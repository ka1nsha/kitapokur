"""Uygulama ayarları. Hepsi ortam değişkeniyle değiştirilebilir."""

import os
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_DIR / "frontend"

DATA_DIR = Path(os.environ.get("KITAPOKUR_DATA", PROJECT_DIR / "data")).resolve()
BOOKS_DIR = DATA_DIR / "books"
COVERS_DIR = DATA_DIR / "covers"
UPLOAD_TMP_DIR = DATA_DIR / "tmp"
DB_PATH = DATA_DIR / "kitapokur.db"

# Tek bir PDF için üst sınır (MB). Pi'nin diskini yanlışlıkla doldurmamak için.
MAX_UPLOAD_MB = int(os.environ.get("KITAPOKUR_MAX_UPLOAD_MB", "500"))

# Kapak küçük resminin genişliği (px). Kütüphane ızgarası için yeterli.
COVER_WIDTH = int(os.environ.get("KITAPOKUR_COVER_WIDTH", "360"))


def ensure_dirs() -> None:
    for d in (DATA_DIR, BOOKS_DIR, COVERS_DIR, UPLOAD_TMP_DIR):
        d.mkdir(parents=True, exist_ok=True)
