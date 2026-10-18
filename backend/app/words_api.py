"""Kelime paneli ve seviye ayarı için API."""

import time
from typing import Literal

import pymupdf
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel

from . import enrich, net, processing, study, tatoeba, words
from .db import get_conn, transaction
from .users import CurrentUser, get_setting, set_setting

router = APIRouter(prefix="/api")

Status = Literal["new", "learning", "known", "ignored"]


# --- Ayarlar ---------------------------------------------------------------

def get_level(user_id: int) -> str:
    value = get_setting(user_id, "level")
    return value if value in words.LEVELS else words.DEFAULT_LEVEL


def level_cutoff(user_id: int) -> float:
    return words.LEVELS[get_level(user_id)]


def levels_json(user_id: int) -> dict:
    return {"level": get_level(user_id), "levels": list(words.LEVELS)}


@router.get("/settings")
def read_settings(user: CurrentUser) -> dict:
    return levels_json(user)


class SettingsUpdate(BaseModel):
    level: Literal["A2", "B1", "B2", "C1"]


@router.put("/settings")
def update_settings(body: SettingsUpdate, user: CurrentUser) -> dict:
    set_setting(user, "level", body.level)
    return levels_json(user)


# --- Kitap başına sayılar (kütüphane kartları için) ---------------------------

def word_counts(user_id: int) -> dict[int, dict]:
    """Her kitap için seviyeye göre yeni ve öğrenilmekte olan kelime sayısı."""
    rows = get_conn().execute(
        """
        SELECT bw.book_id,
               COUNT(*) FILTER (WHERE ws.status IS NULL AND w.zipf > 0 AND w.zipf < ?
                                  AND bw.is_proper = 0 AND length(w.lemma) >= 3) AS new_words,
               COUNT(*) FILTER (WHERE ws.status = 'learning') AS learning_words,
               COUNT(*) FILTER (WHERE w.translation IS NULL AND w.zipf > 0 AND w.zipf < ?
                                  AND bw.is_proper = 0 AND length(w.lemma) >= 3) AS untranslated,
               COUNT(*) FILTER (WHERE w.zipf > 0 AND w.zipf < ?
                                  AND bw.is_proper = 0 AND length(w.lemma) >= 3) AS candidates
          FROM book_words bw
          JOIN words w ON w.id = bw.word_id
          LEFT JOIN word_status ws ON ws.word_id = bw.word_id AND ws.user_id = ?
         GROUP BY bw.book_id
        """,
        (level_cutoff(user_id), words.CANDIDATE_MAX_ZIPF, words.CANDIDATE_MAX_ZIPF, user_id),
    ).fetchall()
    return {
        r["book_id"]: {
            "new_words": r["new_words"],
            "learning_words": r["learning_words"],
            "translated": round(1 - r["untranslated"] / r["candidates"], 3) if r["candidates"] else 1.0,
        }
        for r in rows
    }


# --- Sayfa ve kitap kelimeleri -------------------------------------------------

