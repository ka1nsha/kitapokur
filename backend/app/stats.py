"""İstatistik sayfası: tekrar geçmişi, yaklaşan tekrarlar, kelime ve okuma durumu."""

import time

from fastapi import APIRouter

from . import study
from .db import get_conn
from .users import CurrentUser

router = APIRouter(prefix="/api/stats")

HISTORY_DAYS = 30
FORECAST_DAYS = 14
# Kartın başında unutulup gidilen süreler çalışma süresini şişirmesin.
MAX_REVIEW_MS = 60_000


def _day_label(ts: int) -> str:
    return time.strftime("%Y-%m-%d", time.localtime(ts))


@router.get("")
def overview(user: CurrentUser) -> dict:
    conn = get_conn()
    summary = study.summary(user)
    today = study.day_start()
    offset = today % 86400
    today_n = (today - offset) // 86400
    since = today - (HISTORY_DAYS - 1) * 86400

    # --- Son 30 gün: tekrar, doğru, süre, eklenen kart ---
    history = {
        r["d"]: r for r in conn.execute(
            """
            SELECT (r.reviewed_at - ?) / 86400 AS d, COUNT(*) AS n, SUM(r.rating > 1) AS ok,
                   SUM(MIN(COALESCE(r.duration_ms, 0), ?)) AS ms
              FROM reviews r JOIN cards c ON c.id = r.card_id
             WHERE c.user_id = ? AND r.reviewed_at >= ?
             GROUP BY d
            """,
            (offset, MAX_REVIEW_MS, user, since),
        )
    }
    added = {
        r["d"]: r["n"] for r in conn.execute(
            "SELECT (created_at - ?) / 86400 AS d, COUNT(*) AS n FROM cards WHERE user_id = ? AND created_at >= ? GROUP BY d",
            (offset, user, since),
        )
    }
    days = []
    for i in range(HISTORY_DAYS - 1, -1, -1):
        n = today_n - i
        h = history.get(n)
        days.append({
            "date": _day_label(today - i * 86400),
            "reviews": h["n"] if h else 0,
            "correct": h["ok"] if h else 0,
            "minutes": round((h["ms"] or 0) / 60000, 1) if h else 0,
            "added": added.get(n, 0),
        })
    total_30 = sum(d["reviews"] for d in days)
    correct_30 = sum(d["correct"] for d in days)

    # --- Önümüzdeki 14 gün (bugün, gecikmişleri de içerir) ---
    forecast = [0] * FORECAST_DAYS
    for r in conn.execute(
        "SELECT due FROM cards WHERE user_id = ? AND suspended = 0 AND state > 0 AND due < ?",
        (user, today + FORECAST_DAYS * 86400),
    ):
        forecast[max(0, (r["due"] - today) // 86400)] += 1

    # --- Kart durumları ---
    states = {"new": 0, "learning": 0, "review": 0, "suspended": 0}
    names = {0: "new", 1: "learning", 2: "review", 3: "learning"}
    for r in conn.execute(
        "SELECT state, suspended, COUNT(*) AS n FROM cards WHERE user_id = ? GROUP BY state, suspended", (user,)
    ):
        states["suspended" if r["suspended"] else names.get(r["state"], "learning")] += r["n"]

    words = {"known": 0, "learning": 0, "ignored": 0}
    for r in conn.execute("SELECT status, COUNT(*) AS n FROM word_status WHERE user_id = ? GROUP BY status", (user,)):
        words[r["status"]] = r["n"]

    # --- Kitaplar ---
    books = []
    for r in conn.execute(
        """
        SELECT b.id, b.title, b.page_count, COALESCE(p.last_page, 1) AS last_page,
               COALESCE(p.last_offset, 0) AS last_offset, p.last_opened_at,
               (SELECT COUNT(*) FROM cards c WHERE c.user_id = ? AND c.book_id = b.id) AS cards
          FROM books b LEFT JOIN book_progress p ON p.book_id = b.id AND p.user_id = ?
         WHERE b.status = 'ready'
         ORDER BY p.last_opened_at IS NULL, p.last_opened_at DESC, b.title
        """,
        (user, user),
    ):
        progress = (r["last_page"] - 1 + r["last_offset"]) / r["page_count"] if r["page_count"] else 0
        books.append({
            "id": r["id"], "title": r["title"], "page_count": r["page_count"], "last_page": r["last_page"],
            "progress": round(min(progress, 1), 4), "last_opened_at": r["last_opened_at"], "cards": r["cards"],
        })

    total_reviews = conn.execute(
        "SELECT COUNT(*) FROM reviews r JOIN cards c ON c.id = r.card_id WHERE c.user_id = ?", (user,)
    ).fetchone()[0]

    return {
        "summary": summary,
        "days": days,
        "accuracy_30": round(correct_30 / total_30, 3) if total_30 else None,
        "reviews_30": total_30,
        "minutes_30": round(sum(d["minutes"] for d in days)),
        "total_reviews": total_reviews,
        "forecast": forecast,
        "states": states,
        "words": words,
        "books": books,
    }
