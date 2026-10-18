"""Kitap içinde arama.

Sonuç listesi, kelime çıkarırken saklanan cümlelerden gelir (SQLite'ta
milisaniyeler sürer). Henüz cümleleri çıkarılmamış kitaplarda PDF'in metni
sayfa sayfa taranır. Vurgu kutuları yalnızca ekrandaki sayfalar için PyMuPDF
ile hesaplanır.
"""

import re
import unicodedata

import pymupdf
from fastapi import APIRouter, HTTPException, Query

from . import processing
from .db import get_conn

router = APIRouter(prefix="/api/books")

MAX_RESULTS = 300
_SNIPPET = 70  # eşleşmenin iki yanında gösterilecek karakter
_APOSTROPHES = "'’‘"


def _book(book_id: int):
    row = get_conn().execute(
        "SELECT id, hash, status, page_count, words_status FROM books WHERE id = ?", (book_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Kitap bulunamadı.")
    if row["status"] != "ready":
        raise HTTPException(409, "Kitap henüz hazır değil.")
    return row


def _normalize(q: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", q).split())


def _matcher(q: str) -> re.Pattern:
    """Büyük/küçük harf ve kesme işareti türü (' ’) fark etmeden eşleşir."""
    parts = [f"[{_APOSTROPHES}]" if ch in _APOSTROPHES else (r"\s+" if ch == " " else re.escape(ch)) for ch in q]
    return re.compile("".join(parts), re.IGNORECASE)


def _snippet(text: str, m: re.Match) -> dict:
    start = max(0, m.start() - _SNIPPET)
    end = min(len(text), m.end() + _SNIPPET)
    # Kelime ortasından kesme.
    if start > 0:
        space = text.find(" ", start, m.start())
        if space >= 0:
            start = space + 1
    if end < len(text):
        space = text.rfind(" ", m.end(), end)
        if space > 0:
            end = space
    return {
        "text": ("…" if start > 0 else "") + text[start:end] + ("…" if end < len(text) else ""),
        "start": m.start() - start + (1 if start > 0 else 0),
        "length": m.end() - m.start(),
    }


def _from_sentences(book_id: int, q: str, pattern: re.Pattern) -> tuple[list[dict], int]:
    # LIKE büyük/küçük harfe (ASCII) duyarsızdır; '_' kesme işaretinin her türüne uyar.
    like = "%" + "".join(
        "_" if ch in _APOSTROPHES else ("\\" + ch if ch in "%_\\" else ch) for ch in q
    ) + "%"
    rows = get_conn().execute(
        "SELECT page, text FROM sentences WHERE book_id = ? AND text LIKE ? ESCAPE '\\' ORDER BY page, id",
        (book_id, like),
    )
    items, total = [], 0
    for row in rows:
        for m in pattern.finditer(row["text"]):
            total += 1
            if len(items) < MAX_RESULTS:
                items.append({"page": row["page"], **_snippet(row["text"], m)})
    return items, total


def _from_pdf(book_hash: str, pattern: re.Pattern) -> tuple[list[dict], int]:
    items, total = [], 0
    with pymupdf.open(processing.book_path(book_hash)) as doc:
        for page in doc:
            text = " ".join(unicodedata.normalize("NFKC", page.get_text("text")).split())
            for m in pattern.finditer(text):
                total += 1
                if len(items) < MAX_RESULTS:
                    items.append({"page": page.number + 1, **_snippet(text, m)})
    return items, total


@router.get("/{book_id}/search")
def search(book_id: int, q: str = Query(..., min_length=1, max_length=100)) -> dict:
    book = _book(book_id)
    q = _normalize(q)
    if len(q) < 2:
        raise HTTPException(422, "En az iki harf yaz.")
    pattern = _matcher(q)
    if book["words_status"] == "ready":
        items, total = _from_sentences(book_id, q, pattern)
    else:
        items, total = _from_pdf(book["hash"], pattern)
    return {"q": q, "total": total, "items": items, "truncated": total > len(items)}


@router.get("/{book_id}/pages/{page}/search")
def page_hits(book_id: int, page: int, q: str = Query(..., min_length=1, max_length=100)) -> dict:
    """Bir sayfadaki eşleşmelerin kutuları, sayfa boyutuna oranla (0–1)."""
    book = _book(book_id)
    if not 1 <= page <= book["page_count"]:
        raise HTTPException(404, "Sayfa yok.")
    q = _normalize(q)
    # PyMuPDF büyük/küçük harfe duyarsız arar; kesme işaretinin iki türü de denenir.
    variants = {q, q.replace("'", "’"), q.replace("’", "'")}
    hits = []
    with pymupdf.open(processing.book_path(book["hash"])) as doc:
        p = doc[page - 1]
        rect, matrix = p.rect, p.rotation_matrix
        seen = set()
        for v in variants:
            # Satır sonunda bölünen eşleşme birden çok kutu (quad) olarak gelir.
            for quads in p.search_for(v, quads=True, flags=pymupdf.TEXT_DEHYPHENATE):
                r = quads.rect * matrix
                key = (round(r.x0), round(r.y0))
                if key in seen:
                    continue
                seen.add(key)
                hits.append([
                    round(r.x0 / rect.width, 4), round(r.y0 / rect.height, 4),
                    round(r.x1 / rect.width, 4), round(r.y1 / rect.height, 4),
                ])
    hits.sort(key=lambda b: (round(b[1], 2), b[0]))
    return {"page": page, "boxes": hits}
