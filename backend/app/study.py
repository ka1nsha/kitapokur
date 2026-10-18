"""Flashcard çalışma: FSRS ile zamanlama, günlük yeni kart sınırı, istatistik.

Kart, kelimeye "Öğren" denince oluşur. Her cevaptan sonra FSRS bir sonraki
tekrar zamanını hesaplar: zorlanılan kelimeler sık, iyi bilinenler seyrek gelir.
"""

import json
import re
import time
from datetime import datetime, timedelta, timezone

import fsrs

from . import words
from .db import get_conn, transaction
from .users import get_setting

# Gerçek zamanlama küçük rastgele sapmalar içerir (aynı gün eklenen kartlar
# hep aynı güne yığılmasın); düğmelerdeki önizleme sapmasız hesaplanır.
_scheduler = fsrs.Scheduler(desired_retention=0.9, enable_fuzzing=True)
_preview_scheduler = fsrs.Scheduler(desired_retention=0.9, enable_fuzzing=False)

DEFAULT_NEW_PER_DAY = 20
# Gün, gece yarısı yerine sabah 4'te döner (gece geç saatte çalışanlar için).
DAY_START_HOUR = 4
# Bu kadar dakika içinde zamanı gelecek bir öğrenme kartı varsa oturum bitmez, beklenir.
LEARN_AHEAD_MINUTES = 20

STATE_NEW = 0


# --- Yardımcılar -----------------------------------------------------------------

def day_start(now: float | None = None) -> int:
    local = datetime.fromtimestamp(now or time.time())
    start = local.replace(hour=DAY_START_HOUR, minute=0, second=0, microsecond=0)
    if local < start:
        start -= timedelta(days=1)
    return int(start.timestamp())


def _load(row) -> fsrs.Card:
    return fsrs.Card.from_dict(json.loads(row["fsrs"])) if row["fsrs"] else fsrs.Card()


def new_per_day(user_id: int) -> int:
    value = get_setting(user_id, "new_per_day")
    try:
        return max(0, min(200, int(value))) if value else DEFAULT_NEW_PER_DAY
    except ValueError:
        return DEFAULT_NEW_PER_DAY


def _filter(user_id: int, book_id: int | None) -> tuple[str, tuple]:
    if book_id:
        return "c.user_id = ? AND c.book_id = ?", (user_id, book_id)
    return "c.user_id = ?", (user_id,)


def new_seen_today(user_id: int) -> int:
    return get_conn().execute(
        """
        SELECT COUNT(DISTINCT r.card_id) FROM reviews r JOIN cards c ON c.id = r.card_id
         WHERE c.user_id = ? AND r.state_before = 0 AND r.reviewed_at >= ?
        """,
        (user_id, day_start()),
    ).fetchone()[0]


# --- Kuyruk ----------------------------------------------------------------------

def counts(user_id: int, book_id: int | None = None) -> dict:
    now = int(time.time())
    where, params = _filter(user_id, book_id)
    row = get_conn().execute(
        f"""
        SELECT COUNT(*) FILTER (WHERE c.state = 0)                      AS new_total,
               COUNT(*) FILTER (WHERE c.state IN (1, 3) AND c.due <= ?) AS learning,
               COUNT(*) FILTER (WHERE c.state = 2 AND c.due <= ?)       AS review
          FROM cards c
         WHERE c.suspended = 0 AND {where}
        """,
        (now, now, *params),
    ).fetchone()
    new_left = max(0, new_per_day(user_id) - new_seen_today(user_id))
    return {
        "new": min(row["new_total"], new_left),
        "learning": row["learning"],
        "review": row["review"],
    }


def next_card(user_id: int, book_id: int | None = None) -> dict:
    """Sıradaki kart; yoksa en yakın öğrenme kartının zamanı ya da bitti bilgisi."""
    conn = get_conn()
    now = int(time.time())
    where, params = _filter(user_id, book_id)
    c = counts(user_id, book_id)

    # Önce zamanı gelmiş öğrenme/tekrar kartları, sonra günlük sınır içinde yeniler.
    row = conn.execute(
        f"""
        SELECT c.* FROM cards c
         WHERE c.suspended = 0 AND c.state > 0 AND c.due <= ? AND {where}
         ORDER BY c.due LIMIT 1
        """,
        (now, *params),
    ).fetchone()
    if row is None and c["new"] > 0:
        row = conn.execute(
            f"SELECT c.* FROM cards c WHERE c.suspended = 0 AND c.state = 0 AND {where} ORDER BY c.created_at, c.id LIMIT 1",
            params,
        ).fetchone()
    if row is None:
        # Birkaç dakika sonra dönecek öğrenme kartı varsa beklet.
        soon = conn.execute(
            f"""
            SELECT MIN(c.due) FROM cards c
             WHERE c.suspended = 0 AND c.state IN (1, 3) AND c.due <= ? AND {where}
            """,
            (now + LEARN_AHEAD_MINUTES * 60, *params),
        ).fetchone()[0]
        return {"card": None, "counts": c, "wait_until": soon}
    return {"card": card_json(row), "counts": c, "wait_until": None}


def _previews(card: fsrs.Card) -> dict[int, int]:
    now = datetime.now(timezone.utc)
    out = {}
    for rating in fsrs.Rating:
        nxt, _ = _preview_scheduler.review_card(card, rating, review_datetime=now)
        out[rating.value] = max(0, int((nxt.due - now).total_seconds()))
    return out


