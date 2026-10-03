from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _encode(payload: dict[str, Any], ttl: timedelta) -> str:
    body = dict(payload)
    now = datetime.now(UTC)
    body.update({"iat": now, "exp": now + ttl, "jti": uuid.uuid4().hex})
    return jwt.encode(body, settings.secret_key, algorithm=settings.jwt_algorithm)


def _decode(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


def create_access_token(user_id: str) -> str:
    return _encode(
        {"sub": user_id, "type": "access"},
        timedelta(minutes=settings.access_token_ttl_minutes),
    )


def create_refresh_token(user_id: str) -> str:
    return _encode(
        {"sub": user_id, "type": "refresh"},
        timedelta(days=settings.refresh_token_ttl_days),
    )


def decode_token(token: str, expected_type: str = "access") -> str | None:
    try:
        payload = _decode(token)
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None
