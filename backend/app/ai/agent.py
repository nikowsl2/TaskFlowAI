"""Provider-switching agentic loop with SSE streaming."""

import json
from collections.abc import AsyncGenerator
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app import log_store
from app.ai.tools import ANTHROPIC_TOOL_DEFINITIONS, TOOL_DEFINITIONS, execute_tool
from app.config import settings
from app.models import Project, UserProfile

SYSTEM_PROMPT_TEMPLATE = """\
You are TaskFlow AI, a task management and scheduling assistant. \
You help users manage their task list and calendar using the available tools.

Today's date is {today}. Use this to resolve relative dates like "next Monday" or "Thursday".

{profile}{projects}Capabilities:
- create_task           — add a new task with optional description, priority, and deadline
- list_tasks            — show all tasks with IDs (call this first when you need a task ID)
- update_task           — edit any field: rename, rewrite description, change priority, \
set or clear a deadline, or reopen a completed task
- delete_task           — permanently remove a task
- complete_task         — mark a task done
- draft_email           — compose a new email draft (saved & displayed to user for copying)
- update_email_draft    — revise an existing draft (call get_email_draft first if unsure of content)
- get_email_draft       — retrieve a draft's current content
- list_documents        — show all uploaded documents with IDs and AI summaries
- search_documents      — retrieve semantically relevant text chunks from documents
- update_user_profile   — save durable user context (role, prefs, focus, notes)
- list_projects / create_project — manage project registry
- log_project_event     — record milestones and decisions to episodic memory
- recall_project_history — retrieve past project context via semantic search

Rules:
1. If the user refers to a task by name rather than ID, call list_tasks first to find the ID.
2. Tool results are JSON objects with an "ok" field — if ok is false, tell the user what went wrong.
3. After each action, give a short, friendly confirmation of what was done.
4. Never invent task IDs — always retrieve them from list_tasks.
5. DATE FORMAT (critical): Always convert relative dates to ISO 8601 (YYYY-MM-DD) before passing \
to any tool. Never pass strings like "next Wednesday" or "Friday" — use the actual date, e.g. \
"2026-03-18". Use today's date ({today}) as the reference to compute the exact calendar date.
6. MEETINGS & SCHEDULED EVENTS: There is no calendar tool available. Convert any scheduled sync, \
call, or meeting into a task with an appropriate due_date instead.
7. MEMORY: Call update_user_profile proactively when the user reveals role, preferences, current \
focus, or any durable personal context. Field routing: role/team → role_and_goals; \
style/tools/workflows → preferences; active sprint/milestone → current_focus; misc → extra_notes.
8. PROJECT EVENTS: Call log_project_event after significant milestones, decisions, deadlines, \
blockers, or scope changes. Always call list_projects first to get project IDs. Offer to create \
a project if none exists when the user discusses ongoing project work.
9. PROJECT RECALL: Call recall_project_history before answering questions about past project work, \
previous decisions, or earlier context. Always call list_projects first to get project IDs.

Meeting notes processing:
When the user shares meeting notes or asks you to process notes:
- Identify ACTION ITEMS (things someone needs to do) → create_task for each, with due_date if mentioned
- Identify SCHEDULED EVENTS (meetings, syncs, calls) → create_task for each with due_date set to the event date
- After processing all items, give a clear summary: list what tasks were created
- Assign appropriate priorities (high if urgent/blocking, medium by default, low if explicitly minor)

Email drafting:
When the user asks you to write, draft, or compose an email:
1. Call draft_email with the full To, Subject, and Body. Match the requested tone (formal/casual/urgent).
2. Simultaneously, identify any commitments made in the email:
   - Promised deliverables or deadlines → create_task with the due_date set
   - Scheduled meetings/calls → create_task with due_date set to the meeting date
3. After the draft is created, briefly confirm: the draft is ready AND list any tasks you synced.
4. When the user asks to refine or edit the draft, call get_email_draft first, then update_email_draft \
with the revised version. Apply changes precisely — don't rewrite parts the user didn't ask to change.

Document knowledge base:
When the user asks about uploaded documents or their content:
1. ALWAYS call list_documents first to discover document IDs and summaries. \
NEVER guess or assume a document_id — IDs start at 1 and you must retrieve them.
2. Identify the most relevant document(s) by their summary.
3. Call search_documents with a focused query; pass the correct document_id from step 1.
4. For cross-document questions, call search_documents multiple times across different docs.
5. Synthesize the retrieved chunks into a clear answer. Always cite the source
   field from each chunk (e.g. "Source: Page 4 — NVIDIAAn.pdf"). When quoting
   directly, wrap the quote in quotation marks followed by the source.
6. If no documents exist or no relevant chunks are found, say so honestly.
7. For complex questions, try multiple query phrasings to improve recall.

Email thread summarization:
When the user pastes an email thread or asks you to analyze emails:
- Identify the final decisions/outcomes and summarize them clearly
- Extract ALL action items AND scheduled meetings/syncs assigned to the user → create_task for each; \
set due_date in YYYY-MM-DD format for any deadline or meeting date (resolve relative dates using today)
- Give a concise summary of what happened, then list what tasks were created
"""


