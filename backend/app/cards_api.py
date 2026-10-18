"""Kart tarayıcısı: destedeki kartları listeleme, elle kart ekleme, düzenleme."""

import re
import time
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from . import enrich, study, words
from .db import get_conn, transaction
from .users import CurrentUser

router = APIRouter(prefix="/api/cards")

Filter = Literal["all", "due", "new", "learning", "review", "suspended"]
Sort = Literal["due", "added", "alpha", "lapses"]

# Her filtrenin SQL koşulu; ":now" sorgu sırasında doldurulur.
_FILTERS = {
    "all": "1",
    "due": "c.suspended = 0 AND c.state > 0 AND c.due <= :now",
    "new": "c.suspended = 0 AND c.state = 0",
    "learning": "c.suspended = 0 AND c.state IN (1, 3)",
    "review": "c.suspended = 0 AND c.state = 2",
    "suspended": "c.suspended = 1",
}
_SORTS = {
    # Yeni kartlar (hiç çalışılmamış) sona.
    "due": "c.state = 0, c.due, c.id",
    "added": "c.created_at DESC, c.id DESC",
    "alpha": "w.lemma COLLATE NOCASE",
    "lapses": "lapses DESC, c.due",
}

_SELECT = """
    SELECT c.id, c.word_id, w.lemma, COALESCE(NULLIF(c.translation, ''), w.translation) AS translation,
           c.translation IS NOT NULL AND c.translation != '' AS own_translation,
           c.note, c.sentence, c.page, c.state, c.due, c.suspended, c.created_at,
           b.id AS book_id, b.title AS book_title,
           (SELECT COUNT(*) FROM reviews r WHERE r.card_id = c.id) AS reviews,
           (SELECT COUNT(*) FROM reviews r WHERE r.card_id = c.id AND r.rating = 1 AND r.state_before = 2) AS lapses
      FROM cards c
      JOIN words w ON w.id = c.word_id
      LEFT JOIN books b ON b.id = c.book_id
"""


def _card_row_json(r) -> dict:
    return {
        "id": r["id"],
        "word_id": r["word_id"],
        "lemma": r["lemma"],
        "translation": r["translation"],
        "own_translation": bool(r["own_translation"]),
        "note": r["note"],
        "sentence": r["sentence"],
        "book": {"id": r["book_id"], "title": r["book_title"]} if r["book_id"] else None,
        "page": r["page"],
        "state": r["state"],
        "due": r["due"],
        "suspended": bool(r["suspended"]),
        "created_at": r["created_at"],
        "reviews": r["reviews"],
        "lapses": r["lapses"],
    }


