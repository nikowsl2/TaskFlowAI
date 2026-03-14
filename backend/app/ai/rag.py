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


def chunk_pages(pages: list[tuple[int, str]]) -> list[dict]:
    """Chunk pages into ~800-char segments, tracking page_num per chunk.

    pages: [(page_num, text), ...] — 1-indexed page numbers.
    Each page is chunked independently so every chunk maps to exactly one page.
    Returns: [{"text": str, "page_num": int}, ...]
    """
    target = 800
    overlap = 150
    result = []

    for page_num, page_text in pages:
        paragraphs = [p.strip() for p in page_text.split("\n\n") if p.strip()]
        current = ""

        for para in paragraphs:
            if len(para) > target:
                if current:
                    result.append({"text": current.strip(), "page_num": page_num})
                    current = ""
                start = 0
                while start < len(para):
                    end = start + target
                    result.append({"text": para[start:end].strip(), "page_num": page_num})
                    start = end - overlap
                continue

            if len(current) + len(para) + 2 > target:
                if current:
                    result.append({"text": current.strip(), "page_num": page_num})
                current = current[-overlap:].strip() + "\n\n" + para if current else para
            else:
                current = current + "\n\n" + para if current else para

        if current.strip():
            result.append({"text": current.strip(), "page_num": page_num})

    MIN_CHUNK = 50  # discard fragments shorter than this (e.g. tail slivers from hard-splits)
    return [c for c in result if len(c["text"]) >= MIN_CHUNK]


def index_document(doc_id: int, pages: list[tuple[int, str]]) -> int:
    """Embed and store document chunks with page metadata. Returns chunk count."""
    collection = _get_collection()
    chunks = chunk_pages(pages)

    ids = [f"doc_{doc_id}_chunk_{i}" for i in range(len(chunks))]
    documents = [c["text"] for c in chunks]
    metadatas = [{"document_id": doc_id, "page_num": c["page_num"]} for c in chunks]

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
    return [{**data[cid], "score": round(s, 4)} for cid, s in merged]


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

    seen: dict[str, dict] = {}  # chunk_id → best result
    for q in queries:
        semantic = search_chunks(q, document_id, per_query)
        bm25 = _bm25_search(q, document_id, per_query)
        merged = _rrf_merge(semantic, bm25)
        for result in merged:
            chunk_id = result["id"]
            if chunk_id not in seen or result["score"] > seen[chunk_id]["score"]:
                seen[chunk_id] = result

    ranked = sorted(seen.values(), key=lambda r: r["score"], reverse=True)
    ranked = [r for r in ranked if r["score"] >= MIN_SCORE]
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
