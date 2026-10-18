"""Kelimeleri çeviri, sözlük bilgisi ve örnek cümlelerle zenginleştirir.

- Kitaptaki aday kelimeler arka planda toplu çevrilir (birkaç istekte binlerce kelime).
- Türlere göre anlamlar, tanım, telaffuz ve ses ilk kez gerektiğinde alınır
  ve saklanır; aynı kelime için bir daha internete çıkılmaz.
- Cümle çevirileri de önbelleğe alınır.
"""

import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from . import dictionary, forms, net, tatoeba, words
from .db import get_conn, transaction
from .translate import get_translator

log = logging.getLogger("kitapokur.enrich")

_BATCH = 400
_RETRY_SECONDS = 600
# Sözlük bilgisi bu kadar gün sonra tazelenir.
_DETAILS_MAX_AGE = 180 * 86400

_job_lock = threading.Lock()
_wake = threading.Event()
state = {"running": False, "last_error": None}
# Google ve sözlük aynı anda sorgulanır; kart daha hızlı açılır.
_lookup_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="lookup")


# --- Toplu kelime çevirisi --------------------------------------------------------

def _pending(limit: int) -> list:
    # En son açılan kitabın kelimeleri önce çevrilir.
    return get_conn().execute(
        """
        SELECT w.id, w.lemma
          FROM words w
          JOIN book_words bw ON bw.word_id = w.id
          JOIN books b       ON b.id = bw.book_id
          LEFT JOIN (SELECT book_id, MAX(last_opened_at) AS opened FROM book_progress GROUP BY book_id) p
                 ON p.book_id = b.id
         WHERE w.translation IS NULL AND w.zipf > 0 AND w.zipf < ?
           AND bw.is_proper = 0 AND length(w.lemma) >= 3
         GROUP BY w.id
         ORDER BY MAX(COALESCE(p.opened, b.created_at)) DESC, MAX(bw.count) DESC
         LIMIT ?
        """,
        (words.CANDIDATE_MAX_ZIPF, limit),
    ).fetchall()


def _translate_worker() -> None:
    while True:
        _wake.wait()
        _wake.clear()
        state["running"] = True
        try:
            translator = get_translator()
            while rows := _pending(_BATCH):
                lemmas = [r["lemma"] for r in rows]
                results = translator.translate_lines(lemmas)
                with transaction() as tx:
                    tx.executemany(
                        "UPDATE words SET translation = ? WHERE id = ?",
                        # Çevrilemeyen kelime boş metinle işaretlenir; sonsuz döngüye girmesin.
                        [(t if t else "", r["id"]) for r, t in zip(rows, results)],
                    )
                log.info("%d kelime çevrildi", len(rows))
            state["last_error"] = None
        except Exception as exc:  # noqa: BLE001 - iş parçacığı ölmesin; sonra tekrar denenir
            state["last_error"] = str(exc)
            log.warning("Çeviri durdu, %d sn sonra tekrar denenecek: %s", _RETRY_SECONDS, exc)
            threading.Timer(_RETRY_SECONDS, _wake.set).start()
        finally:
            state["running"] = False


def start() -> None:
    threading.Thread(target=_translate_worker, name="translator", daemon=True).start()
    request_translations()


def request_translations() -> None:
    _wake.set()


# --- Tek kelime ayrıntısı -----------------------------------------------------------

def _merge(google: list[dict], dict_data: dict) -> list[dict]:
    """Google'ın türlere göre Türkçe anlamlarıyla sözlüğün İngilizce tanımlarını birleştir."""
    by_pos: dict[str, dict] = {}
    for g in google:
        by_pos.setdefault(g["pos"].lower(), {"pos": g["pos"].lower(), "tr": [], "defs": []})["tr"] = g["terms"]
    for m in dict_data.get("meanings", []):
        by_pos.setdefault(m["pos"], {"pos": m["pos"], "tr": [], "defs": []})["defs"] = m["defs"]
    return list(by_pos.values())


def word_details(word_id: int) -> dict:
    """Kelimenin çevirisi, anlamları, telaffuzu ve örnek cümleleri."""
    conn = get_conn()
    row = conn.execute(
        "SELECT id, lemma, translation, details, details_at FROM words WHERE id = ?", (word_id,)
    ).fetchone()
    if row is None:
        raise KeyError(word_id)

    translation = row["translation"]
    details = json.loads(row["details"]) if row["details"] else None
    fresh = details is not None and time.time() - (row["details_at"] or 0) < _DETAILS_MAX_AGE

    if not fresh:
        translator = get_translator()
        google, complete = [], True
        dict_future = _lookup_pool.submit(dictionary.lookup, row["lemma"])
        try:
            google = translator.dictionary(row["lemma"])
            if not translation:
                translation = (translator.translate_lines([row["lemma"]])[0] or "")
        except net.NetError:
            complete = False
        dict_data = dict_future.result()
        # Sözlükte olmayan kelime de kesin bir sonuçtur; her açılışta yeniden sorulmaz.
        if dict_data.get("source") is None and not dict_data.get("missing"):
            complete = False
        fetched = {
            "phonetic": dict_data.get("phonetic"),
            "audio": dict_data.get("audio"),
            "meanings": _merge(google, dict_data),
            "source": dict_data.get("source"),
        }
        # Eksik sonuç (ör. internet yok) kalıcı olarak saklanmaz; bir dahaki sefere tekrar denenir.
        if complete or (details is None and fetched["meanings"]):
            details = fetched
            with transaction() as tx:
                tx.execute(
                    "UPDATE words SET details = ?, details_at = ?, translation = COALESCE(NULLIF(?, ''), translation) WHERE id = ?",
                    (json.dumps(details, ensure_ascii=False), int(time.time()) if complete else 0, translation, word_id),
                )
        elif details is None:
            details = fetched

    pos_list = [m["pos"] for m in (details or {}).get("meanings", [])]
    return {
        "id": row["id"],
        "lemma": row["lemma"],
        "translation": translation or None,
        **(details or {}),
        "forms": forms.of(row["lemma"], pos_list),
        "examples": tatoeba.examples(row["lemma"]),
    }


def prefetch_details(word_id: int) -> None:
    def run():
        try:
            word_details(word_id)
        except Exception:  # noqa: BLE001 - kart açılınca tekrar denenir
            log.debug("Kelime %s için ayrıntı alınamadı", word_id)
    _lookup_pool.submit(run)


# --- Serbest metin (cümle) çevirisi ---------------------------------------------------

def translate_text(text: str) -> str:
    text = " ".join(text.split())
    conn = get_conn()
    row = conn.execute("SELECT tr FROM translations WHERE src = ?", (text,)).fetchone()
    if row:
        return row["tr"]
    result = get_translator().translate_lines([text])[0]
    if not result:
        raise net.NetError("Çeviri alınamadı.")
    with transaction() as tx:
        tx.execute(
            "INSERT OR REPLACE INTO translations (src, tr, created_at) VALUES (?, ?, ?)",
            (text, result, int(time.time())),
        )
    return result
