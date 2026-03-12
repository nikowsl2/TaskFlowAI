"""AI tool definitions, typed I/O models, and dispatcher.

Every tool follows this contract:
  Input  — a Pydantic model validated from the raw args dict the AI provides
  Output — a ToolResult serialized to JSON; the AI always receives structured data

Adding a new tool requires:
  1. An Input model (BaseModel subclass)
  2. A branch in execute_tool() that validates via the model and returns ToolResult
  3. An entry in TOOL_DEFINITIONS (OpenAI format — Anthropic format is auto-derived)
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.models import CalendarEvent, Document, EmailDraft, Task

Priority = Literal["low", "medium", "high"]


# ── Input models ──────────────────────────────────────────────────────────────


class CreateTaskInput(BaseModel):
    title: str
    description: str | None = None
    priority: Priority = "medium"
    due_date: str | None = None  # ISO 8601, e.g. "2025-06-01"
    parent_id: int | None = None


class ListTasksInput(BaseModel):
    pass


class UpdateTaskInput(BaseModel):
    task_id: int
    title: str | None = None
    description: str | None = None
    priority: Priority | None = None
    due_date: str | None = None  # ISO 8601; send empty string "" to clear
    completed: bool | None = None


class DeleteTaskInput(BaseModel):
    task_id: int


class CompleteTaskInput(BaseModel):
    task_id: int


class AddCalendarEventInput(BaseModel):
    title: str
    start_time: str  # ISO 8601 datetime, e.g. "2025-06-02T10:00:00"
    end_time: str | None = None  # ISO 8601 datetime
    description: str | None = None


class ListCalendarEventsInput(BaseModel):
    pass


class UpdateCalendarEventInput(BaseModel):
    event_id: int
    title: str | None = None
    start_time: str | None = None  # ISO 8601 datetime
    end_time: str | None = None  # ISO 8601 datetime; send "" to clear
    description: str | None = None


class DeleteCalendarEventInput(BaseModel):
    event_id: int


class DraftEmailInput(BaseModel):
    to: str  # comma-separated recipients
    subject: str
    body: str


class UpdateEmailDraftInput(BaseModel):
    draft_id: int
    to: str | None = None
    subject: str | None = None
    body: str | None = None


class GetEmailDraftInput(BaseModel):
    draft_id: int | None = None  # None = latest


class ListDocumentsInput(BaseModel):
    pass  # no args


class SearchDocumentsInput(BaseModel):
    query: str
    document_id: int | None = None
    n_results: int = 5


# ── Output model ──────────────────────────────────────────────────────────────


class ToolResult(BaseModel):
    """Structured result returned to the AI for every tool call."""

    ok: bool
    message: str
    data: dict[str, Any] | None = None

    def to_json(self) -> str:
        return self.model_dump_json()


# ── Tool definitions (OpenAI format) ─────────────────────────────────────────

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": (
                "Create a new task. Use this when the user asks to add, create, or schedule a task."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short task title"},
                    "description": {
                        "type": "string",
                        "description": "Optional longer description or notes",
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                        "description": "Task priority level",
                    },
                    "due_date": {
                        "type": "string",
                        "description": (
                            "Optional deadline in ISO 8601 format YYYY-MM-DD, e.g. '2026-03-18'. "
                            "You MUST resolve relative dates like 'next Wednesday' to a concrete date "
                            "before calling this tool. Never pass relative date strings."
                        ),
                    },
                    "parent_id": {
                        "type": "integer",
                        "description": "ID of parent task if this is a subtask",
                    },
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_tasks",
            "description": (
                "List all current tasks with their IDs, titles, priorities, completion status, "
                "and due dates. Call this first when you need a task ID to act on."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": (
                "Update any field of an existing task: rename it (title), edit its description, "
                "change priority, set or clear a deadline (due_date), or mark it complete/incomplete. "
                "Only send the fields you want to change."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "ID of the task to update"},
                    "title": {"type": "string", "description": "New title for the task"},
                    "description": {
                        "type": "string",
                        "description": "New description / notes for the task",
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                        "description": "New priority level",
                    },
                    "due_date": {
                        "type": "string",
                        "description": (
                            "New deadline in ISO 8601 format YYYY-MM-DD, e.g. '2026-03-18'. "
                            "Always resolve relative dates to a concrete date before calling. "
                            "Send an empty string '' to remove the deadline."
                        ),
                    },
                    "completed": {
                        "type": "boolean",
                        "description": "true to mark complete, false to reopen",
                    },
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "Permanently delete a task and all its subtasks.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "ID of the task to delete"},
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "complete_task",
            "description": "Mark a task as completed. Prefer this over update_task when the only goal is completion.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "ID of the task to complete"},
                },
                "required": ["task_id"],
            },
        },
    },
    # Calendar event tools disabled — calendar reflects tasks only for now
    {
        "type": "function",
        "function": {
            "name": "draft_email",
            "description": (
                "Create a new email draft with recipient(s), subject, and body. "
                "Use when the user asks you to write, compose, or draft an email. "
                "The draft is saved and displayed to the user for review and copying. "
                "After drafting, also create any tasks or calendar events implied by the email content."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {
                        "type": "string",
                        "description": "Recipient email address(es), comma-separated if multiple. "
                        "If no email address is known, use the person's name.",
                    },
                    "subject": {"type": "string", "description": "Email subject line"},
                    "body": {"type": "string", "description": "Full email body text"},
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_email_draft",
            "description": (
                "Update an existing email draft. Use when the user asks to revise, refine, "
                "edit, or adjust a previously created draft. Only send the fields to change."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "draft_id": {"type": "integer", "description": "ID of the draft to update"},
                    "to": {"type": "string", "description": "New recipient(s)"},
                    "subject": {"type": "string", "description": "New subject line"},
                    "body": {"type": "string", "description": "New email body"},
                },
                "required": ["draft_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_email_draft",
            "description": "Retrieve an existing email draft to review its current content before editing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "draft_id": {
                        "type": "integer",
                        "description": "ID of the draft to retrieve. Omit to get the most recent draft.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_documents",
            "description": (
                "List all uploaded documents with their IDs, filenames, file types, and AI summaries. "
                "Call this first to discover what documents are available before searching."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_documents",
            "description": (
                "Retrieve semantically relevant text chunks from uploaded documents. "
                "Use this to answer questions about document content. "
                "Optionally filter by document_id to search a specific document."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query — be specific and focused",
                    },
                    "document_id": {
                        "type": "integer",
                        "description": "Optional: restrict search to a specific document by ID",
                    },
                    "n_results": {
                        "type": "integer",
                        "description": "Number of chunks to return (default 5, max 10)",
                    },
                },
                "required": ["query"],
            },
        },
    },
]


def _to_anthropic_format() -> list[dict]:
    result = []
    for t in TOOL_DEFINITIONS:
        fn = t["function"]
        result.append(
            {"name": fn["name"], "description": fn["description"], "input_schema": fn["parameters"]}
        )
    return result


ANTHROPIC_TOOL_DEFINITIONS = _to_anthropic_format()


# ── Dispatcher ────────────────────────────────────────────────────────────────


def execute_tool(name: str, args: dict, db: Session) -> str:
    """Validate input, run the tool, return a ToolResult JSON string."""
    try:
        return _dispatch(name, args, db).to_json()
    except ValidationError as e:
        return ToolResult(ok=False, message=f"Invalid arguments: {e.errors()}").to_json()
    except Exception as e:
        return ToolResult(ok=False, message=f"Tool error: {e}").to_json()


def _dispatch(name: str, args: dict, db: Session) -> ToolResult:
    if name == "create_task":
        inp = CreateTaskInput.model_validate(args)
        due = _parse_date(inp.due_date)
        task = Task(
            title=inp.title,
            description=inp.description,
            priority=inp.priority,
            due_date=due,
            parent_id=inp.parent_id,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return ToolResult(
            ok=True,
            message=f"Created task #{task.id}: '{task.title}'",
            data={"id": task.id, "title": task.title, "priority": task.priority},
        )

    if name == "list_tasks":
        ListTasksInput.model_validate(args)
        tasks = db.query(Task).filter(Task.parent_id.is_(None)).all()
        task_list = [
            {
                "id": t.id,
                "title": t.title,
                "priority": t.priority,
                "completed": t.completed,
                "due_date": t.due_date.date().isoformat() if t.due_date else None,
                "subtask_count": len(t.subtasks),
            }
            for t in tasks
        ]
        return ToolResult(
            ok=True,
            message=f"Found {len(tasks)} task(s)",
            data={"tasks": task_list},
        )

    if name == "update_task":
        inp = UpdateTaskInput.model_validate(args)
        task = db.get(Task, inp.task_id)
        if not task:
            return ToolResult(ok=False, message=f"Task #{inp.task_id} not found.")

        updated_fields: list[str] = []
        if inp.title is not None:
            task.title = inp.title
            updated_fields.append("title")
        if inp.description is not None:
            task.description = inp.description
            updated_fields.append("description")
        if inp.priority is not None:
            task.priority = inp.priority
            updated_fields.append("priority")
        if inp.completed is not None:
            task.completed = inp.completed
            updated_fields.append("completed")
        if inp.due_date is not None:
            # Empty string explicitly clears the deadline
            task.due_date = None if inp.due_date == "" else _parse_date(inp.due_date)
            updated_fields.append("due_date")

        db.commit()
        return ToolResult(
            ok=True,
            message=f"Updated task #{task.id}: '{task.title}' (fields: {', '.join(updated_fields)})",
            data={"id": task.id, "title": task.title, "updated_fields": updated_fields},
        )

    if name == "delete_task":
        inp = DeleteTaskInput.model_validate(args)
        task = db.get(Task, inp.task_id)
        if not task:
            return ToolResult(ok=False, message=f"Task #{inp.task_id} not found.")
        title = task.title
        db.delete(task)
        db.commit()
        return ToolResult(
            ok=True,
            message=f"Deleted task #{inp.task_id}: '{title}'",
            data={"id": inp.task_id},
        )

    if name == "complete_task":
        inp = CompleteTaskInput.model_validate(args)
        task = db.get(Task, inp.task_id)
        if not task:
            return ToolResult(ok=False, message=f"Task #{inp.task_id} not found.")
        task.completed = True
        db.commit()
        return ToolResult(
            ok=True,
            message=f"Marked task #{task.id}: '{task.title}' as completed",
            data={"id": task.id, "title": task.title},
        )

    if name == "add_calendar_event":
        inp = AddCalendarEventInput.model_validate(args)
        start = _parse_datetime(inp.start_time)
        if start is None:
            return ToolResult(ok=False, message=f"Invalid start_time: '{inp.start_time}'")
        end = _parse_datetime(inp.end_time) if inp.end_time else None
        ev = CalendarEvent(
            title=inp.title,
            description=inp.description,
            start_time=start,
            end_time=end,
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)
        return ToolResult(
            ok=True,
            message=f"Added calendar event #{ev.id}: '{ev.title}' at {ev.start_time.isoformat()}",
            data={"id": ev.id, "title": ev.title, "start_time": ev.start_time.isoformat()},
        )

    if name == "list_calendar_events":
        ListCalendarEventsInput.model_validate(args)
        events = db.query(CalendarEvent).order_by(CalendarEvent.start_time.asc()).all()
        event_list = [
            {
                "id": e.id,
                "title": e.title,
                "start_time": e.start_time.isoformat(),
                "end_time": e.end_time.isoformat() if e.end_time else None,
                "description": e.description,
            }
            for e in events
        ]
        return ToolResult(
            ok=True,
            message=f"Found {len(events)} calendar event(s)",
            data={"events": event_list},
        )

    if name == "update_calendar_event":
        inp = UpdateCalendarEventInput.model_validate(args)
        ev = db.get(CalendarEvent, inp.event_id)
        if not ev:
            return ToolResult(ok=False, message=f"Event #{inp.event_id} not found.")
        updated_fields: list[str] = []
        if inp.title is not None:
            ev.title = inp.title
            updated_fields.append("title")
        if inp.description is not None:
            ev.description = inp.description
            updated_fields.append("description")
        if inp.start_time is not None:
            parsed = _parse_datetime(inp.start_time)
            if parsed is None:
                return ToolResult(ok=False, message=f"Invalid start_time: '{inp.start_time}'")
            ev.start_time = parsed
            updated_fields.append("start_time")
        if inp.end_time is not None:
            ev.end_time = None if inp.end_time == "" else _parse_datetime(inp.end_time)
            updated_fields.append("end_time")
        db.commit()
        return ToolResult(
            ok=True,
            message=f"Updated event #{ev.id}: '{ev.title}' (fields: {', '.join(updated_fields)})",
            data={"id": ev.id, "title": ev.title, "updated_fields": updated_fields},
        )

    if name == "delete_calendar_event":
        inp = DeleteCalendarEventInput.model_validate(args)
        ev = db.get(CalendarEvent, inp.event_id)
        if not ev:
            return ToolResult(ok=False, message=f"Event #{inp.event_id} not found.")
        title = ev.title
        db.delete(ev)
        db.commit()
        return ToolResult(
            ok=True,
            message=f"Deleted calendar event #{inp.event_id}: '{title}'",
            data={"id": inp.event_id},
        )

    if name == "draft_email":
        inp = DraftEmailInput.model_validate(args)
        draft = EmailDraft(to_field=inp.to, subject=inp.subject, body=inp.body)
        db.add(draft)
        db.commit()
        db.refresh(draft)
        return ToolResult(
            ok=True,
            message=f"Email draft #{draft.id} created: '{draft.subject}'",
            data={
                "id": draft.id,
                "to_field": draft.to_field,
                "subject": draft.subject,
                "body": draft.body,
                "created_at": draft.created_at.isoformat(),
                "updated_at": draft.updated_at.isoformat(),
            },
        )

    if name == "update_email_draft":
        inp = UpdateEmailDraftInput.model_validate(args)
        draft = db.get(EmailDraft, inp.draft_id)
        if not draft:
            return ToolResult(ok=False, message=f"Draft #{inp.draft_id} not found.")
        if inp.to is not None:
            draft.to_field = inp.to
        if inp.subject is not None:
            draft.subject = inp.subject
        if inp.body is not None:
            draft.body = inp.body
        db.commit()
        db.refresh(draft)
        return ToolResult(
            ok=True,
            message=f"Email draft #{draft.id} updated",
            data={
                "id": draft.id,
                "to_field": draft.to_field,
                "subject": draft.subject,
                "body": draft.body,
                "created_at": draft.created_at.isoformat(),
                "updated_at": draft.updated_at.isoformat(),
            },
        )

    if name == "get_email_draft":
        inp = GetEmailDraftInput.model_validate(args)
        if inp.draft_id:
            draft = db.get(EmailDraft, inp.draft_id)
        else:
            draft = db.query(EmailDraft).order_by(EmailDraft.created_at.desc()).first()
        if not draft:
            return ToolResult(ok=False, message="No email draft found.")
        return ToolResult(
            ok=True,
            message=f"Email draft #{draft.id}: '{draft.subject}'",
            data={
                "id": draft.id,
                "to_field": draft.to_field,
                "subject": draft.subject,
                "body": draft.body,
                "created_at": draft.created_at.isoformat(),
                "updated_at": draft.updated_at.isoformat(),
            },
        )

    if name == "list_documents":
        ListDocumentsInput.model_validate(args)
        docs = db.query(Document).order_by(Document.created_at.desc()).all()
        doc_list = [
            {
                "id": d.id,
                "filename": d.filename,
                "file_type": d.file_type,
                "summary": d.summary,
                "char_count": d.char_count,
                "chunk_count": d.chunk_count,
            }
            for d in docs
        ]
        return ToolResult(
            ok=True,
            message=f"Found {len(docs)} document(s)",
            data={"documents": doc_list},
        )

    if name == "search_documents":
        from app.ai.rag import smart_search

        inp = SearchDocumentsInput.model_validate(args)
        n = min(inp.n_results, 10)

        # Validate document_id if provided — never trust the AI's guess
        doc_summary = None
        valid_doc_id = inp.document_id
        if valid_doc_id is not None:
            doc = db.get(Document, valid_doc_id)
            if doc:
                doc_summary = doc.summary
            else:
                # ID doesn't exist — fall back to searching all documents
                valid_doc_id = None

        results = smart_search(inp.query, valid_doc_id, n, doc_summary=doc_summary)

        # If filtered search returned nothing, retry across all documents
        if not results and valid_doc_id is not None:
            results = smart_search(inp.query, None, n)

        # Enrich results with filenames from SQL
        doc_ids = {r["document_id"] for r in results if r.get("document_id")}
        docs_by_id = {}
        for did in doc_ids:
            doc = db.get(Document, did)
            if doc:
                docs_by_id[did] = doc.filename

        for r in results:
            filename = docs_by_id.get(r.get("document_id"), "unknown")
            r["filename"] = filename
            page_num = r.pop("page_num", None)
            r["source"] = f"Page {page_num} — {filename}" if page_num else filename

        return ToolResult(
            ok=True,
            message=f"Found {len(results)} chunk(s) for query: '{inp.query}'",
            data={"results": results},
        )

    return ToolResult(ok=False, message=f"Unknown tool: '{name}'")


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parse_date(value: str | None) -> datetime | None:
    """Parse an ISO date string to datetime; returns None on failure or empty input."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None


def _parse_datetime(value: str | None) -> datetime | None:
    """Parse an ISO datetime string; returns None on failure or empty input."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None
