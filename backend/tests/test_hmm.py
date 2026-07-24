"""P5-HMM-PY — parité Python ↔ hmmRegimes JS."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.quant.hmm import (
    HMM_REGIME_LABELS,
    Feature,
    hmm_features,
    hmm_regimes,
    map_clusters_to_regimes,
)

FIXTURE = Path(__file__).parent / "fixtures" / "hmm_parity_seed9.json"


def test_hmm_features_warmup() -> None:
    returns = [0.01] * 50
    feats = hmm_features(returns, 20)
    assert feats[10].vol != feats[10].vol  # NaN
    assert feats[25].vol == feats[25].vol
    assert feats[25].efficiency >= 0.0


def test_map_clusters_unique() -> None:
    centroids = [
        Feature(vol=0.02, efficiency=0.9),
        Feature(vol=0.005, efficiency=0.1),
        Feature(vol=0.05, efficiency=0.3),
        Feature(vol=0.02, efficiency=0.05),
    ]
    remap = map_clusters_to_regimes(centroids)
    assert sorted(remap.values()) == [0, 1, 2, 3]
    assert remap[0] == 0  # highest eff → Trend


def test_hmm_too_short() -> None:
    assert hmm_regimes([0.1, -0.1, 0.05]) is None


def test_parity_with_js_fixture() -> None:
    data = json.loads(FIXTURE.read_text())
    result = hmm_regimes(data["returns"])
    assert result is not None
    assert result["labels"] == HMM_REGIME_LABELS
    assert result["states"] == data["states"]
    assert result["current"] == data["current"]
    assert result["counts"] == data["counts"]
    assert result["engine"] == "python"
    assert result["heuristic"] is True


def test_api_hmm_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings

    monkeypatch.setenv("QX_ENV", "development")
    monkeypatch.delenv("QX_API_KEYS", raising=False)
    get_settings.cache_clear()
    app = create_app()
    client = TestClient(app)
    data = json.loads(FIXTURE.read_text())
    res = client.post("/v1/quant/hmm", json={"returns": data["returns"]})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["states"] == data["states"]
    assert body["current_label"] == HMM_REGIME_LABELS[data["current"]]
    assert body["engine"] == "python"
