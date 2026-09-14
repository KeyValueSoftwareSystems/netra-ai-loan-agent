"""Nova Loan Agent — built with Agno, traced with Netra (auto + manual spans)."""

import logging
import os

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.db.sqlite import SqliteDb

from netra import Netra

from agent.prompt import get_system_prompt
from agent.tools import AGENT_TOOLS

_DB_PATH = os.environ.get("DATABASE_PATH", "data/nova.db")

nova_agent = Agent(
    name="Nova Agent",
    model=OpenAIChat(id="gpt-4.1"),
    instructions=get_system_prompt(),
    tools=AGENT_TOOLS,
    db=SqliteDb(db_file=_DB_PATH),
    add_history_to_context=True,
    num_history_runs=20,
    enable_agentic_memory=True,
    markdown=True,
)


async def get_response(prompt: str, session_id: str) -> str:
    """Run the agent and return the text response.

    Tracing:
    - Agno auto-instrumentation creates the root trace.
    - Manual child spans (e.g. Eligibility Decision) are opened inside tools
      via Netra.start_span while that auto span is active, so they nest under it.
    """
    Netra.set_session_id(session_id)
    logging.info(f"Agent invoked — session_id={session_id}, prompt length={len(prompt)}")

    response = await nova_agent.arun(prompt, session_id=session_id)
    content = response.content if response and response.content else ""

    logging.info(f"Agent responded — session_id={session_id}, response length={len(content)}")
    return content
