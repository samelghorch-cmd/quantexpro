"""Configuration applicative — Pydantic Settings v2.

Toute la configuration passe par variables d'environnement préfixées ``QX_`` (jamais de
secret en dur). Les clés d'API sont fournies en liste séparée par des virgules, par
environnement, et validées au démarrage.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Paramètres immuables résolus une fois au démarrage (cache via ``get_settings``)."""

    model_config = SettingsConfigDict(
        env_prefix="QX_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    env: str = Field(default="development", description="development | staging | production")

    # Base de données TimescaleDB (async SQLAlchemy → asyncpg).
    database_url: str = Field(
        default="postgresql+asyncpg://quant:quant@localhost:5432/quantexpro",
        description="URL SQLAlchemy async (driver asyncpg).",
    )
    db_pool_size: int = Field(default=10, ge=1, le=100)
    db_max_overflow: int = Field(default=20, ge=0, le=200)
    db_pool_timeout_s: float = Field(default=30.0, gt=0)
    db_echo: bool = Field(default=False)

    # Bus ZDL (Redis Streams) — consommé par app.bus.
    redis_url: str = Field(default="redis://localhost:6379/0")
    # Opt-in : sur un hébergement gratuit sans Redis, laisser désactivé (la base TS reste
    # la source de vérité ; la publication devient un no-op silencieux).
    bus_enabled: bool = Field(default=False)
    bus_consumer_group: str = Field(default="quant-engines")
    bus_stream_maxlen: int = Field(default=100_000, ge=1000)
    bus_block_ms: int = Field(default=5000, ge=100)
    bus_batch: int = Field(default=100, ge=1, le=10000)
    bus_max_retries: int = Field(default=3, ge=1, le=20)
    bus_backoff_base_s: float = Field(default=0.5, gt=0)
    bus_reclaim_idle_ms: int = Field(default=60_000, ge=1000)

    # Sécurité : clés d'API acceptées (header X-API-Key). Vide → l'API refuse tout accès
    # authentifié en production (fail-safe) mais reste ouverte en development.
    api_keys: tuple[str, ...] = Field(default_factory=tuple)
    # RBAC : clés associées à un rôle (pm | analyst | risk | ea). Format env :
    #   QX_API_KEY_ROLES="cléPM:pm,cléRisk:risk,cléEA:ea"
    api_key_roles: dict[str, str] = Field(default_factory=dict)

    # P4-SSO — session JWT (HS256) + OIDC optionnel (PKCE / id_token).
    # sso_secret : signature des JWT de session. En production, obligatoire si SSO utilisé.
    sso_secret: str = Field(default="")
    sso_ttl_s: int = Field(default=28_800, ge=300, le=604_800)  # 8h défaut
    # OIDC public client (SPA PKCE). Vide = OIDC désactivé.
    oidc_issuer: str = Field(default="")
    oidc_client_id: str = Field(default="")
    oidc_client_secret: str = Field(default="")  # optionnel (confidential)
    oidc_audience: str = Field(default="")  # défaut = client_id
    # Mapping claim → rôle. Format : "admin:pm,risk-team:risk,*:analyst"
    oidc_role_map: dict[str, str] = Field(default_factory=dict)
    oidc_role_claim: str = Field(default="groups")  # ou "roles" / "email"

    # Pont MT5.
    mt5_default_mode: str = Field(default="paper")  # paper | demo | live

    # Pagination des lectures de séries.
    default_page_limit: int = Field(default=1000, ge=1, le=50000)
    max_page_limit: int = Field(default=10000, ge=1, le=50000)

    # Taille maximale d'un lot d'ingestion (protection mémoire / backpressure).
    max_ingest_batch: int = Field(default=10000, ge=1, le=100000)

    # LLM local (Qwen2.5-Coder-7B) — endpoint OpenAI-compatible (Ollama / llama.cpp / vLLM).
    # Zero-token : inférence locale, aucun coût d'API. Opt-in.
    llm_enabled: bool = Field(default=False)
    llm_base_url: str = Field(default="http://localhost:11434/v1")
    llm_model: str = Field(default="qwen2.5-coder:7b")
    llm_api_key: str = Field(default="not-needed")  # local → placeholder, jamais un secret
    llm_timeout_s: float = Field(default=120.0, gt=0)
    llm_temperature: float = Field(default=0.1, ge=0, le=2)
    llm_max_tokens: int = Field(default=1024, ge=64, le=8192)
    llm_max_retries: int = Field(default=2, ge=1, le=10)

    log_level: str = Field(default="INFO")

    @field_validator("api_keys", mode="before")
    @classmethod
    def _split_api_keys(cls, value: object) -> object:
        """Accepte soit une chaîne CSV (``k1,k2``), soit une séquence déjà découpée."""
        if value is None or value == "":
            return ()
        if isinstance(value, str):
            return tuple(part.strip() for part in value.split(",") if part.strip())
        if isinstance(value, (list, tuple)):
            return tuple(str(part).strip() for part in value if str(part).strip())
        return value

    @field_validator("api_key_roles", mode="before")
    @classmethod
    def _parse_key_roles(cls, value: object) -> object:
        """Accepte une chaîne ``k1:pm,k2:risk`` ou un dict déjà structuré."""
        if value is None or value == "":
            return {}
        if isinstance(value, str):
            out: dict[str, str] = {}
            for pair in value.split(","):
                pair = pair.strip()
                if not pair:
                    continue
                key, _, role = pair.partition(":")
                if key.strip() and role.strip():
                    out[key.strip()] = role.strip().lower()
            return out
        return value

    @field_validator("oidc_role_map", mode="before")
    @classmethod
    def _parse_oidc_role_map(cls, value: object) -> object:
        """Accepte ``admin:pm,*:analyst`` ou un dict."""
        if value is None or value == "":
            return {}
        if isinstance(value, str):
            out: dict[str, str] = {}
            for pair in value.split(","):
                pair = pair.strip()
                if not pair:
                    continue
                key, _, role = pair.partition(":")
                if key.strip() and role.strip():
                    out[key.strip()] = role.strip().lower()
            return out
        return value

    @field_validator("env")
    @classmethod
    def _normalize_env(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = {"development", "staging", "production"}
        if normalized not in allowed:
            raise ValueError(f"env doit être l'un de {sorted(allowed)}, reçu {value!r}")
        return normalized

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def oidc_enabled(self) -> bool:
        return bool(self.oidc_issuer.strip() and self.oidc_client_id.strip())

    @property
    def sso_signing_secret(self) -> str:
        """Secret effectif : QX_SSO_SECRET, sinon dérivé des API keys (dev only)."""
        if self.sso_secret.strip():
            return self.sso_secret.strip()
        if self.api_keys:
            return "qx-sso:" + "|".join(self.api_keys)
        return "qx-sso-dev-insecure"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Résout et met en cache la configuration (une seule instance par process)."""
    return Settings()
