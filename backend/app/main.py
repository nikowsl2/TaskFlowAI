from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import chat, email_drafts, events, logs, meeting, notes, tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
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


@app.get("/api/health")
def health():
    return {"status": "ok"}
