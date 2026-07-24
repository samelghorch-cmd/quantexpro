// P1-EDGE — Statistical Edge Module 1
import { describe, it, expect } from "vitest";
import {
  pearson,
  spearman,
  noiseLevel,
  crossoverRate,
  hitRate,
  forwardReturns,
  evaluateIndicator,
  runStatisticalEdge,
  metricsToCSV,
  seriesToCSV,
  zScoreAndPercentile,
  bestLag,
} from "../../src/engine/statisticalEdge.ts";
import { buildContext } from "../../src/engine/context.ts";

function makeBars(n = 200, seed = 1) {
  let p = 100;
  const bars = [];
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) {
    const r = (rnd() - 0.48) * 0.02;
    const o = p;
    p = p * (1 + r);
    const h = Math.max(o, p) * (1 + rnd() * 0.005);
    const l = Math.min(o, p) * (1 - rnd() * 0.005);
    bars.push({ t: 1_700_000_000_000 + i * 3_600_000, o, h, l, c: p, v: 1000 + rnd() * 500 });
  }
  return bars;
}

describe("stats helpers", () => {
  it("pearson parfait = 1", () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(pearson(x, x)).toBeCloseTo(1, 5);
  });

  it("spearman monotone", () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const y = x.map((v) => v * v);
    expect(spearman(x, y)).toBeGreaterThan(0.9);
  });

  it("noise plus élevé sur bruit que sur tendance lisse", () => {
    const trend = Array.from({ length: 80 }, (_, i) => i * 0.5);
    const white = Array.from({ length: 80 }, (_, i) => ((i * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    expect(noiseLevel(white)).toBeGreaterThan(noiseLevel(trend));
  });

  it("crossoverRate compte les zero-cross", () => {
    const s = [1, 1, -1, -1, 1, 1, -1];
    const rate = crossoverRate(s, 0);
    expect(rate).toBeGreaterThan(0);
  });

  it("zScoreAndPercentile sur série connue", () => {
    const s = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const { zScore, percentile, last } = zScoreAndPercentile(s);
    expect(last).toBe(9);
    expect(percentile).toBe(1);
    expect(zScore).toBeGreaterThan(1);
  });
});

describe("hitRate / lag / forwardReturns", () => {
  it("forwardReturns décale correctement", () => {
    const c = [100, 110, 121];
    const fwd = forwardReturns(c, 1);
    expect(fwd[0]).toBeCloseTo(0.1, 5);
    expect(Number.isNaN(fwd[2])).toBe(true);
  });

  it("hitRate > 50% si indicateur = signe du futur", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const fwd = forwardReturns(closes, 1);
    // indicateur = fwd lui-même (fuite volontaire pour test)
    const ind = fwd.map((v) => (Number.isFinite(v) ? v : 0));
    const { hit, n } = hitRate(ind, fwd, "test");
    expect(n).toBeGreaterThan(10);
    expect(hit).toBeGreaterThan(0.9);
  });

  it("bestLag retourne un lag dans la plage", () => {
    const bars = makeBars(120);
    const closes = bars.map((b) => b.c);
    const series = closes.map((c, i) => (i > 0 ? closes[i] - closes[i - 1] : 0));
    const { lag } = bestLag(series, closes, 8);
    expect(lag).toBeGreaterThanOrEqual(1);
    expect(lag).toBeLessThanOrEqual(8);
  });
});

describe("evaluateIndicator / runStatisticalEdge", () => {
  it("expose les 10 métriques + score", () => {
    const bars = makeBars(180);
    const ctx = buildContext(bars);
    const row = evaluateIndicator("RSI 14", ctx.rsi[14], bars, { horizon: 5 });
    expect(row.name).toBe("RSI 14");
    expect(row).toHaveProperty("noise");
    expect(row).toHaveProperty("persist");
    expect(row).toHaveProperty("crossovers");
    expect(row).toHaveProperty("corrRet");
    expect(row).toHaveProperty("lag");
    expect(row).toHaveProperty("ic");
    expect(row).toHaveProperty("hit");
    expect(row).toHaveProperty("edgeNet");
    expect(row).toHaveProperty("n");
    expect(row).toHaveProperty("zScore");
    expect(row).toHaveProperty("percentile");
    expect(row.n).toBeGreaterThan(50);
    expect(row.score).toBeGreaterThanOrEqual(0);
  });

  it("runStatisticalEdge classe plusieurs indicateurs", () => {
    const bars = makeBars(200);
    const ctx = buildContext(bars);
    const res = runStatisticalEdge(bars, ctx, { horizon: 5 });
    expect(res.nIndicators).toBeGreaterThan(5);
    expect(res.rows[0].score).toBeGreaterThanOrEqual(res.rows[res.rows.length - 1].score);
  });
});

describe("CSV export", () => {
  it("metricsToCSV contient header et lignes", () => {
    const csv = metricsToCSV([{
      name: "RSI 14", noise: 0.5, persist: 0.55, crossovers: 10,
      corrPrice: 0.1, corrRet: 0.2, lag: 3, ic: 0.08, hit: 55, edgeNet: 5,
      n: 100, zScore: 1.2, percentile: 80, score: 70,
    }]);
    expect(csv.split("\n")[0]).toContain("noise");
    expect(csv).toContain("RSI 14");
  });

  it("seriesToCSV aligne t/close/indicateurs", () => {
    const bars = [{ t: 1, c: 10 }, { t: 2, c: 11 }];
    const catalog = { "RSI 14": [30, 40] };
    const csv = seriesToCSV(bars, catalog);
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv).toContain("30");
  });
});
