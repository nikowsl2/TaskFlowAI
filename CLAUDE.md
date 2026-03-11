# TaskFlow AI

AI-powered task management workspace. Single-user local app / demo.

## Stack
- **Backend**: FastAPI (Python 3.11+), SQLAlchemy (SQLite), Pydantic Settings
- **Frontend**: React 18 + Vite + TypeScript, Tailwind CSS, React Query, Zustand
- **AI**: OpenAI or Anthropic (configurable via `.env`)

## Directory Layout
```
TaskFlowAI/
├── backend/          FastAPI app
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── models.py
│       ├── schemas.py
│       ├── routers/  (tasks.py, chat.py)
│       └── ai/       (agent.py, tools.py)
└── frontend/         React + Vite app
    └── src/
        ├── components/
        ├── hooks/
        ├── store/
        └── lib/
```

## Running Locally

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then fill in API keys
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev   # runs on http://localhost:5173
```

Health check: `GET http://localhost:8000/api/health`

## Env Setup
Copy `backend/.env.example` to `backend/.env` and set:
- `AI_PROVIDER` — `openai` or `anthropic`
- `AI_MODEL` — e.g. `gpt-4o` or `claude-sonnet-4-6`
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

## Lint / Format
```bash
# Backend
ruff check .
ruff format .

# Frontend
npm run lint
npm run format
```

## Tests
```bash
# Backend
pytest

# Frontend
npm test
```

## Features Implemented
- **2 modes** (top-bar toggle): Manual | AI Chat
  - Manual: full task board with **List / Calendar** view toggle in header + floating AI chat widget (bottom-right)
  - AI Chat: chat panel + compact accordion task sidebar
- **Task fields**: title, description, priority (low/medium/high, validated via `Literal` in Pydantic), optional deadline (`due_date`)
- **Calendar view** (`CalendarView.tsx`): day/week/month scale; overdue tasks highlighted red; month-day click drills to day view; footer shows count of tasks without deadlines; subtasks included (flattened)
- **Dark/light theme**: toggle in top-right, persisted to localStorage via Zustand persist middleware
- **AI task management**: SSE streaming chat, 5 tools (create/list/update/delete/complete), `due_date` supported in natural language

## Key Technical Notes
- `Task.due_date` stored as naive UTC `DateTime` in SQLite; frontend sends `"YYYY-MM-DDT00:00:00"`
- Task router uses `exclude_unset=True` — sending `due_date: null` explicitly clears the field
- Subtasks use self-referential FK `parent_id → tasks.id` with CASCADE delete
- AI provider switching: OpenAI uses `tool_choice="auto"` stream; Anthropic uses `tools=` param with converted schema
- `datetime.utcnow` replaced with `lambda: datetime.now(timezone.utc).replace(tzinfo=None)` throughout models

## Possible Next Steps
- Recurring tasks (daily/weekly/monthly)
- Drag-and-drop to reschedule from calendar
- Task tags / categories
- Export to iCal / PDF

## AI Tool Coding Guidelines

Every tool in `backend/app/ai/tools.py` **must** follow this contract:

### 1. Typed input model
Define a Pydantic `BaseModel` for each tool's arguments:
```python
class MyToolInput(BaseModel):
    task_id: int
    some_field: str | None = None
```

### 2. Structured output via ToolResult
All tools return `ToolResult` (never a raw string):
```python
class ToolResult(BaseModel):
    ok: bool        # True = success, False = error
    message: str    # Human-readable summary (shown to AI)
    data: dict | None = None  # Optional structured payload
```

### 3. Dispatcher pattern
The public `execute_tool()` catches all exceptions and wraps them in `ToolResult(ok=False, ...)`.
Internal `_dispatch()` raises freely — Pydantic `ValidationError` is caught automatically.

### 4. Adding a new tool checklist
- [ ] Input model (Pydantic)
- [ ] Branch in `_dispatch()` — validate with `MyToolInput.model_validate(args)`
- [ ] Entry in `TOOL_DEFINITIONS` (OpenAI JSON schema format) — Anthropic format auto-derived
- [ ] Update system prompt in `agent.py` if the tool changes what the AI can do

---

## Agent Conventions
For each new feature, spawn agents in this order:
1. **Implementation agent** — plans and writes all code
2. **Test agent** — runs `pytest` + `npm test`, reports failures
3. **Review agent** — runs `ruff check` + `npm run lint`, reviews logic quality
