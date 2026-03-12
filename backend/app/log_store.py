"""Structured log store — in-memory ring buffer + append-only JSONL file on disk."""

import json
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MAX_ENTRIES = 300

# Stored next to the backend package: backend/logs/taskflow.jsonl
LOG_FILE = Path(__file__).parent.parent / "logs" / "taskflow.jsonl"

_buffer: deque = deque(maxlen=MAX_ENTRIES)

# Event type constants
CHAT_REQUEST = "chat_request"
AGENT_START = "agent_start"
TOOL_CALL = "tool_call"
TOOL_RESULT = "tool_result"
AGENT_DONE = "agent_done"
AGENT_ERROR = "agent_error"
QUERY_REWRITE = "query_rewrite"


def _ensure_dir() -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load_from_disk() -> None:
    """Populate the in-memory buffer from the existing log file on startup."""
    if not LOG_FILE.exists():
        return
    try:
        lines = LOG_FILE.read_text(encoding="utf-8").splitlines()
        for line in lines[-MAX_ENTRIES:]:  # only last MAX_ENTRIES lines
            entry = json.loads(line)
            _buffer.append(entry)
    except Exception:
        pass  # corrupt file — start fresh in memory, leave file alone


def log(event: str, data: dict[str, Any], level: str = "INFO") -> None:
    entry = {
        "id": uuid.uuid4().hex[:8],
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "event": event,
        "data": data,
    }
    _buffer.append(entry)
    # Append to disk
    try:
        _ensure_dir()
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass  # never let logging break the app


def get_all() -> list[dict]:
    return list(_buffer)


def clear() -> None:
    _buffer.clear()
    try:
        _ensure_dir()
        LOG_FILE.write_text("", encoding="utf-8")
    except Exception:
        pass


# Load existing logs into memory when the module is first imported
_load_from_disk()
