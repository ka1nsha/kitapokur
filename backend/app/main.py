"""KitapOkur: Raspberry Pi üzerinde çalışan PDF okuyucu."""

import hashlib
import json
import logging
import mimetypes
import os
import time
import uuid
from contextlib import asynccontextmanager
from urllib.parse import unquote

import anyio
from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import cards_api, enrich, processing, study_api, tatoeba, toc, users, words_api
from .config import FRONTEND_DIR, MAX_UPLOAD_MB, UPLOAD_TMP_DIR, ensure_dirs
from .db import get_conn, migrate, transaction

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# Bazı sistemlerin mime veritabanında yok; PWA kurulumu için doğru tür gerekli.
mimetypes.add_type("application/manifest+json", ".webmanifest")

# Diske yazmadan önce bellekte biriktirilecek miktar. SD kart ve USB
# disklerde küçük ve sık yazmalardan çok daha hızlıdır.
_WRITE_BUFFER = 1024 * 1024
_IMMUTABLE = "private, max-age=31536000, immutable"


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_dirs()
    migrate()
    for leftover in UPLOAD_TMP_DIR.glob("*.part"):
        leftover.unlink(missing_ok=True)
    processing.requeue_pending()
    enrich.start()
    # Örnek cümle verisi yoksa ya da bir aydan eskiyse arka planda indir.
    if os.environ.get("KITAPOKUR_TATOEBA_AUTO", "1") != "0":
        tatoeba.start_background()
    yield
    processing.shutdown()


app = FastAPI(title="KitapOkur", lifespan=lifespan, docs_url="/api/docs", redoc_url=None)
app.include_router(users.router)
app.include_router(words_api.router)
app.include_router(study_api.router)
app.include_router(cards_api.router)


# --- Yardımcılar -------------------------------------------------------------

def book_json(row, detail: bool = False) -> dict:
    page_count = row["page_count"]
    progress = 0.0
    if page_count:
        progress = min(1.0, (row["last_page"] - 1 + row["last_offset"]) / page_count)
    data = {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "filename": row["filename"],
        "file_size": row["file_size"],
        "page_count": page_count,
        "has_text": bool(row["has_text"]),
        "last_page": row["last_page"],
        "last_offset": row["last_offset"],
        "progress": round(progress, 4),
        "status": row["status"],
        "error": row["error"],
        "created_at": row["created_at"],
        "last_opened_at": row["last_opened_at"],
        "cover_url": f"/api/books/{row['id']}/cover" if row["status"] == "ready" else None,        "words_status": row["words_status"],
        "words_progress": row["words_progress"],
    }
    if detail:
        data["page_sizes"] = json.loads(row["page_sizes"]) if row["page_sizes"] else []
    return data


# Okuma konumu profile özeldir; kitap satırına o profilin konumu eklenir.
_BOOK_SELECT = """
    SELECT b.*, COALESCE(p.last_page, 1) AS last_page, COALESCE(p.last_offset, 0) AS last_offset,
           p.last_opened_at AS last_opened_at
      FROM books b
      LEFT JOIN book_progress p ON p.book_id = b.id AND p.user_id = ?
"""


