import asyncio
import logging
import uuid

import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from netra import Netra
from netra.instrumentation.instruments import InstrumentSet

from agent import get_response
from config import env
from db import init_db
from logger import setup_logging
from schema.chat_request import ChatRequest

setup_logging()

# ── Netra initialisation ──────────────────────────────────────────────
Netra.init(
    app_name="Nova Agent",
    environment=env.ENVIRONMENT,
    headers=f"x-api-key={env.NETRA_API_KEY}",
    debug_mode=True,
    block_instruments={
        InstrumentSet.FASTAPI,
        InstrumentSet.OPENAI,
        InstrumentSet.HTTPX,
        InstrumentSet.REQUESTS,
        InstrumentSet.SQLALCHEMY,
        InstrumentSet.SQLITE3,
    },
)
Netra.set_tenant_id("Nova")
logging.info("Netra SDK initialised")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("Starting application — initialising database")
    init_db()
    logging.info("Database initialised with seed data")
    yield
    logging.info("Shutting down application")


app = FastAPI(title="Nova Loan Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health():
    return {"status": "ok", "agent": "Nova"}


# ── Chat ──────────────────────────────────────────────────────────────


@app.post("/chat")
async def chat(chat: ChatRequest, response: Response):
    try:
        thread_id = chat.thread_id or uuid.uuid4().hex
        Netra.set_session_id(thread_id)

        agent_response = await get_response(chat.prompt, session_id=thread_id)

        return {
            "response": agent_response,
            "thread_id": thread_id,
        }
    except Exception as e:
        logging.error(f"Chat error: {e}", exc_info=True)
        response.status_code = 500
        return {"error": "An error occurred"}


# ── Netra Evaluation ──────────────────────────────────────────────────


@app.post("/single-turn/{dataset_id}")
async def single_turn_evaluation(dataset_id: str, response: Response):
    """Run a single-turn evaluation suite using a Netra dataset."""
    try:
        from services.evaluation import run_evaluation

        result = await asyncio.to_thread(run_evaluation, dataset_id)
        if result is None:
            response.status_code = 404
            return {"error": f"Dataset {dataset_id} not found or evaluation failed"}
        return result
    except Exception as e:
        logging.error(f"Evaluation error: {e}", exc_info=True)
        response.status_code = 500
        return {"error": "An error occurred during evaluation"}


# ── Netra Simulation ─────────────────────────────────────────────────


@app.post("/simulation/{dataset_id}")
async def simulation(dataset_id: str, response: Response):
    """Run a multi-turn simulation using a Netra dataset."""
    try:
        from services.simulation import run_simulation

        result = await asyncio.to_thread(run_simulation, dataset_id)
        if result is None:
            response.status_code = 404
            return {"error": f"Dataset {dataset_id} not found or simulation failed"}
        return result
    except Exception as e:
        logging.error(f"Simulation error: {e}", exc_info=True)
        response.status_code = 500
        return {"error": "An error occurred during simulation"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=env.ENVIRONMENT == "dev",
        log_level="info",
    )
