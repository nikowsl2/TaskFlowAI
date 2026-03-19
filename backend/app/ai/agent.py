"""Provider-switching agentic loop with SSE streaming."""

import hashlib
import json
from collections.abc import AsyncGenerator
from datetime import date

from sqlalchemy.orm import Session

from app import log_store
from app.ai.tools import ANTHROPIC_TOOL_DEFINITIONS, TOOL_DEFINITIONS, execute_tool
from app.config import settings
from app.models import UserProfile

MAX_TOOL_ROUNDS = 20

FAITHFULNESS_PROMPT = """\
You are a factual accuracy auditor. Given source chunks and an AI response, \
assess whether every factual claim in the response is supported by the chunks.

Rules:
- "supported" = a chunk contains the same or equivalent information.
- "unsupported" = no chunk backs the claim.
- Ignore greetings, caveats, and "I don't have information" disclaimers — those are fine.
- If the response correctly says info is unavailable, that is faithful.

Return ONLY a JSON object:
{"score": <0.0-1.0>, "verdict": "<faithful|partial|unfaithful>", "flags": ["<unsupported claim>"]}

score >= 0.7 → "faithful", 0.4-0.7 → "partial", < 0.4 → "unfaithful"
flags: up to 3 specific unsupported claims (empty list if faithful)
"""

# Tools that only read data — safe to cache within a single agent invocation.
READ_ONLY_TOOLS = frozenset({
    "list_tasks", "list_projects", "list_documents", "search_documents",
    "recall_project_history", "recall_user_context", "get_email_draft",
})


def _cache_key(tool_name: str, args: dict) -> str:
    """Deterministic cache key from tool name + sorted args JSON."""
    args_str = json.dumps(args, sort_keys=True, default=str)
    return hashlib.md5(f"{tool_name}:{args_str}".encode()).hexdigest()


def _build_invocation_hint(invocation_log: list[str]) -> str:
    """Build a short metadata hint summarising tools called so far."""
    if len(invocation_log) < 2:
        return ""
    summary = "; ".join(invocation_log)
    return (
        f"[Invocation context — tools called so far: {summary}. "
        "No need to re-fetch read-only data unless you've modified it.]"
    )

SYSTEM_PROMPT_TEMPLATE = """\
You are TaskFlow AI, a task management and scheduling assistant. \
Today's date is {today}. Use this to resolve relative dates to ISO 8601 (YYYY-MM-DD) \
before passing to any tool — never pass relative strings like "next Wednesday".

{goals}{profile}{summary}Rules:
1. If the user refers to a task by name, call list_tasks first to find the ID. Never invent IDs.
2. Tool results are JSON with "ok" field — if false, tell the user what went wrong.
3. Convert meetings/syncs/calls into tasks with due_date (no calendar tool).
4. Call update_user_profile proactively when the user reveals role, preferences, or focus. \
Field routing: role/team → role_and_goals; style/workflows → preferences; sprint/milestone → current_focus; misc → extra_notes.
5. Call log_project_event after milestones, decisions, blockers, or scope changes. \
Call list_projects first for IDs; offer to create a project if none exists.
6. Call recall_project_history before answering questions about past project work. List projects first.
7. AMBIGUITY: Never guess which task/project the user means with vague references. \
Call list_tasks/list_projects, present numbered options, wait for confirmation before acting.
8. Call log_user_memory when the user shares personal anecdotes or recurring patterns. \
Call recall_user_context when personal history is relevant.
9. When the user states session goals, save them via update_user_profile(field="active_goals").
10. Morning briefs: concise and structured, no action offers, no tangents.

Action item extraction (meeting notes, email threads, any source):
- ACTION ITEMS → create_task with due_date if mentioned (high if urgent, medium by default)
- SCHEDULED EVENTS → create_task with due_date set to event date
- Summarize what was created

Email drafting:
1. Call draft_email with To, Subject, Body. Match requested tone.
2. Create tasks for any commitments or scheduled meetings in the email.
3. To revise: call get_email_draft first, then update_email_draft — change only what was requested.

Document knowledge base:
1. ALWAYS call list_documents first — never guess document IDs.
2. Call search_documents with focused query and correct document_id. \
Try multiple phrasings for complex questions.
3. GROUNDING RULES (mandatory when answering from documents):
   - Use ONLY information from the retrieved chunks. Do NOT supplement \
with prior knowledge, extrapolate, or infer beyond what chunks state.
   - If chunks do not contain enough info, say: "The retrieved sections \
do not cover [topic]. Try a different query or check if the document is uploaded."
   - Never fabricate statistics, dates, names, or figures not in chunks.
   - Use numbered inline citations [1], [2] matching the References list. \
End your answer with a "References:" section listing all cited sources.

<example title="Grounded answer with citations">
User: What was NVIDIA's quarterly revenue?
[search_documents returns chunks about Q3 financials]
Assistant: NVIDIA reported quarterly revenue of $68 billion, \
a 73% YoY increase [1]. Data Center was the primary driver at $62B [2].

References:
[1] Page 4 — nvidia_earnings.pdf
[2] Page 6 — nvidia_earnings.pdf
</example>

<example title="Insufficient information — refuse gracefully">
User: What is the company's remote work policy?
[search_documents returns chunks about office locations only]
Assistant: The retrieved sections do not cover remote work policy — \
they discuss office locations. Try a different query or check if \
an HR policy document has been uploaded.
</example>
"""


