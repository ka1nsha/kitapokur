"""Tatoeba İngilizce–Türkçe cümle çiftleri.

Dışa aktarım dosyaları bir kez indirilir ve ayrı bir SQLite dosyasına (FTS5
tam metin indeksiyle) yüklenir. Böylece aramalar milisaniyeler sürer, internet
gerekmez ve istek sınırına takılınmaz. Veri ayda bir tazelenir.

Lisans: Tatoeba cümleleri CC-BY 2.0 FR (bir kısmı CC0).

Elle çalıştırmak için:  python -m app.tatoeba   (backend klasöründe)
"""

import bz2
import json
import logging
import os
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

from .config import DATA_DIR
from .net import USER_AGENT

log = logging.getLogger("kitapokur.tatoeba")

DB_PATH = DATA_DIR / "tatoeba.db"
# Kurulum ayrı bir süreçte çalışır; ilerlemesini bu dosyaya yazar.
STATUS_PATH = DATA_DIR / "tatoeba-status.json"
BASE = "https://downloads.tatoeba.org/exports/per_language"
FILES = {
    "eng": f"{BASE}/eng/eng_sentences.tsv.bz2",
    "tur": f"{BASE}/tur/tur_sentences.tsv.bz2",
    "links": f"{BASE}/eng/eng-tur_links.tsv.bz2",
}
REFRESH_DAYS = 30
# Örnek olarak işe yarayan cümle uzunluğu (kelime).
MIN_WORDS, MAX_WORDS = 3, 24

status = {"state": "idle", "progress": 0.0, "message": None}
_lock = threading.Lock()
_local = threading.local()
_process: subprocess.Popen | None = None


# --- Arama -------------------------------------------------------------------

def _conn() -> sqlite3.Connection | None:
    if not DB_PATH.exists():
        return None
    mtime = DB_PATH.stat().st_mtime
    conn = getattr(_local, "conn", None)
    # Dosya yeniden oluşturulduysa bağlantıyı tazele.
    if conn is None or getattr(_local, "mtime", None) != mtime:
        if conn is not None:
            conn.close()
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        _local.conn, _local.mtime = conn, mtime
    return conn


def examples(lemma: str, limit: int = 2) -> list[dict]:
    conn = _conn()
    if conn is None or not lemma.isalpha():
        return []
    try:
        rows = conn.execute(
            """
            SELECT en, tr FROM (
                SELECT p.en, p.tr, p.words
                  FROM pairs_fts f JOIN pairs p ON p.id = f.rowid
                 WHERE pairs_fts MATCH ?
                 LIMIT 400
            )
            -- Kelimenin aynen geçtiği cümleler, kökü aynı olan başka
            -- kelimelerden (possession → possessed) önce gelir.
            ORDER BY (' ' || lower(en) || ' ') LIKE ? DESC, abs(words - 9), length(en)
            LIMIT ?
            """,
            (f'"{lemma}"', f"% {lemma}%", limit),
        ).fetchall()
    except sqlite3.Error:
        return []
    return [{"en": r["en"], "tr": r["tr"]} for r in rows]


def info() -> dict:
    data = {"state": "idle", "progress": 0.0, "message": None}
    try:
        data.update(json.loads(STATUS_PATH.read_text()))
    except (OSError, ValueError):
        pass
    if data["state"] in ("downloading", "building") and not _running():
        data["state"] = "idle"  # süreç yarıda kaldı
    conn = _conn()
    if conn is not None:
        try:
            meta = dict(conn.execute("SELECT key, value FROM meta").fetchall())
            data.update(available=True, pairs=int(meta.get("pairs", 0)), updated_at=int(meta.get("updated_at", 0)))
        except sqlite3.Error:
            data["available"] = False
    else:
        data["available"] = False
    return data


# --- İçe aktarma ---------------------------------------------------------------

def _set(state: str, progress: float = 0.0, message: str | None = None) -> None:
    status.update(state=state, progress=round(progress, 3), message=message)
    try:
        tmp = STATUS_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(status))
        tmp.replace(STATUS_PATH)
    except OSError:
        pass


def _download(url: str, dest, weight: float, offset: float) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as out:
        total = int(resp.headers.get("Content-Length") or 0)
        done = 0
        while chunk := resp.read(256 * 1024):
            out.write(chunk)
            done += len(chunk)
            if total:
                _set("downloading", offset + weight * done / total)