def _get(user_id: int, card_id: int) -> dict:
    row = get_conn().execute(f"{_SELECT} WHERE c.id = ? AND c.user_id = ?", (card_id, user_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Kart bulunamadı.")
    return _card_row_json(row)


@router.get("")
def list_cards(
    user: CurrentUser,
    q: str = Query("", max_length=80),
    filter: Filter = "all",
    sort: Sort = "due",
    book: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    conn = get_conn()
    params: dict = {"user": user, "now": int(time.time())}
    where = ["c.user_id = :user"]
    if book:
        where.append("c.book_id = :book")
        params["book"] = book
    q = q.strip().lower()
    if q:
        where.append("(w.lemma LIKE :prefix ESCAPE '\\' OR COALESCE(c.translation, w.translation) LIKE :inner ESCAPE '\\')")
        safe = re.sub(r"([%_\\])", r"\\\1", q)
        params["prefix"] = f"{safe}%"
        params["inner"] = f"%{safe}%"
    base = " AND ".join(where)

    rows = conn.execute(
        f"{_SELECT} WHERE {base} AND {_FILTERS[filter]} ORDER BY {_SORTS[sort]} LIMIT :limit OFFSET :offset",
        {**params, "limit": limit, "offset": offset},
    ).fetchall()
    # Sekmelerdeki sayılar arama ve kitap filtresini de hesaba katar.
    counts = conn.execute(
        "SELECT " + ", ".join(f'COUNT(*) FILTER (WHERE {cond}) AS "{name}"' for name, cond in _FILTERS.items())
        + f" FROM cards c JOIN words w ON w.id = c.word_id WHERE {base}",
        params,
    ).fetchone()
    return {
        "items": [_card_row_json(r) for r in rows],
        "counts": dict(counts),
        "total": counts[filter],
        "now": params["now"],
    }


# --- Elle kart ekleme ----------------------------------------------------------------

class NewCard(BaseModel):
    word: str = Field(..., min_length=1, max_length=60)
    translation: str | None = Field(None, max_length=200)
    sentence: str | None = Field(None, max_length=500)
    note: str | None = Field(None, max_length=500)


def _lemma_for(text: str) -> str:
    """Tek kelime kökene indirilir ("went" → "go"); kalıplar ("give up") olduğu gibi kalır."""
    text = re.sub(r"\s+", " ", text.replace("’", "'")).strip().lower()
    if not re.search(r"[a-z]", text) or not re.fullmatch(r"[a-z][a-z' -]*", text):
        raise HTTPException(422, "Kelime yalnızca İngilizce harflerden oluşmalı.")
    if " " in text or "-" in text:
        return text
    return words.lemma_of(words.normalize_token(text))


def _clean(value: str | None) -> str | None:
    value = re.sub(r"\s+", " ", value or "").strip()
    return value or None


@router.post("", status_code=201)
def add_card(body: NewCard, user: CurrentUser, response: Response) -> dict:
    lemma = _lemma_for(body.word)
    now = int(time.time())
    with transaction() as tx:
        tx.execute(
            "INSERT INTO words (lemma, zipf) VALUES (?, ?) ON CONFLICT(lemma) DO NOTHING",
            (lemma, words.zipf_of(lemma)),
        )
        word_id = tx.execute("SELECT id FROM words WHERE lemma = ?", (lemma,)).fetchone()["id"]
        existing = tx.execute(
            "SELECT id, suspended FROM cards WHERE user_id = ? AND word_id = ?", (user, word_id)
        ).fetchone()
        tx.execute(
            "INSERT INTO word_status (user_id, word_id, status, updated_at) VALUES (?, ?, 'learning', ?) "
            "ON CONFLICT(user_id, word_id) DO UPDATE SET status = 'learning', updated_at = excluded.updated_at",
            (user, word_id, now),
        )
        study.ensure_card(tx, user, word_id, None, None, _clean(body.sentence))
        card_id = tx.execute(
            "SELECT id FROM cards WHERE user_id = ? AND word_id = ?", (user, word_id)
        ).fetchone()["id"]
        # Mevcut bir kartta yalnızca doldurulan alanlar değişir.
        for field in ("translation", "note", "sentence"):
            value = _clean(getattr(body, field))
            if value:
                tx.execute(f"UPDATE cards SET {field} = ? WHERE id = ?", (value, card_id))
    enrich.prefetch_details(word_id)
    if existing is not None:
        response.status_code = 200
    return {**_get(user, card_id), "existed": existing is not None and not existing["suspended"]}


# --- Düzenleme ------------------------------------------------------------------------

class CardUpdate(BaseModel):
    translation: str | None = Field(None, max_length=200)
    sentence: str | None = Field(None, max_length=500)
    note: str | None = Field(None, max_length=500)
    suspended: bool | None = None


@router.patch("/{card_id}")
def update_card(card_id: int, body: CardUpdate, user: CurrentUser) -> dict:
    card = _get(user, card_id)
    fields = body.model_dump(exclude_unset=True)
    with transaction() as tx:
        for field in ("translation", "sentence", "note"):
            if field in fields:
                # Boş bırakılan anlam, kelimenin ortak çevirisine döner.
                tx.execute(f"UPDATE cards SET {field} = ? WHERE id = ?", (_clean(fields[field]), card_id))
        if fields.get("suspended") is not None:
            tx.execute("UPDATE cards SET suspended = ? WHERE id = ?", (int(fields["suspended"]), card_id))
            if not fields["suspended"]:
                # "Biliyorum" yüzünden askıya alınmış bir kart geri gelirse kelime yeniden öğreniliyor sayılır.
                tx.execute(
                    "INSERT INTO word_status (user_id, word_id, status, updated_at) VALUES (?, ?, 'learning', ?) "
                    "ON CONFLICT(user_id, word_id) DO UPDATE SET status = 'learning', updated_at = excluded.updated_at",
                    (user, card["word_id"], int(time.time())),
                )
    return _get(user, card_id)


@router.post("/{card_id}/reset")
def reset_card(card_id: int, user: CurrentUser) -> dict:
    """Kartı yeni kart hâline döndürür; tekrar geçmişi silinmez."""
    _get(user, card_id)
    with transaction() as tx:
        tx.execute("UPDATE cards SET state = 0, fsrs = NULL, due = ? WHERE id = ?", (int(time.time()), card_id))
    return _get(user, card_id)


@router.delete("/{card_id}", status_code=204)
def delete_card(card_id: int, user: CurrentUser) -> Response:
    card = _get(user, card_id)
    with transaction() as tx:
        tx.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        # Kelime artık öğrenilmiyor; kitaplarda yeniden "yeni" olarak görünür.
        tx.execute(
            "DELETE FROM word_status WHERE user_id = ? AND word_id = ? AND status = 'learning'",
            (user, card["word_id"]),
        )
    return Response(status_code=204)
