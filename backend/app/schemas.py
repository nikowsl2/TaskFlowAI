from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


# ── Task schemas ──────────────────────────────────────────────────────────────


Priority = Literal["low", "medium", "high"]


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: Priority = "medium"
    due_date: datetime | None = None
    parent_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    completed: bool | None = None
    priority: Priority | None = None
    due_date: datetime | None = None


class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    completed: bool
    priority: Priority
    due_date: datetime | None
    parent_id: int | None
    created_at: datetime
    updated_at: datetime
    subtasks: list[TaskOut] = []

    model_config = {"from_attributes": True}


TaskOut.model_rebuild()


# ── Chat / Message schemas ────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    content: str


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
