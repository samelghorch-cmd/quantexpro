"""Client d'inférence OpenAI-compatible (local) — Qwen via Ollama / llama.cpp / vLLM.

Zero-token : appelle un endpoint ``/chat/completions`` local. Retry avec backoff sur les
erreurs réseau ; toute indisponibilité est remontée en ``LLMUnavailable``.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Protocol

import httpx

from ..config import Settings, get_settings
from .errors import LLMUnavailable

_logger = logging.getLogger(__name__)


class ChatClient(Protocol):
    """Contrat minimal d'un client de complétion (injectable pour les tests)."""

    async def complete(self, system: str, user: str) -> str: ...


class OpenAICompatClient:
    """Implémentation HTTP OpenAI-compatible."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._s = settings or get_settings()

    async def complete(self, system: str, user: str) -> str:
        payload: dict[str, Any] = {
            "model": self._s.llm_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": self._s.llm_temperature,
            "max_tokens": self._s.llm_max_tokens,
            "response_format": {"type": "json_object"},
            "stream": False,
        }
        headers = {"Authorization": f"Bearer {self._s.llm_api_key}"}
        url = f"{self._s.llm_base_url.rstrip('/')}/chat/completions"

        attempts = self._s.llm_max_retries
        last_exc: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=self._s.llm_timeout_s) as client:
                    resp = await client.post(url, json=payload, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                return _extract_content(data)
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                last_exc = exc
                if attempt >= attempts:
                    break
                delay = 0.5 * (2 ** (attempt - 1))
                _logger.warning("llm_retry", extra={"attempt": attempt, "delay_s": delay})
                await asyncio.sleep(delay)
        raise LLMUnavailable(f"inférence locale injoignable ({last_exc})") from last_exc


def _extract_content(data: dict[str, Any]) -> str:
    """Extrait le contenu texte d'une réponse chat OpenAI-compatible."""
    choices = data.get("choices")
    if not choices:
        raise ValueError("réponse LLM sans 'choices'")
    message = choices[0].get("message", {})
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise ValueError("réponse LLM sans contenu texte")
    return content
