from pydantic import BaseModel


class ChatRequest(BaseModel):
    prompt: str
    thread_id: str | None = None
    scenario_intent: str | None = None
    scenario_sequence: str | None = None
