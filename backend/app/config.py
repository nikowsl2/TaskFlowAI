from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    AI_PROVIDER: str = "openai"
    AI_MODEL: str = "gpt-4o"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    DATABASE_URL: str = "sqlite:///./taskflow.db"
    FRONTEND_URL: str = "http://localhost:5173"


settings = Settings()
