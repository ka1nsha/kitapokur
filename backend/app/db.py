"""SQLite bağlantısı ve şema göçleri.

Her iş parçacığı kendi bağlantısını kullanır (FastAPI'nin thread havuzu ve
arka plan işleyicisi). WAL modu sayesinde okuma ve yazma birbirini bekletmez.
"""

import sqlite3
import threading
from contextlib import contextmanager

from .config import DB_PATH

_local = threading.local()

# Her eleman bir şema sürümü. Yeni değişiklikler listenin sonuna eklenir,
# mevcut olanlar asla düzenlenmez.
MIGRATIONS = [
    """
    CREATE TABLE books (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        hash           TEXT    NOT NULL UNIQUE,
        title          TEXT    NOT NULL,
        author         TEXT    NOT NULL DEFAULT '',
        filename       TEXT    NOT NULL,
        file_size      INTEGER NOT NULL,
        page_count     INTEGER NOT NULL DEFAULT 0,
        page_sizes     TEXT,
        has_text       INTEGER NOT NULL DEFAULT 0,
        last_page      INTEGER NOT NULL DEFAULT 1,
        last_offset    REAL    NOT NULL DEFAULT 0,
        status         TEXT    NOT NULL DEFAULT 'processing',
        error          TEXT,
        created_at     INTEGER NOT NULL,
        last_opened_at INTEGER
    );
    CREATE INDEX books_last_opened ON books(last_opened_at);
    """,
    # 2: kelime çıkarma
    """
    ALTER TABLE books ADD COLUMN words_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE books ADD COLUMN words_progress REAL NOT NULL DEFAULT 0;

    -- Tüm kitaplarda ortak sözlük. zipf: wordfreq sıklığı (7 ≈ "the", 0 = bilinmiyor).
    CREATE TABLE words (
        id    INTEGER PRIMARY KEY,
        lemma TEXT NOT NULL UNIQUE,
        zipf  REAL NOT NULL
    );

    -- Kayıt yoksa kelime "yeni" sayılır.
    CREATE TABLE word_status (
        word_id    INTEGER PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
        status     TEXT NOT NULL CHECK (status IN ('learning', 'known', 'ignored')),
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE book_words (
        book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        word_id    INTEGER NOT NULL REFERENCES words(id),
        count      INTEGER NOT NULL,
        first_page INTEGER NOT NULL,
        is_proper  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (book_id, word_id)
    ) WITHOUT ROWID;
    CREATE INDEX book_words_word ON book_words(word_id);

    CREATE TABLE sentences (
        id      INTEGER PRIMARY KEY,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        page    INTEGER NOT NULL,
        text    TEXT NOT NULL
    );
    CREATE INDEX sentences_page ON sentences(book_id, page);

    -- Yalnızca öğrenmeye aday (yeterince seyrek) kelimeler için tutulur.
    CREATE TABLE page_words (
        book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        page        INTEGER NOT NULL,
        word_id     INTEGER NOT NULL REFERENCES words(id),
        count       INTEGER NOT NULL,
        sentence_id INTEGER NOT NULL,
        surfaces    TEXT NOT NULL,
        PRIMARY KEY (book_id, page, word_id)
    ) WITHOUT ROWID;

    CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    UPDATE books SET words_status = 'none' WHERE status = 'ready' AND has_text = 0;
    """,
    # 3: çeviri ve sözlük bilgisi
    """
    ALTER TABLE words ADD COLUMN translation TEXT;
    -- JSON: telaffuz, ses, türlere göre Türkçe anlamlar ve İngilizce tanımlar
    ALTER TABLE words ADD COLUMN details TEXT;
    ALTER TABLE words ADD COLUMN details_at INTEGER;

    -- Cümle çevirileri için önbellek (aynı metin bir daha çevrilmez).
    CREATE TABLE translations (
        src        TEXT PRIMARY KEY,
        tr         TEXT NOT NULL,
        created_at INTEGER NOT NULL
    ) WITHOUT ROWID;
    """,
    # 4: flashcard (FSRS)
    """
    -- state: 0 yeni (hiç çalışılmadı), 1 öğreniyor, 2 tekrar, 3 yeniden öğreniyor
    -- fsrs: py-fsrs kartının JSON hâli; NULL ise kart hiç çalışılmamıştır.
    CREATE TABLE cards (
        id         INTEGER PRIMARY KEY,
        word_id    INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        book_id    INTEGER REFERENCES books(id) ON DELETE SET NULL,
        page       INTEGER,
        sentence   TEXT,
        state      INTEGER NOT NULL DEFAULT 0,
        due        INTEGER NOT NULL,
        fsrs       TEXT,
        suspended  INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX cards_word ON cards(word_id);
    CREATE INDEX cards_due ON cards(suspended, state, due);

    CREATE TABLE reviews (
        id           INTEGER PRIMARY KEY,
        card_id      INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        rating       INTEGER NOT NULL,
        mode         TEXT,
        state_before INTEGER NOT NULL,
        reviewed_at  INTEGER NOT NULL,
        duration_ms  INTEGER
    );
    CREATE INDEX reviews_time ON reviews(reviewed_at);

    -- Daha önce "Öğren" denmiş kelimeler için kart oluştur; örnek cümle,
    -- kelimenin geçtiği en son açılan kitaptan alınır.
    INSERT INTO cards (word_id, book_id, page, sentence, state, due, created_at)
    SELECT ws.word_id, src.book_id, src.page, src.text, 0, ws.updated_at, ws.updated_at
      FROM word_status ws
      LEFT JOIN (
          SELECT pw.word_id, pw.book_id, pw.page, s.text,
                 ROW_NUMBER() OVER (PARTITION BY pw.word_id
                                    ORDER BY COALESCE(b.last_opened_at, b.created_at) DESC, pw.page) AS rn
            FROM page_words pw
            JOIN sentences s ON s.id = pw.sentence_id
            JOIN books b ON b.id = pw.book_id
      ) src ON src.word_id = ws.word_id AND src.rn = 1
     WHERE ws.status = 'learning';
    """,
    # 5: profiller. Kitaplık ortak; okuma konumu, kelime durumu, ayarlar ve
    # kartlar her profile ayrı. Mevcut veriler ilk profile taşınır.
    """
    CREATE TABLE users (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT NOT NULL,
        color        TEXT NOT NULL DEFAULT '#0E6B5A',
        created_at   INTEGER NOT NULL,
        last_seen_at INTEGER
    );
    INSERT INTO users (id, name, color, created_at) VALUES (1, 'Ben', '#0E6B5A', CAST(strftime('%s', 'now') AS INTEGER));

    CREATE TABLE book_progress (
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        last_page      INTEGER NOT NULL DEFAULT 1,
        last_offset    REAL    NOT NULL DEFAULT 0,
        last_opened_at INTEGER,
        PRIMARY KEY (user_id, book_id)
    ) WITHOUT ROWID;
    INSERT INTO book_progress (user_id, book_id, last_page, last_offset, last_opened_at)
    SELECT 1, id, last_page, last_offset, last_opened_at FROM books
     WHERE last_opened_at IS NOT NULL OR last_page > 1;
    DROP INDEX books_last_opened;
    ALTER TABLE books DROP COLUMN last_page;
    ALTER TABLE books DROP COLUMN last_offset;
    ALTER TABLE books DROP COLUMN last_opened_at;

    CREATE TABLE user_word_status (
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        word_id    INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        status     TEXT NOT NULL CHECK (status IN ('learning', 'known', 'ignored')),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, word_id)
    ) WITHOUT ROWID;
    INSERT INTO user_word_status (user_id, word_id, status, updated_at)
    SELECT 1, word_id, status, updated_at FROM word_status;
    DROP TABLE word_status;
    ALTER TABLE user_word_status RENAME TO word_status;

    CREATE TABLE user_settings (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key     TEXT NOT NULL,
        value   TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
    ) WITHOUT ROWID;
    INSERT INTO user_settings (user_id, key, value)
    SELECT 1, key, value FROM settings WHERE key IN ('level', 'new_per_day');
    DELETE FROM settings WHERE key IN ('level', 'new_per_day');

    -- SQLite, sonradan eklenen sütuna varsayılanı NULL olmayan bir REFERENCES
    -- izin vermiyor; profil silinirken kartlar elle silinir.
    ALTER TABLE cards ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
    DROP INDEX cards_word;
    CREATE UNIQUE INDEX cards_user_word ON cards(user_id, word_id);
    DROP INDEX cards_due;
    CREATE INDEX cards_due ON cards(user_id, suspended, state, due);
    """,
    # 6: içindekiler önbelleği; kart tarayıcısında düzenlenen anlam ve not
    """
    -- JSON (bkz. toc.py); NULL ise henüz hesaplanmadı.
    ALTER TABLE books ADD COLUMN toc TEXT;
    -- Profilin kendi yazdığı anlam; boşsa kelimenin ortak çevirisi kullanılır.
    ALTER TABLE cards ADD COLUMN translation TEXT;
    ALTER TABLE cards ADD COLUMN note TEXT;
    """,
]


def get_conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(DB_PATH, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA temp_store=MEMORY")
        _local.conn = conn
    return conn


@contextmanager
def transaction():
    conn = get_conn()
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def migrate() -> None:
    conn = get_conn()
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    for i, sql in enumerate(MIGRATIONS[version:], start=version + 1):
        with transaction() as tx:
            for stmt in _statements(sql):
                tx.execute(stmt)
            tx.execute(f"PRAGMA user_version={i}")


def _statements(sql: str):
    """SQL betiğini ifadelere böl (yorum ve metin içindeki ';' işaretlerini doğru ele alır)."""
    buf = ""
    for line in sql.splitlines(keepends=True):
        buf += line
        if sqlite3.complete_statement(buf):
            if buf.strip():
                yield buf
            buf = ""
    if buf.strip() and not all(l.strip().startswith("--") or not l.strip() for l in buf.splitlines()):
        yield buf
