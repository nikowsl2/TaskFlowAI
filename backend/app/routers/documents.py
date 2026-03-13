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
    if not (filename.endswith(".txt") or filename.endswith(".docx") or filename.endswith(".pdf")):
        raise HTTPException(415, "Only .txt, .docx, and .pdf files are supported.")

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

    if filename.endswith(".txt"):
        file_type = "txt"
    elif filename.endswith(".docx"):
        file_type = "docx"
    else:
        file_type = "pdf"

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
    if filename.endswith(".txt"):
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")
        return [(1, text)]

    if filename.endswith(".docx"):
        import io

        from docx import Document as DocxDocument

        doc = DocxDocument(io.BytesIO(content))
        text = "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
        return [(1, text)]

    if filename.endswith(".pdf"):
        import io

        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        pages = []
        for i, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                pages.append((i, text.strip()))
        return pages

    raise ValueError(f"Unsupported file type: {filename}")


async def _generate_summary(text: str) -> str:
    # Truncate to first 8000 chars to stay within token limits
    snippet = text[:8000]
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
