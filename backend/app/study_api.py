"""Flashcard çalışma API'si."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from . import enrich, study
from .db import get_conn
from .users import CurrentUser, set_setting

router = APIRouter(prefix="/api/study")


@router.get("/summary")
def summary(user: CurrentUser) -> dict:
    return study.summary(user)


@router.get("/next")
def next_card(user: CurrentUser, book: int | None = Query(None)) -> dict:
    data = study.next_card(user, book)
    if data["card"]:
        # Ayrıntılar genelde önbellekte; değilse burada bir kez alınır.
        try:
            details = enrich.word_details(data["card"]["word_id"])
            data["card"]["details"] = {k: details.get(k) for k in ("phonetic", "audio", "meanings", "forms", "examples")}
            data["card"]["translation"] = data["card"]["translation"] or details.get("translation")
        except KeyError:
            data["card"]["details"] = None
        card = data["card"]
        meanings = (card["details"] or {}).get("meanings") or []
        card["choices"] = study.choices(
            card["word_id"], card["translation"], (card["book"] or {}).get("id"),
            meanings[0]["pos"] if meanings else None,
        )
    return data


class Review(BaseModel):
    rating: int = Field(..., ge=1, le=4)
    mode: Literal["classic", "reverse", "cloze", "choice"] | None = None
    duration_ms: int | None = Field(None, ge=0, le=3_600_000)


@router.post("/cards/{card_id}/review")
def review(card_id: int, body: Review, user: CurrentUser, book: int | None = Query(None)) -> dict:
    try:
        study.review(user, card_id, body.rating, body.mode, body.duration_ms)
    except KeyError:
        raise HTTPException(404, "Kart bulunamadı.") from None
    return next_card(user, book)


class StudySettings(BaseModel):
    new_per_day: int = Field(..., ge=0, le=200)


@router.put("/settings")
def update_settings(body: StudySettings, user: CurrentUser) -> dict:
    set_setting(user, "new_per_day", str(body.new_per_day))
    return study.summary(user)


@router.get("/books")
def study_books(user: CurrentUser) -> list[dict]:
    """Deste seçimi için kartı olan kitaplar."""
    rows = get_conn().execute(
        """
        SELECT b.id, b.title, COUNT(c.id) AS cards
          FROM books b JOIN cards c ON c.book_id = b.id AND c.suspended = 0 AND c.user_id = ?
         GROUP BY b.id ORDER BY b.title
        """,
        (user,),
    ).fetchall()
    return [dict(r) for r in rows]
