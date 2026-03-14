"""Document upload, listing, and deletion endpoints."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.ai.rag import delete_document_chunks, index_document
from app.config import settings
from app.database import get_db
from app.models import Document
from app.schemas import DocumentOut

router = APIRouter(prefix="/documents", tags=["documents"])

SUMMARY_SYSTEM = """\
You are an AI that summarizes documents concisely.
Write a 2-4 sentence summary capturing the main topics, purpose, and key information.
Be factual and specific. Do not use markdown formatting.
"""


@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(file: UploadFile, db: Session = Depends(get_db)):
    filename = file.filename or "untitled"
    content_bytes = await file.read()

    # Reject files larger than 20 MB
    if len(content_bytes) > 20 * 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum size is 20 MB.")

    # Validate file type
    allowed_ext = (".txt", ".docx", ".pdf", ".md", ".csv")
    if not any(filename.lower().endswith(ext) for ext in allowed_ext):
        raise HTTPException(415, f"Only {', '.join(allowed_ext)} files are supported.")

    # Extract text pages
    try:
        pages = _extract_pages(filename, content_bytes)
    except Exception as e:
        raise HTTPException(400, f"Could not read file: {e}")

    text = "\n\n".join(t for _, t in pages)
    if not text.strip():
        raise HTTPException(400, "File appears to be empty.")

    # Generate AI summary
    try:
        summary = await _generate_summary(text)
    except Exception as e:
        raise HTTPException(500, f"AI summary failed: {e}")

    ext_to_type = {".txt": "txt", ".docx": "docx", ".pdf": "pdf", ".md": "md", ".csv": "csv"}
    file_type = next((t for ext, t in ext_to_type.items() if filename.endswith(ext)), "txt")

    # Insert SQL record
    doc = Document(
        filename=filename,
        file_type=file_type,
        summary=summary,
        char_count=len(text),
        chunk_count=0,  # updated after indexing
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Index into ChromaDB — rollback SQL record on failure
    try:
        chunk_count = index_document(doc.id, pages)
        doc.chunk_count = chunk_count
        db.commit()
        db.refresh(doc)
    except Exception as e:
        db.delete(doc)
        db.commit()
        raise HTTPException(500, f"Failed to index document: {e}")

    return doc


@router.get("/", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db)):
    return db.query(Document).order_by(Document.created_at.desc()).all()


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, f"Document #{doc_id} not found.")

    try:
        delete_document_chunks(doc_id)
    except Exception as e:
        raise HTTPException(500, f"Failed to remove document chunks: {e}")
    db.delete(doc)
    db.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _extract_pages(filename: str, content: bytes) -> list[tuple[int, str]]:
    """Extract text as (page_num, text) pairs.

    PDFs get real 1-indexed page numbers from pypdf.
    TXT and DOCX are treated as a single page (page 1).
    """
    if filename.endswith(".txt") or filename.endswith(".md"):
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")
        return [(1, text)]

    if filename.endswith(".csv"):
        import csv as csv_mod
        import io

        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")
        reader = csv_mod.reader(io.StringIO(text))
        rows = [
            " | ".join(cell.strip() for cell in row)
            for row in reader
            if any(c.strip() for c in row)
        ]
        return [(1, "\n".join(rows))]

    if filename.endswith(".docx"):
        import io

        from docx import Document as DocxDocument

        doc = DocxDocument(io.BytesIO(content))
        text = "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())

        # Extract tables
        table_lines: list[str] = []
        for table in doc.tables:
            seen_rows: set[str] = set()
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells)
                if row_text not in seen_rows and row_text.replace("|", "").strip():
                    seen_rows.add(row_text)
                    table_lines.append(row_text)
        if table_lines:
            text = text + "\n\n" + "\n".join(table_lines)

        return [(1, text)]

    if filename.endswith(".pdf"):
        import fitz  # PyMuPDF

        doc = fitz.open(stream=content, filetype="pdf")
        pages = []
        for i, page in enumerate(doc, start=1):
            text = page.get_text().strip()
            if not text:
                # OCR fallback for image-only pages (requires Tesseract)
                try:
                    tp = page.get_textpage_ocr(language="eng", dpi=300)
                    text = page.get_text(textpage=tp).strip()
                except Exception:
                    pass  # Tesseract not installed — skip this page
            if text:
                pages.append((i, text))
        doc.close()
        return pages

    raise ValueError(f"Unsupported file type: {filename}")


async def _generate_summary(text: str) -> str:
    # Truncate to first 4000 chars to stay within token limits
    snippet = text[:4000]
    if settings.AI_PROVIDER == "anthropic":
        return await _summarize_anthropic(snippet)
    return await _summarize_openai(snippet)


async def _summarize_openai(text: str) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model=settings.AI_MODEL,
        messages=[
            {"role": "system", "content": SUMMARY_SYSTEM},
            {"role": "user", "content": f"Summarize this document:\n\n{text}"},
        ],
        temperature=0.2,
        max_tokens=300,
    )
    return response.choices[0].message.content or "No summary available."


async def _summarize_anthropic(text: str) -> str:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model=settings.AI_MODEL,
        max_tokens=300,
        system=SUMMARY_SYSTEM,
        messages=[{"role": "user", "content": f"Summarize this document:\n\n{text}"}],
        temperature=0.2,
    )
    return response.content[0].text if response.content else "No summary available."
