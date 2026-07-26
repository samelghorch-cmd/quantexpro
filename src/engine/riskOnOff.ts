// Jauge Risk-On / Risk-Off composite, calculée depuis de VRAIES séries FRED
// (VIX, spread crédit high yield, courbe des taux). Aucune donnée inventée.
// Méthode : rang percentile HISTORIQUE de chaque indicateur (robuste, sans hypothèse
// de normalité), pondéré. VIX & spread crédit élevés = risk-off ; courbe pentue = risk-on.

interface Pt { t: number; v: number; }

// Rang percentile de la dernière valeur dans tout l'historique de la série (0..1).
function pctRank(series: Pt[] | null | undefined): number | null {
  if (!series || series.length < 30) return null;
  const vals = series.map((p) => p.v).filter((v) => Number.isFinite(v));
  if (vals.length < 30) return null;
  const cur = vals[vals.length - 1];
  const below = vals.reduce((n, v) => n + (v <= cur ? 1 : 0), 0);
  return below / vals.length;
}

const lastV = (s: Pt[] | null | undefined): number | null => (s && s.length ? s[s.length - 1].v : null);

export interface RiskComponent {
  key: string; label: string;
  value: number | null;   // dernière valeur brute
  pct: number | null;     // rang percentile historique (0..1)
  contrib: number;        // contribution risk-on (0..1)
}
export interface RiskOnOff {
  score: number | null;   // 0 = risk-off extrême, 100 = risk-on
  verdict: "Risk-ON" | "Neutre" | "Risk-OFF" | "—";
  components: RiskComponent[];
}

const WEIGHTS: Record<string, number> = { vix: 0.4, hy: 0.4, curve: 0.2 };

export function computeRiskOnOff({ vix, hy, curve }: { vix?: Pt[] | null; hy?: Pt[] | null; curve?: Pt[] | null }): RiskOnOff {
  const vixPct = pctRank(vix);      // haut = peur → risk-off
  const hyPct = pctRank(hy);        // haut = stress crédit → risk-off
  const curvePct = pctRank(curve);  // haut = pentue → risk-on

  const components: RiskComponent[] = [
    { key: "vix", label: "VIX (peur)", value: lastV(vix), pct: vixPct, contrib: vixPct == null ? 0 : 1 - vixPct },
    { key: "hy", label: "Spread High Yield (crédit)", value: lastV(hy), pct: hyPct, contrib: hyPct == null ? 0 : 1 - hyPct },
    { key: "curve", label: "Courbe 10A-2A (croissance)", value: lastV(curve), pct: curvePct, contrib: curvePct == null ? 0 : curvePct },
  ];

  let wsum = 0, acc = 0;
  for (const c of components) {
    if (c.pct == null) continue;
    const w = WEIGHTS[c.key] ?? 0;
    acc += w * c.contrib;
    wsum += w;
  }
  const score = wsum > 0 ? Math.round((acc / wsum) * 100) : null;
  let verdict: RiskOnOff["verdict"] = "—";
  if (score != null) verdict = score >= 60 ? "Risk-ON" : score >= 40 ? "Neutre" : "Risk-OFF";

  return { score, verdict, components };
}
