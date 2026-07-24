"""Tests P4-SSO — JWT session HS256 + mapping rôles OIDC."""

from __future__ import annotations

import time

import pytest

from app.config import Settings
from app.security import Role, get_principal
from app.sso import (
    decode_jwt_payload,
    decode_session_token,
    encode_hs256,
    issue_session_token,
    map_oidc_role,
    verify_oidc_id_token,
)


def test_issue_and_decode_session_token() -> None:
    s = Settings(sso_secret="test-secret-sso", sso_ttl_s=3600, api_keys=("k1",))
    issued = issue_session_token(sub="alice", role=Role.pm, settings=s, auth_method="api_key")
    assert issued["token_type"] == "Bearer"
    assert issued["role"] == "pm"
    claims = decode_session_token(issued["access_token"], s)
    assert claims["sub"] == "alice"
    assert claims["role"] == "pm"
    assert claims["iss"] == "quantexpro"


def test_decode_rejects_tampered() -> None:
    s = Settings(sso_secret="test-secret-sso")
    issued = issue_session_token(sub="bob", role=Role.analyst, settings=s)
    bad = issued["access_token"][:-4] + "xxxx"
    with pytest.raises(ValueError, match="signature|JWT"):
        decode_session_token(bad, s)


def test_map_oidc_role_groups() -> None:
    s = Settings(oidc_role_map={"admins": "pm", "*": "analyst"}, oidc_role_claim="groups")
    assert map_oidc_role({"groups": ["admins"]}, s) is Role.pm
    assert map_oidc_role({"groups": ["other"]}, s) is Role.analyst


def test_map_oidc_role_email() -> None:
    s = Settings(oidc_role_map={"risk@desk.com": "risk"}, oidc_role_claim="email")
    assert map_oidc_role({"email": "risk@desk.com"}, s) is Role.risk


@pytest.mark.asyncio
async def test_get_principal_accepts_bearer_session() -> None:
    s = Settings(
        sso_secret="unit-sso-secret",
        api_keys=("desk-key",),
        api_key_roles={"desk-key": "risk"},
    )
    issued = issue_session_token(sub="risk@desk", role=Role.risk, settings=s, auth_method="oidc")
    principal = await get_principal(
        x_api_key=None,
        authorization=f"Bearer {issued['access_token']}",
        settings=s,
    )
    assert principal.role is Role.risk
    assert principal.auth_method == "oidc"
    assert principal.sub == "risk@desk"


@pytest.mark.asyncio
async def test_get_principal_api_key_still_works() -> None:
    s = Settings(api_keys=("desk-key",), api_key_roles={"desk-key": "pm"}, sso_secret="x")
    principal = await get_principal(x_api_key="desk-key", authorization=None, settings=s)
    assert principal.role is Role.pm
    assert principal.auth_method == "api_key"


def test_expired_token_rejected() -> None:
    s = Settings(sso_secret="exp-secret", sso_ttl_s=300)
    now = int(time.time())
    payload = {
        "iss": "quantexpro",
        "sub": "x",
        "role": "analyst",
        "amr": "api_key",
        "iat": now - 100,
        "exp": now - 10,
    }
    token = encode_hs256(payload, s.sso_signing_secret)
    with pytest.raises(ValueError, match="expiré"):
        decode_session_token(token, s)


def test_verify_oidc_id_token_claims() -> None:
    import base64
    import json

    s = Settings(
        oidc_issuer="https://issuer.example",
        oidc_client_id="spa-client",
        oidc_role_map={"*": "analyst"},
    )
    now = int(time.time())

    def b64(o: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()

    header = {"alg": "RS256"}
    payload = {
        "iss": "https://issuer.example",
        "aud": "spa-client",
        "sub": "u1",
        "email": "a@b.c",
        "exp": now + 3600,
        "iat": now,
    }
    token = (
        f"{b64(header)}."
        f"{b64(payload)}."
        "sig"
    )
    claims = verify_oidc_id_token(token, s)
    assert claims["sub"] == "u1"
    assert decode_jwt_payload(token)["aud"] == "spa-client"


def test_oidc_enabled_flag() -> None:
    assert Settings().oidc_enabled is False
    assert Settings(oidc_issuer="https://x", oidc_client_id="c").oidc_enabled is True
