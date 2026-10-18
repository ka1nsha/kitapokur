"""Profiller.

Ev içinde kullanılan bir uygulama olduğu için şifre yoktur: herkes açılışta
kendi profilini seçer, seçim bir çerezde saklanır. Kitaplık ortaktır; okuma
konumu, kelime durumları, ayarlar ve kartlar profile özeldir.
"""

import re
import time
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from .db import get_conn, transaction

COOKIE = "okur_user"
COOKIE_MAX_AGE = 2 * 365 * 86400
COLORS = ["#0E6B5A", "#1F5FA8", "#9A4F0F", "#7A3E9D", "#A1281C", "#2E5E73", "#5A6168"]

router = APIRouter(prefix="/api")


def current_user(okur_user: str | None = Cookie(None)) -> int:
    """İsteği yapan profil. Seçilmemişse 401 döner; arayüz profil seçimine yönlendirir."""
    if okur_user and okur_user.isdigit():
        user_id = int(okur_user)
        conn = get_conn()
        row = conn.execute("SELECT id, last_seen_at FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is not None:
            now = int(time.time())
            # "Son görülme" en fazla dakikada bir yazılır (her istekte disk yazımı olmasın).
            if (row["last_seen_at"] or 0) < now - 60:
                with transaction() as tx:
                    tx.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (now, user_id))
            return user_id
    raise HTTPException(401, "profile_required")


CurrentUser = Annotated[int, Depends(current_user)]


# --- Profil ayarları ----------------------------------------------------------------

def get_setting(user_id: int, key: str) -> str | None:
    row = get_conn().execute(
        "SELECT value FROM user_settings WHERE user_id = ? AND key = ?", (user_id, key)
    ).fetchone()
    return row["value"] if row else None


def set_setting(user_id: int, key: str, value: str) -> None:
    with transaction() as tx:
        tx.execute(
            "INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) "
            "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
            (user_id, key, value),
        )


# --- Profil yönetimi -----------------------------------------------------------------

def _user_json(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "color": row["color"],
        "created_at": row["created_at"],
        "last_seen_at": row["last_seen_at"],
        "deck": row["deck"],
        "known": row["known"],
        "books": row["books"],
    }


_USER_SELECT = """
    SELECT u.*,
           (SELECT COUNT(*) FROM cards c WHERE c.user_id = u.id AND c.suspended = 0) AS deck,
           (SELECT COUNT(*) FROM word_status ws WHERE ws.user_id = u.id AND ws.status = 'known') AS known,
           (SELECT COUNT(*) FROM book_progress p WHERE p.user_id = u.id AND p.last_opened_at IS NOT NULL) AS books
      FROM users u
"""


def _user_or_404(user_id: int):
    row = get_conn().execute(f"{_USER_SELECT} WHERE u.id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Profil bulunamadı.")
    return row


class UserBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=40)
    color: str | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("İsim boş olamaz.")
        return v

    @field_validator("color")
    @classmethod
    def check_color(cls, v: str | None) -> str | None:
        if v is not None and not re.fullmatch(r"#[0-9A-Fa-f]{6}", v):
            raise ValueError("Renk #RRGGBB biçiminde olmalı.")
        return v


@router.get("/users")
def list_users() -> list[dict]:
    rows = get_conn().execute(f"{_USER_SELECT} ORDER BY u.last_seen_at IS NULL, u.last_seen_at DESC, u.id").fetchall()
    return [_user_json(r) for r in rows]


@router.post("/users", status_code=201)
def create_user(body: UserBody, response: Response) -> dict:
    conn = get_conn()
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count >= 12:
        raise HTTPException(409, "En fazla 12 profil oluşturulabilir.")
    if conn.execute("SELECT 1 FROM users WHERE lower(name) = lower(?)", (body.name,)).fetchone():
        raise HTTPException(409, "Bu isimde bir profil zaten var.")
    with transaction() as tx:
        cur = tx.execute(
            "INSERT INTO users (name, color, created_at) VALUES (?, ?, ?)",
            (body.name, body.color or COLORS[count % len(COLORS)], int(time.time())),
        )
        user_id = cur.lastrowid
    _set_cookie(response, user_id)
    return _user_json(_user_or_404(user_id))


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserBody) -> dict:
    _user_or_404(user_id)
    conn = get_conn()
    if conn.execute("SELECT 1 FROM users WHERE lower(name) = lower(?) AND id != ?", (body.name, user_id)).fetchone():
        raise HTTPException(409, "Bu isimde bir profil zaten var.")
    with transaction() as tx:
        tx.execute(
            "UPDATE users SET name = ?, color = COALESCE(?, color) WHERE id = ?", (body.name, body.color, user_id)
        )
    return _user_json(_user_or_404(user_id))


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, response: Response, okur_user: str | None = Cookie(None)) -> Response:
    _user_or_404(user_id)
    with transaction() as tx:
        # Kartlar ve tekrar geçmişi (kartlara bağlı) elle; diğerleri yabancı anahtarla silinir.
        tx.execute("DELETE FROM cards WHERE user_id = ?", (user_id,))
        tx.execute("DELETE FROM users WHERE id = ?", (user_id,))
    resp = Response(status_code=204)
    if okur_user == str(user_id):
        resp.delete_cookie(COOKIE, path="/")
    return resp


# --- Oturum (seçili profil) ------------------------------------------------------------

def _set_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        COOKIE, str(user_id), max_age=COOKIE_MAX_AGE, path="/", samesite="lax", httponly=True
    )


class SessionBody(BaseModel):
    user_id: int


@router.get("/session")
def read_session(user_id: CurrentUser) -> dict:
    return _user_json(_user_or_404(user_id))


@router.post("/session")
def start_session(body: SessionBody, response: Response) -> dict:
    row = _user_or_404(body.user_id)
    _set_cookie(response, body.user_id)
    with transaction() as tx:
        tx.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (int(time.time()), body.user_id))
    return _user_json(row)


@router.delete("/session", status_code=204)
def end_session() -> Response:
    resp = Response(status_code=204)
    resp.delete_cookie(COOKIE, path="/")
    return resp
