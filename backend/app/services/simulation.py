from netra import Netra
from netra.simulation import BaseTask, TaskResult
from netra.simulation.client import SimulationHttpClient
from typing import Optional, Any
from uuid import uuid4
from agent import get_response
import logging
import threading
import httpx
from config import env

logger = logging.getLogger(__name__)

NETRA_API_BASE = "https://api.demo.getnetra.ai"

_last_run_id: str | None = None
_run_id_lock = threading.Lock()
_original_post_run_status = SimulationHttpClient.post_run_status


def _capturing_post_run_status(self: Any, run_id: str, status: str) -> Any:
    global _last_run_id
    with _run_id_lock:
        _last_run_id = run_id
    return _original_post_run_status(self, run_id, status)


SimulationHttpClient.post_run_status = _capturing_post_run_status  # type: ignore


class LoanAgentTask(BaseTask):

    def run(self, message: str, session_id: Optional[str] = None) -> TaskResult:
        thread_id = uuid4().hex if not session_id else session_id

        Netra.set_session_id(thread_id)

        try:
            response = get_response(message, thread_id)
            final_message = response
        except Exception as e:
            final_message = f"Error: {str(e)}"

        return TaskResult(
            message=final_message,
            session_id=thread_id
        )


def run_simulation(dataset_id: str) -> dict | None:
    global _last_run_id
    with _run_id_lock:
        _last_run_id = None

    result = Netra.simulation.run_simulation(  # type: ignore
        name="Loan Agent Simulation",
        dataset_id=dataset_id,
        task=LoanAgentTask(),
    )

    if result and isinstance(result, dict):
        with _run_id_lock:
            if _last_run_id:
                result["run_id"] = _last_run_id

    return result


def fetch_run_details(run_id: str) -> dict[str, Any] | None:
    try:
        resp = httpx.get(
            f"{NETRA_API_BASE}/evaluations/run/{run_id}",
            headers={"x-api-key": env.NETRA_API_KEY},
            timeout=15.0,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch run details for {run_id}: {e}")
        return None