def _read_tsv(path):
    with bz2.open(path, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                yield parts


def build() -> None:
    """İndirir ve veritabanını sıfırdan kurar. Uzun sürer; arka planda çağrılmalı."""
    if not _lock.acquire(blocking=False):
        return
    tmp_dir = DATA_DIR / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    paths = {k: tmp_dir / f"tatoeba-{k}.tsv.bz2" for k in FILES}
    tmp_db = DATA_DIR / "tatoeba.db.tmp"
    started = time.monotonic()
    try:
        weights = {"eng": 0.6, "tur": 0.25, "links": 0.15}
        offset = 0.0
        for key, url in FILES.items():
            _download(url, paths[key], weights[key] * 0.7, offset)
            offset += weights[key] * 0.7

        _set("building", 0.72)
        links: dict[int, list[int]] = {}
        for eng_id, tur_id, *_ in _read_tsv(paths["links"]):
            links.setdefault(int(eng_id), []).append(int(tur_id))
        wanted_tur = {t for ts in links.values() for t in ts}

        tur: dict[int, str] = {}
        for sid, _lang, text, *_ in _read_tsv(paths["tur"]):
            i = int(sid)
            if i in wanted_tur:
                tur[i] = text
        _set("building", 0.8)

        tmp_db.unlink(missing_ok=True)
        db = sqlite3.connect(tmp_db)
        db.executescript(
            """
            PRAGMA journal_mode=OFF;
            PRAGMA synchronous=OFF;
            CREATE TABLE pairs (id INTEGER PRIMARY KEY, en TEXT NOT NULL, tr TEXT NOT NULL, words INTEGER NOT NULL);
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
            """
        )
        batch, count = [], 0
        for sid, _lang, text, *_ in _read_tsv(paths["eng"]):
            ids = links.get(int(sid))
            if not ids:
                continue
            n = len(text.split())
            if not MIN_WORDS <= n <= MAX_WORDS:
                continue
            translations = [tur[t] for t in ids if t in tur]
            if not translations:
                continue
            # Birden çok çeviri varsa en kısası genelde en doğalıdır.
            batch.append((text, min(translations, key=len), n))
            if len(batch) >= 5000:
                db.executemany("INSERT INTO pairs (en, tr, words) VALUES (?, ?, ?)", batch)
                count += len(batch)
                batch.clear()
        if batch:
            db.executemany("INSERT INTO pairs (en, tr, words) VALUES (?, ?, ?)", batch)
            count += len(batch)
        _set("building", 0.9)

        db.executescript(
            """
            CREATE VIRTUAL TABLE pairs_fts USING fts5(en, content='pairs', content_rowid='id', tokenize='porter unicode61');
            INSERT INTO pairs_fts(pairs_fts) VALUES ('rebuild');
            INSERT INTO pairs_fts(pairs_fts) VALUES ('optimize');
            """
        )
        db.executemany(
            "INSERT INTO meta (key, value) VALUES (?, ?)",
            [("pairs", str(count)), ("updated_at", str(int(time.time())))],
        )
        db.commit()
        db.close()
        os.replace(tmp_db, DB_PATH)
        _set("ready", 1.0)
        log.info("Tatoeba hazır: %d cümle çifti, %.0f sn", count, time.monotonic() - started)
    except Exception as exc:  # noqa: BLE001
        log.exception("Tatoeba verisi kurulamadı")
        _set("error", 0.0, str(exc))
        tmp_db.unlink(missing_ok=True)
    finally:
        for p in paths.values():
            p.unlink(missing_ok=True)
        _lock.release()


def _running() -> bool:
    return _process is not None and _process.poll() is None


def start_background(force: bool = False) -> bool:
    """Veri yoksa ya da eskidiyse ayrı, düşük öncelikli bir süreçte kur. Başladıysa True.

    Kurulum birkaç yüz MB bellek kullanır; ayrı süreçte çalıştığı için bittiğinde
    bellek tamamen işletim sistemine geri döner.
    """
    global _process
    if _running():
        return False
    if not force and DB_PATH.exists():
        age_days = (time.time() - DB_PATH.stat().st_mtime) / 86400
        if age_days < REFRESH_DAYS:
            return False
    _set("downloading", 0.0)
    _process = subprocess.Popen(
        [sys.executable, "-m", "app.tatoeba"],
        cwd=Path(__file__).resolve().parents[1],
        preexec_fn=lambda: os.nice(10),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return True


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    build()
    print({**status, "pairs": info().get("pairs")})