def _build_system_prompt(db: Session) -> str:
    profile = db.get(UserProfile, 1)

    # Active goals — injected first if present
    goals_text = ""
    if profile and profile.active_goals:
        goals_text = (
            "ACTIVE GOALS (track these throughout the conversation):\n"
            + profile.active_goals
            + "\n\n"
        )

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

    # Conversation summary — injected as prior context block
    summary_text = ""
    if profile and profile.conversation_summary:
        summary_text = (
            "Previous Conversation Context (summary of earlier messages):\n"
            + profile.conversation_summary
            + "\n\n"
        )

    return SYSTEM_PROMPT_TEMPLATE.format(
        today=date.today().isoformat(),
        goals=goals_text,
        profile=profile_text,
        summary=summary_text,
    )


def _extract_rag_chunks(batch: list[dict]) -> list[str]:
    """Extract chunk texts from search_documents results in a batch."""
    chunks: list[str] = []
    for item in batch:
        if item["name"] == "search_documents":
            try:
                parsed = json.loads(item["result"])
                if parsed.get("ok") and parsed.get("data", {}).get("results"):
                    chunks.extend(
                        r["chunk_text"] for r in parsed["data"]["results"]
                        if r.get("chunk_text")
                    )
            except (json.JSONDecodeError, KeyError):
                pass
    return chunks


