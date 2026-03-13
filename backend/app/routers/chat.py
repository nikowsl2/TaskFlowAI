import asyncio
import json
from datetime import date as date_type

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import log_store
from app.ai.agent import run_agent
from app.config import settings
from app.database import SessionLocal, get_db
from app.models import Message, UserProfile
from app.schemas import ChatMessage, MessageOut

router = APIRouter(prefix="/chat", tags=["chat"])

MORNING_BRIEF_TRIGGER = """\
Good morning! Please generate my morning brief for today ({today}).

Steps:
1. Call list_tasks — identify overdue tasks (past due_date) and tasks due today
2. Call list_projects — get active projects
3. For each active project, call recall_project_history with a relevant query \
to surface recent decisions or blockers

Then write the brief in this format:
- Greeting (1 sentence, include today's date)
- TODAY'S FOCUS: overdue + due-today tasks, high priority first
- UPCOMING (next 7 days): tasks with approaching deadlines
- ACTIVE PROJECTS: one-liner per project; note if stale (>7 days since last activity)
- QUICK WINS: up to 3 low/medium tasks with no deadline

Keep each bullet to one line. If no tasks exist, say so warmly. \
End with one sentence of encouragement.\
"""


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
    messages = [
        {"role": "assistant" if m.role == "morning_brief" else m.role, "content": m.content}
        for m in history
    ]

    log_store.log(log_store.CHAT_REQUEST, {
        "message": payload.content,
        "history_len": len(messages),
    })

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

            total_count = db.query(Message).count()
            if total_count > 0 and total_count % 10 == 0:
                asyncio.create_task(_condense_old_messages(total_count))

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _extract_user_facts(text: str) -> str:
    system = (
        "Extract only durable user context from this conversation: role, preferences, current focus. "
        "Output semicolon-separated facts, or 'NONE' if nothing persistent."
    )
    try:
        if settings.AI_PROVIDER == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.chat.completions.create(
                model=settings.AI_MODEL,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": text}],
                temperature=0,
                max_tokens=200,
            )
            result = resp.choices[0].message.content or "NONE"
        else:
            import anthropic as ant
            client = ant.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            resp = await client.messages.create(
                model=settings.AI_MODEL,
                max_tokens=200,
                system=system,
                messages=[{"role": "user", "content": text}],
            )
            result = resp.content[0].text if resp.content else "NONE"
        return "" if result.strip() == "NONE" else result.strip()
    except Exception:
        return ""


async def _condense_old_messages(total_count: int) -> None:
    db_local = SessionLocal()
    try:
        offset = max(0, total_count - 25)
        msgs = db_local.query(Message).order_by(Message.id.asc()).offset(offset).limit(10).all()
        text = "\n".join(f"{m.role}: {m.content}" for m in msgs)
        facts = await _extract_user_facts(text)
        if facts:
            profile = db_local.get(UserProfile, 1)
            if profile is None:
                profile = UserProfile(id=1)
                db_local.add(profile)
            from datetime import date
            entry = f"[{date.today().isoformat()}] {facts}"
            profile.extra_notes = (profile.extra_notes + "\n" + entry) if profile.extra_notes else entry
            db_local.commit()
    except Exception as exc:
        log_store.log("system", {"error": f"Condensation error: {exc}"}, level="WARNING")
    finally:
        db_local.close()


@router.post("/brief")
async def stream_brief(db: Session = Depends(get_db)):
    today = date_type.today()
    profile = db.get(UserProfile, 1)
    if profile and profile.last_brief_date == today:
        from fastapi.responses import Response
        return Response(status_code=204)

    trigger = MORNING_BRIEF_TRIGGER.format(today=today.isoformat())
    messages = [{"role": "user", "content": trigger}]

    async def event_stream():
        full_response = ""
        try:
            async for chunk in run_agent(messages, db):
                if chunk.get("type") == "text":
                    full_response += chunk["content"]
                    payload = json.dumps(
                        {"type": "morning_brief_text", "content": chunk["content"]}
                    )
                    yield f"data: {payload}\n\n"
                elif chunk.get("type") == "status":
                    yield f"data: {json.dumps(chunk)}\n\n"
                elif chunk.get("type") == "done":
                    if full_response:
                        db.add(Message(role="morning_brief", content=full_response))
                        p = db.get(UserProfile, 1)
                        if p is None:
                            p = UserProfile(id=1)
                            db.add(p)
                        p.last_brief_date = today
                        db.commit()
                    yield f"data: {json.dumps({'type': 'morning_brief_done'})}\n\n"
                    return
        except Exception as exc:
            log_store.log(
                log_store.AGENT_ERROR,
                {"error": str(exc), "context": "morning_brief"},
                level="ERROR",
            )
            return  # silent fail — no morning_brief_done emitted

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/history", response_model=list[MessageOut])
def get_history(db: Session = Depends(get_db)):
    return db.query(Message).order_by(Message.created_at.asc()).all()


@router.delete("/history", status_code=204)
def clear_history(db: Session = Depends(get_db)):
    db.query(Message).delete()
    db.commit()
