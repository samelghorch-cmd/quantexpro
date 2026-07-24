"""HMM Gaussian univariate — Baum-Welch EM (P6-HMM-BW).

Algorithme classique forward-backward + Viterbi sur log-returns.
Post-map des états → Trend / Range / Vol / Choppy via centroïdes μ/σ.
Pas de dépendance numpy — stdlib uniquement.
"""

from __future__ import annotations

import math
from typing import Any

from .hmm import HMM_REGIME_IDS, HMM_REGIME_LABELS, Feature, map_clusters_to_regimes

_SQRT_2PI = math.sqrt(2.0 * math.pi)


def _gauss_pdf(x: float, mu: float, sigma: float) -> float:
    s = max(sigma, 1e-8)
    z = (x - mu) / s
    return math.exp(-0.5 * z * z) / (s * _SQRT_2PI)


def _normalize(row: list[float]) -> float:
    s = sum(row)
    if s <= 0:
        n = len(row)
        for i in range(n):
            row[i] = 1.0 / n
        return 1.0
    for i in range(len(row)):
        row[i] /= s
    return s


def _init_params(
    obs: list[float], n_states: int
) -> tuple[list[float], list[list[float]], list[float], list[float]]:
    """Init π, A, μ, σ depuis quantiles (déterministe)."""
    sorted_o = sorted(obs)
    n = len(sorted_o)

    def q(p: float) -> float:
        return sorted_o[min(n - 1, int(n * p))]

    mus: list[float] = []
    sigmas: list[float] = []
    for k in range(n_states):
        p = (k + 0.5) / n_states
        mus.append(q(p))
    # σ initiale = écart interquartile / 1.35 (approx)
    iqr = max(q(0.75) - q(0.25), 1e-6)
    base_s = iqr / 1.35
    for k in range(n_states):
        sigmas.append(base_s * (0.7 + 0.2 * k))

    pi = [1.0 / n_states] * n_states
    # A légèrement persistante
    stick = 0.7
    off = (1.0 - stick) / max(n_states - 1, 1)
    a = [[stick if i == j else off for j in range(n_states)] for i in range(n_states)]
    return pi, a, mus, sigmas


def _forward(
    obs: list[float],
    pi: list[float],
    a: list[list[float]],
    mus: list[float],
    sigmas: list[float],
) -> tuple[list[list[float]], list[float]]:
    t_len = len(obs)
    k = len(pi)
    alpha: list[list[float]] = [[0.0] * k for _ in range(t_len)]
    scales: list[float] = [0.0] * t_len

    for j in range(k):
        alpha[0][j] = pi[j] * _gauss_pdf(obs[0], mus[j], sigmas[j])
    scales[0] = _normalize(alpha[0])

    for t in range(1, t_len):
        for j in range(k):
            s = 0.0
            for i in range(k):
                s += alpha[t - 1][i] * a[i][j]
            alpha[t][j] = s * _gauss_pdf(obs[t], mus[j], sigmas[j])
        scales[t] = _normalize(alpha[t])
    return alpha, scales


def _backward(
    obs: list[float],
    a: list[list[float]],
    mus: list[float],
    sigmas: list[float],
    scales: list[float],
) -> list[list[float]]:
    t_len = len(obs)
    k = len(mus)
    beta: list[list[float]] = [[0.0] * k for _ in range(t_len)]
    for j in range(k):
        beta[t_len - 1][j] = 1.0 / scales[t_len - 1]

    for t in range(t_len - 2, -1, -1):
        for i in range(k):
            s = 0.0
            for j in range(k):
                s += a[i][j] * _gauss_pdf(obs[t + 1], mus[j], sigmas[j]) * beta[t + 1][j]
            beta[t][i] = s / scales[t]
    return beta


def _viterbi(
    obs: list[float],
    pi: list[float],
    a: list[list[float]],
    mus: list[float],
    sigmas: list[float],
) -> list[int]:
    t_len = len(obs)
    k = len(pi)
    # log-space
    neg_inf = -1e300
    delta = [[neg_inf] * k for _ in range(t_len)]
    psi = [[0] * k for _ in range(t_len)]

    def log_b(t: int, j: int) -> float:
        p = _gauss_pdf(obs[t], mus[j], sigmas[j])
        return math.log(max(p, 1e-300))

    for j in range(k):
        delta[0][j] = math.log(max(pi[j], 1e-300)) + log_b(0, j)

    for t in range(1, t_len):
        for j in range(k):
            best_i = 0
            best_v = neg_inf
            for i in range(k):
                v = delta[t - 1][i] + math.log(max(a[i][j], 1e-300))
                if v > best_v:
                    best_v = v
                    best_i = i
            delta[t][j] = best_v + log_b(t, j)
            psi[t][j] = best_i

    path = [0] * t_len
    path[t_len - 1] = max(range(k), key=lambda j: delta[t_len - 1][j])
    for t in range(t_len - 2, -1, -1):
        path[t] = psi[t + 1][path[t + 1]]
    return path