def _book_or_404(book_id: int):
    row = get_conn().execute(
        "SELECT id, hash, page_count, words_status FROM books WHERE id = ?", (book_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Kitap bulunamadı.")
    return row


def _word_json(r) -> dict:
    return {
        "id": r["word_id"],
        "lemma": r["lemma"],
        "zipf": round(r["zipf"], 2),
        "status": r["status"] or "new",
        "book_count": r["book_count"],
        "translation": r["translation"] or None,
    }


@router.get("/books/{book_id}/pages/{page}/words")
def page_words(book_id: int, page: int, user: CurrentUser) -> dict:
    book = _book_or_404(book_id)
    if not 1 <= page <= max(book["page_count"], 1):
        raise HTTPException(404, "Sayfa bulunamadı.")
    rows = get_conn().execute(
        """
        SELECT pw.word_id, w.lemma, w.zipf, w.translation, ws.status, bw.count AS book_count,
               pw.count, pw.surfaces, s.text AS sentence
          FROM page_words pw
          JOIN words w       ON w.id = pw.word_id
          JOIN book_words bw ON bw.book_id = pw.book_id AND bw.word_id = pw.word_id
          JOIN sentences s   ON s.id = pw.sentence_id
          LEFT JOIN word_status ws ON ws.word_id = pw.word_id AND ws.user_id = ?
         WHERE pw.book_id = ? AND pw.page = ? AND w.zipf < ? AND bw.is_proper = 0
         ORDER BY w.zipf ASC
        """,
        (user, book_id, page, level_cutoff(user)),
    ).fetchall()
    items = [
        {
            **_word_json(r),
            "count": r["count"],
            "surfaces": r["surfaces"].split(","),
            "sentence": r["sentence"],
            "boxes": [],
        }
        for r in rows
    ]
    if items:
        by_surface = {s: item for item in items for s in item["surfaces"]}
        for token, *box in _page_boxes(book, page):
            item = by_surface.get(token)
            if item is not None:
                item["boxes"].append(box)
    return {"page": page, "words_status": book["words_status"], "words": items}


def _page_boxes(book, page: int) -> list:
    try:
        with pymupdf.open(processing.book_path(book["hash"])) as doc:
            return words.page_word_boxes(doc[page - 1])
    except Exception:  # noqa: BLE001 - vurgu olmadan da liste gösterilebilir
        return []


@router.get("/books/{book_id}/words")
def book_words(
    book_id: int,
    status: Literal["new", "learning", "all"] = "new",
    sort: Literal["count", "rare", "alpha", "page"] = "count",
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    *,
    user: CurrentUser,
) -> dict:
    _book_or_404(book_id)
    # Seviye filtresi yalnızca yeni kelimelere uygulanır; öğrenmek için
    # seçilenler (yaygın olsalar bile) her zaman listelenir.
    is_new = "(ws.status IS NULL AND w.zipf > 0 AND w.zipf < ? AND bw.is_proper = 0 AND length(w.lemma) >= 3)"
    where = ["bw.book_id = ?"]
    params: list = [user, book_id]
    if status == "new":
        where.append(is_new)
        params.append(level_cutoff(user))
    elif status == "learning":
        where.append("ws.status = 'learning'")
    else:
        where.append(f"({is_new} OR ws.status = 'learning')")
        params.append(level_cutoff(user))
    order = {
        "count": "bw.count DESC, w.zipf ASC",
        "rare": "w.zipf ASC",
        "alpha": "w.lemma",
        "page": "bw.first_page, w.lemma",
    }[sort]
    sql_from = f"""
          FROM book_words bw
          JOIN words w ON w.id = bw.word_id
          LEFT JOIN word_status ws ON ws.word_id = bw.word_id AND ws.user_id = ?
         WHERE {" AND ".join(where)}
    """
    conn = get_conn()
    total = conn.execute(f"SELECT COUNT(*) {sql_from}", params).fetchone()[0]
    rows = conn.execute(
        f"""
        SELECT bw.word_id, w.lemma, w.zipf, w.translation, ws.status, bw.count AS book_count, bw.first_page
        {sql_from}
        ORDER BY {order}
        LIMIT ? OFFSET ?
        """,
        (*params, limit, offset),
    ).fetchall()
    return {
        "total": total,
        "items": [{**_word_json(r), "first_page": r["first_page"]} for r in rows],
    }


@router.get("/books/{book_id}/words/{word_id}")
def book_word(book_id: int, word_id: int, user: CurrentUser, page: int | None = None) -> dict:
    """Bir kelimenin bu kitaptaki ayrıntısı; tercihen verilen sayfadaki cümleyle."""
    _book_or_404(book_id)
    conn = get_conn()
    r = conn.execute(
        """
        SELECT w.id AS word_id, w.lemma, w.zipf, w.translation, ws.status, COALESCE(bw.count, 0) AS book_count
          FROM words w
          LEFT JOIN book_words bw ON bw.word_id = w.id AND bw.book_id = ?
          LEFT JOIN word_status ws ON ws.word_id = w.id AND ws.user_id = ?
         WHERE w.id = ?
        """,
        (book_id, user, word_id),
    ).fetchone()
    if r is None:
        raise HTTPException(404, "Kelime bulunamadı.")
    occ = conn.execute(
        """
        SELECT pw.page, pw.surfaces, s.text
          FROM page_words pw JOIN sentences s ON s.id = pw.sentence_id
         WHERE pw.book_id = ? AND pw.word_id = ?
         ORDER BY (pw.page = ?) DESC, pw.page
         LIMIT 1
        """,
        (book_id, word_id, page or 0),
    ).fetchone()
    return {
        **_word_json(r),
        "page": occ["page"] if occ else None,
        "surfaces": occ["surfaces"].split(",") if occ else [r["lemma"]],
        "sentence": occ["text"] if occ else None,
    }


@router.get("/books/{book_id}/lookup")
def lookup(
    book_id: int,
    q: str | None = Query(None, min_length=1, max_length=60),
    page: int | None = None,
    x: float | None = Query(None, ge=0, le=1),
    y: float | None = Query(None, ge=0, le=1),
    *,
    user: CurrentUser,
) -> dict:
    """Okuyucuda tıklanan herhangi bir kelime (listede olmasa bile).

    Kelime ya metin olarak (q) ya da sayfadaki tıklama noktasıyla (x, y; sayfa
    boyutuna oranla) verilir.
    """
    book = _book_or_404(book_id)
    if q is None:
        if page is None or x is None or y is None:
            raise HTTPException(422, "Kelime ya da tıklama noktası gerekli.")
        q = _token_at(book, page, x, y)
        if q is None:
            raise HTTPException(404, "Bu noktada kelime yok.")
    tokens = words._TOKEN.findall(q)
    if not tokens:
        raise HTTPException(422, "Kelime anlaşılamadı.")
    surface = words.normalize_token(tokens[0])
    if len(surface) < 2:
        raise HTTPException(422, "Kelime çok kısa.")
    lemma = words.lemma_of(surface)

    with transaction() as tx:
        tx.execute(
            "INSERT OR IGNORE INTO words (lemma, zipf) VALUES (?, ?)", (lemma, words.zipf_of(lemma))
        )
        word_id = tx.execute("SELECT id FROM words WHERE lemma = ?", (lemma,)).fetchone()["id"]

    data = book_word(book_id, word_id, user, page)
    # Yaygın kelimeler sayfa kaydında tutulmaz; cümleyi o sayfanın metninden bul.
    if page and data["page"] != page:
        sentence = _sentence_on_page(book, page, surface)
        if sentence:
            data.update(page=page, sentence=sentence, surfaces=[surface])
    if surface not in data["surfaces"]:
        data["surfaces"] = [surface, *data["surfaces"]]
    return data


def _token_at(book, page: int, x: float, y: float) -> str | None:
    if not 1 <= page <= book["page_count"]:
        return None
    pad = 0.004
    best, best_dist = None, None
    for token, x0, y0, x1, y1 in _page_boxes(book, page):
        if x0 - pad <= x <= x1 + pad and y0 - pad <= y <= y1 + pad:
            dist = abs((x0 + x1) / 2 - x) + abs((y0 + y1) / 2 - y)
            if best_dist is None or dist < best_dist:
                best, best_dist = token, dist
    return best


def _sentence_on_page(book, page: int, surface: str) -> str | None:
    if not 1 <= page <= book["page_count"]:
        return None
    try:
        with pymupdf.open(processing.book_path(book["hash"])) as doc:
            text = words.page_text(doc[page - 1])
    except Exception:  # noqa: BLE001
        return None
    for sentence in words.split_sentences(text):
        for t in words._TOKEN.findall(sentence):
            token = words.normalize_token(t)
            if token == surface or words.lemma_of(token) == surface:
                return sentence[:700]
    return None


def _card_context(book_id: int, word_id: int, page: int | None) -> tuple[int | None, str | None]:
    """Kart için kitaptan bir örnek cümle: önce o sayfadan, yoksa kitabın ilk geçtiği yerden."""
    conn = get_conn()
    row = conn.execute(
        """
        SELECT pw.page, s.text FROM page_words pw JOIN sentences s ON s.id = pw.sentence_id
         WHERE pw.book_id = ? AND pw.word_id = ?
         ORDER BY (pw.page = ?) DESC, pw.page LIMIT 1
        """,
        (book_id, word_id, page or 0),
    ).fetchone()
    if row:
        return row["page"], row["text"]
    book = conn.execute("SELECT id, hash, page_count FROM books WHERE id = ?", (book_id,)).fetchone()
    lemma = conn.execute("SELECT lemma FROM words WHERE id = ?", (word_id,)).fetchone()
    if book and lemma and page:
        return page, _sentence_on_page(book, page, lemma["lemma"])
    return page, None


# --- Çeviri, sözlük ve örnek cümleler ------------------------------------------

@router.get("/words/{word_id}/details")
def word_details(word_id: int) -> dict:
    try:
        return enrich.word_details(word_id)
    except KeyError:
        raise HTTPException(404, "Kelime bulunamadı.") from None


class TranslateRequest(BaseModel):
    text: str


@router.post("/translate")
def translate(body: TranslateRequest) -> dict:
    text = body.text.strip()
    if not text or len(text) > 1500:
        raise HTTPException(422, "Metin boş ya da çok uzun.")
    try:
        return {"translation": enrich.translate_text(text)}
    except net.NetError:
        raise HTTPException(503, "Çeviri servisine ulaşılamadı.") from None


@router.get("/tatoeba")
def tatoeba_status() -> dict:
    return tatoeba.info()


@router.post("/tatoeba/refresh", status_code=202)
def tatoeba_refresh() -> dict:
    tatoeba.start_background(force=True)
    return tatoeba.info()


# --- Kelime durumu -----------------------------------------------------------

class StatusUpdate(BaseModel):
    status: Status
    # "Öğren" denilen yer; kartın örnek cümlesi buradan alınır.
    book_id: int | None = None
    page: int | None = None


@router.put("/words/{word_id}/status")
def set_status(word_id: int, body: StatusUpdate, user: CurrentUser) -> dict:
    page, sentence = body.page, None
    if body.status == "learning" and body.book_id:
        page, sentence = _card_context(body.book_id, word_id, body.page)
    with transaction() as tx:
        if tx.execute("SELECT 1 FROM words WHERE id = ?", (word_id,)).fetchone() is None:
            raise HTTPException(404, "Kelime bulunamadı.")
        book_id = body.book_id
        if book_id and tx.execute("SELECT 1 FROM books WHERE id = ?", (book_id,)).fetchone() is None:
            book_id = None  # kitap bu arada silinmiş; kart kitapsız oluşturulur
        if body.status == "new":
            tx.execute("DELETE FROM word_status WHERE user_id = ? AND word_id = ?", (user, word_id))
        else:
            tx.execute(
                "INSERT INTO word_status (user_id, word_id, status, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(user_id, word_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at",
                (user, word_id, body.status, int(time.time())),
            )
        if body.status == "learning":
            study.ensure_card(tx, user, word_id, book_id, page, sentence)
        else:
            study.suspend_card(tx, user, word_id)
    if body.status == "learning":
        # Çeviri ve sözlük bilgisini şimdiden al; çalışırken internet gerekmesin.
        enrich.prefetch_details(word_id)
    return {"id": word_id, "status": body.status}


@router.post("/books/{book_id}/reprocess-words", status_code=202)
def reprocess_words(book_id: int) -> Response:
    """Kelime çıkarma kuralları değiştiğinde bir kitabı yeniden işler."""
    book = _book_or_404(book_id)
    if book["words_status"] == "processing":
        raise HTTPException(409, "Kelimeler zaten hazırlanıyor.")
    with transaction() as tx:
        tx.execute("UPDATE books SET words_status = 'pending', words_progress = 0 WHERE id = ?", (book_id,))
    processing.enqueue_words(book_id)
    return Response(status_code=202)
