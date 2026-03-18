"""ChromaDB vector store for document RAG."""

import asyncio
import json
import logging
from functools import lru_cache

from app.config import settings as _settings

logger = logging.getLogger(__name__)

COLLECTION_NAME = "taskflow_docs"
MIN_SCORE = 0.25

QUERY_REWRITE_PROMPT = """\
You are an expert research analyst helping retrieve relevant passages from a document.

You will receive a user query and, when available, a short summary of the document \
being searched. Your job is to:
1. Infer the user's UNDERLYING INFORMATION NEED — what they actually need to know.
2. Use the document summary to understand what content the document contains.
3. Generate 2–3 search queries that will retrieve the most useful passages from \
that specific document.

Do NOT just rephrase the literal words of the query. Reason about WHY the user is \
asking, WHAT decision or goal it serves, and WHICH topics in the document are most \
relevant to that goal.

Rules:
- Ground your queries in the document summary — target content that document \
actually has, not generic topics.
- Each query must target a distinct angle (financial data, technology, risk, etc.).
- Keep queries concise and keyword-rich (good for embedding search).
- Never produce more than 3 queries.
- Return ONLY a JSON array of strings. No explanation, no markdown.

Example:
  Query: "collaboration with Nvidia"
  Document summary: "NVIDIA reported $68B quarterly revenue, 73% YoY growth. \
Data Center segment drove $62B. Announced partnerships with Meta, AWS, Siemens. \
Unveiled Rubin platform roadmap."
  Reasoning: The user's company is evaluating a collaboration. They need to assess \
NVIDIA's financial strength, what technology they bring, and what kinds of \
partnerships they form — not a list of who they already partner with.
  Output: ["NVIDIA revenue growth $68 billion fiscal 2026 financial strength", \
"NVIDIA data center AI technology capabilities products roadmap", \
"NVIDIA partnership investment terms strategic direction Rubin"]
"""


def rewrite_queries(query: str, doc_summary: str | None = None) -> list[str]:
    """Use LLM to rewrite/decompose a query into search-optimized variants.

    Falls back to the original query on any error so search never breaks.
    Short, specific queries without doc context skip LLM rewriting entirely.
    """
    from app.config import settings

    # Fast path: short, specific queries don't benefit from rewriting
    word_count = len(query.split())
    if word_count <= 4 and doc_summary is None:
        logger.info("Query rewrite: skipping (short query, no doc context): %r", query)
        return [query]

    try:
        raw = _call_rewrite_llm(query, settings, doc_summary)
        queries = _parse_query_list(raw)
        if queries:
            logger.info("Query rewrite: %r → %s", query, queries)
            return queries
    except Exception:
        logger.warning("Query rewrite failed, falling back to original query", exc_info=True)

    logger.info("Query rewrite: using original query %r", query)
    return [query]


def _call_rewrite_llm(query: str, settings, doc_summary: str | None) -> str:  # noqa: ANN001
    user_content = f"Query: {query}"
    if doc_summary:
        user_content += f"\n\nDocument summary: {doc_summary}"

    if settings.AI_PROVIDER == "anthropic":
        from anthropic import Anthropic

        client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=256,
            system=QUERY_REWRITE_PROMPT,
            messages=[{"role": "user", "content": user_content}],
            temperature=0.0,
        )
        return response.content[0].text if response.content else "[]"
    else:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        # Note: do NOT use response_format=json_object — the prompt returns an
        # array, not an object, and json_object mode rejects non-object output.
        response = client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=[
                {"role": "system", "content": QUERY_REWRITE_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.0,
            max_tokens=256,
        )
        return response.choices[0].message.content or "[]"


def _parse_query_list(raw: str) -> list[str]:
    """Parse a JSON array from raw LLM output, with regex fallback."""
    import re

    # Try direct parse first
    try:
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list):
            return [str(q).strip() for q in parsed if str(q).strip()]
        # Unwrap {"queries": [...]} style
        if isinstance(parsed, dict):
            for v in parsed.values():
                if isinstance(v, list):
                    return [str(q).strip() for q in v if str(q).strip()]
    except json.JSONDecodeError:
        pass

    # Regex fallback: find the first [...] block in the text
    match = re.search(r"\[.*?\]", raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, list):
                return [str(q).strip() for q in parsed if str(q).strip()]
        except json.JSONDecodeError:
            pass

    return []


