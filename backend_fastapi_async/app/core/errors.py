from __future__ import annotations

from fastapi import HTTPException, status


class AppError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(status_code=status_code, detail={"code": code, "message": message})


def not_found(message: str = "Not found") -> AppError:
    return AppError(status.HTTP_404_NOT_FOUND, "not_found", message)


def forbidden(message: str = "You do not have permission to do that") -> AppError:
    return AppError(status.HTTP_403_FORBIDDEN, "forbidden", message)


def conflict(message: str = "Already exists") -> AppError:
    return AppError(status.HTTP_409_CONFLICT, "conflict", message)


def bad_request(message: str = "Invalid request") -> AppError:
    return AppError(status.HTTP_400_BAD_REQUEST, "bad_request", message)


def unauthorized(message: str = "Invalid or expired credentials") -> AppError:
    return AppError(status.HTTP_401_UNAUTHORIZED, "unauthorized", message)


def too_large(message: str = "File exceeds the allowed size") -> AppError:
    return AppError(status.HTTP_413_CONTENT_TOO_LARGE, "too_large", message)
