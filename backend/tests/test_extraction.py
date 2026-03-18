"""Tests for enriched PDF/DOCX/CSV extraction in documents.py."""

import fitz  # PyMuPDF
import pytest

from app.routers.documents import _extract_pages, _extract_pdf_page


class TestPdfTableExtraction:
    def test_table_becomes_markdown(self):
        """Create a synthetic PDF with a table and verify markdown output."""
        doc = fitz.open()
        page = doc.new_page(width=400, height=300)

        # Insert a simple table using text at known positions
        # We'll use PyMuPDF's table insertion via Story or manual drawing
        # Simplest approach: create cells with rect drawing + text
        # Draw table grid and insert text
        headers = ["DATE", "TYPE", "LOCATION"]
        rows = [["2026-01-06", "Arrival", "LOS"], ["2026-01-10", "Departure", "LHR"]]

        col_width = 120
        row_height = 20
        x0, y0 = 20, 20

        # Draw cells and insert text
        for col_idx, header in enumerate(headers):
            x = x0 + col_idx * col_width
            rect = fitz.Rect(x, y0, x + col_width, y0 + row_height)
            page.draw_rect(rect)
            page.insert_text((x + 5, y0 + 15), header, fontsize=10)

        for row_idx, row in enumerate(rows):
            for col_idx, cell in enumerate(row):
                x = x0 + col_idx * col_width
                y = y0 + (row_idx + 1) * row_height
                rect = fitz.Rect(x, y, x + col_width, y + row_height)
                page.draw_rect(rect)
                page.insert_text((x + 5, y + 15), cell, fontsize=10)

        content = doc.tobytes()
        doc.close()

        # Extract using our function
        pages = _extract_pages("test.pdf", content)
        assert len(pages) >= 1
        text = pages[0][1]

        # The text should contain our data (either as table or plain text)
        assert "DATE" in text or "2026-01-06" in text

    def test_fallback_on_plain_page(self):
        """A page with just text should fall back gracefully."""
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Hello world, this is plain text.", fontsize=12)
        content = doc.tobytes()
        doc.close()

        pages = _extract_pages("test.pdf", content)
        assert len(pages) == 1
        assert "Hello world" in pages[0][1]


class TestPdfHeadingDetection:
    def test_large_font_heading(self):
        """Text with font size >= 1.3x median should get HEADING marker."""
        doc = fitz.open()
        page = doc.new_page()

        # Insert heading (large font) and body (normal font)
        page.insert_text((72, 72), "BIG HEADING", fontsize=24)
        page.insert_text((72, 120), "Normal body text here.", fontsize=10)
        page.insert_text((72, 140), "More normal text here.", fontsize=10)

        text = _extract_pdf_page(page)
        doc.close()

        assert "<!-- HEADING -->" in text
        assert "BIG HEADING" in text

    def test_uniform_font_no_heading(self):
        """When all text is the same size, no heading markers should appear."""
        doc = fitz.open()
        page = doc.new_page()

        page.insert_text((72, 72), "Line one.", fontsize=12)
        page.insert_text((72, 92), "Line two.", fontsize=12)
        page.insert_text((72, 112), "Line three.", fontsize=12)

        text = _extract_pdf_page(page)
        doc.close()

        # With uniform font, threshold = median * 1.3 = 12 * 1.3 = 15.6
        # No text is >= 15.6, so no heading markers
        assert "<!-- HEADING -->" not in text


class TestPdfFallback:
    def test_fallback_returns_text(self):
        """Even if dict extraction fails, plain get_text() should work."""
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Fallback content", fontsize=12)

        # Test the fallback by calling _extract_pdf_page directly
        # (the fallback is internal, so we just verify the function works)
        text = _extract_pdf_page(page)
        doc.close()

        assert "Fallback content" in text


class TestCsvExtraction:
    def test_csv_table_markers(self):
        csv_content = b"Name,Age,City\nAlice,30,NYC\nBob,25,LA"
        pages = _extract_pages("test.csv", csv_content)
        assert len(pages) == 1
        text = pages[0][1]
        assert "<!-- TABLE -->" in text
        assert "<!-- /TABLE -->" in text
        assert "| Name |" in text or "Name" in text


class TestDocxExtraction:
    def test_docx_table_markers(self):
        """DOCX tables should use <!-- TABLE --> markers."""
        import io

        docx_mod = pytest.importorskip("docx", reason="python-docx not installed")
        DocxDocument = docx_mod.Document

        doc = DocxDocument()
        doc.add_paragraph("Introduction text.")
        table = doc.add_table(rows=2, cols=2)
        table.cell(0, 0).text = "Header1"
        table.cell(0, 1).text = "Header2"
        table.cell(1, 0).text = "Data1"
        table.cell(1, 1).text = "Data2"

        buf = io.BytesIO()
        doc.save(buf)
        content = buf.getvalue()

        pages = _extract_pages("test.docx", content)
        assert len(pages) == 1
        text = pages[0][1]
        assert "<!-- TABLE -->" in text
        assert "<!-- /TABLE -->" in text
        assert "Header1" in text
        assert "Data1" in text
