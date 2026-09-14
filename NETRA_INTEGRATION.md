# Netra Integration Reference

This document captures all Netra SDK integration points that existed in the codebase prior to the Agno migration. Use this as a reference when re-adding Netra observability support.

---

## 1. SDK Initialization

**File:** `backend/app/main.py`

```python
from netra import Netra, InstrumentSet
from netra.version import __version__ as netra_version

Netra.init(
    app_name="Nova Agent",
    environment=env.ENVIRONMENT,
    headers=f"x-api-key={env.NETRA_API_KEY}",
    debug_mode=True,
    block_instruments={
        InstrumentSet.FASTAPI,
        InstrumentSet.LANGCHAIN,
        InstrumentSet.LITELLM,
        InstrumentSet.OPENAI,
        InstrumentSet.REQUESTS,
    }
)

Netra.set_tenant_id("Nova")
```

**Notes:**
- Auto-instrumentation was **blocked** for all providers (FastAPI, LangChain, LiteLLM, OpenAI, Requests).
- All tracing was done manually via `trace_conversation()`.
- `debug_mode=True` was enabled.

---

## 2. Manual Trace Recording

**File:** `backend/app/agent/__init__.py`

The `trace_conversation()` function was decorated with `@agent(name="Nova Agent")` from `netra.decorators` and called after every agent response.

### Span Structure

```
Generation Pipeline (SpanType.GENERATION)
├── Session/User/Tenant IDs set
├── Scenario attributes (optional)
├── System prompt recorded via Netra.add_conversation()
├── For each message:
│   ├── Human messages → ConversationType.INPUT
│   ├── AI messages → ConversationType.OUTPUT
│   │   └── Agent Response (SpanType.GENERATION)
│   │       ├── model: "gpt-4.1"
│   │       ├── input_tokens usage
│   │       └── output_tokens usage
│   ├── Tool calls → ConversationType.INPUT (as "Tool Call")
│   └── Tool outputs → ConversationType.OUTPUT (as "Tool Output")
│       └── Tool Name (SpanType.TOOL)
│           ├── tool.name
│           ├── tool.args
│           └── tool.output
```

### Key Code Patterns

```python
from netra.decorators import agent
from netra import Netra, ConversationType, SpanType, UsageModel

@agent(name="Nova Agent")
def trace_conversation(thread_id, messages, *, scenario_intent=None, scenario_sequence=None):
    with Netra.start_span("Generation Pipeline", as_type=SpanType.GENERATION) as agent_span:
        Netra.set_session_id(thread_id)
        Netra.set_user_id("Neethu")
        Netra.set_tenant_id("Laura Inc.")

        # Optional scenario labels for trace clustering
        if scenario_intent is not None:
            agent_span.set_attribute("scenario.intent", scenario_intent)
        if scenario_sequence is not None:
            agent_span.set_attribute("scenario.sequence", scenario_sequence)

        # Record system prompt
        Netra.add_conversation(
            conversation_type=ConversationType.INPUT,
            content=system_prompt_text,
            role="System"
        )

        # For each message in the conversation:
        # Human messages:
        Netra.add_conversation(conversation_type=ConversationType.INPUT, content=message.text, role="User")

        # AI messages with token usage:
        Netra.add_conversation(conversation_type=ConversationType.OUTPUT, content=message.text, role="Ai")
        with Netra.start_span("Agent Response", as_type=SpanType.GENERATION) as response_span:
            response_span.set_model("gpt-4.1")
            input_usage = UsageModel(model="gpt-4.1", units_used=input_tokens, usage_type="input")
            output_usage = UsageModel(model="gpt-4.1", units_used=output_tokens, usage_type="output")
            response_span.set_usage([input_usage, output_usage])

        # Tool calls:
        Netra.add_conversation(conversation_type=ConversationType.INPUT, content=f"{name}({args})", role="Tool Call")

        # Tool outputs:
        with Netra.start_span(tool_name, as_type=SpanType.TOOL) as tool_span:
            tool_span.set_attribute("tool.name", tool_name)
            tool_span.set_attribute("tool.args", str(args))
            tool_span.set_attribute("tool.output", str(output))
        Netra.add_conversation(conversation_type=ConversationType.OUTPUT, content=output, role="Tool Output")
```

