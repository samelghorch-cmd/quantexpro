"""Quant engines Python — P5-HMM-PY.

Port fidèle de ``hmmRegimes`` (heuristique soft-clustering EM JS) pour parité
dashboard ↔ backend. Badge heuristique conservé côté UI ; ce module est la
référence serveur, pas un HMM Baum-Welch « hedge fund » complet.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

HMM_REGIME_LABELS: list[str] = ["Trend", "Range", "Vol", "Choppy"]
HMM_REGIME_IDS: list[str] = ["trend", "range", "vol", "choppy"]


@dataclass(frozen=True)
class Feature:
    vol: float
    efficiency: float


def hmm_features(returns: list[float], win: int = 20) -> list[Feature]:
    """Features causales par barre (fenêtre ``win`` close)."""
    out: list[Feature] = []
    for i in range(len(returns)):
        if i + 1 < win:
            out.append(Feature(vol=float("nan"), efficiency=float("nan")))
            continue
        s = 0.0
        sum_sq = 0.0
        sum_abs = 0.0
        for j in range(i - win + 1, i + 1):
            r = returns[j]
            s += r
            sum_sq += r * r
            sum_abs += abs(r)
        mean = s / win
        vol = (max(0.0, sum_sq / win - mean * mean) ** 0.5) + 1e-12
        efficiency = abs(mean) / (sum_abs / win + 1e-12)
        out.append(Feature(vol=vol, efficiency=efficiency))
    return out


def map_clusters_to_regimes(centroids: list[Feature]) -> dict[int, int]:
    """Assigne les ids de clusters → Trend/Range/Vol/Choppy selon centroïdes."""
    idx = list(range(len(centroids)))
    by_vol = sorted(idx, key=lambda a: centroids[a].vol)
    by_eff = sorted(idx, key=lambda a: centroids[a].efficiency, reverse=True)
    used: set[int] = set()
    remap: dict[int, int] = {}

    def take(order: list[int], regime_idx: int) -> None:
        for c in order:
            if c not in used:
                used.add(c)
                remap[c] = regime_idx
                return

    take(by_eff, 0)  # Trend
    take(by_vol, 1)  # Range
    take(list(reversed(by_vol)), 2)  # Vol
    take(idx, 3)  # Choppy
    return remap


def _quantile(sorted_arr: list[float], p: float) -> float:
    if not sorted_arr:
        return 0.0
    i = min(len(sorted_arr) - 1, int(len(sorted_arr) * p))
    return sorted_arr[i]


def hmm_regimes(
    returns: list[float] | None,
    n_states: int = 4,
    iters: int = 15,
) -> dict[str, Any] | None:
    """Soft-clustering EM sur vol × efficacité — parité ``hmmRegimes`` JS."""
    if not returns or len(returns) < 40:
        return None
    n_k = min(max(n_states, 2), 4)
    win = 20
    feats = hmm_features(returns, win)
    valid_idx = [
        i
        for i, f in enumerate(feats)
        if f.vol == f.vol and f.efficiency == f.efficiency  # not NaN
    ]
    if len(valid_idx) < 20:
        return None

    vols = [feats[i].vol for i in valid_idx]
    effs = [feats[i].efficiency for i in valid_idx]
    vol_sorted = sorted(vols)
    eff_sorted = sorted(effs)

    centroids: list[Feature]
    if n_k == 4:
        centroids = [
            Feature(vol=_quantile(vol_sorted, 0.4), efficiency=_quantile(eff_sorted, 0.8)),
            Feature(vol=_quantile(vol_sorted, 0.2), efficiency=_quantile(eff_sorted, 0.3)),
            Feature(vol=_quantile(vol_sorted, 0.85), efficiency=_quantile(eff_sorted, 0.45)),
            Feature(vol=_quantile(vol_sorted, 0.55), efficiency=_quantile(eff_sorted, 0.2)),
        ]
    else:
        centroids = []
        for k in range(n_k):
            p = (k + 0.5) / n_k
            centroids.append(
                Feature(vol=_quantile(vol_sorted, p), efficiency=_quantile(eff_sorted, 1 - p))
            )

    scale_vol = _quantile(vol_sorted, 0.9) + 1e-12

    def dist2(a: Feature, b: Feature) -> float:
        dv = (a.vol - b.vol) / scale_vol
        de = a.efficiency - b.efficiency
        return dv * dv + de * de

    assign = [0] * len(valid_idx)
    for _ in range(iters):
        for j, vi in enumerate(valid_idx):
            f = feats[vi]
            best = 0
            best_d = float("inf")
            for k in range(n_k):
                d = dist2(f, centroids[k])
                if d < best_d:
                    best_d = d
                    best = k
            assign[j] = best
        next_acc = [{"vol": 0.0, "efficiency": 0.0, "n": 0} for _ in range(n_k)]
        for j, vi in enumerate(valid_idx):
            f = feats[vi]
            k = assign[j]
            next_acc[k]["vol"] += f.vol
            next_acc[k]["efficiency"] += f.efficiency
            next_acc[k]["n"] += 1
        for k in range(n_k):
            if next_acc[k]["n"] > 0:
                n = next_acc[k]["n"]
                centroids[k] = Feature(
                    vol=next_acc[k]["vol"] / n,
                    efficiency=next_acc[k]["efficiency"] / n,
                )

    if n_k == 4:
        remap = map_clusters_to_regimes(centroids)
    else:
        remap = {k: k for k in range(n_k)}

    n_regimes = 4 if n_k == 4 else n_k
    states = [1 if n_k == 4 else 0] * len(returns)
    counts = [0] * n_regimes
    for j, vi in enumerate(valid_idx):
        regime = remap.get(assign[j], assign[j])
        states[vi] = regime
        counts[regime] += 1

    first_valid = valid_idx[0]
    for i in range(first_valid):
        states[i] = states[first_valid]

    if n_k == 4:
        labels = HMM_REGIME_LABELS[:]
        ids = HMM_REGIME_IDS[:]
    else:
        labels = [f"S{i}" for i in range(n_k)]
        ids = [lab.lower() for lab in labels]

    ordered_centroids: list[dict[str, float]] = []
    for regime_idx in range(len(labels)):
        cluster = next((c for c, r in remap.items() if r == regime_idx), None)
        if cluster is not None:
            c = centroids[cluster]
            ordered_centroids.append({"vol": c.vol, "efficiency": c.efficiency})
        else:
            ordered_centroids.append({"vol": 0.0, "efficiency": 0.0})

    current = states[-1]
    return {
        "states": states,
        "counts": counts,
        "labels": labels,
        "ids": ids,
        "centroids": ordered_centroids,
        "mu": [c["efficiency"] for c in ordered_centroids],
        "sigma": [c["vol"] for c in ordered_centroids],
        "current": current,
        "current_label": labels[current],
        "heuristic": True,
        "n_states": n_regimes,
        "engine": "python",
    }
