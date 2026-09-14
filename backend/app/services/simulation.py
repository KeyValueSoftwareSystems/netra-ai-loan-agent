"""Multi-turn simulation service powered by Netra.

Runs a conversational simulation where Netra drives multi-turn
interactions against the agent using a provided dataset.
"""

import asyncio
import logging
from uuid import uuid4

from netra import Netra
from netra.simulation import BaseTask, TaskResult

from agent import get_response


class LoanAgentTask(BaseTask):
    """Wraps the Nova agent as a Netra simulation task."""

    def run(self, message: str, session_id: str | None = None) -> TaskResult:
        thread_id = session_id or uuid4().hex
        Netra.set_session_id(thread_id)
        try:
            response = asyncio.run(get_response(message, session_id=thread_id))
        except Exception as e:
            logging.error(f"Simulation turn failed: {e}", exc_info=True)
            response = f"Error: {str(e)}"
        return TaskResult(message=response, session_id=thread_id)


def run_simulation(dataset_id: str) -> dict | None:
    """Run a multi-turn simulation against the given dataset."""
    try:
        return Netra.simulation.run_simulation(
            name="Loan Agent Simulation",
            dataset_id=dataset_id,
            task=LoanAgentTask(),
        )
    except Exception as e:
        logging.error(f"Simulation failed: {e}", exc_info=True)
        return None
