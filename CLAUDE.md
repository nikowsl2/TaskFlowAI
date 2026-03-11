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

## Agent Conventions
For each new feature, spawn agents in this order:
1. **Implementation agent** — plans and writes all code
2. **Test agent** — runs `pytest` + `npm test`, reports failures
3. **Review agent** — runs `ruff check` + `npm run lint`, reviews logic quality
