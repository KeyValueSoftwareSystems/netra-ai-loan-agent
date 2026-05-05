from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator

class Environment(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    ENVIRONMENT: str = "dev"
    NETRA_API_KEY: str = Field()
    NETRA_OTLP_ENDPOINT: str = Field()

    LITELLM_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    GOOGLE_API_KEY: str | None = None

    @model_validator(mode="after")
    def llm_api_key_validator(self) -> 'Environment':
        has_any = (
            self.OPENAI_API_KEY
            or self.ANTHROPIC_API_KEY
            or self.GOOGLE_API_KEY
            or self.LITELLM_API_KEY
        )
        if not has_any:
            raise AttributeError(
                "At least one LLM API key must be set "
                "(OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, or LITELLM_API_KEY)"
            )
        return self
    
env = Environment() #type: ignore