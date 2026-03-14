from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.config import settings
from app.database import Base, engine
from app.routers import (
    chat,
    documents,
    email_drafts,
    events,
    logs,
    meeting,
    notes,
    profile,
    projects,
    tasks,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Migrate existing tables before create_all
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE projects ADD COLUMN last_accessed DATETIME"))
            conn.commit()
        except OperationalError:
            pass  # column already exists
        try:
            conn.execute(text("ALTER TABLE user_profiles ADD COLUMN last_brief_date DATE"))
            conn.commit()
        except OperationalError:
            pass
        try:
            conn.execute(text("ALTER TABLE user_profiles ADD COLUMN active_goals TEXT"))
            conn.commit()
        except OperationalError:
            pass
        try:
            conn.execute(text("ALTER TABLE user_profiles ADD COLUMN conversation_summary TEXT"))
            conn.commit()
        except OperationalError:
            pass
    # Create DB tables on startup
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="TaskFlow AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(meeting.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(email_drafts.router, prefix="/api")
app.include_router(logs.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(projects.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
