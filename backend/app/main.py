from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from schema.chat_request import ChatRequest
from agent import get_response
import logging
import uuid
import uvicorn
from config import env
from contextlib import asynccontextmanager
from db import init_db
from logger import setup_logging
from netra import Netra
from netra.version import __version__ as netra_version
from netra.instrumentation.instruments import InstrumentSet
from services.simulation import run_simulation
from services.evaluation import run_evaluation

setup_logging()

Netra.init(
    app_name="Nova Agent",
    environment=env.ENVIRONMENT,
    headers=f"x-api-key={env.NETRA_API_KEY}",
    debug_mode=True,
    block_instruments={InstrumentSet.FASTAPI, InstrumentSet.LANGCHAIN, InstrumentSet.LITELLM, InstrumentSet.OPENAI, InstrumentSet.REQUESTS} #type: ignore
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

@app.post("/chat")
def chat(chat: ChatRequest, response: Response):
    # IMPORTANT this method does not currently actually read the file, now it only infers from the file and its metadata.
    # TODO: implement file reading and parsing
    try:
        thread_id = chat.thread_id or uuid.uuid4().hex
        Netra.set_session_id(thread_id)

        files = []
        if chat.files and len(chat.files) > 0:
            files = [x.model_dump() for x in chat.files]
            logging.info(f"Document upload - thread_id={thread_id}, files={[f.filename for f in chat.files]}")

        return {
            "response": get_response(
                chat.prompt,
                thread_id,
                files,
                scenario_intent=chat.scenario_intent,
                scenario_sequence=chat.scenario_sequence,
            ),
            "thread_id": thread_id,
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
            raise ValueError("Simulation failed")

        return result
    except Exception as e:
        logging.error(msg=e)
        response.status_code = 500
        return {
            "error": "An error occurred"
        }
    
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