### Span Attributes Set

| Attribute | Value/Pattern |
|-----------|---------------|
| `gen_ai.system.role` | `"system"` |
| `gen_ai.system.content` | System prompt text |
| `gen_ai.prompt.{i}.role` | `"user"` |
| `gen_ai.prompt.{i}.content` | User message text |
| `gen_ai.completion.{i}.role` | `"assistant"` or `"tool"` |
| `gen_ai.completion.{i}.content` | AI or tool output text |
| `gen_ai.completion.{i}.tool_call_id` | Tool call ID |
| `gen_ai.completion.{i}.name` | Tool name |
| `scenario.intent` | Intent label (e.g., `"check_eligibility"`) |
| `scenario.sequence` | Sequence label |

---

## 3. Prompt Management

**File:** `backend/app/agent/prompt.py`

```python
from netra import Netra

def get_system_prompt() -> str:
    try:
        prompt = Netra.prompts.get_prompt(name="Loan Agent Prompt", label="production")
        if prompt and prompt.get("messages"):
            messages = prompt["messages"]
            for msg in messages:
                if msg.get("role", "").lower() == "system":
                    return msg.get("content", SYSTEM_PROMPT)
    except (AttributeError, Exception) as e:
        logging.warning(f"Failed to fetch prompt from Netra ({e}), using hardcoded fallback")

    return SYSTEM_PROMPT
```

**Notes:**
- Fetches prompt by name `"Loan Agent Prompt"` with label `"production"` from Netra.
- Falls back to hardcoded `SYSTEM_PROMPT` if Netra fetch fails.
- The prompt was stored in Netra's prompt management system.

---

## 4. Session and User Tracking

### Session ID

**File:** `backend/app/main.py` (in `/chat` endpoint)

```python
Netra.set_session_id(thread_id)
```

Called at the start of every `/chat` request with the conversation's `thread_id`.

### User ID

**File:** `backend/app/agent/tools.py` (in `verify_identity` tool)

```python
Netra.set_user_id(customer["customer_id"])
```

Called when a customer is successfully verified, linking the Netra session to the bank's customer ID.

### Tenant ID

Set in two places:
- `Netra.set_tenant_id("Nova")` during init (`main.py`)
- `Netra.set_tenant_id("Laura Inc.")` during trace recording (`agent/__init__.py`)

---

## 5. Evaluation Service

**File:** `backend/app/services/evaluation.py`

```python
from netra import Netra
from uuid import uuid4

def run_evaluation(dataset_id: str) -> dict | None:
    dataset = Netra.evaluation.get_dataset(dataset_id)

    return Netra.evaluation.run_test_suite(
        name="Loan Agent Single Turn",
        data=dataset,
        task=lambda message: get_response(message, thread_id=uuid4().hex)
    )
```

**API Endpoint:** `POST /single-turn/{dataset_id}`

**Notes:**
- Fetches a test dataset from Netra by ID.
- Runs single-turn evaluation where each test case sends a message to the agent and compares the response.
- The `task` lambda wraps `get_response()` with a fresh `thread_id` for each test case.

---

## 6. Simulation Service

**File:** `backend/app/services/simulation.py`

```python
from netra import Netra
from netra.simulation import BaseTask, TaskResult

class LoanAgentTask(BaseTask):
    def run(self, message: str, session_id: Optional[str] = None) -> TaskResult:
        thread_id = uuid4().hex if not session_id else session_id
        Netra.set_session_id(thread_id)
        try:
            response = get_response(message, thread_id)
            final_message = response
        except Exception as e:
            final_message = f"Error: {str(e)}"
        return TaskResult(message=final_message, session_id=thread_id)

def run_simulation(dataset_id: str) -> dict | None:
    return Netra.simulation.run_simulation(
        name="Loan Agent Simulation",
        dataset_id=dataset_id,
        task=LoanAgentTask()
    )
```

