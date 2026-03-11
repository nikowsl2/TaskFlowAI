"""Provider-switching agentic loop with SSE streaming."""

import json
from collections.abc import AsyncGenerator

from sqlalchemy.orm import Session

from app.ai.tools import ANTHROPIC_TOOL_DEFINITIONS, TOOL_DEFINITIONS, execute_tool
from app.config import settings

SYSTEM_PROMPT = """\
You are TaskFlow AI, a task management assistant. You help the user manage their task list \
using the available tools.

Capabilities:
- create_task  — add a new task with optional description, priority, and deadline
- list_tasks   — show all tasks with their IDs (call this first when you need an ID)
- update_task  — edit any field: rename a task (title), rewrite its description, change priority, \
set or clear a deadline, or reopen a completed task
- delete_task  — permanently remove a task
- complete_task — mark a task done

Rules:
1. If the user refers to a task by name rather than ID, call list_tasks first to find the ID.
2. Tool results are JSON objects with an "ok" field — if ok is false, tell the user what went wrong.
3. After each action, give a short, friendly confirmation of what was done.
4. Never invent task IDs — always retrieve them from list_tasks.
"""


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
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + list(messages)

    while True:
        stream = await client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=msgs,
            tools=TOOL_DEFINITIONS,
            tool_choice="auto",
            stream=True,
        )

        # Collect streamed response
        collected_chunks: list = []
        collected_text = ""
        tool_calls_raw: dict[int, dict] = {}

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta is None:
                continue

            # Stream text content
            if delta.content:
                collected_text += delta.content
                yield {"type": "text", "content": delta.content}

            # Accumulate tool call deltas
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

        # No tool calls → done
        if not tool_calls_raw:
            yield {"type": "done"}
            return

        # Build assistant message with tool_calls
        tool_calls_list = [tool_calls_raw[i] for i in sorted(tool_calls_raw)]
        assistant_msg: dict = {"role": "assistant", "tool_calls": tool_calls_list}
        if collected_text:
            assistant_msg["content"] = collected_text
        msgs.append(assistant_msg)

        # Execute tools and add results
        for tc in tool_calls_list:
            fn_name = tc["function"]["name"]
            try:
                fn_args = json.loads(tc["function"]["arguments"])
            except json.JSONDecodeError:
                fn_args = {}
            result = execute_tool(fn_name, fn_args, db)
            msgs.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                }
            )


# ── Anthropic ─────────────────────────────────────────────────────────────────


async def _anthropic_loop(
    messages: list[dict], db: Session
) -> AsyncGenerator[dict, None]:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Anthropic uses a separate system param; filter out system messages from list
    anthropic_msgs = [m for m in messages if m["role"] != "system"]

    while True:
        collected_text = ""
        tool_uses: list[dict] = []
        current_tool: dict | None = None

        async with client.messages.stream(
            model=settings.AI_MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
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
                    elif event.content_block.type == "text":
                        pass  # handled in delta

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
            yield {"type": "done"}
            return

        # Build assistant turn
        content_blocks = []
        if collected_text:
            content_blocks.append({"type": "text", "text": collected_text})
        for tu in tool_uses:
            content_blocks.append(
                {"type": "tool_use", "id": tu["id"], "name": tu["name"], "input": tu["input"]}
            )
        anthropic_msgs.append({"role": "assistant", "content": content_blocks})

        # Execute tools
        tool_results = []
        for tu in tool_uses:
            result = execute_tool(tu["name"], tu["input"], db)
            tool_results.append(
                {"type": "tool_result", "tool_use_id": tu["id"], "content": result}
            )
        anthropic_msgs.append({"role": "user", "content": tool_results})
