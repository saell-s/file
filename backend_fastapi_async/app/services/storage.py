from __future__ import annotations

import hashlib
import logging
import shutil
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

CHUNK = 1024 * 1024


@dataclass
class SavedObject:
    key: str
    size: int
    sha256: str
    deduplicated: bool


class LocalDriver:
    """Content-addressed local object store. Key -> <base>/<key>."""

    def __init__(self, base: Path | None = None) -> None:
        self.base = Path(base or settings.storage_dir)
        self.tmp = self.base / ".tmp"

    def ensure(self) -> None:
        self.base.mkdir(parents=True, exist_ok=True)
        self.tmp.mkdir(parents=True, exist_ok=True)

    def path_for(self, key: str) -> Path:
        return self.base / key

    def exists(self, key: str) -> bool:
        return self.path_for(key).is_file()

    async def save_stream(self, chunks: AsyncIterator[bytes]) -> SavedObject:
        self.ensure()
        tmp_path = self.tmp / f"{uuid.uuid4().hex}.part"
        digest = hashlib.sha256()
        size = 0
        with open(tmp_path, "wb") as fh:
            async for chunk in chunks:
                if not chunk:
                    continue
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    fh.close()
                    tmp_path.unlink(missing_ok=True)
                    raise PermissionError("upload-too-large")
                digest.update(chunk)
                fh.write(chunk)

        sha = digest.hexdigest()
        key = f"{sha[:2]}/{sha}"
        target = self.path_for(key)
        if target.is_file():
            tmp_path.unlink(missing_ok=True)
            return SavedObject(key=key, size=size, sha256=sha, deduplicated=True)

        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp_path), str(target))
        return SavedObject(key=key, size=size, sha256=sha, deduplicated=False)

    def write_bytes(self, key: str, data: bytes) -> None:
        self.ensure()
        target = self.path_for(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def read_bytes(self, key: str) -> bytes | None:
        path = self.path_for(key)
        return path.read_bytes() if path.is_file() else None

    def delete(self, key: str | None) -> None:
        if not key:
            return
        path = self.path_for(key)
        try:
            path.unlink(missing_ok=True)
            parent = path.parent
            if parent != self.base and parent.is_dir() and not any(parent.iterdir()):
                parent.rmdir()
        except OSError:
            logger.warning("failed to delete object %s", key)

    def delete_many(self, keys: list[str]) -> None:
        for key in keys:
            self.delete(key)


driver = LocalDriver()


def thumbnail_key_for(node_id: str) -> str:
    return f"thumbs/{node_id}.jpg"
