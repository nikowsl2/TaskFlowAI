"""Meeting notes extraction endpoints."""

import json
from datetime import date

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/meeting", tags=["meeting"])

EXTRACTION_SYSTEM = """\
You are an AI that extracts structured data from meeting notes.
Return ONLY valid JSON matching this exact schema — no markdown fences, no extra text:
{
  "title": "short descriptive title for this meeting (e.g. 'Marketing Sync – Q3 Strategy')",
  "summary": "2-4 sentence summary of the meeting",
  "candidates": [
    {
      "title": "short actionable task title",
      "description": "additional context or null",
      "priority": "low | medium | high",
      "due_date": "YYYY-MM-DD or null"
    }
  ]
}
Rules:
- Only include ACTION ITEMS as candidates (things that need to be done).
- Do NOT include meetings/syncs/calls as candidates — those are calendar events, not tasks.
- Infer priority from urgency cues: "urgent"/"ASAP"/"blocking" → high; explicit "low priority" → low; default → medium.
- Only set due_date when a specific date or relative deadline is clearly stated.
"""


class ExtractRequest(BaseModel):
    content: str


class TaskCandidate(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    due_date: str | None = None


class ExtractResponse(BaseModel):
    title: str
    summary: str
    candidates: list[TaskCandidate]


@router.post("/extract", response_model=ExtractResponse)
async def extract_meeting(payload: ExtractRequest):
    if not payload.content.strip():
        raise HTTPException(400, "Meeting notes content is required")

    content = payload.content[:15000]  # Cap input to ~3,750 tokens
    user_message = f"Today's date: {date.today().isoformat()}\n\nMeeting notes:\n{content}"

    try:
        result = await _call_ai(user_message)
    except Exception as e:
        raise HTTPException(500, f"AI extraction failed: {e}")

    # Parse JSON from AI response
    try:
        data = json.loads(result)
    except json.JSONDecodeError:
        # Try to extract JSON from the response if it's wrapped in text
        import re
        match = re.search(r'\{.*\}', result, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group())
            except json.JSONDecodeError:
                raise HTTPException(500, "AI returned invalid JSON")
        else:
            raise HTTPException(500, "AI returned invalid JSON")

    candidates = [
        TaskCandidate(
            title=c.get("title", "Untitled task"),
            description=c.get("description") or None,
            priority=c.get("priority", "medium") if c.get("priority") in ("low", "medium", "high") else "medium",
            due_date=c.get("due_date") or None,
        )
        for c in data.get("candidates", [])
    ]

    return ExtractResponse(
        title=data.get("title", "Meeting Notes"),
        summary=data.get("summary", ""),
        candidates=candidates,
    )


@router.post("/parse-file")
async def parse_file(file: UploadFile):
    filename = file.filename or ""
    content_bytes = await file.read()

    if len(content_bytes) > 20 * 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum size is 20 MB.")

    if filename.endswith(".txt"):
        try:
            return {"text": content_bytes.decode("utf-8")}
        except UnicodeDecodeError:
            return {"text": content_bytes.decode("latin-1")}

    if filename.endswith(".docx"):
        try:
            import io
            from docx import Document
            doc = Document(io.BytesIO(content_bytes))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            return {"text": text}
        except Exception as e:
            raise HTTPException(400, f"Could not read .docx file: {e}")

    if filename.endswith(".doc"):
        raise HTTPException(
            415,
            "Old .doc format is not supported. Please save the file as .docx and try again."
        )

    raise HTTPException(415, "Unsupported file type. Please upload a .txt or .docx file.")


# ── AI helpers ────────────────────────────────────────────────────────────────


async def _call_ai(user_message: str) -> str:
    if settings.AI_PROVIDER == "anthropic":
        return await _call_anthropic(user_message)
    return await _call_openai(user_message)


async def _call_openai(user_message: str) -> str:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model=settings.AI_MODEL,
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    return response.choices[0].message.content or "{}"


async def _call_anthropic(user_message: str) -> str:
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model=settings.AI_MODEL,
        max_tokens=2048,
        system=EXTRACTION_SYSTEM,
        messages=[{"role": "user", "content": user_message}],
        temperature=0.2,
    )
    return response.content[0].text if response.content else "{}"