async def _verify_faithfulness(
    response_text: str, rag_chunks: list[str]
) -> dict | None:
    """Run a lightweight LLM call to verify response faithfulness against chunks.

    Returns {"score": float, "verdict": str, "flags": list[str]} or None on error.
    """
    if not rag_chunks or not response_text.strip():
        return None

    # Truncate to keep verification call small
    truncated_chunks = [c[:500] for c in rag_chunks[:8]]
    truncated_response = response_text[:2000]

    user_msg = (
        f"Source chunks:\n{json.dumps(truncated_chunks, ensure_ascii=False)}\n\n"
        f"AI response:\n{truncated_response}"
    )

    try:
        if settings.AI_PROVIDER == "anthropic":
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            result = await client.messages.create(
                model=settings.AI_MODEL,
                max_tokens=200,
                temperature=0,
                system=FAITHFULNESS_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            )
            raw = result.content[0].text
        else:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            result = await client.chat.completions.create(
                model=settings.AI_MODEL,
                max_tokens=200,
                temperature=0,
                messages=[
                    {"role": "system", "content": FAITHFULNESS_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
            )
            raw = result.choices[0].message.content or ""

        return json.loads(raw)
    except Exception:
        return None


async def _execute_tools_batch(
    tool_calls: list[dict],
    db: Session,
    tool_cache: dict[str, str],
    invocation_log: list[str],
) -> AsyncGenerator[dict, None]:
    """Execute tool calls with caching, logging, and SSE emission. Yields chunks.

    Each item in tool_calls must have: {"name": str, "args": dict, "id": str}.
    After execution, each item gets a "result" key with the raw JSON string.
    """
    for tc in tool_calls:
        fn_name, fn_args = tc["name"], tc["args"]
        yield {"type": "status", "content": _status_label(fn_name)}

        ckey = _cache_key(fn_name, fn_args)
        cached = fn_name in READ_ONLY_TOOLS and ckey in tool_cache

        if cached:
            result = tool_cache[ckey]
            log_store.log(
                log_store.TOOL_CALL,
                {"name": fn_name, "args": fn_args, "cached": True},
            )
        else:
            log_store.log(log_store.TOOL_CALL, {"name": fn_name, "args": fn_args})
            result = await execute_tool(fn_name, fn_args, db)
            if fn_name in READ_ONLY_TOOLS:
                tool_cache[ckey] = result
            else:
                tool_cache.clear()

        try:
            result_obj = json.loads(result)
            log_store.log(
                log_store.TOOL_RESULT,
                {"name": fn_name, "ok": result_obj.get("ok"), "message": result_obj.get("message"), "data": result_obj.get("data")},
                level="ERROR" if not result_obj.get("ok") else "INFO",
            )
            email_tools = ("draft_email", "update_email_draft", "get_email_draft")
            if fn_name in email_tools and result_obj.get("ok") and result_obj.get("data"):
                # Send full draft to frontend via SSE (only for write operations)
                if fn_name in ("draft_email", "update_email_draft"):
                    yield {"type": "email_draft", "data": result_obj["data"]}
                # Truncate body in result sent to LLM to save tokens
                data = result_obj["data"]
                if "body" in data and len(data["body"]) > 200:
                    result_obj["data"]["body_preview"] = data["body"][:200] + "..."
                    del result_obj["data"]["body"]
                    result = json.dumps(result_obj)
            short_msg = result_obj.get("message", "")[:80]
            status = "ok" if result_obj.get("ok") else "error"
            tag = " (cached)" if cached else ""
            invocation_log.append(f"{fn_name}{tag} -> {status}: {short_msg}")
            # Emit tool result to frontend for visibility
            yield {
                "type": "tool_result",
                "name": fn_name,
                "ok": result_obj.get("ok", True),
                "message": result_obj.get("message", ""),
            }
        except json.JSONDecodeError:
            invocation_log.append(f"{fn_name} -> done")

        tc["result"] = result


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
    tool_cache: dict[str, str] = {}
    invocation_log: list[str] = []
    rag_chunks: list[str] = []

    log_store.log(log_store.AGENT_START, {"provider": "openai", "model": settings.AI_MODEL})

    try:
        while True:
            if tool_call_count >= MAX_TOOL_ROUNDS:
                yield {"type": "text", "content": "\n\n[Reached tool call limit — stopping.]"}
                yield {"type": "done"}
                return
            stream = await client.chat.completions.create(
                model=settings.AI_MODEL,
                messages=msgs,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto",
                stream=True,
            )

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

            if not tool_calls_raw:
                log_store.log(log_store.AGENT_DONE, {"tool_calls": tool_call_count, "response_len": len(collected_text)})
                if settings.RAG_VERIFY_FAITHFULNESS and rag_chunks and collected_text.strip():
                    verification = await _verify_faithfulness(collected_text, rag_chunks)
                    if verification:
                        yield {"type": "faithfulness", "data": verification}
                yield {"type": "done"}
                return

            tool_calls_list = [tool_calls_raw[i] for i in sorted(tool_calls_raw)]
            assistant_msg: dict = {"role": "assistant", "tool_calls": tool_calls_list}
            if collected_text:
                assistant_msg["content"] = collected_text
            msgs.append(assistant_msg)

            # Normalize to shared format for _execute_tools_batch
            batch = []
            for tc in tool_calls_list:
                try:
                    fn_args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    fn_args = {}
                batch.append({"name": tc["function"]["name"], "args": fn_args, "id": tc["id"]})

            async for chunk in _execute_tools_batch(batch, db, tool_cache, invocation_log):
                yield chunk
            tool_call_count += len(batch)

            rag_chunks.extend(_extract_rag_chunks(batch))

            for item in batch:
                msgs.append({"role": "tool", "tool_call_id": item["id"], "content": item["result"]})

            hint = _build_invocation_hint(invocation_log)
            if hint:
                msgs.append({"role": "system", "content": hint})

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
    tool_cache: dict[str, str] = {}
    invocation_log: list[str] = []
    rag_chunks: list[str] = []

    log_store.log(log_store.AGENT_START, {"provider": "anthropic", "model": settings.AI_MODEL})

    try:
        while True:
            if tool_call_count >= MAX_TOOL_ROUNDS:
                yield {"type": "text", "content": "\n\n[Reached tool call limit — stopping.]"}
                yield {"type": "done"}
                return
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
                if settings.RAG_VERIFY_FAITHFULNESS and rag_chunks and collected_text.strip():
                    verification = await _verify_faithfulness(collected_text, rag_chunks)
                    if verification:
                        yield {"type": "faithfulness", "data": verification}
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

            # Normalize to shared format for _execute_tools_batch
            batch = [{"name": tu["name"], "args": tu["input"], "id": tu["id"]} for tu in tool_uses]

            async for chunk in _execute_tools_batch(batch, db, tool_cache, invocation_log):
                yield chunk
            tool_call_count += len(batch)

            rag_chunks.extend(_extract_rag_chunks(batch))

            tool_results = [
                {"type": "tool_result", "tool_use_id": item["id"], "content": item["result"]}
                for item in batch
            ]

            hint = _build_invocation_hint(invocation_log)
            if hint:
                tool_results.append({"type": "text", "text": hint})
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
        "log_user_memory": "Saving personal memory\u2026",
        "recall_user_context": "Recalling personal context\u2026",
    }
    return labels.get(tool_name, f"Running {tool_name}\u2026")
