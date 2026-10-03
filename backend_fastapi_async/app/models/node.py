from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import new_id, utcnow

SQLITE_LIVE = text("is_deleted = 0")
POSTGRES_LIVE = text("is_deleted = false")


class NodeType(enum.StrEnum):
    folder = "folder"
    file = "file"


class Node(Base):
    """Folders and files live in one adjacency-list tree (parent_id -> nodes.id)."""

    __tablename__ = "nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"), index=True, nullable=True
    )
    node_type: Mapped[NodeType] = mapped_column(
        Enum(NodeType, name="node_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    size: Mapped[int] = mapped_column(BigInteger, default=0)
    mime_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    thumbnail_key: Mapped[str | None] = mapped_column(String(120), nullable=True)

    is_starred: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_root_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    parent: Mapped[Node | None] = relationship("Node", remote_side=[id], back_populates="children")
    children: Mapped[list[Node]] = relationship(
        "Node", back_populates="parent", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_nodes_owner_parent", "owner_id", "parent_id"),
        Index(
            "uq_nodes_sibling_live",
            "owner_id",
            "parent_id",
            "name",
            unique=True,
            sqlite_where=SQLITE_LIVE,
            postgresql_where=POSTGRES_LIVE,
        ),
    )

    @property
    def type(self) -> str:
        return self.node_type.value