def _build_system_prompt(db: Session) -> str:
    profile = db.get(UserProfile, 1)
    profile_text = ""
    if profile:
        parts = []
        if profile.role_and_goals:
            parts.append(f"Role & Goals: {profile.role_and_goals}")
        if profile.preferences:
            parts.append(f"Preferences: {profile.preferences}")
        if profile.current_focus:
            parts.append(f"Current Focus: {profile.current_focus}")
        if profile.extra_notes:
            parts.append(f"Extra Notes: {profile.extra_notes}")
        if parts:
            profile_text = "User Profile (always take this into account):\n" + "\n".join(parts) + "\n\n"

    staleness_text = ""
    try:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        projects = db.query(Project).order_by(Project.created_at.desc()).all()
        if projects:
            lines = []
            for p in projects:
                ref = p.last_accessed or p.updated_at
                days = (now - ref).days if ref else None
                if days is not None:
                    note = f", last active {days} days ago"
                    if days > 30:
                        note += " — consider archiving"
                else:
                    note = ""
                lines.append(f"- {p.name} ({p.status}{note})")
            staleness_text = "Projects:\n" + "\n".join(lines) + "\n\n"
    except Exception:
        staleness_text = ""

    return SYSTEM_PROMPT_TEMPLATE.format(
        today=date.today().isoformat(),
        profile=profile_text,
        projects=staleness_text,
    )


async def run_agent(
    messages: list[dict], db: Session
) -> AsyncGenerator[dict, None]:
    if settings.AI_PROVIDER == "anthropic":
        async for chunk in _anthropic_loop(messages, db):
            yield chunk
    else:
        async for chunk in _openai_loop(messages, db):
            yield chunk


# ── OpenAI ────────────────────────────────────────────────────────────────────


async def _openai_loop(
    messages: list[dict], db: Session
) -> AsyncGenerator[dict, None]:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    system_prompt = _build_system_prompt(db)
    msgs = [{"role": "system", "content": system_prompt}] + list(messages)
    tool_call_count = 0

    log_store.log(log_store.AGENT_START, {"provider": "openai", "model": settings.AI_MODEL})

    try:
        while True:
            stream = await client.chat.completions.create(
                model=settings.AI_MODEL,
                messages=msgs,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto",
                stream=True,
            )

            collected_chunks: list = []
            collected_text = ""
            tool_calls_raw: dict[int, dict] = {}

            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta is None:
                    continue

                if delta.content:
                    collected_text += delta.content
                    yield {"type": "text", "content": delta.content}

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_raw:
                            tool_calls_raw[idx] = {
                                "id": tc.id or "",
                                "type": "function",
                                "function": {"name": tc.function.name or "", "arguments": ""},
                            }
                        if tc.id:
                            tool_calls_raw[idx]["id"] = tc.id
                        if tc.function.name:
                            tool_calls_raw[idx]["function"]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_raw[idx]["function"]["arguments"] += tc.function.arguments

                collected_chunks.append(chunk)

            if not tool_calls_raw:
                log_store.log(log_store.AGENT_DONE, {"tool_calls": tool_call_count, "response_len": len(collected_text)})
                yield {"type": "done"}
                return

            tool_calls_list = [tool_calls_raw[i] for i in sorted(tool_calls_raw)]
            assistant_msg: dict = {"role": "assistant", "tool_calls": tool_calls_list}
            if collected_text:
                assistant_msg["content"] = collected_text
            msgs.append(assistant_msg)

            for tc in tool_calls_list:
                fn_name = tc["function"]["name"]
                yield {"type": "status", "content": _status_label(fn_name)}
                try:
                    fn_args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    fn_args = {}

                log_store.log(log_store.TOOL_CALL, {"name": fn_name, "args": fn_args})
                result = execute_tool(fn_name, fn_args, db)
                tool_call_count += 1

                try:
                    result_obj = json.loads(result)
                    log_store.log(
                        log_store.TOOL_RESULT,
                        {"name": fn_name, "ok": result_obj.get("ok"), "message": result_obj.get("message"), "data": result_obj.get("data")},
                        level="ERROR" if not result_obj.get("ok") else "INFO",
                    )
                    if fn_name in ("draft_email", "update_email_draft") and result_obj.get("ok") and result_obj.get("data"):
                        yield {"type": "email_draft", "data": result_obj["data"]}
                except json.JSONDecodeError:
                    pass

                msgs.append({"role": "tool", "tool_call_id": tc["id"], "content": result})

    except Exception as e:
        log_store.log(log_store.AGENT_ERROR, {"error": str(e)}, level="ERROR")
        raise


