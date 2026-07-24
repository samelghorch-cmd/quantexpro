"""Construction du prompt système/utilisateur pour Qwen2.5-Coder-7B.

Le prompt force une sortie JSON stricte conforme au Rule Builder. Il énumère le catalogue
exact des sources et opérateurs pour empêcher toute hallucination de champ.
"""

from __future__ import annotations

from .rules import OP_IDS, SOURCE_IDS

_SOURCES = ", ".join(sorted(SOURCE_IDS))
_OPS = ", ".join(sorted(OP_IDS))

SYSTEM_PROMPT = f"""Tu es un ingénieur quant. Tu traduis une idée de stratégie de trading \
en un objet JSON STRICT compris par le moteur QuantEXPro (Rule Builder). Tu ne réponds \
QUE par du JSON valide, sans texte autour, sans commentaire, sans markdown.

Schéma exact :
{{
  "name": "<nom court de la stratégie>",
  "rules": {{
    "long":  [ {{"left": <source>, "op": <op>, "right": <source>, "rightConst": <nombre?>}} ],
    "short": [ {{"left": <source>, "op": <op>, "right": <source>, "rightConst": <nombre?>}} ]
  }}
}}

Contraintes :
- "left" et "right" DOIVENT appartenir à : {_SOURCES}.
- "op" DOIT appartenir à : {_OPS} (gt=>, lt=<, crossUp=croise au-dessus, crossDn=croise en-dessous).
- "rightConst" (nombre) est OBLIGATOIRE si et seulement si "right" vaut "const".
- Les conditions d'un même côté sont combinées en ET logique.
- Fournis au moins une condition LONG ou SHORT. Reste simple et causal.

Exemple :
{{"name":"EMA20 > EMA50 + RSI","rules":{{"long":[{{"left":"ema20","op":"crossUp","right":"ema50"}},\
{{"left":"rsi14","op":"lt","right":"const","rightConst":70}}],"short":[{{"left":"ema20","op":"crossDn","right":"ema50"}}]}}}}"""


def build_user_prompt(prompt: str, name: str | None = None) -> str:
    hint = f'\nUtilise "{name}" comme champ "name".' if name else ""
    return f"Idée de stratégie à convertir en JSON :\n{prompt.strip()}{hint}"
