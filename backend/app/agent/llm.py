from config import env
from langchain_openai import ChatOpenAI
from langchain_litellm import ChatLiteLLM
import threading
import httpx
import logging
import time

logger = logging.getLogger(__name__)

_lock = threading.Lock()

_PROVIDER_DISPLAY: dict[str, str] = {}
_AVAILABLE_PROVIDERS: list[str] = []

if env.OPENAI_API_KEY:
    _AVAILABLE_PROVIDERS.append("openai")
    _PROVIDER_DISPLAY["openai"] = "OpenAI"
if env.ANTHROPIC_API_KEY:
    _AVAILABLE_PROVIDERS.append("anthropic")
    _PROVIDER_DISPLAY["anthropic"] = "Anthropic"
if env.GOOGLE_API_KEY:
    _AVAILABLE_PROVIDERS.append("google")
    _PROVIDER_DISPLAY["google"] = "Google"
if env.LITELLM_API_KEY:
    _AVAILABLE_PROVIDERS.append("litellm")
    _PROVIDER_DISPLAY["litellm"] = "LiteLLM"

LITELLM_FALLBACK_MODELS = [
    "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
    "gpt-4o", "gpt-4o-mini", "o4-mini",
]

_OPENAI_CHAT_PREFIXES = ("gpt-", "o1-", "o3-", "o4-", "chatgpt-")
_OPENAI_EXCLUDE = {"gpt-4-", "gpt-3.5-turbo-instruct"}

# ── Model cache ──
_model_cache: dict[str, list[str]] = {}
_cache_timestamps: dict[str, float] = {}
_CACHE_TTL = 300  # 5 minutes


def _is_openai_chat_model(model_id: str) -> bool:
    mid = model_id.lower()
    if not any(mid.startswith(p) for p in _OPENAI_CHAT_PREFIXES):
        return False
    if mid in _OPENAI_EXCLUDE:
        return False
    skip_suffixes = ("-realtime", "-audio", "-transcribe", "-search", "-distill")
    return not any(mid.endswith(s) for s in skip_suffixes)


def _fetch_openai_models() -> list[str]:
    try:
        resp = httpx.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {env.OPENAI_API_KEY}"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        models = sorted(
            [m["id"] for m in data if m.get("id") and _is_openai_chat_model(m["id"])],
            key=lambda x: x.lower(),
        )
        return models
    except Exception as e:
        logger.warning(f"Failed to fetch OpenAI models: {e}")
        return []


def _is_anthropic_chat_model(model_id: str) -> bool:
    return model_id.lower().startswith("claude-")


def _fetch_anthropic_models() -> list[str]:
    try:
        resp = httpx.get(
            "https://api.anthropic.com/v1/models?limit=100",
            headers={
                "x-api-key": env.ANTHROPIC_API_KEY or "",
                "anthropic-version": "2023-06-01",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        models = [m["id"] for m in data if m.get("id") and _is_anthropic_chat_model(m["id"])]
        return models
    except Exception as e:
        logger.warning(f"Failed to fetch Anthropic models: {e}")
        return []


def _is_google_text_gen_model(name: str, methods: list[str]) -> bool:
    if "generateContent" not in methods:
        return False
    n = name.lower()
    skip_keywords = ("embedding", "aqa", "imagen", "veo", "codestral", "learnlm")
    return not any(kw in n for kw in skip_keywords)


def _fetch_google_models() -> list[str]:
    try:
        resp = httpx.get(
            "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
            headers={"x-goog-api-key": env.GOOGLE_API_KEY or ""},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json().get("models", [])
        models = []
        for m in data:
            name: str = m.get("name", "")
            if name.startswith("models/"):
                name = name[len("models/"):]
            methods = m.get("supportedGenerationMethods", [])
            if _is_google_text_gen_model(name, methods):
                models.append(name)
        return sorted(models, key=lambda x: x.lower())
    except Exception as e:
        logger.warning(f"Failed to fetch Google models: {e}")
        return []


_FETCHERS: dict[str, callable] = {  # type: ignore[type-arg]
    "openai": _fetch_openai_models,
    "anthropic": _fetch_anthropic_models,
    "google": _fetch_google_models,
}


def _get_models_for_provider(provider: str) -> list[str]:
    now = time.time()
    if provider in _model_cache and (now - _cache_timestamps.get(provider, 0)) < _CACHE_TTL:
        return _model_cache[provider]

    if provider == "litellm":
        _model_cache[provider] = LITELLM_FALLBACK_MODELS
        _cache_timestamps[provider] = now
        return LITELLM_FALLBACK_MODELS

    fetcher = _FETCHERS.get(provider)
    if not fetcher:
        return []

    models = fetcher()
    if models:
        _model_cache[provider] = models
        _cache_timestamps[provider] = now
    elif provider in _model_cache:
        return _model_cache[provider]

    return models


def get_available_providers() -> list[dict]:
    result = []
    for pid in _AVAILABLE_PROVIDERS:
        models = _get_models_for_provider(pid)
        result.append({
            "id": pid,
            "name": _PROVIDER_DISPLAY[pid],
            "models": models,
        })
    return result


def get_available_models() -> list[str]:
    return _get_models_for_provider(_current_provider)


def _build_llm(provider: str, model_name: str):
    if provider == "openai":
        return ChatOpenAI(api_key=env.OPENAI_API_KEY, model=model_name)  # type: ignore

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(api_key=env.ANTHROPIC_API_KEY, model_name=model_name)  # type: ignore

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(google_api_key=env.GOOGLE_API_KEY, model=model_name)  # type: ignore

    prefixed = f"litellm_proxy/{model_name}" if not model_name.startswith("litellm_proxy/") else model_name
    return ChatLiteLLM(api_key=env.LITELLM_API_KEY, api_base="https://llm.keyvalue.systems", model=prefixed)


_default_provider = _AVAILABLE_PROVIDERS[0] if _AVAILABLE_PROVIDERS else "openai"
_default_models = _get_models_for_provider(_default_provider)
_default_model = _default_models[0] if _default_models else "gpt-4.1"

_current_provider: str = _default_provider
_current_model_name: str = _default_model
llm = _build_llm(_default_provider, _default_model)


def get_current_provider() -> str:
    return _current_provider


def get_current_model() -> str:
    return _current_model_name


def set_model(model_name: str, provider: str | None = None):
    global llm, _current_model_name, _current_provider

    target_provider = provider or _current_provider
    if target_provider not in _AVAILABLE_PROVIDERS:
        raise ValueError(f"Unknown provider '{target_provider}'. Available: {_AVAILABLE_PROVIDERS}")

    available = _get_models_for_provider(target_provider)
    if model_name not in available:
        raise ValueError(f"Unknown model '{model_name}' for provider '{target_provider}'. Available: {available}")

    with _lock:
        _current_provider = target_provider
        _current_model_name = model_name
        llm = _build_llm(target_provider, model_name)


def refresh_models(provider: str | None = None):
    """Force-refresh the model cache for one or all providers."""
    targets = [provider] if provider else _AVAILABLE_PROVIDERS
    for pid in targets:
        _cache_timestamps.pop(pid, None)
        _model_cache.pop(pid, None)
        _get_models_for_provider(pid)
