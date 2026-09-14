"""Single-turn evaluation service powered by Netra.

Fetches a test dataset from Netra, runs each test case through the agent,
and returns the scored results.
"""

import asyncio
import logging
from uuid import uuid4

from netra import Netra

from agent import get_response


def _agent_task(message: str) -> str:
    """Synchronous wrapper around the async agent for Netra's callback."""
    return asyncio.run(get_response(message, session_id=uuid4().hex))


def run_evaluation(dataset_id: str) -> dict | None:
    """Run a single-turn evaluation suite against the given dataset."""
    try:
        dataset = Netra.evaluation.get_dataset(dataset_id)
        if dataset is None:
            logging.error(f"Evaluation dataset not found: {dataset_id}")
            return None

        return Netra.evaluation.run_test_suite(
            name="Loan Agent Single Turn",
            data=dataset,
            task=_agent_task,
        )
    except Exception as e:
        logging.error(f"Evaluation failed: {e}", exc_info=True)
        return None
