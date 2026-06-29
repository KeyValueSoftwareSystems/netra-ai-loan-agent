from pydantic import BaseModel

class UploadFile(BaseModel):
    filename: str
    mime_type: str
    data: str

class ChatRequest(BaseModel):
    prompt: str
    thread_id: str | None = None
    files: list[UploadFile] | None = None
    # Optional labels from trace generators (Netra Insights / dashboards)
    scenario_intent: str | None = None
    scenario_sequence: str | None = None
