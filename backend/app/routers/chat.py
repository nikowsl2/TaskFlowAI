import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.ai.agent import run_agent
from app.database import get_db
from app.models import Message
from app.schemas import ChatMessage, MessageOut

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def stream_chat(payload: ChatMessage, db: Session = Depends(get_db)):
    # Persist user message
    user_msg = Message(role="user", content=payload.content)
    db.add(user_msg)
    db.commit()

    # Load history for context (last 20 messages)
    history = (
        db.query(Message).order_by(Message.created_at.desc()).limit(20).all()[::-1]
    )
    messages = [{"role": m.role, "content": m.content} for m in history]

    async def event_stream():
        full_response = ""
        async for chunk in run_agent(messages, db):
            full_response += chunk.get("content", "") if chunk.get("type") == "text" else ""
            yield f"data: {json.dumps(chunk)}\n\n"

        # Persist assistant response
        if full_response:
            assistant_msg = Message(role="assistant", content=full_response)
            db.add(assistant_msg)
            db.commit()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/history", response_model=list[MessageOut])
def get_history(db: Session = Depends(get_db)):
    return db.query(Message).order_by(Message.created_at.asc()).all()


@router.delete("/history", status_code=204)
def clear_history(db: Session = Depends(get_db)):
    db.query(Message).delete()
    db.commit()
