import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


@dataclass(frozen=True)
class Settings:
    falkordb_host: str = os.getenv("FALKORDB_HOST", "localhost")
    falkordb_port: int = int(os.getenv("FALKORDB_PORT", "6379"))
    falkordb_password: str | None = os.getenv("FALKORDB_PASSWORD") or None
    llm_base_url: str = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
    llm_api_key: str | None = os.getenv("GROQ_API_KEY") or os.getenv("LLM_API_KEY") or None
    llm_model: str = os.getenv("LLM_MODEL", "openai/gpt-oss-120b")
    llm_model_fast: str = os.getenv("LLM_MODEL_FAST", "openai/gpt-oss-20b")
    openfda_api_key: str | None = os.getenv("OPENFDA_API_KEY") or None

    supply_graph: str = "supply"
    tenant_prefix: str = "tenant_"


settings = Settings()