@lru_cache(maxsize=1)
def _get_collection():
    import chromadb
    from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

    from app.config import settings

    # Embeddings always use OpenAI text-embedding-3-small regardless of AI_PROVIDER,
    # because Anthropic has no public embeddings API. OPENAI_API_KEY must be set.
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is required for document embeddings even when AI_PROVIDER=anthropic."
        )

    client = chromadb.PersistentClient(path=_settings.CHROMA_DB_PATH)
    embedding_fn = OpenAIEmbeddingFunction(
        api_key=settings.OPENAI_API_KEY,
        model_name="text-embedding-3-small",
    )
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=embedding_fn,
        metadata={"hnsw:space": "cosine"},
    )


def _split_segments(text: str) -> list[dict]:
    """Parse marked-up page text into typed segments.

    Recognizes <!-- TABLE --> and <!-- HEADING --> markers from enriched extraction.
    Unmarked text (e.g. plain TXT/MD files) produces a single "text" segment.
    """
    import re

    TABLE_START = "<!-- TABLE -->"
    TABLE_END = "<!-- /TABLE -->"
    HEADING_MARKER = "<!-- HEADING -->"

    segments: list[dict] = []

    # Split on table markers first
    parts = re.split(r"(<!-- TABLE -->.*?<!-- /TABLE -->)", text, flags=re.DOTALL)

    for part in parts:
        part = part.strip()
        if not part:
            continue

        if part.startswith(TABLE_START) and part.endswith(TABLE_END):
            # Strip the markers from the content
            inner = part[len(TABLE_START) : -len(TABLE_END)].strip()
            segments.append({"text": inner, "type": "table"})
        elif HEADING_MARKER in part:
            # Split on heading markers to create heading_section segments
            heading_parts = re.split(r"(?=<!-- HEADING -->)", part)
            for hp in heading_parts:
                hp = hp.strip()
                if not hp:
                    continue
                if hp.startswith(HEADING_MARKER):
                    # Remove the marker from the text content
                    hp = hp.replace(HEADING_MARKER, "", 1)
                    segments.append({"text": hp.strip(), "type": "heading_section"})
                else:
                    segments.append({"text": hp, "type": "text"})
        else:
            segments.append({"text": part, "type": "text"})

    return segments


def _chunk_table(text: str, max_size: int = 1600) -> list[dict]:
    """Chunk a table segment. Keep atomic if under max_size, else split by rows."""
    if len(text) <= max_size:
        return [{"text": text, "chunk_type": "table"}]

    lines = text.split("\n")
    # First two lines are header + separator
    header_lines = lines[:2] if len(lines) >= 2 else lines[:1]
    header = "\n".join(header_lines)
    data_rows = lines[2:] if len(lines) >= 2 else []

    if not data_rows:
        return [{"text": text, "chunk_type": "table"}]

    chunks: list[dict] = []
    current_rows: list[str] = []
    current_size = len(header) + 1  # +1 for newline

    for row in data_rows:
        row_size = len(row) + 1
        if current_size + row_size > max_size and current_rows:
            chunk_text = header + "\n" + "\n".join(current_rows)
            chunks.append({"text": chunk_text, "chunk_type": "table"})
            current_rows = []
            current_size = len(header) + 1
        current_rows.append(row)
        current_size += row_size

    if current_rows:
        chunk_text = header + "\n" + "\n".join(current_rows)
        chunks.append({"text": chunk_text, "chunk_type": "table"})

    return chunks


