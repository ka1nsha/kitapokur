"""Yüklenen PDF'leri arka planda işler.

Pi'nin dört çekirdeğini okuma isteklerine bırakmak için tek bir işçi
kullanılır; kitaplar sırayla işlenir. Sonraki aşamalarda kelime çıkarma ve
çeviri adımları da bu kuyruğa eklenecek.
"""

import json
import logging
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pymupdf

from .config import BOOKS_DIR, COVER_WIDTH, COVERS_DIR
from . import words
from .db import get_conn, transaction

log = logging.getLogger("kitapokur.processing")

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pdf-worker")

# Sadece bu kadar sayfaya (kitaba yayılmış) bakarak PDF'in metin içerip içermediğine karar ver.
_TEXT_PROBE_PAGES = 12
# Filigran ve üstbilgiler çıkarıldıktan sonra bundan az metni olan sayfa metinsiz sayılır.
_MIN_PAGE_TEXT = 50

# Yazılım adı gibi görünen, kitap başlığı olarak işe yaramayan meta veriler.
_JUNK_TITLE = re.compile(
    r"^(untitled|unknown|microsoft word\b|document\d*$|\S+\.(docx?|pdf|indd|tex|qxd)$)",
    re.IGNORECASE,
)


def book_path(file_hash: str) -> Path:
    return BOOKS_DIR / f"{file_hash}.pdf"


def cover_path(file_hash: str) -> Path:
    return COVERS_DIR / f"{file_hash}.jpg"


def title_from_filename(filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"[_]+", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()
    return stem or "Adsız kitap"


def clean_meta(value: str | None) -> str:
    if not value:
        return ""
    value = re.sub(r"\s+", " ", value).strip()
    return value[:300]


def enqueue(book_id: int) -> None:
    _executor.submit(_process, book_id)


def enqueue_words(book_id: int) -> None:
    _executor.submit(_extract_words, book_id)


def requeue_pending() -> None:
    """Sunucu işlem sırasında kapandıysa yarım kalan kitapları tekrar sıraya al."""
    conn = get_conn()
    for row in conn.execute("SELECT id FROM books WHERE status = 'processing'").fetchall():
        enqueue(row["id"])
    rows = conn.execute(
        "SELECT id FROM books WHERE status = 'ready' AND words_status IN ('pending', 'processing')"
    ).fetchall()
    for row in rows:
        enqueue_words(row["id"])


def shutdown() -> None:
    _executor.shutdown(wait=False, cancel_futures=True)


def _process(book_id: int) -> None:
    conn = get_conn()
    row = conn.execute("SELECT hash, filename FROM books WHERE id = ?", (book_id,)).fetchone()
    if row is None:
        return
    try:
        result = _analyze(book_path(row["hash"]), cover_path(row["hash"]))
    except Exception as exc:  # noqa: BLE001 - kullanıcıya gösterilecek hata
        log.exception("Kitap %s işlenemedi", book_id)
        message = str(exc) if isinstance(exc, ProcessingError) else "PDF okunamadı. Dosya bozuk olabilir."
        with transaction() as tx:
            tx.execute("UPDATE books SET status = 'error', error = ? WHERE id = ?", (message, book_id))
        return

    with transaction() as tx:
        tx.execute(
            """
            UPDATE books
               SET page_count = ?, page_sizes = ?, has_text = ?,
                   -- Kullanıcı bu arada yeniden adlandırdıysa dokunma.
                   title = CASE WHEN ? != '' AND title = ? THEN ? ELSE title END,
                   author = CASE WHEN author = '' THEN ? ELSE author END,
                   status = 'ready', error = NULL,
                   words_status = CASE WHEN ? THEN 'pending' ELSE 'none' END
             WHERE id = ?
            """,
            (
                result["page_count"],
                json.dumps(result["page_sizes"], separators=(",", ":")),
                int(result["has_text"]),
                result["title"],
                title_from_filename(row["filename"]),
                result["title"],
                result["author"],
                int(result["has_text"]),
                book_id,
            ),
        )
    log.info("Kitap %s hazır (%s sayfa)", book_id, result["page_count"])
    # Okuma bu noktada başlayabilir; kelimeler arka planda hazırlanır.
    if result["has_text"]:
        _extract_words(book_id)


def _extract_words(book_id: int) -> None:
    row = get_conn().execute("SELECT hash FROM books WHERE id = ?", (book_id,)).fetchone()
    if row is None:
        return
    try:
        words.extract(book_id, book_path(row["hash"]))
        # Yeni kelimelerin çevirisi ayrı bir iş parçacığında, ağ üzerinden yapılır.
        from . import enrich
        enrich.request_translations()
    except Exception:  # noqa: BLE001
        log.exception("Kitap %s için kelimeler çıkarılamadı", book_id)
        with transaction() as tx:
            tx.execute("UPDATE books SET words_status = 'error' WHERE id = ?", (book_id,))


class ProcessingError(Exception):
    pass


def _has_text(doc: pymupdf.Document) -> bool:
    """Kitaba yayılmış örnek sayfalarda gerçek metin var mı?

    Taranmış PDF'lerde her sayfaya basılmış bir filigran ya da altbilgi
    satırı ("Join us -> site.com") bulunabilir; sayfaların çoğunda aynen
    tekrarlanan satırlar metin sayılmaz.
    """
    n = doc.page_count
    k = min(_TEXT_PROBE_PAGES, n)
    pages = sorted({round(i * (n - 1) / (k - 1)) for i in range(k)}) if k > 1 else [0]
    lines = {
        p: [s for s in (line.strip() for line in doc[p].get_text("text").splitlines()) if s]
        for p in pages
    }
    repeated: set[str] = set()
    if len(pages) >= 3:
        counts = Counter(line for p in pages for line in set(lines[p]))
        repeated = {line for line, c in counts.items() if c >= len(pages) * 0.6}
    return any(
        sum(len(line) for line in lines[p] if line not in repeated) >= _MIN_PAGE_TEXT
        for p in pages
    )


def _analyze(pdf: Path, cover: Path) -> dict:
    with pymupdf.open(pdf) as doc:
        if doc.needs_pass:
            raise ProcessingError("Şifreli PDF'ler desteklenmiyor.")
        if doc.page_count == 0:
            raise ProcessingError("PDF'te hiç sayfa yok.")

        # İstemci, sayfa iskeletini PDF.js her sayfayı yüklemeden önce
        # çizebilsin diye tüm sayfa boyutları (döndürme dahil) saklanır.
        sizes = []
        for page in doc:
            r = page.rect
            sizes.append([round(r.width, 1), round(r.height, 1)])

        has_text = _has_text(doc)

        first = doc[0]
        zoom = COVER_WIDTH / max(first.rect.width, 1)
        pix = first.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        tmp = cover.with_suffix(".tmp")
        tmp.write_bytes(pix.tobytes("jpg", jpg_quality=82))
        tmp.replace(cover)

        meta = doc.metadata or {}
        title = clean_meta(meta.get("title"))
        if _JUNK_TITLE.match(title) or len(title) < 2:
            title = ""
        author = clean_meta(meta.get("author"))

        return {
            "page_count": doc.page_count,
            "page_sizes": sizes,
            "has_text": has_text,
            "title": title,
            "author": author,
        }
