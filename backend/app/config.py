from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator

class Environment(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    ENVIRONMENT: str = "dev"
    NETRA_API_KEY: str = Field()
    NETRA_OTLP_ENDPOINT: str = Field()

    LITELLM_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    # When true (1/true/yes), Nova uses a relaxed tool-order prompt and reordered tools for trace diversity.
    TOOL_DRIFT: str = Field(default="")

    @model_validator(mode="after")
    def llm_api_key_validator(self) -> 'Environment':
        if not self.LITELLM_API_KEY and not self.OPENAI_API_KEY:
            raise AttributeError("LLM keys must be set")
        elif self.LITELLM_API_KEY and self.OPENAI_API_KEY:
            raise AttributeError("More than one LLM api key has been set. Comment one out.")

        return self


env = Environment() #type: ignore


def tool_drift_enabled() -> bool:
    return env.TOOL_DRIFT.strip().lower() in ("1", "true", "yes")