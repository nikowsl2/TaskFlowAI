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

from app.models import Task

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
                        "description": "Optional deadline in ISO 8601 format, e.g. '2025-06-01'",
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
                            "New deadline in ISO 8601 format, e.g. '2025-06-01'. "
                            "Send an empty string to remove the deadline."
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

    return ToolResult(ok=False, message=f"Unknown tool: '{name}'")


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parse_date(value: str | None) -> datetime | None:
    """Parse an ISO date string to datetime; returns None on failure or empty input."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        # Try date-only format
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None
