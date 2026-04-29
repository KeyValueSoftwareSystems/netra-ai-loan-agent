from config import env
from langchain_openai import ChatOpenAI
from langchain_litellm import ChatLiteLLM
import threading

OPENAI_MODELS = [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o4-mini",
]

LITELLM_MODELS = [
    "litellm_proxy/gpt-4.1",
    "litellm_proxy/gpt-4.1-mini",
    "litellm_proxy/gpt-4.1-nano",
    "litellm_proxy/gpt-4o",
    "litellm_proxy/gpt-4o-mini",
    "litellm_proxy/o4-mini",
]

_lock = threading.Lock()


def _get_provider() -> str:
    if env.OPENAI_API_KEY:
        return "openai"
    return "litellm"


def get_available_models() -> list[str]:
    if _get_provider() == "openai":
        return list(OPENAI_MODELS)
    return [m.removeprefix("litellm_proxy/") for m in LITELLM_MODELS]


def _build_llm(model_name: str):
    if _get_provider() == "openai":
        return ChatOpenAI(api_key=env.OPENAI_API_KEY, model=model_name)  # type: ignore
    prefixed = f"litellm_proxy/{model_name}" if not model_name.startswith("litellm_proxy/") else model_name
    return ChatLiteLLM(api_key=env.LITELLM_API_KEY, api_base="https://llm.keyvalue.systems", model=prefixed)


_default_model = "gpt-4.1"
_current_model_name: str = _default_model
llm = _build_llm(_default_model)


def get_current_model() -> str:
    return _current_model_name


def set_model(model_name: str):
    global llm, _current_model_name
    available = get_available_models()
    if model_name not in available:
        raise ValueError(f"Unknown model '{model_name}'. Available: {available}")
    with _lock:
        _current_model_name = model_name
        llm = _build_llm(model_name)
