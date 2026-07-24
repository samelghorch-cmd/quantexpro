"""Erreurs typées du moteur LLM."""

from __future__ import annotations


class LLMError(Exception):
    """Erreur générique du moteur LLM."""


class LLMUnavailable(LLMError):
    """Le service d'inférence local est injoignable / en échec réseau."""


class LLMInvalidOutput(LLMError):
    """La sortie du modèle n'est pas un JSON de stratégie valide."""
