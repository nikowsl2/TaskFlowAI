from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve project root: backend/ is one level up from app/
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_CHROMA = str(_BACKEND_DIR / "chroma_db")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    AI_PROVIDER: str = "openai"
    AI_MODEL: str = "gpt-4o"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    DATABASE_URL: str = "sqlite:///./taskflow.db"
    FRONTEND_URL: str = "http://localhost:5173"
    CHROMA_DB_PATH: str = _DEFAULT_CHROMA
    RAG_VERIFY_FAITHFULNESS: bool = True


settings = Settings()
