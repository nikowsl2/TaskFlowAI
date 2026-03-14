from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# ── User Profile schemas ──────────────────────────────────────────────────────


class UserProfileUpdate(BaseModel):
    role_and_goals: str | None = None
    preferences: str | None = None
    current_focus: str | None = None
    extra_notes: str | None = None


class UserProfileOut(BaseModel):
    id: int
    role_and_goals: str | None = None
    preferences: str | None = None
    current_focus: str | None = None
    extra_notes: str | None = None
    active_goals: str | None = None
    conversation_summary: str | None = None
    updated_at: datetime | None = None
    model_config = {"from_attributes": True}


# ── Project schemas ───────────────────────────────────────────────────────────


class LogEpisodeRequest(BaseModel):
    memory_text: str


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: Literal["active", "on-hold", "completed"] | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    last_accessed: datetime | None = None
    model_config = {"from_attributes": True}


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


class ContextAttachment(BaseModel):
    type: str
    id: int
    title: str | None = None
    name: str | None = None
    priority: str | None = None
    completed: bool | None = None
    due_date: str | None = None
    description: str | None = None
    summary: str | None = None
    subject: str | None = None
    to_field: str | None = None
    body: str | None = None
    status: str | None = None


class FileAttachment(BaseModel):
    name: str
    content: str


class ChatMessage(BaseModel):
    content: str
    context: list[ContextAttachment] | None = None
    files: list[FileAttachment] | None = None


class MessageOut(BaseModel):
    id: int
    role: Literal["user", "assistant", "morning_brief"]
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Calendar Event schemas ────────────────────────────────────────────────────


class CalendarEventCreate(BaseModel):
    title: str
    description: str | None = None
    start_time: datetime
    end_time: datetime | None = None


class CalendarEventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None


class CalendarEventOut(BaseModel):
    id: int
    title: str
    description: str | None
    start_time: datetime
    end_time: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Email Draft schemas ───────────────────────────────────────────────────────


class EmailDraftCreate(BaseModel):
    to_field: str
    subject: str
    body: str


class EmailDraftUpdate(BaseModel):
    to_field: str | None = None
    subject: str | None = None
    body: str | None = None


class EmailDraftOut(BaseModel):
    id: int
    to_field: str
    subject: str
    body: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Document schemas ──────────────────────────────────────────────────────────


class DocumentOut(BaseModel):
    id: int
    filename: str
    file_type: str
    summary: str
    char_count: int
    chunk_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentSearchResult(BaseModel):
    chunk_text: str
    document_id: int
    filename: str
    score: float


# ── Meeting Note schemas ───────────────────────────────────────────────────────


class MeetingNoteCreate(BaseModel):
    title: str
    summary: str
    content: str
    meeting_time: datetime


class MeetingNoteUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    meeting_time: datetime | None = None


class MeetingNoteOut(BaseModel):
    id: int
    title: str
    summary: str
    content: str
    meeting_time: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