def _chunk_heading_section(text: str, target: int = 800, overlap: int = 150) -> list[dict]:
    """Chunk a heading section, keeping heading attached to first paragraph."""
    if len(text) <= target:
        return [{"text": text, "chunk_type": "text"}]

    # Split into heading line and body
    lines = text.split("\n", 1)
    heading_line = lines[0]
    body = lines[1].strip() if len(lines) > 1 else ""

    if not body:
        return [{"text": text, "chunk_type": "text"}]

    # First chunk: heading + as much body as fits
    first_budget = target - len(heading_line) - 2  # -2 for \n\n
    if first_budget <= 0:
        first_budget = target

    chunks: list[dict] = []
    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]

    # Build first chunk with heading attached
    first_parts = [heading_line]
    used = len(heading_line)
    para_idx = 0

    while para_idx < len(paragraphs):
        para = paragraphs[para_idx]
        if used + len(para) + 2 > target and para_idx > 0:
            break
        first_parts.append(para)
        used += len(para) + 2
        para_idx += 1
        if used >= target:
            break

    chunks.append({"text": "\n\n".join(first_parts).strip(), "chunk_type": "text"})

    # Remaining paragraphs: chunk with overlap
    if para_idx < len(paragraphs):
        remaining = "\n\n".join(paragraphs[para_idx:])
        remaining_chunks = _chunk_text(remaining, target, overlap)
        # Add overlap from end of first chunk to start of second
        if remaining_chunks and chunks:
            first_text = chunks[-1]["text"]
            overlap_text = first_text[-overlap:].strip()
            if overlap_text:
                remaining_chunks[0]["text"] = overlap_text + "\n\n" + remaining_chunks[0]["text"]
        chunks.extend(remaining_chunks)

    return chunks


