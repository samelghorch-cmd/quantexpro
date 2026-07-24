"""Moteur LLM local (Qwen2.5-Coder-7B) — prompt → stratégie JSON (zero-token).

- ``rules``   : schéma Pydantic MIROIR du Rule Builder JS (`src/engine/ruleBuilder.js`)
                → toute stratégie générée est validée contre le MÊME contrat que l'Importer.
- ``prompt``  : construction du prompt système (catalogue sources/opérateurs + few-shot).
- ``client``  : client chat OpenAI-compatible (Ollama / llama.cpp / vLLM) avec retry.
- ``service`` : compile_strategy(prompt) → StrategyDraft validé.
"""

from .errors import LLMError, LLMInvalidOutput, LLMUnavailable
from .rules import OP_IDS, SOURCE_IDS, RuleCondition, StrategyDraft, StrategyRules
from .service import compile_strategy

__all__ = [
    "OP_IDS",
    "SOURCE_IDS",
    "LLMError",
    "LLMInvalidOutput",
    "LLMUnavailable",
    "RuleCondition",
    "StrategyDraft",
    "StrategyRules",
    "compile_strategy",
]
