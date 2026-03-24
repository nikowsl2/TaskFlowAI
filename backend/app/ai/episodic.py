from __future__ import annotations

import logging
import time
import uuid
from functools import lru_cache

from app.config import settings

logger = logging.getLogger(__name__)

EPISODIC_COLLECTION = "taskflow_episodes"
USER_MEMORIES_COLLECTION = "taskflow_user_memories"

MIN_MEMORY_SCORE = 0.35  # Filter out low-relevance recall results (1 - cosine distance)

_COSINE_META = {"hnsw:space": "cosine"}


def _ensure_cosine_space(client, name: str, embedding_function) -> None:  # noqa: ANN001
    """Recreate a collection with cosine space if it was created with the default (L2).

    ChromaDB's get_or_create_collection does not update metadata on an existing
    collection, so collections created before the cosine metadata was added are
    stuck on L2 distance.  This migrates them in-place: back up data, delete,
    recreate with cosine, and re-insert.
    """
    try:
        existing = client.get_collection(name)
    except Exception:
        return  # Collection doesn't exist yet — get_or_create will handle it

    if existing.metadata and existing.metadata.get("hnsw:space") == "cosine":
        return  # Already correct

    count = existing.count()
    if count == 0:
        client.delete_collection(name)
        logger.info("Deleted empty collection %s to recreate with cosine space", name)
        return

    # Back up all data
    backup = existing.get(include=["documents", "metadatas", "embeddings"])
    ids = backup["ids"]
    docs = backup["documents"]
    metas = backup["metadatas"]
    embeds = backup["embeddings"]

    # Delete and recreate with cosine
    client.delete_collection(name)
    new_col = client.get_or_create_collection(
        name, embedding_function=embedding_function, metadata=_COSINE_META
    )

    # Re-insert with original embeddings to avoid re-computing them
    new_col.upsert(ids=ids, documents=docs, metadatas=metas, embeddings=embeds)
    logger.info(
        "Migrated collection %s to cosine space (%d items preserved)", name, len(ids)
    )


@lru_cache(maxsize=1)
def _get_episodic_collection():
    import chromadb
    from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY required for episodic memory")

    ef = OpenAIEmbeddingFunction(
        api_key=settings.OPENAI_API_KEY,
        model_name="text-embedding-3-small",
    )
    client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
    _ensure_cosine_space(client, EPISODIC_COLLECTION, ef)
    return client.get_or_create_collection(
        EPISODIC_COLLECTION,
        embedding_function=ef,
        metadata=_COSINE_META,
    )


def log_episode(project_id: int, memory_text: str) -> str:
    col = _get_episodic_collection()
    episode_id = f"episode_{project_id}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
    col.upsert(
        ids=[episode_id],
        documents=[memory_text],
        metadatas=[{"project_id": project_id, "logged_at": int(time.time() * 1000)}],
    )
    return episode_id


def recall_episodes(project_id: int, query: str, n_results: int = 5) -> list[dict]:
    try:
        col = _get_episodic_collection()
        results = col.query(
            query_texts=[query],
            n_results=n_results,
            where={"project_id": project_id},
            include=["documents", "metadatas", "distances"],
        )
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]
        return [
            {"text": d, "metadata": m}
            for d, m, dist in zip(docs, metas, dists)
            if (1.0 - dist) >= MIN_MEMORY_SCORE
        ]
    except Exception:
        logger.exception("recall_episodes failed")
        return []


def get_project_episodes(project_id: int) -> list[dict]:
    try:
        col = _get_episodic_collection()
        results = col.get(
            where={"project_id": project_id},
            include=["documents", "metadatas"],
        )
        ids = results.get("ids", [])
        docs = results.get("documents", [])
        metas = results.get("metadatas", [])
        episodes = []
        for ep_id, text, meta in zip(ids, docs, metas):
            logged_at = meta.get("logged_at") if meta else None
            if logged_at is None:
                try:
                    logged_at = int(ep_id.rsplit("_", 1)[-1])
                except (ValueError, IndexError):
                    logged_at = None
            episodes.append({"id": ep_id, "text": text, "logged_at_ms": logged_at})
        episodes.sort(key=lambda e: e["logged_at_ms"] or 0, reverse=True)
        return episodes
    except Exception:
        return []


def delete_episode(episode_id: str) -> None:
    col = _get_episodic_collection()
    col.delete(ids=[episode_id])


def delete_project_episodes(project_id: int) -> None:
    try:
        col = _get_episodic_collection()
        col.delete(where={"project_id": project_id})
    except Exception:
        pass


# ── User personal memory ──────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def _get_user_memory_collection():
    import chromadb
    from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY required for user memory")

    ef = OpenAIEmbeddingFunction(
        api_key=settings.OPENAI_API_KEY,
        model_name="text-embedding-3-small",
    )
    client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
    _ensure_cosine_space(client, USER_MEMORIES_COLLECTION, ef)
    return client.get_or_create_collection(
        USER_MEMORIES_COLLECTION,
        embedding_function=ef,
        metadata=_COSINE_META,
    )


def log_user_memory(memory_text: str) -> str:
    """Log a personal user memory (anecdote, preference detail, past experience).

    Deduplicates: if a near-identical memory exists (score >= 0.85), updates it
    instead of creating a new entry.
    """
    col = _get_user_memory_collection()

    # Check for near-duplicate
    try:
        existing = col.query(
            query_texts=[memory_text],
            n_results=1,
            include=["documents", "distances"],
        )
        dists = existing.get("distances", [[]])[0]
        ids = existing.get("ids", [[]])[0]
        if dists and (1.0 - dists[0]) >= 0.85 and ids:
            # Update existing memory instead of creating duplicate
            col.update(
                ids=[ids[0]],
                documents=[memory_text],
                metadatas=[{"logged_at": int(time.time() * 1000)}],
            )
            return ids[0]
    except Exception:
        pass  # Fall through to create new

    memory_id = f"umem_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
    col.upsert(
        ids=[memory_id],
        documents=[memory_text],
        metadatas=[{"logged_at": int(time.time() * 1000)}],
    )
    return memory_id


def recall_user_memories(query: str, n_results: int = 5) -> list[dict]:
    """Semantic search over personal user memories."""
    try:
        col = _get_user_memory_collection()
        results = col.query(
            query_texts=[query],
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]
        return [
            {"text": d, "metadata": m}
            for d, m, dist in zip(docs, metas, dists)
            if (1.0 - dist) >= MIN_MEMORY_SCORE
        ]
    except Exception:
        return []


def delete_all_user_memories() -> None:
    try:
        col = _get_user_memory_collection()
        all_ids = col.get()["ids"]
        if all_ids:
            col.delete(ids=all_ids)
    except Exception:
        pass
