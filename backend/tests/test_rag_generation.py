"""Tests for RAG generation faithfulness features."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai.agent import FAITHFULNESS_PROMPT, _extract_rag_chunks, _verify_faithfulness


class TestReferencesInToolResult:
    """Verify search_documents adds index and references to results."""

    @pytest.mark.asyncio
    async def test_references_in_tool_result(self):
        from app.ai.tools import _dispatch

        mock_results = [
            {"chunk_text": "Revenue was $68B", "document_id": 1,
             "page_num": 4, "chunk_type": "text", "score": 0.9},
            {"chunk_text": "Data center segment", "document_id": 1,
             "page_num": 6, "chunk_type": "text", "score": 0.8},
        ]

        db = MagicMock()
        doc_mock = MagicMock()
        doc_mock.filename = "earnings.pdf"
        doc_mock.summary = "Financial report"
        db.get.return_value = doc_mock

        with patch(
            "app.ai.rag.async_smart_search",
            new_callable=AsyncMock,
            return_value=mock_results,
        ):
            result = await _dispatch(
                "search_documents",
                {"query": "quarterly revenue"},
                db,
            )

        assert result.ok is True
        assert result.data is not None
        results = result.data["results"]
        assert results[0]["index"] == 1
        assert results[1]["index"] == 2
        assert "references" in result.data
        assert len(result.data["references"]) == 2
        assert "[1]" in result.data["references"][0]
        assert "[2]" in result.data["references"][1]
        assert "[N] inline citations" in result.message


class TestFaithfulnessPrompt:
    def test_prompt_is_well_formed(self):
        assert "factual accuracy auditor" in FAITHFULNESS_PROMPT
        assert "score" in FAITHFULNESS_PROMPT
        assert "verdict" in FAITHFULNESS_PROMPT
        assert "flags" in FAITHFULNESS_PROMPT
        assert "faithful" in FAITHFULNESS_PROMPT
        assert "partial" in FAITHFULNESS_PROMPT
        assert "unfaithful" in FAITHFULNESS_PROMPT


class TestExtractRagChunks:
    def test_extracts_chunks_from_search_results(self):
        batch = [
            {
                "name": "search_documents",
                "result": json.dumps({
                    "ok": True,
                    "data": {
                        "results": [
                            {"chunk_text": "chunk A"},
                            {"chunk_text": "chunk B"},
                        ]
                    },
                }),
            },
        ]
        chunks = _extract_rag_chunks(batch)
        assert chunks == ["chunk A", "chunk B"]

    def test_ignores_non_search_tools(self):
        batch = [
            {
                "name": "list_tasks",
                "result": json.dumps({"ok": True, "data": {"tasks": []}}),
            },
        ]
        chunks = _extract_rag_chunks(batch)
        assert chunks == []

    def test_handles_malformed_json(self):
        batch = [{"name": "search_documents", "result": "not json"}]
        chunks = _extract_rag_chunks(batch)
        assert chunks == []

    def test_handles_failed_search(self):
        batch = [
            {
                "name": "search_documents",
                "result": json.dumps(
                    {"ok": False, "message": "error"}
                ),
            },
        ]
        chunks = _extract_rag_chunks(batch)
        assert chunks == []


class TestVerifyFaithfulness:
    @pytest.mark.asyncio
    async def test_returns_none_on_empty_chunks(self):
        result = await _verify_faithfulness("Some response", [])
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_empty_response(self):
        result = await _verify_faithfulness("", ["chunk text"])
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_whitespace_response(self):
        result = await _verify_faithfulness("   ", ["chunk text"])
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_llm_error(self):
        """LLM API error should return None, not raise."""
        with patch("app.ai.agent.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = "test"
            mock_settings.AI_MODEL = "gpt-4o"
            with patch.dict(
                "sys.modules",
                {"openai": MagicMock()},
            ):
                # Force the import inside _verify_faithfulness to
                # return a client that raises on create
                import openai as openai_mod
                mock_client = AsyncMock()
                mock_client.chat.completions.create = AsyncMock(
                    side_effect=Exception("API down")
                )
                openai_mod.AsyncOpenAI.return_value = mock_client

                result = await _verify_faithfulness(
                    "Some response", ["chunk"]
                )
                assert result is None

    @pytest.mark.asyncio
    async def test_returns_parsed_result_on_success(self):
        expected = {
            "score": 0.9,
            "verdict": "faithful",
            "flags": [],
        }

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps(expected)

        with patch("app.ai.agent.settings") as mock_settings:
            mock_settings.AI_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = "test"
            mock_settings.AI_MODEL = "gpt-4o"
            with patch.dict(
                "sys.modules",
                {"openai": MagicMock()},
            ):
                import openai as openai_mod
                mock_client = AsyncMock()
                mock_client.chat.completions.create = AsyncMock(
                    return_value=mock_response
                )
                openai_mod.AsyncOpenAI.return_value = mock_client

                result = await _verify_faithfulness(
                    "Revenue was $68B",
                    ["Revenue was $68 billion"],
                )
                assert result == expected
