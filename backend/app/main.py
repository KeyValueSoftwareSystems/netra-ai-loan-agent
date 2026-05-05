from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from schema.chat_request import ChatRequest
from agent import get_response
from agent.llm import get_available_models, get_available_providers, get_current_model, get_current_provider, set_model
import logging
import uuid
import uvicorn
from config import env
from contextlib import asynccontextmanager
from db import init_db
from netra import Netra
from netra.version import __version__ as netra_version
from netra.instrumentation.instruments import InstrumentSet
from services.simulation import run_simulation, fetch_run_details
from services.evaluation import run_evaluation

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

Netra.init(
    app_name="Nova Agent",
    environment=env.ENVIRONMENT,
    headers=f"x-api-key={env.NETRA_API_KEY}",
    debug_mode=True,
    block_instruments={InstrumentSet.FASTAPI, InstrumentSet.LANGCHAIN, InstrumentSet.LITELLM, InstrumentSet.OPENAI, InstrumentSet.REQUESTS, InstrumentSet.HTTPX} #type: ignore
)

Netra.set_tenant_id("Nova")

logging.info(f"Initialised Netra v{netra_version}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("Starting application - initializing database")
    init_db()
    logging.info("Mock DB has been initialized successfully")
    yield
    logging.info("Shutting down application")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
) 

class ModelRequest(BaseModel):
    model: str
    provider: str | None = None

class BatchSimulationRequest(BaseModel):
    models: list[str]


@app.get("/providers")
def list_providers():
    return {
        "providers": get_available_providers(),
        "currentProvider": get_current_provider(),
        "currentModel": get_current_model(),
    }


@app.get("/models")
def list_models():
    return {
        "models": get_available_models(),
        "current": get_current_model(),
    }


@app.put("/model")
def switch_model(req: ModelRequest, response: Response):
    try:
        set_model(req.model, req.provider)
        logging.info(f"Model switched to: {req.model} (provider: {get_current_provider()})")
        return {"current": get_current_model(), "provider": get_current_provider()}
    except ValueError as e:
        response.status_code = 400
        return {"error": str(e)}


@app.post("/chat")
def chat(chat: ChatRequest, response: Response):
    try:
        thread_id = chat.thread_id or uuid.uuid4().hex
        Netra.set_session_id(thread_id)

        return {
            "response": get_response(chat.prompt, thread_id),
            "thread_id": thread_id
        }
    except Exception as e:
        logging.error(msg=e)
        response.status_code = 500
        return {
            "error": "An error occurred"
        }
    
@app.post("/simulation/{dataset_id}")
def start_simulation(dataset_id: str, response: Response):
    try:
        result = run_simulation(dataset_id)
        if not result:
            raise ValueError("Simulation returned no results — check Netra quota or dataset ID")

        return result
    except Exception as e:
        logging.error(msg=e)
        response.status_code = 500
        return {
            "error": str(e)
        }
    
@app.post("/simulation/{dataset_id}/batch")
def start_batch_simulation(dataset_id: str, req: BatchSimulationRequest, response: Response):
    available = get_available_models()
    invalid = [m for m in req.models if m not in available]
    if invalid:
        response.status_code = 400
        return {"error": f"Unknown models: {invalid}", "available": available}

    original_model = get_current_model()
    results: list[dict] = []

    for model_name in req.models:
        try:
            set_model(model_name)
            logging.info(f"Batch simulation: running dataset {dataset_id} with model {model_name}")
            result = run_simulation(dataset_id)
            results.append({"model": model_name, "status": "success", "result": result})
        except Exception as e:
            logging.error(f"Batch simulation failed for {model_name}: {e}")
            results.append({"model": model_name, "status": "error", "error": str(e)})

    try:
        set_model(original_model)
    except Exception:
        pass

    return {"results": results}


@app.get("/evaluation/run/{run_id}")
def get_evaluation_run(run_id: str, response: Response):
    details = fetch_run_details(run_id)
    if not details:
        response.status_code = 502
        return {"error": "Failed to fetch run details from Netra"}
    return details


@app.post("/single-turn/{dataset_id}")
def run_single_turn_evaluation(dataset_id: str, response: Response):
    try:
        result = run_evaluation(dataset_id)
        if not result:
            raise ValueError("Evaluation failed")

        return result
    except Exception as e:
        logging.error(msg=e)
        response.status_code = 500
        return {
            "error": "An error occurred"
        }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=env.ENVIRONMENT == "dev",
        log_level="info"
    )