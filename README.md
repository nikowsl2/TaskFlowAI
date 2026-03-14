# TaskFlowAI

An AI-powered task management workspace with natural language chat, meeting notes extraction, document RAG search, calendar views, and project tracking. Built with FastAPI, React, and OpenAI/Anthropic APIs.

## Features

### Dual Mode Interface
- **Manual Mode** — Full task board with List and Calendar views, plus a floating AI chat widget
- **AI Chat Mode** — Full-page agentic chat with a compact sidebar for tasks, notes, emails, docs, and projects

### Task Management
- Create, edit, complete, and delete tasks with priority levels (low / medium / high) and optional deadlines
- Subtask hierarchy with parent-child relationships
- Calendar view with day/week/month navigation and overdue highlighting

### AI Agent
- Natural language task management — create, update, and organize tasks through conversation
- **Morning Brief** — daily summary of overdue tasks, upcoming deadlines, active projects, and quick wins
- **Episodic Memory** — the agent remembers project history and user preferences across conversations
- **Ambiguity Resolution** — asks clarifying questions instead of guessing
- Supports both OpenAI and Anthropic as interchangeable providers

### Document Knowledge Base (RAG)
- Upload documents (TXT, DOCX, PDF, MD, CSV) up to 20 MB
- AI-generated summaries on upload
- Semantic search with BM25 + embedding reranking and source citations

### Meeting Notes
- Paste or upload meeting notes for AI extraction
- Automatically identifies action items with priority and deadline inference
- One-click task creation from extracted candidates

### Email Drafting
- AI-powered email composition with revision workflow
- Draft management with copy-to-clipboard

### Projects & Profile
- Track projects with status (active / on-hold / completed) and episodic memory
- User profile that the AI learns and adapts to over time

### UI
- Dark and light theme with toggle (persisted to localStorage)
- Inter font, responsive layout, smooth transitions

## Architecture

```mermaid
graph TD
    subgraph Frontend [React Frontend]
        UI[UI Components / Tailwind]
        State[Zustand / React Query]
    end

    subgraph Backend[FastAPI Backend]
        Router[API Routers]
        Agent[Agentic Loop & Tools]
        RAG[RAG Pipeline]
    end

    subgraph Databases [Data Storage]
        SQL[(SQLite)]
        Vector[(ChromaDB)]
    end

    subgraph External [External APIs]
        LLM((OpenAI / Anthropic))
    end

    %% Connections
    UI <-->|REST API| Router
    State <--> UI
    Router <--> Agent
    Agent <-->|Prompt / Tool Calls| LLM
    Agent --> RAG
    Router <-->|ORM| SQL
    RAG <-->|Embeddings| Vector
    RAG <-->|Metadata| SQL

    classDef react fill:#61dafb,stroke:#333,stroke-width:2px,color:#000;
    classDef python fill:#3776ab,stroke:#333,stroke-width:2px,color:#fff;
    classDef db fill:#f2a900,stroke:#333,stroke-width:2px,color:#000;

    class Frontend react;
    class Backend python;
    class Databases db;
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Query |
| Backend | FastAPI, SQLAlchemy, Pydantic, SQLite |
| AI | OpenAI / Anthropic (configurable), ChromaDB (vector store), BM25 |
| Documents | PyMuPDF, python-docx, pypdf |

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- An OpenAI or Anthropic API key

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in your API keys
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # runs on http://localhost:5173
```

### Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

```env
AI_PROVIDER=openai           # openai | anthropic
AI_MODEL=gpt-4o              # e.g. gpt-4o, claude-sonnet-4-6
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=sqlite:///./taskflow.db
FRONTEND_URL=http://localhost:5173
```

### Health Check

```
GET http://localhost:8000/api/health
```

## Project Structure

```
TaskFlowAI/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + migrations
│   │   ├── config.py          # Pydantic settings
│   │   ├── database.py        # SQLAlchemy engine + session
│   │   ├── models.py          # ORM models
│   │   ├── schemas.py         # Request/response schemas
│   │   ├── ai/
│   │   │   ├── agent.py       # Agentic loop + system prompt
│   │   │   ├── tools.py       # 17 AI tools + dispatcher
│   │   │   ├── rag.py         # Document RAG pipeline
│   │   │   └── episodic.py    # Project + user memory
│   │   └── routers/           # 10 API routers
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── App.tsx             # Layout, mode toggle, routing
    │   ├── components/         # UI components
    │   ├── hooks/              # Data fetching hooks
    │   ├── store/              # Zustand stores
    │   └── lib/                # API client + utilities
    ├── package.json
    └── tsconfig.json
```

## AI Tools

The agent has access to 17 tools:

| Tool | Description |
|------|-------------|
| `create_task` | Create a task with title, priority, due date, and optional parent |
| `list_tasks` | List active or completed tasks with pagination |
| `update_task` | Update any task field |
| `delete_task` | Delete a task by ID |
| `complete_task` | Mark a task as complete |
| `draft_email` | Compose an email draft |
| `update_email_draft` | Revise an existing draft |
| `get_email_draft` | Retrieve a specific draft |
| `list_documents` | List uploaded documents with summaries |
| `search_documents` | RAG search across documents with citations |
| `update_user_profile` | Update profile fields |
| `list_projects` | List all projects |
| `create_project` | Create a new project |
| `log_project_event` | Log an episodic memory for a project |
| `recall_project_history` | Retrieve relevant project memories |
| `log_user_memory` | Store a user preference or fact |
| `recall_user_context` | Retrieve user memories by similarity |

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
