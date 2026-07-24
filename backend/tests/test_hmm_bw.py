"""P6-HMM-BW — Baum-Welch Gaussian HMM."""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app
from app.quant.hmm import HMM_REGIME_LABELS
from app.quant.hmm_bw import hmm_baum_welch


def _synth(n: int, drift: float, vol: float, seed: int = 1) -> list[float]:
    # LCG compatible esprit JS seededRandom
    s = seed & 0xFFFFFFFF
    out: list[float] = []
    for _ in range(n):
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        u = s / 4294967296
        out.append(drift + (u * 2 - 1) * vol)
    return out


def test_bw_too_short() -> None:
    assert hmm_baum_welch([0.1, -0.1, 0.05]) is None


def test_bw_four_regimes() -> None:
    r = _synth(200, drift=0.0005, vol=0.012, seed=9)
    h = hmm_baum_welch(r, iters=20)
    assert h is not None
    assert h["labels"] == HMM_REGIME_LABELS
    assert h["engine"] == "baum_welch"
    assert h["heuristic"] is False
    assert len(h["states"]) == len(r)
    assert sum(h["counts"]) == len(r)
    assert all(0 <= s < 4 for s in h["states"])
    assert all(math.isfinite(m) for m in h["mu"])
    assert all(s > 0 for s in h["sigma"])


def test_bw_trend_series_has_trend() -> None:
    r = _synth(250, drift=0.008, vol=0.004, seed=3)
    h = hmm_baum_welch(r, iters=25)
    assert h is not None
    assert h["counts"][0] > 0  # Trend


def test_bw_deterministic() -> None:
    r = _synth(120, drift=0.001, vol=0.01, seed=42)
    a = hmm_baum_welch(r, iters=15)
    b = hmm_baum_welch(r, iters=15)
    assert a is not None and b is not None
    assert a["states"] == b["states"]
    assert a["current"] == b["current"]


def test_api_baum_welch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QX_ENV", "development")
    monkeypatch.delenv("QX_API_KEYS", raising=False)
    get_settings.cache_clear()
    client = TestClient(create_app())
    r = _synth(100, 0.001, 0.01, seed=7)
    res = client.post("/v1/quant/hmm", json={"returns": r, "engine": "baum_welch", "iters": 15})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["engine"] == "baum_welch"
    assert body["heuristic"] is False
    assert body["labels"] == HMM_REGIME_LABELS
