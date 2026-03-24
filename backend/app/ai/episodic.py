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


def _rebuild_collection(client, name: str, embedding_function):  # noqa: ANN001, ANN202
    """Build (or rebuild) a collection guaranteeing cosine distance space.

    ChromaDB's get_or_create_collection does not update metadata on an existing
    collection, and cross-process state is unreliable (metadata may read as
    cosine while the HNSW index still uses L2).  Since both distance metrics
    fall in [0, 2] for normalised vectors, there is no way to detect the
    mismatch by probing.

    The safe approach: always back up → delete → recreate with cosine → restore.
    For small episodic/user-memory collections (typically < 100 items) this adds
    negligible startup cost and guarantees correctness.  Returns the collection
    directly so callers never touch a stale client-cached object.
    """
    # Collect existing data (if any) before deleting
    backup = None
    try:
        existing = client.get_collection(name, embedding_function=embedding_function)
        count = existing.count()
        if count > 0:
            backup = existing.get(include=["documents", "metadatas", "embeddings"])
        client.delete_collection(name)
    except Exception:
        pass  # Collection doesn't exist yet

    # Create fresh collection with cosine space
    col = client.create_collection(
        name, embedding_function=embedding_function, metadata=_COSINE_META
    )

    # Restore backed-up data
    if backup and backup["ids"]:
        col.upsert(
            ids=backup["ids"],
            documents=backup["documents"],
            metadatas=backup["metadatas"],
            embeddings=backup["embeddings"],
        )
        logger.info("Rebuilt collection %s with cosine space (%d items)", name, len(backup["ids"]))

    return col


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
    return _rebuild_collection(client, EPISODIC_COLLECTION, ef)


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
        # No score filter: results are already scoped by project_id,
        # so all returned episodes are relevant.  Semantic search ranks
        # them by relevance; the caller controls n_results.
        return [
            {"text": d, "metadata": m}
            for d, m, dist in zip(docs, metas, dists)
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
    return _rebuild_collection(client, USER_MEMORIES_COLLECTION, ef)


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
