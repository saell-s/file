from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.user import new_id, utcnow


class ActivityAction(enum.StrEnum):
    upload = "upload"
    download = "download"
    view = "view"
    edit = "edit"
    delete = "delete"
    restore = "restore"
    share = "share"
    login = "login"
    create = "create"


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    node_id: Mapped[str | None] = mapped_column(
        ForeignKey("nodes.id", ondelete="SET NULL"), index=True, nullable=True
    )
    action: Mapped[ActivityAction] = mapped_column(
        Enum(
            ActivityAction,
            name="activity_action",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    detail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
