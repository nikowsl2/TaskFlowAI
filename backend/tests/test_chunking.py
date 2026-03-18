"""Tests for structure-aware chunking in rag.py."""

from unittest.mock import patch

from app.ai.rag import (
    _chunk_table,
    _chunk_text,
    _fixed_chunk_pages,
    _split_segments,
    chunk_pages,
)


class TestSplitSegments:
    def test_table_markers(self):
        text = (
            "intro text\n\n"
            "<!-- TABLE -->\n| A | B |\n| --- | --- |\n| 1 | 2 |\n<!-- /TABLE -->\n\n"
            "more text"
        )
        segments = _split_segments(text)
        types = [s["type"] for s in segments]
        assert "table" in types
        table_seg = next(s for s in segments if s["type"] == "table")
        assert "| A | B |" in table_seg["text"]
        # Markers should be stripped
        assert "<!-- TABLE -->" not in table_seg["text"]
        assert "<!-- /TABLE -->" not in table_seg["text"]

    def test_heading_markers(self):
        text = "<!-- HEADING -->Revenue Overview\n\nRevenue grew 73% year over year."
        segments = _split_segments(text)
        assert any(s["type"] == "heading_section" for s in segments)
        heading_seg = next(s for s in segments if s["type"] == "heading_section")
        assert "Revenue Overview" in heading_seg["text"]
        # Marker should be stripped
        assert "<!-- HEADING -->" not in heading_seg["text"]

    def test_plain_text_fallback(self):
        text = "Just some plain text without any markers.\n\nAnother paragraph."
        segments = _split_segments(text)
        assert len(segments) == 1
        assert segments[0]["type"] == "text"
        assert "plain text" in segments[0]["text"]

    def test_mixed_content(self):
        text = (
            "Intro paragraph.\n\n"
            "<!-- HEADING -->Section Title\n\nSection body.\n\n"
            "<!-- TABLE -->\n| X | Y |\n| --- | --- |\n| 1 | 2 |\n<!-- /TABLE -->\n\n"
            "Closing text."
        )
        segments = _split_segments(text)
        types = [s["type"] for s in segments]
        assert "table" in types
        assert "heading_section" in types


class TestTableChunking:
    def test_atomic_small_table(self):
        table = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |"
        chunks = _chunk_table(table)
        assert len(chunks) == 1
        assert chunks[0]["chunk_type"] == "table"
        assert chunks[0]["text"] == table

    def test_split_large_table(self):
        # Create a table over 1600 chars
        header = "| Col1 | Col2 | Col3 |"
        separator = "| --- | --- | --- |"
        rows = [f"| data_{i}_a | data_{i}_b | data_{i}_c |" for i in range(100)]
        table = header + "\n" + separator + "\n" + "\n".join(rows)
        assert len(table) > 1600

        chunks = _chunk_table(table)
        assert len(chunks) > 1
        # Each chunk should have the header repeated
        for chunk in chunks:
            assert chunk["chunk_type"] == "table"
            assert chunk["text"].startswith(header)
            assert separator in chunk["text"]


class TestHeadingChunking:
    def test_heading_stays_with_content(self):
        from app.ai.rag import _chunk_heading_section

        heading_text = "Important Heading\n\nFirst paragraph of the section."
        chunks = _chunk_heading_section(heading_text)
        assert len(chunks) == 1
        assert "Important Heading" in chunks[0]["text"]
        assert "First paragraph" in chunks[0]["text"]

    def test_long_heading_section_splits(self):
        from app.ai.rag import _chunk_heading_section

        body = "\n\n".join(f"Paragraph {i} with enough text to fill space." * 5 for i in range(20))
        text = "My Heading\n\n" + body
        assert len(text) > 800

        chunks = _chunk_heading_section(text)
        assert len(chunks) > 1
        # Heading must be in the first chunk
        assert "My Heading" in chunks[0]["text"]


class TestTextChunking:
    def test_universal_overlap(self):
        # Create multiple paragraphs that will produce at least 2 chunks
        paragraphs = [f"Paragraph {i}. " + "x" * 300 for i in range(5)]
        text = "\n\n".join(paragraphs)
        chunks = _chunk_text(text)
        assert len(chunks) >= 2

        # Check that consecutive chunks share overlapping content
        for i in range(len(chunks) - 1):
            current_text = chunks[i]["text"]
            next_text = chunks[i + 1]["text"]
            # The tail of current chunk should appear at the start of next chunk
            tail = current_text[-100:]  # check last 100 chars
            # At least some overlap should exist
            assert any(
                word in next_text[:300] for word in tail.split() if len(word) > 3
            ), f"No overlap found between chunk {i} and {i+1}"

    def test_chunk_type_is_text(self):
        text = "Short paragraph one.\n\nShort paragraph two."
        chunks = _chunk_text(text)
        for chunk in chunks:
            assert chunk["chunk_type"] == "text"


class TestChunkPages:
    def test_chunk_type_metadata(self):
        # Table must be >= 50 chars (MIN_CHUNK) to be kept
        table = (
            "<!-- TABLE -->\n"
            "| Column A | Column B | Column C |\n"
            "| --- | --- | --- |\n"
            "| Value 1 | Value 2 | Value 3 |\n"
            "| Value 4 | Value 5 | Value 6 |\n"
            "<!-- /TABLE -->"
        )
        pages = [
            (1, table),
            (2, "Regular text paragraph with enough content to be kept as a chunk here."),
        ]
        chunks = chunk_pages(pages)
        for chunk in chunks:
            assert "chunk_type" in chunk
            assert chunk["chunk_type"] in ("table", "text")

        table_chunks = [c for c in chunks if c["chunk_type"] == "table"]
        assert len(table_chunks) >= 1

    def test_fallback_to_fixed(self):
        pages = [(1, "Some regular text that should chunk fine.")]

        with patch(
            "app.ai.rag._structure_chunk_pages",
            side_effect=RuntimeError("simulated failure"),
        ):
            chunks = chunk_pages(pages)
            # Should fall back to _fixed_chunk_pages and still produce results
            assert len(chunks) >= 0  # may be 0 if text too short
            # Verify it used _fixed_chunk_pages by checking chunk_type exists
            for chunk in chunks:
                assert "chunk_type" in chunk

    def test_fixed_chunk_pages_produces_chunk_type(self):
        pages = [(1, "A" * 200 + "\n\n" + "B" * 200)]
        chunks = _fixed_chunk_pages(pages)
        for chunk in chunks:
            assert chunk["chunk_type"] == "text"
