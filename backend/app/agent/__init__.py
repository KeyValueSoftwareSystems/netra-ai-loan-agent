from langchain.agents import create_agent
from langchain.agents.middleware import after_agent, AgentState, ModelRetryMiddleware
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.runtime import Runtime
from langchain.messages import AIMessage
from typing import Any
from agent.llm import llm
from agent.prompt import SYSTEM_PROMPT
from agent.tools import (
    verify_identity,
    calculate_emi,
    check_eligibility,
    fetch_credit_report,
    fetch_financial_profile,
    generate_pre_approval,
    search_loan_products
)
from netra.decorators import agent
from netra import Netra, ConversationType, SpanType, UsageModel
from langgraph.runtime import Runtime
from langchain.messages import AnyMessage
import logging
import re
from langgraph.types import Overwrite


@after_agent
def verify_agent_response(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    """Verify if check_eligibility tool was called and AI response contains lakh figures."""
    has_eligibility_check = False
    eligibility_output = None

    # Check if check_eligibility tool was called in this turn
    for message in state["messages"]:
        # Only AIMessage has tool_calls
        # if isinstance(message, AIMessage) and hasattr(message, "tool_calls"):
        #     for tool_call in message.tool_calls:
        #         if tool_call.get("name") == "check_eligibility":
        #             has_eligibility_check = True
        if hasattr(message, "type") and message.type == "tool" and hasattr(message, "name"):
            if message.name == "check_eligibility":
                eligibility_output = message.content

    # Get the last AI message
    if not state["messages"]:
        return None

    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage):
        return None

    ai_message = last_message.content
    # Handle case where content might not be a string
    if not isinstance(ai_message, str):
        return None

    # Check if AI response contains lakh figures (e.g., "5 lakhs", "5L", "Rs. 5 lakh")
    # or any large number (5+ digits), with or without comma/dot thousand separators
    lakh_pattern = r'\d+\.?\d*\s*(?:lakh|lakhs|L\b)|\d{1,3}(?:[,.]?\d{2,3})+'
    contains_lakh = bool(re.search(lakh_pattern, ai_message, re.IGNORECASE))

    if contains_lakh:
        # Ask LLM to verify and correct the amounts
        verification_prompt = f"""
You are verifying a loan agent's response for accuracy.

Tool Output from check_eligibility:
{eligibility_output}

Agent's Response:
{ai_message}

Task: Check if the agent's response correctly uses the amounts from the tool output. 
Specifically verify:
1. The approved/maximum amount matches the tool output
2. Any amount figures in lakhs are correctly converted from the tool output
3. The agent hasn't invented or miscalculated any amounts

If the response is correct, return it as-is.
If incorrect, return a corrected version that accurately reflects the tool output data.
If there's no eligibility output, round the amount up to the nearest lakh.
Return ONLY the corrected response text, nothing else.
"""

        try:
            corrected_response = llm.invoke(
                [{"role": "user", "content": verification_prompt}])
            corrected_text = corrected_response.content if hasattr(
                corrected_response, "content") else str(corrected_response)

            logging.info(
                f"Amount verification - Original: {ai_message[:100]}... | Corrected: {corrected_text[:100]}...")

            updated_messages = state["messages"].copy()

            updated_messages[-1] = AIMessage(content=corrected_text,
                                             tool_calls=last_message.tool_calls, usage_metadata=last_message.usage_metadata)

            return {"messages": Overwrite(updated_messages)}
        except Exception as e:
            logging.error(f"Amount verification failed: {e}")
            return None

    return None


_agent = create_agent(
    model=llm,
    system_prompt=SYSTEM_PROMPT,
    tools=[
        verify_identity,
        calculate_emi,
        check_eligibility,
        fetch_credit_report,
        fetch_financial_profile,
        generate_pre_approval,
        search_loan_products
    ],
    checkpointer=InMemorySaver(),
    middleware=[
        verify_agent_response,
        ModelRetryMiddleware(
            max_delay=2,
            max_retries=5
        )
    ]
)

# @agent(name="Nova")


def get_response(prompt: str, thread_id: str, files: list[dict[str, str]] = []):
    # IMPORTANT this method does not currently actually read the file, now it only infers from the file and its metadata.
    # TODO: implement file reading and parsing
    messages = [
        {
            "role": "user",
            "content": prompt
        }
    ]

    if files and len(files) > 0:
        for file in files:
            messages.append({
                "role": "user",
                "content": f"I have uploaded a file named {file["filename"]} with mimetype {file["mime_type"]}"
            })

    response = _agent.invoke({
        "messages": messages
    }, {
        "configurable": {
            "thread_id": thread_id
        }
    })

    # Pass the actual response messages which include middleware modifications
    trace_conversation(thread_id, response["messages"])
    return response["messages"][-1].text