# ── Anthropic ─────────────────────────────────────────────────────────────────


async def _anthropic_loop(
    messages: list[dict], db: Session
) -> AsyncGenerator[dict, None]:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    system_prompt = _build_system_prompt(db)
    anthropic_msgs = [m for m in messages if m["role"] != "system"]
    tool_call_count = 0

    log_store.log(log_store.AGENT_START, {"provider": "anthropic", "model": settings.AI_MODEL})

    try:
        while True:
            collected_text = ""
            tool_uses: list[dict] = []
            current_tool: dict | None = None

            async with client.messages.stream(
                model=settings.AI_MODEL,
                max_tokens=4096,
                system=system_prompt,
                messages=anthropic_msgs,
                tools=ANTHROPIC_TOOL_DEFINITIONS,
            ) as stream:
                async for event in stream:
                    event_type = event.type

                    if event_type == "content_block_start":
                        if event.content_block.type == "tool_use":
                            current_tool = {
                                "id": event.content_block.id,
                                "name": event.content_block.name,
                                "input_raw": "",
                            }

                    elif event_type == "content_block_delta":
                        delta = event.delta
                        if delta.type == "text_delta":
                            collected_text += delta.text
                            yield {"type": "text", "content": delta.text}
                        elif delta.type == "input_json_delta" and current_tool:
                            current_tool["input_raw"] += delta.partial_json

                    elif event_type == "content_block_stop":
                        if current_tool:
                            try:
                                current_tool["input"] = json.loads(current_tool["input_raw"] or "{}")
                            except json.JSONDecodeError:
                                current_tool["input"] = {}
                            tool_uses.append(current_tool)
                            current_tool = None

                    elif event_type == "message_stop":
                        break

            if not tool_uses:
                log_store.log(log_store.AGENT_DONE, {"tool_calls": tool_call_count, "response_len": len(collected_text)})
                yield {"type": "done"}
                return

            content_blocks = []
            if collected_text:
                content_blocks.append({"type": "text", "text": collected_text})
            for tu in tool_uses:
                content_blocks.append(
                    {"type": "tool_use", "id": tu["id"], "name": tu["name"], "input": tu["input"]}
                )
            anthropic_msgs.append({"role": "assistant", "content": content_blocks})

            tool_results = []
            for tu in tool_uses:
                yield {"type": "status", "content": _status_label(tu["name"])}
                log_store.log(log_store.TOOL_CALL, {"name": tu["name"], "args": tu["input"]})
                result = execute_tool(tu["name"], tu["input"], db)
                tool_call_count += 1

                try:
                    result_obj = json.loads(result)
                    log_store.log(
                        log_store.TOOL_RESULT,
                        {"name": tu["name"], "ok": result_obj.get("ok"), "message": result_obj.get("message"), "data": result_obj.get("data")},
                        level="ERROR" if not result_obj.get("ok") else "INFO",
                    )
                    if tu["name"] in ("draft_email", "update_email_draft") and result_obj.get("ok") and result_obj.get("data"):
                        yield {"type": "email_draft", "data": result_obj["data"]}
                except json.JSONDecodeError:
                    pass

                tool_results.append({"type": "tool_result", "tool_use_id": tu["id"], "content": result})
            anthropic_msgs.append({"role": "user", "content": tool_results})

    except Exception as e:
        log_store.log(log_store.AGENT_ERROR, {"error": str(e)}, level="ERROR")
        raise


# ── Helpers ───────────────────────────────────────────────────────────────────


def _status_label(tool_name: str) -> str:
    labels = {
        "create_task": "Creating task\u2026",
        "list_tasks": "Fetching tasks\u2026",
        "update_task": "Updating task\u2026",
        "delete_task": "Deleting task\u2026",
        "complete_task": "Completing task\u2026",
        "draft_email": "Drafting email\u2026",
        "update_email_draft": "Updating draft\u2026",
        "get_email_draft": "Loading draft\u2026",
        "list_documents": "Reading document library\u2026",
        "search_documents": "Searching documents\u2026",
        "update_user_profile": "Updating user profile\u2026",
        "list_projects": "Listing projects\u2026",
        "create_project": "Creating project\u2026",
        "log_project_event": "Logging project event\u2026",
        "recall_project_history": "Recalling project history\u2026",
    }
    return labels.get(tool_name, f"Running {tool_name}\u2026")
