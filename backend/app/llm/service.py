"""Service de compilation prompt → stratégie JSON validée."""

from __future__ import annotations

import json
import logging

from pydantic import ValidationError

from .client import ChatClient, OpenAICompatClient
from .errors import LLMInvalidOutput
from .prompt import SYSTEM_PROMPT, build_user_prompt
from .rules import StrategyDraft

_logger = logging.getLogger(__name__)


def _extract_json(text: str) -> str:
    """Isole l'objet JSON dans la réponse du modèle (tolère fences markdown / prose)."""
    cleaned = text.strip()
    if "```" in cleaned:
        # Prend le contenu du premier bloc de code (```json ... ``` ou ``` ... ```).
        start = cleaned.find("```")
        end = cleaned.find("```", start + 3)
        if end != -1:
            block = cleaned[start + 3 : end]
            if block.lstrip().lower().startswith("json"):
                block = block.lstrip()[4:]
            cleaned = block.strip()
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first == -1 or last == -1 or last < first:
        raise LLMInvalidOutput("aucun objet JSON trouvé dans la réponse du modèle")
    return cleaned[first : last + 1]


async def compile_strategy(
    prompt: str, *, name: str | None = None, client: ChatClient | None = None
) -> StrategyDraft:
    """Traduit un prompt en langage naturel en une ``StrategyDraft`` validée (parité Rule Builder).

    Lève ``LLMUnavailable`` si l'inférence échoue, ``LLMInvalidOutput`` si la sortie n'est
    pas un JSON de stratégie conforme.
    """
    engine = client or OpenAICompatClient()
    raw = await engine.complete(SYSTEM_PROMPT, build_user_prompt(prompt, name))

    payload = _extract_json(raw)
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise LLMInvalidOutput(f"JSON illisible : {exc}") from exc
    if not isinstance(data, dict):
        raise LLMInvalidOutput("la racine JSON doit être un objet")
    if name and not data.get("name"):
        data["name"] = name

    try:
        draft = StrategyDraft.model_validate(data)
    except ValidationError as exc:
        raise LLMInvalidOutput(f"stratégie non conforme au Rule Builder : {exc}") from exc

    _logger.info(
        "llm_strategy_compiled",
        extra={"name": draft.name, "long": len(draft.rules.long), "short": len(draft.rules.short)},
    )
    return draft