def _cloze(sentence: str | None, lemma: str) -> list[str] | None:
    """Cümleyi [önce, kelime, sonra] olarak böl (boşluk doldurma için)."""
    if not sentence:
        return None
    for m in words._TOKEN.finditer(sentence):
        token = words.normalize_token(m.group(0))
        if token == lemma or words.lemma_of(token) == lemma:
            end = m.start() + len(re.split(r"['’]", m.group(0))[0])
            return [sentence[:m.start()], sentence[m.start():end], sentence[end:]]
    return None


def card_json(row) -> dict:
    conn = get_conn()
    w = conn.execute("SELECT id, lemma, translation FROM words WHERE id = ?", (row["word_id"],)).fetchone()
    book = None
    if row["book_id"]:
        b = conn.execute("SELECT id, title FROM books WHERE id = ?", (row["book_id"],)).fetchone()
        book = {"id": b["id"], "title": b["title"]} if b else None
    return {
        "id": row["id"],
        "word_id": w["id"],
        "lemma": w["lemma"],
        "translation": row["translation"] or w["translation"] or None,
        "own_translation": bool(row["translation"]),
        "note": row["note"],
        "state": row["state"],
        "book": book,
        "page": row["page"],
        "sentence": row["sentence"],
        "cloze": _cloze(row["sentence"], w["lemma"]),
        "intervals": _previews(_load(row)),
    }


# --- Cevap ------------------------------------------------------------------------

def review(user_id: int, card_id: int, rating: int, mode: str | None, duration_ms: int | None) -> None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM cards WHERE id = ? AND user_id = ?", (card_id, user_id)).fetchone()
    if row is None:
        raise KeyError(card_id)
    card = _load(row)
    nxt, _ = _scheduler.review_card(card, fsrs.Rating(rating), review_datetime=datetime.now(timezone.utc))
    now = int(time.time())
    with transaction() as tx:
        tx.execute(
            "UPDATE cards SET fsrs = ?, state = ?, due = ? WHERE id = ?",
            (json.dumps(nxt.to_dict()), nxt.state.value, int(nxt.due.timestamp()), card_id),
        )
        tx.execute(
            """
            INSERT INTO reviews (card_id, rating, mode, state_before, reviewed_at, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (card_id, rating, mode, row["state"], now, duration_ms),
        )


# --- Kelime durumuyla bağlantı ----------------------------------------------------

def ensure_card(tx, user_id: int, word_id: int, book_id: int | None, page: int | None, sentence: str | None) -> None:
    """Kelimeye "Öğren" denince kart oluştur ya da askıdaysa geri getir."""
    existing = tx.execute(
        "SELECT id, sentence FROM cards WHERE user_id = ? AND word_id = ?", (user_id, word_id)
    ).fetchone()
    now = int(time.time())
    if existing:
        tx.execute(
            """
            UPDATE cards SET suspended = 0,
                   book_id = COALESCE(book_id, ?), page = COALESCE(page, ?), sentence = COALESCE(sentence, ?)
             WHERE id = ?
            """,
            (book_id, page, sentence, existing["id"]),
        )
    else:
        tx.execute(
            """
            INSERT INTO cards (user_id, word_id, book_id, page, sentence, state, due, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (user_id, word_id, book_id, page, sentence, now, now),
        )


def suspend_card(tx, user_id: int, word_id: int) -> None:
    """Kelime artık öğrenilmiyorsa kart askıya alınır; geçmişi silinmez."""
    tx.execute("UPDATE cards SET suspended = 1 WHERE user_id = ? AND word_id = ?", (user_id, word_id))


# --- Özet -------------------------------------------------------------------------

def summary(user_id: int) -> dict:
    conn = get_conn()
    c = counts(user_id)
    today = day_start()
    reviewed_today = conn.execute(
        "SELECT COUNT(*) FROM reviews r JOIN cards c ON c.id = r.card_id WHERE c.user_id = ? AND r.reviewed_at >= ?",
        (user_id, today),
    ).fetchone()[0]
    learning_total = conn.execute(
        "SELECT COUNT(*) FROM cards WHERE user_id = ? AND suspended = 0", (user_id,)
    ).fetchone()[0]
    mature = conn.execute(
        "SELECT COUNT(*) FROM cards WHERE user_id = ? AND suspended = 0 AND state = 2 AND due - ? > 21 * 86400",
        (user_id, int(time.time())),
    ).fetchone()[0]
    known = conn.execute(
        "SELECT COUNT(*) FROM word_status WHERE user_id = ? AND status = 'known'", (user_id,)
    ).fetchone()[0]

    # Seri: bugünden (ya da dünden) geriye, her gün en az bir tekrar.
    days = {
        r[0] for r in conn.execute(
            """
            SELECT DISTINCT (r.reviewed_at - ?) / 86400 FROM reviews r JOIN cards c ON c.id = r.card_id
             WHERE c.user_id = ? AND r.reviewed_at >= ?
            """,
            (today % 86400, user_id, today - 400 * 86400),
        )
    }
    streak, day = 0, (today - today % 86400) // 86400
    if day not in days:
        day -= 1
    while day in days:
        streak += 1
        day -= 1

    return {
        **c,
        "due": c["new"] + c["learning"] + c["review"],
        "reviewed_today": reviewed_today,
        "learning_total": learning_total,
        "mature": mature,
        "known": known,
        "streak": streak,
        "new_per_day": new_per_day(user_id),
    }
