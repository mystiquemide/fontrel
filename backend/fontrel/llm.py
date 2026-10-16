"""OpenAI-compatible chat client. Groq by default; any provider works via LLM_BASE_URL."""
from functools import lru_cache

from openai import OpenAI

from .config import settings


class LLMUnavailable(RuntimeError):
    pass


@lru_cache(maxsize=1)
def client() -> OpenAI:
    if not settings.llm_api_key:
        raise LLMUnavailable("no LLM API key configured")
    return OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key, timeout=30, max_retries=0)


def chat(messages: list[dict], tools: list[dict] | None, model: str, force_tool: str | None = None):
    try:
        kwargs = {"model": model, "messages": messages, "temperature": 0}
        if tools:
            kwargs["tools"] = tools
        if force_tool:
            kwargs["tool_choice"] = {"type": "function", "function": {"name": force_tool}}
        return client().chat.completions.create(**kwargs)
    except LLMUnavailable:
        raise
    except Exception as e:  # rate limit, quota, network, provider error
        raise LLMUnavailable(f"{type(e).__name__}: {e}") from e
