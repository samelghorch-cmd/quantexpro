"""Tests RBAC — résolution des rôles et garde require_role."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.config import Settings
from app.security import DEFAULT_ROLE, Principal, Role, _resolve_role, require_role


def _settings() -> Settings:
    return Settings(api_keys=("kgen",), api_key_roles={"kpm": "pm", "kea": "ea", "kbad": "nope"})


def test_resolve_explicit_role() -> None:
    s = _settings()
    assert _resolve_role("kpm", s) is Role.pm
    assert _resolve_role("kea", s) is Role.ea


def test_resolve_general_key_gets_default() -> None:
    assert _resolve_role("kgen", _settings()) is DEFAULT_ROLE


def test_resolve_unknown_key_is_none() -> None:
    assert _resolve_role("nope", _settings()) is None


def test_resolve_invalid_role_falls_back() -> None:
    assert _resolve_role("kbad", _settings()) is DEFAULT_ROLE


@pytest.mark.asyncio
async def test_require_role_allows_member() -> None:
    dep = require_role(Role.pm, Role.risk)
    principal = Principal(key_id="id", role=Role.pm)
    assert await dep(principal=principal) is principal


@pytest.mark.asyncio
async def test_require_role_denies_non_member() -> None:
    dep = require_role(Role.pm)
    with pytest.raises(HTTPException) as exc:
        await dep(principal=Principal(key_id="id", role=Role.ea))
    assert exc.value.status_code == 403
