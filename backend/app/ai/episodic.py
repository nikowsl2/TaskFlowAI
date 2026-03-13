from __future__ import annotations

import time
from functools import lru_cache

from app.config import settings

EPISODIC_COLLECTION = "taskflow_episodes"
USER_MEMORIES_COLLECTION = "taskflow_user_memories"


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
    return client.get_or_create_collection(EPISODIC_COLLECTION, embedding_function=ef)


def log_episode(project_id: int, memory_text: str) -> str:
    col = _get_episodic_collection()
    episode_id = f"episode_{project_id}_{int(time.time() * 1000)}"
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
        )
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        return [{"text": d, "metadata": m} for d, m in zip(docs, metas)]
    except Exception:
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
    return client.get_or_create_collection(USER_MEMORIES_COLLECTION, embedding_function=ef)


def log_user_memory(memory_text: str) -> str:
    """Log a personal user memory (anecdote, preference detail, past experience)."""
    col = _get_user_memory_collection()
    memory_id = f"umem_{int(time.time() * 1000)}"
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
        results = col.query(query_texts=[query], n_results=n_results)
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        return [{"text": d, "metadata": m} for d, m in zip(docs, metas)]
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