def _chunk_text(text: str, target: int = 800, overlap: int = 150) -> list[dict]:
    """Fixed-size text chunking with universal overlap between ALL consecutive chunks."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        return []

    chunks: list[dict] = []
    current = ""
    prev_tail = ""  # last `overlap` chars of previous chunk for overlap

    for para in paragraphs:
        if len(para) > target:
            # Flush current buffer
            if current:
                chunks.append({"text": current.strip(), "chunk_type": "text"})
                prev_tail = current.strip()[-overlap:]
                current = ""
            # Hard-split long paragraph
            start = 0
            # Prepend overlap from previous chunk to first sub-chunk
            prefix = prev_tail.strip() + "\n\n" if prev_tail else ""
            while start < len(para):
                end = start + target
                chunk_text = para[start:end].strip()
                if start == 0 and prefix:
                    chunk_text = prefix + chunk_text
                chunks.append({"text": chunk_text, "chunk_type": "text"})
                prev_tail = para[start:end].strip()[-overlap:]
                start = end - overlap
            continue

        if len(current) + len(para) + 2 > target:
            if current:
                chunks.append({"text": current.strip(), "chunk_type": "text"})
                prev_tail = current.strip()[-overlap:]
            # Start new chunk with overlap from previous
            overlap_prefix = prev_tail.strip() if prev_tail else ""
            current = overlap_prefix + "\n\n" + para if overlap_prefix else para
        else:
            if not current and prev_tail:
                # First paragraph of new sequence — prepend overlap
                overlap_prefix = prev_tail.strip()
                current = overlap_prefix + "\n\n" + para if overlap_prefix else para
            else:
                current = current + "\n\n" + para if current else para

    if current.strip():
        chunks.append({"text": current.strip(), "chunk_type": "text"})

    return chunks


def chunk_pages(pages: list[tuple[int, str]]) -> list[dict]:
    """Structure-aware chunking with fallback to fixed-size.

    pages: [(page_num, text), ...] — 1-indexed page numbers.
    Returns: [{"text": str, "page_num": int, "chunk_type": str}, ...]
    """
    try:
        return _structure_chunk_pages(pages)
    except Exception:
        logger.warning("Structure-aware chunking failed, falling back to fixed", exc_info=True)
        return _fixed_chunk_pages(pages)


def _structure_chunk_pages(pages: list[tuple[int, str]]) -> list[dict]:
    """Structure-aware chunking that respects tables, headings, and text segments."""
    result = []

    for page_num, page_text in pages:
        segments = _split_segments(page_text)

        for seg in segments:
            seg_type = seg["type"]
            seg_text = seg["text"]

            if seg_type == "table":
                chunks = _chunk_table(seg_text)
            elif seg_type == "heading_section":
                chunks = _chunk_heading_section(seg_text)
            else:
                chunks = _chunk_text(seg_text)

            for chunk in chunks:
                result.append({
                    "text": chunk["text"],
                    "page_num": page_num,
                    "chunk_type": chunk["chunk_type"],
                })

    MIN_CHUNK = 50
    return [c for c in result if len(c["text"]) >= MIN_CHUNK]


def _fixed_chunk_pages(pages: list[tuple[int, str]]) -> list[dict]:
    """Original fixed-size chunking — used as fallback."""
    target = 800
    overlap = 150
    result = []

    for page_num, page_text in pages:
        paragraphs = [p.strip() for p in page_text.split("\n\n") if p.strip()]
        current = ""

        for para in paragraphs:
            if len(para) > target:
                if current:
                    chunk = {"text": current.strip(), "page_num": page_num, "chunk_type": "text"}
                    result.append(chunk)
                    current = ""
                start = 0
                while start < len(para):
                    end = start + target
                    chunk = {
                        "text": para[start:end].strip(),
                        "page_num": page_num,
                        "chunk_type": "text",
                    }
                    result.append(chunk)
                    start = end - overlap
                continue

            if len(current) + len(para) + 2 > target:
                if current:
                    chunk = {"text": current.strip(), "page_num": page_num, "chunk_type": "text"}
                    result.append(chunk)
                current = current[-overlap:].strip() + "\n\n" + para if current else para
            else:
                current = current + "\n\n" + para if current else para

        if current.strip():
            result.append({"text": current.strip(), "page_num": page_num, "chunk_type": "text"})

    MIN_CHUNK = 50
    return [c for c in result if len(c["text"]) >= MIN_CHUNK]


def index_document(doc_id: int, pages: list[tuple[int, str]]) -> int:
    """Embed and store document chunks with page metadata. Returns chunk count."""
    collection = _get_collection()
    chunks = chunk_pages(pages)

    ids = [f"doc_{doc_id}_chunk_{i}" for i in range(len(chunks))]
    documents = [c["text"] for c in chunks]
    metadatas = [
        {
            "document_id": doc_id,
            "page_num": c["page_num"],
            "chunk_type": c.get("chunk_type", "text"),
        }
        for c in chunks
    ]

    collection.upsert(documents=documents, ids=ids, metadatas=metadatas)
    return len(chunks)


def delete_document_chunks(doc_id: int) -> None:
    """Remove all chunks for a document from ChromaDB."""
    collection = _get_collection()
    collection.delete(where={"document_id": doc_id})


def search_chunks(
    query: str,
    document_id: int | None = None,
    n_results: int = 5,
) -> list[dict]:
    """Single-query semantic search. Returns chunks with id, text, and score."""
    collection = _get_collection()
    where = {"document_id": document_id} if document_id is not None else None

    results = collection.query(
        query_texts=[query],
        n_results=n_results,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    ids = results.get("ids", [[]])[0]
    docs = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    return [
        {
            "id": chunk_id,
            "chunk_text": doc,
            "document_id": meta.get("document_id"),
            "page_num": meta.get("page_num"),  # None for docs indexed before this feature
            "chunk_type": meta.get("chunk_type", "text"),
            "score": round(1.0 - dist, 4),
        }
        for chunk_id, doc, meta, dist in zip(ids, docs, metadatas, distances)
    ]


def _bm25_search(
    query: str,
    document_id: int | None = None,
    n_results: int = 10,
) -> list[dict]:
    """Keyword search using BM25 over stored chunks."""
    from rank_bm25 import BM25Okapi

    collection = _get_collection()
    where = {"document_id": document_id} if document_id is not None else None

    stored = collection.get(where=where, include=["documents", "metadatas"])
    ids = stored.get("ids", [])
    docs = stored.get("documents", [])
    metadatas = stored.get("metadatas", [])

    if not ids:
        return []

    tokenized = [d.lower().split() for d in docs]
    bm25 = BM25Okapi(tokenized)
    scores = bm25.get_scores(query.lower().split())

    # Normalize scores to 0-1 range
    max_score = max(scores) if len(scores) > 0 else 1.0
    if max_score == 0:
        max_score = 1.0

    indexed = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:n_results]
    return [
        {
            "id": ids[i],
            "chunk_text": docs[i],
            "document_id": metadatas[i].get("document_id"),
            "page_num": metadatas[i].get("page_num"),
            "chunk_type": metadatas[i].get("chunk_type", "text"),
            "score": round(float(s) / max_score, 4),
        }
        for i, s in indexed
        if s > 0
    ]


def _rrf_merge(
    semantic_results: list[dict],
    bm25_results: list[dict],
    k: int = 60,
) -> list[dict]:
    """Reciprocal Rank Fusion: merge two ranked lists into one."""
    scores: dict[str, float] = {}
    data: dict[str, dict] = {}

    for rank, r in enumerate(semantic_results):
        cid = r["id"]
        scores[cid] = scores.get(cid, 0) + 1.0 / (k + rank)
        data[cid] = r

    for rank, r in enumerate(bm25_results):
        cid = r["id"]
        scores[cid] = scores.get(cid, 0) + 1.0 / (k + rank)
        if cid not in data:
            data[cid] = r

    merged = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    # Normalize to 0-1 so MIN_SCORE threshold stays intuitive
    max_score = merged[0][1] if merged else 1.0
    return [
        {**data[cid], "score": round(s / max_score, 4) if max_score > 0 else 0.0}
        for cid, s in merged
    ]


def _diversify(ranked: list[dict], n_results: int, max_per_page: int = 2) -> list[dict]:
    """Prefer top-scoring chunks but cap results from any single page.

    This prevents all returned chunks from being the same dense summary section.
    Remainder chunks (beyond the page cap) are appended if we're still short.
    """
    page_counts: dict[int, int] = {}
    selected: list[dict] = []
    remainder: list[dict] = []

    for r in ranked:
        page = r.get("page_num")
        if page is None:
            selected.append(r)
        elif page_counts.get(page, 0) < max_per_page:
            page_counts[page] = page_counts.get(page, 0) + 1
            selected.append(r)
        else:
            remainder.append(r)

        if len(selected) == n_results:
            break

    # Pad with lower-priority remainder if still short
    if len(selected) < n_results:
        selected.extend(remainder[: n_results - len(selected)])

    return selected[:n_results]


def smart_search(
    query: str,
    document_id: int | None = None,
    n_results: int = 5,
    doc_summary: str | None = None,
) -> list[dict]:
    """Rewrite query, search with each variant, deduplicate, diversify, return top-N.

    This is the primary entry point for RAG search.
    """
    from app import log_store

    queries = rewrite_queries(query, doc_summary=doc_summary)
    log_store.log(log_store.QUERY_REWRITE, {"original": query, "rewritten": queries})

    # Fetch generously per sub-query so diversification has candidates from
    # different pages, not just the top-2 dense summary pages.
    per_query = max(n_results * 2, 8)

    # Track the best semantic (cosine) score per chunk for relevance filtering
    sem_scores: dict[str, float] = {}
    seen: dict[str, dict] = {}  # chunk_id → best result
    for q in queries:
        semantic = search_chunks(q, document_id, per_query)
        for r in semantic:
            cid = r["id"]
            if cid not in sem_scores or r["score"] > sem_scores[cid]:
                sem_scores[cid] = r["score"]

        bm25 = _bm25_search(q, document_id, per_query)
        merged = _rrf_merge(semantic, bm25)
        for result in merged:
            chunk_id = result["id"]
            if chunk_id not in seen or result["score"] > seen[chunk_id]["score"]:
                seen[chunk_id] = result

    ranked = sorted(seen.values(), key=lambda r: r["score"], reverse=True)

    # Filter on semantic similarity (cosine, 0-1) — not RRF score —
    # so truly irrelevant chunks are dropped even after rank normalization.
    ranked = [r for r in ranked if sem_scores.get(r.get("id", ""), 0) >= MIN_SCORE]

    for r in ranked:
        r.pop("id", None)

    return _diversify(ranked, n_results)


async def async_smart_search(
    query: str,
    document_id: int | None = None,
    n_results: int = 5,
    doc_summary: str | None = None,
) -> list[dict]:
    """Async wrapper for smart_search — runs blocking I/O in a thread."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        lambda: smart_search(query, document_id, n_results, doc_summary=doc_summary),
    )