def get_book_row(book_id: int, user_id: int = 0):
    row = get_conn().execute(f"{_BOOK_SELECT} WHERE b.id = ?", (user_id, book_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Kitap bulunamadı.")
    return row


# --- Kitaplar ----------------------------------------------------------------

@app.get("/api/books")
def list_books(user: users.CurrentUser) -> list[dict]:
    rows = get_conn().execute(
        f"{_BOOK_SELECT} ORDER BY COALESCE(p.last_opened_at, b.created_at) DESC", (user,)
    ).fetchall()
    counts = words_api.word_counts(user)
    empty = {"new_words": 0, "learning_words": 0, "translated": 1.0}
    translating = enrich.state["running"]
    return [{**book_json(r), **counts.get(r["id"], empty), "translating": translating} for r in rows]


@app.get("/api/books/{book_id}")
def get_book(book_id: int, user: users.CurrentUser) -> dict:
    return book_json(get_book_row(book_id, user), detail=True)


@app.post("/api/books", status_code=201)
async def upload_book(
    request: Request,
    response: Response,
    user: users.CurrentUser,
    x_filename: str = Header(..., description="URL-encoded dosya adı"),
) -> dict:
    """PDF'i ham gövde olarak alır; multipart ayrıştırma maliyeti olmadan diske akıtır."""
    filename = unquote(x_filename).replace("/", "_").replace("\\", "_")[:255] or "kitap.pdf"
    limit = MAX_UPLOAD_MB * 1024 * 1024
    tmp = UPLOAD_TMP_DIR / f"{uuid.uuid4().hex}.part"
    digest = hashlib.sha256()
    head = b""
    size = 0
    buffer = bytearray()

    try:
        async with await anyio.open_file(tmp, "wb") as f:
            async for chunk in request.stream():
                if not chunk:
                    continue
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"Dosya {MAX_UPLOAD_MB} MB sınırını aşıyor.")
                if len(head) < 1024:
                    head += chunk[: 1024 - len(head)]
                digest.update(chunk)
                buffer += chunk
                if len(buffer) >= _WRITE_BUFFER:
                    await f.write(bytes(buffer))
                    buffer.clear()
            if buffer:
                await f.write(bytes(buffer))
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise

    # PDF başlığı dosyanın ilk 1024 baytında herhangi bir yerde olabilir.
    if b"%PDF-" not in head:
        tmp.unlink(missing_ok=True)
        raise HTTPException(415, "Bu dosya bir PDF değil.")

    file_hash = digest.hexdigest()
    conn = get_conn()
    existing = conn.execute("SELECT id FROM books WHERE hash = ?", (file_hash,)).fetchone()
    if existing is not None:
        tmp.unlink(missing_ok=True)
        response.status_code = 200
        return {**book_json(get_book_row(existing["id"], user)), "duplicate": True}

    os.replace(tmp, processing.book_path(file_hash))
    with transaction() as tx:
        cur = tx.execute(
            """
            INSERT INTO books (hash, title, filename, file_size, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (file_hash, processing.title_from_filename(filename), filename, size, int(time.time())),
        )
        book_id = cur.lastrowid
    processing.enqueue(book_id)
    return {**book_json(get_book_row(book_id, user)), "duplicate": False}


class BookUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    author: str | None = Field(None, max_length=300)


@app.patch("/api/books/{book_id}")
def update_book(book_id: int, body: BookUpdate, user: users.CurrentUser) -> dict:
    get_book_row(book_id)
    fields = {k: v.strip() for k, v in body.model_dump(exclude_none=True).items()}
    if "title" in fields and not fields["title"]:
        raise HTTPException(422, "Başlık boş olamaz.")
    if fields:
        sets = ", ".join(f"{k} = ?" for k in fields)
        with transaction() as tx:
            tx.execute(f"UPDATE books SET {sets} WHERE id = ?", (*fields.values(), book_id))
    return book_json(get_book_row(book_id, user))


@app.delete("/api/books/{book_id}", status_code=204)
def delete_book(book_id: int, user: users.CurrentUser) -> Response:
    row = get_book_row(book_id)
    with transaction() as tx:
        tx.execute("DELETE FROM books WHERE id = ?", (book_id,))
    processing.book_path(row["hash"]).unlink(missing_ok=True)
    processing.cover_path(row["hash"]).unlink(missing_ok=True)
    return Response(status_code=204)


class Progress(BaseModel):
    page: int = Field(..., ge=1)
    offset: float = Field(0, ge=0, le=1)


@app.post("/api/books/{book_id}/progress", status_code=204)
def save_progress(book_id: int, body: Progress, user: users.CurrentUser) -> Response:
    """Okuma konumunu kaydeder. Tarayıcı kapanırken sendBeacon ile de çağrılır."""
    row = get_book_row(book_id, user)
    page = min(body.page, max(row["page_count"], 1))
    with transaction() as tx:
        tx.execute(
            """
            INSERT INTO book_progress (user_id, book_id, last_page, last_offset, last_opened_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, book_id) DO UPDATE
               SET last_page = excluded.last_page, last_offset = excluded.last_offset,
                   last_opened_at = excluded.last_opened_at
            """,
            (user, book_id, page, round(body.offset, 4), int(time.time())),
        )
    return Response(status_code=204)


# Kitap ve kapak dosyaları içerik hash'iyle saklanır ve bir kimliğe ait
# dosya hiç değişmez; tarayıcı bunları süresiz önbelleğe alabilir.

@app.get("/api/books/{book_id}/file")
def book_file(book_id: int) -> FileResponse:
    row = get_book_row(book_id)
    return FileResponse(
        processing.book_path(row["hash"]),
        media_type="application/pdf",
        headers={"Cache-Control": _IMMUTABLE},
    )


@app.get("/api/books/{book_id}/toc")
def book_toc(book_id: int) -> dict:
    row = get_book_row(book_id)
    if row["status"] != "ready":
        raise HTTPException(409, "Kitap henüz hazır değil.")
    if row["toc"]:
        return json.loads(row["toc"])
    data = toc.build(processing.book_path(row["hash"]))
    with transaction() as tx:
        tx.execute("UPDATE books SET toc = ? WHERE id = ?", (toc.dumps(data), book_id))
    return data


@app.get("/api/books/{book_id}/cover")
def book_cover(book_id: int) -> FileResponse:
    row = get_book_row(book_id)
    path = processing.cover_path(row["hash"])
    if not path.exists():
        raise HTTPException(404, "Kapak henüz hazır değil.")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": _IMMUTABLE})


# --- Arayüz ------------------------------------------------------------------

class CachedStaticFiles(StaticFiles):
    def __init__(self, *args, cache_control: str, **kwargs):
        super().__init__(*args, **kwargs)
        self.cache_control = cache_control

    def file_response(self, *args, **kwargs):
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = self.cache_control
        return resp


# Sürümü sabit üçüncü parti dosyalar uzun süre önbellekte kalır; uygulamanın
# kendi dosyaları her açılışta ETag ile doğrulanır, güncellemeler hemen görünür.
app.mount(
    "/vendor",
    CachedStaticFiles(directory=FRONTEND_DIR / "vendor", cache_control="public, max-age=2592000"),
    name="vendor",
)
app.mount(
    "/",
    CachedStaticFiles(directory=FRONTEND_DIR, html=True, cache_control="no-cache"),
    name="frontend",
)
