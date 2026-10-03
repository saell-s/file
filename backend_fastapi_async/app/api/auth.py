from __future__ import annotations

from fastapi import APIRouter, Request, status
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.deps import CurrentUser, DbSession
from app.core.errors import conflict, unauthorized
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import ActivityAction, ActivityLog, User
from app.models.user import utcnow
from app.schemas.auth import LoginIn, RefreshIn, RegisterIn, TokenPair, UserOut
from app.schemas.common import Message
from app.services.rate_limit import rate_limit_ok

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _issue(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, db: DbSession, request: Request) -> TokenPair:
    email = body.email.lower().strip()
    existing = await db.scalar(select(User.id).where(func.lower(User.email) == email))
    if existing is not None:
        raise conflict("An account with that email already exists")
    user = User(
        email=email,
        full_name=body.full_name.strip(),
        hashed_password=hash_password(body.password),
        storage_limit_bytes=settings.default_storage_limit_bytes,
    )
    db.add(user)
    await db.flush()
    db.add(
        ActivityLog(
            user_id=user.id,
            action=ActivityAction.login,
            detail="account created",
            ip=_client_ip(request),
        )
    )
    await db.commit()
    return _issue(user)


@router.post("/token", response_model=TokenPair)
async def login(body: LoginIn, db: DbSession, request: Request) -> TokenPair:
    email = body.email.lower().strip()
    ip = _client_ip(request)
    if not await rate_limit_ok(f"login:{ip}:{email}"):
        raise unauthorized("Too many attempts, please try again later")
    user = await db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None or not verify_password(body.password, user.hashed_password):
        raise unauthorized("Incorrect email or password")
    user.last_login_at = utcnow()
    db.add(ActivityLog(user_id=user.id, action=ActivityAction.login, detail="signed in", ip=ip))
    await db.commit()
    return _issue(user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshIn, db: DbSession) -> TokenPair:
    user_id = decode_token(body.refresh_token, expected_type="refresh")
    if not user_id:
        raise unauthorized("Invalid refresh token")
    user = await db.get(User, user_id)
    if user is None:
        raise unauthorized("Account no longer exists")
    return _issue(user)


@router.post("/logout", response_model=Message)
async def logout(user: CurrentUser) -> Message:
    return Message(message="Signed out")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


def new_session():
    """Used by background workers that do not run inside a request."""
    return SessionLocal()
