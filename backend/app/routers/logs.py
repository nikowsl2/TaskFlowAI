"""Debug log endpoints."""

from fastapi import APIRouter

from app import log_store

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/")
def get_logs():
    return list(reversed(log_store.get_all()))  # newest first


@router.delete("/", status_code=204)
def clear_logs():
    log_store.clear()