def hmm_baum_welch(
    returns: list[float] | None,
    n_states: int = 4,
    iters: int = 25,
) -> dict[str, Any] | None:
    """Fit HMM Gaussian 1D (Baum-Welch) puis mappe vers 4 régimes institutionnels."""
    if not returns or len(returns) < 40:
        return None
    n_k = min(max(n_states, 2), 4)
    obs = [float(x) for x in returns if math.isfinite(float(x))]
    if len(obs) < 40:
        return None

    pi, a, mus, sigmas = _init_params(obs, n_k)
    t_len = len(obs)

    for _ in range(iters):
        alpha, scales = _forward(obs, pi, a, mus, sigmas)
        beta = _backward(obs, a, mus, sigmas, scales)

        # γ_t(i) = α_t(i) β_t(i)  (déjà scalés → produit ≈ postérieur)
        gamma = [[0.0] * n_k for _ in range(t_len)]
        for t in range(t_len):
            for i in range(n_k):
                gamma[t][i] = alpha[t][i] * beta[t][i]
            _normalize(gamma[t])

        # ξ_t(i,j)
        xi = [[[0.0] * n_k for _ in range(n_k)] for _ in range(t_len - 1)]
        for t in range(t_len - 1):
            for i in range(n_k):
                for j in range(n_k):
                    xi[t][i][j] = (
                        alpha[t][i]
                        * a[i][j]
                        * _gauss_pdf(obs[t + 1], mus[j], sigmas[j])
                        * beta[t + 1][j]
                    )
            flat = [xi[t][i][j] for i in range(n_k) for j in range(n_k)]
            s = sum(flat)
            if s > 0:
                for i in range(n_k):
                    for j in range(n_k):
                        xi[t][i][j] /= s

        # M-step π
        pi = [gamma[0][i] for i in range(n_k)]
        _normalize(pi)

        # M-step A
        for i in range(n_k):
            denom = sum(gamma[t][i] for t in range(t_len - 1))
            for j in range(n_k):
                num = sum(xi[t][i][j] for t in range(t_len - 1))
                a[i][j] = num / denom if denom > 1e-12 else 1.0 / n_k
            _normalize(a[i])

        # M-step μ, σ
        for j in range(n_k):
            wsum = sum(gamma[t][j] for t in range(t_len))
            if wsum < 1e-12:
                continue
            mus[j] = sum(gamma[t][j] * obs[t] for t in range(t_len)) / wsum
            var = sum(gamma[t][j] * (obs[t] - mus[j]) ** 2 for t in range(t_len)) / wsum
            sigmas[j] = max(math.sqrt(var), 1e-6)

    raw_states = _viterbi(obs, pi, a, mus, sigmas)

    # Map clusters → régimes via |μ|≈efficiency, σ≈vol
    centroids = [Feature(vol=sigmas[k], efficiency=abs(mus[k])) for k in range(n_k)]
    if n_k == 4:
        remap = map_clusters_to_regimes(centroids)
    else:
        remap = {k: k for k in range(n_k)}

    n_regimes = 4 if n_k == 4 else n_k
    states = [remap.get(s, s) for s in raw_states]
    # Aligner longueur sur returns d'origine (skip non-finite déjà filtrés → pad)
    if len(states) != len(returns):
        # remplit avec premier / dernier état si des NaN avaient été droppés
        full = [states[0]] * len(returns)
        j = 0
        for i, x in enumerate(returns):
            if math.isfinite(float(x)) and j < len(states):
                full[i] = states[j]
                j += 1
            elif j > 0:
                full[i] = states[min(j - 1, len(states) - 1)]
        states = full

    counts = [0] * n_regimes
    for s in states:
        if 0 <= s < n_regimes:
            counts[s] += 1

    if n_k == 4:
        labels = HMM_REGIME_LABELS[:]
        ids = HMM_REGIME_IDS[:]
    else:
        labels = [f"S{i}" for i in range(n_k)]
        ids = [lab.lower() for lab in labels]

    ordered_centroids: list[dict[str, float]] = []
    ordered_mu: list[float] = []
    ordered_sigma: list[float] = []
    for regime_idx in range(len(labels)):
        cluster = next((c for c, r in remap.items() if r == regime_idx), None)
        if cluster is not None:
            ordered_centroids.append(
                {"vol": sigmas[cluster], "efficiency": abs(mus[cluster])}
            )
            ordered_mu.append(mus[cluster])
            ordered_sigma.append(sigmas[cluster])
        else:
            ordered_centroids.append({"vol": 0.0, "efficiency": 0.0})
            ordered_mu.append(0.0)
            ordered_sigma.append(0.0)

    current = states[-1]
    return {
        "states": states,
        "counts": counts,
        "labels": labels,
        "ids": ids,
        "centroids": ordered_centroids,
        "mu": ordered_mu,
        "sigma": ordered_sigma,
        "current": current,
        "current_label": labels[current],
        "heuristic": False,
        "n_states": n_regimes,
        "engine": "baum_welch",
    }
