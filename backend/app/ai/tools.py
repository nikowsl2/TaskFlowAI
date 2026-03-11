from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Task

# ── Tool definitions (OpenAI format — converted for Anthropic in agent.py) ───

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Create a new task in the task list.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Task title"},
                    "description": {"type": "string", "description": "Optional details"},
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                        "description": "Task priority",
                    },
                    "due_date": {
                        "type": "string",
                        "description": "ISO 8601 due date (optional)",
                    },
                    "parent_id": {
                        "type": "integer",
                        "description": "Parent task id for subtasks (optional)",
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
            "description": "List all root-level tasks.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "Update fields of an existing task by id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "Task id to update"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                    "due_date": {"type": "string", "description": "ISO 8601 date"},
                    "completed": {"type": "boolean"},
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "Delete a task by id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "Task id to delete"},
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "complete_task",
            "description": "Mark a task as completed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "Task id to complete"},
                },
                "required": ["task_id"],
            },
        },
    },
]


def _anthropic_tools():
    """Convert OpenAI tool format to Anthropic format."""
    result = []
    for t in TOOL_DEFINITIONS:
        fn = t["function"]
        result.append(
            {
                "name": fn["name"],
                "description": fn["description"],
                "input_schema": fn["parameters"],
            }
        )
    return result


ANTHROPIC_TOOL_DEFINITIONS = _anthropic_tools()


# ── Dispatcher ────────────────────────────────────────────────────────────────


def execute_tool(name: str, args: dict, db: Session) -> str:
    if name == "create_task":
        due = None
        if args.get("due_date"):
            try:
                due = datetime.fromisoformat(args["due_date"])
            except ValueError:
                pass
        task = Task(
            title=args["title"],
            description=args.get("description"),
            priority=args.get("priority", "medium"),
            due_date=due,
            parent_id=args.get("parent_id"),
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return f"Created task #{task.id}: {task.title}"

    elif name == "list_tasks":
        tasks = db.query(Task).filter(Task.parent_id.is_(None)).all()
        if not tasks:
            return "No tasks found."
        lines = [f"#{t.id} [{t.priority}] {'✓' if t.completed else '○'} {t.title}" for t in tasks]
        return "\n".join(lines)

    elif name == "update_task":
        task = db.get(Task, args["task_id"])
        if not task:
            return f"Task #{args['task_id']} not found."
        for field in ("title", "description", "priority", "completed"):
            if field in args:
                setattr(task, field, args[field])
        if args.get("due_date"):
            try:
                task.due_date = datetime.fromisoformat(args["due_date"])
            except ValueError:
                pass
        db.commit()
        return f"Updated task #{task.id}: {task.title}"

    elif name == "delete_task":
        task = db.get(Task, args["task_id"])
        if not task:
            return f"Task #{args['task_id']} not found."
        db.delete(task)
        db.commit()
        return f"Deleted task #{args['task_id']}."

    elif name == "complete_task":
        task = db.get(Task, args["task_id"])
        if not task:
            return f"Task #{args['task_id']} not found."
        task.completed = True
        db.commit()
        return f"Task #{task.id} marked as completed."

    return f"Unknown tool: {name}"