**API Endpoint:** `POST /simulation/{dataset_id}`

**Notes:**
- Multi-turn simulation where Netra drives a conversation using a dataset.
- `LoanAgentTask` extends `BaseTask` and wraps `get_response()`.
- Each turn returns a `TaskResult` with the agent's response and session ID.

---

## 7. Tool-Level Netra Decorators

**File:** `backend/app/agent/tools.py`

All 7 tools had commented-out `@task` decorators from `netra.decorators`:

```python
from netra.decorators import task

@tool
# @task
def verify_identity(...):
    ...
```

These were not active but indicate the intent to add per-tool Netra task tracking.

---

## 8. Environment Variables

| Variable | Purpose | Example Value |
|----------|---------|---------------|
| `NETRA_API_KEY` | Authentication header for Netra API | `your_netra_api_key_here` |
| `NETRA_OTLP_ENDPOINT` | Netra telemetry ingestion endpoint | `https://api.demo.getnetra.ai/telemetry` |
| `ENVIRONMENT` | Environment label sent to Netra | `prod` or `dev` |

---

## 9. Dependencies

```toml
# In backend/pyproject.toml
netra-sdk==0.1.95
```

---

## 10. Trace Generation Script

**File:** `generate_traces.py` (repo root)

A standalone script that generates synthetic multi-turn conversations for Netra trace clustering and analysis. It:

- Defines 25+ intent categories (e.g., `check_eligibility`, `verify_identity_pan`, `complaints_escalations`)
- Uses 4 customer personas with real PAN/Aadhaar/phone numbers
- Generates varied user messages via OpenAI to ensure clean intent clustering
- Sends conversations to `POST /chat` with `scenario_intent` labels
- Saves traces to `trace_logs/traces_{prefix}_{timestamp}.json`

### CLI usage

```bash
python generate_traces.py --samples 5                    # 5 traces per intent
python generate_traces.py --profile balanced             # preset bundle
python generate_traces.py --intent check_eligibility:10  # specific intent
python generate_traces.py --list-intents                 # show available intents
```

---

## 11. Amount Verification Middleware

**File:** `backend/app/agent/__init__.py`

A LangChain-specific `@after_agent` middleware that verified financial figures in AI responses:

```python
@after_agent
def verify_agent_response(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    # Checked if AI response contained lakh figures
    # If so, sent a verification prompt to the LLM to cross-check against tool output
    # Corrected any mismatched amounts
```

This was not Netra-specific but was part of the LangChain agent middleware that was removed during migration. The verification logic has been incorporated into the system prompt instructions instead.

---

## Re-integration Checklist

When adding Netra back, ensure:

- [x] `netra-sdk` added to dependencies
- [x] `Netra.init()` called at app startup with correct config
- [x] `Netra.set_session_id()` called per chat request
- [x] `Netra.set_user_id()` called on customer verification
- [x] `Netra.set_tenant_id()` set appropriately
- [x] Trace recording adapted for Agno's `RunResponse` format (instead of LangChain messages)
- [x] Prompt management reconnected (`Netra.prompts.get_prompt()` with hardcoded fallback)
- [x] Evaluation service re-implemented (`POST /single-turn/{dataset_id}`)
- [x] Simulation service re-implemented (`POST /simulation/{dataset_id}`)
- [x] `NETRA_API_KEY` and `NETRA_OTLP_ENDPOINT` added back to config and docker-compose
- [x] Tool-level `@task` decorators activated on all 7 agent tools
- [x] `scenario_intent` / `scenario_sequence` labels added to ChatRequest schema
- [x] Manual span (`Eligibility Decision`) demonstrated inside `check_eligibility`