@agent(name="Nova Agent")
def trace_conversation(thread_id: str, messages: list[AnyMessage] | None = None):
    # Use provided messages or fetch from state
    if messages is None:
        messages = _agent.get_state({
            "configurable": {
                "thread_id": thread_id
            }
        }).values["messages"]

    # Type guard to ensure messages is not None
    assert messages is not None, "Messages should not be None"

    with Netra.start_span("Generation Pipeline", as_type=SpanType.GENERATION) as agent_span:
        Netra.set_session_id(thread_id)
        Netra.set_user_id("Demo")
        Netra.set_tenant_id("Nova")

        tool_calls = {}

        # logging.info(f"{thread_id}: Processing system message: {SYSTEM_PROMPT}")
        Netra.add_conversation(
            conversation_type=ConversationType.INPUT,
            content=SYSTEM_PROMPT,
            role="System"
        )
        agent_span.set_attribute("gen_ai.system.role", "system")
        agent_span.set_attribute("gen_ai.system.content", SYSTEM_PROMPT)

        for i, message in enumerate(messages):
            if message.type == "human":
                # logging.info(f"{thread_id}: Processing human message: {message.text}")
                Netra.add_conversation(
                    conversation_type=ConversationType.INPUT,
                    content=message.text,
                    role="User"
                )
                agent_span.set_attribute(f"gen_ai.prompt.{i}.role", "user")
                agent_span.set_attribute(
                    f"gen_ai.prompt.{i}.content", message.text)
            elif message.type == "ai":
                # logging.info(f"{thread_id}: Processing AI message: {message.text}")
                agent_span.set_attribute(
                    f"gen_ai.completion.{i}.role", "assistant")
                if len(message.text) > 0:
                    Netra.add_conversation(
                        conversation_type=ConversationType.OUTPUT,
                        content=message.text,
                        role="Ai"
                    )
                    agent_span.set_attribute(
                        f"gen_ai.completion.{i}.content", message.text)
                    agent_span.set_attribute(
                        f"gen_ai.completion.{i}.role", "assistant")

                    with Netra.start_span("Agent Response", as_type=SpanType.GENERATION) as response_span:
                        response_span.set_model("gpt-4.1")

                        input_usage = UsageModel(
                            model="gpt-4.1",
                            units_used=message.usage_metadata["input_tokens"] if message.usage_metadata else 0,
                            usage_type="input"
                        )

                        output_usage = UsageModel(
                            model="gpt-4.1",
                            units_used=message.usage_metadata["output_tokens"] if message.usage_metadata else 0,
                            usage_type="output"
                        )

                        response_span.set_usage([input_usage, output_usage])
                        response_span.set_attribute("completion", message.text)

                for _, tool_call in enumerate(message.tool_calls):
                    tool_calls[tool_call["id"]] = {
                        "name": tool_call["name"],
                        "args": tool_call["args"]
                    }

                    Netra.add_conversation(
                        conversation_type=ConversationType.INPUT,
                        content=f"""{tool_call["name"]}({tool_call["args"]})""",
                        role="Tool Call"
                    )
            elif message.type == "tool":
                # logging.info(f"{thread_id}: Processing tool output: {message.content}")
                tool_calls[message.tool_call_id]["output"] = message.content

                with Netra.start_span(tool_calls[message.tool_call_id]["name"], as_type=SpanType.TOOL) as tool_span:
                    tool_span.set_attribute(
                        "tool.name", tool_calls[message.tool_call_id]["name"])
                    tool_span.set_attribute("tool.args", str(
                        tool_calls[message.tool_call_id]["args"]))
                    tool_span.set_attribute(
                        "tool.output", str(message.content))

                Netra.add_conversation(
                    conversation_type=ConversationType.OUTPUT,
                    content=message.content,
                    role="Tool Output"
                )
                agent_span.set_attribute(f"gen_ai.completion.{i}.role", "tool")
                agent_span.set_attribute(
                    f"gen_ai.completion.{i}.tool_call_id", message.tool_call_id)
                agent_span.set_attribute(
                    f"gen_ai.completion.{i}.name", tool_calls[message.tool_call_id]["name"])
                agent_span.set_attribute(
                    f"gen_ai.completion.{i}.content", str(message.content))
