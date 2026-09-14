from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Environment(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    ENVIRONMENT: str = "dev"
    OPENAI_API_KEY: str = Field()
    DATABASE_PATH: str = Field(default="data/nova.db")

    # Netra observability
    NETRA_API_KEY: str = Field()
    NETRA_OTLP_ENDPOINT: str = Field(default="https://api.demo.getnetra.ai/telemetry")


env = Environment()  # type: ignore
