// COT — positionnement réel des gros spéculateurs (CFTC), par marché.
import { useState, useEffect, useCallback } from "react";
import { usePersistentState } from "../../state/PipelineContext.jsx";
import { fetchCot, COT_MARKETS } from "../../engine/cotData.js";
import { LineChart } from "../../components/charts/LineChart.jsx";
import { Panel, Button, Badge, MetricCard, MetricGrid, fmt, fmtInt } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";

const last = (s) => (s && s.length ? s[s.length - 1] : null);
const fmtDate = (t) => t ? new Date(t).toISOString().slice(0, 10) : "—";

export function CotPage() {
  const [marketKey, setMarketKey] = usePersistentState("cot:market", "gold");
  const [cache, setCache] = usePersistentState("cot:cache", {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const market = COT_MARKETS.find((m) => m.key === marketKey) || COT_MARKETS[0];
  const series = cache[marketKey] || null;

  const load = useCallback(async (force) => {
    setLoading(true); setError(null);
    try {
      const s = await fetchCot(market, { force });
      setCache((c) => ({ ...c, [market.key]: s }));
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  }, [market, setCache]);

  useEffect(() => { if (!series) load(false); /* eslint-disable-next-line */ }, [marketKey]);

  const cur = last(series);
  const prev = series && series.length > 1 ? series[series.length - 2] : null;
  const ncChange = cur && prev ? cur.ncNet - prev.ncNet : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="COT — Positionnement des traders (CFTC)" right={
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: T.textFaint }}>
          <Badge color={T.green}>CFTC · réel</Badge>
          {cur && <span>maj {fmtDate(cur.t)}</span>}
          {loading && <span style={{ color: T.yellow }}>chargement…</span>}
          {error && <span style={{ color: T.red }}>{error}</span>}
          <Button onClick={() => load(true)}>↻</Button>
        </div>
      }>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {COT_MARKETS.map((m) => (
            <span key={m.key} onClick={() => setMarketKey(m.key)} style={{ cursor: "pointer", fontSize: 12, padding: "5px 11px", borderRadius: 6, border: `1px solid ${m.key === marketKey ? T.orange : T.border}`, color: m.key === marketKey ? T.orange : T.textDim, background: m.key === marketKey ? T.orangeSoft : "transparent" }}>{m.label}</span>
          ))}
        </div>
        {cur ? (
          <MetricGrid min={150}>
            <MetricCard label="Net gros spéculateurs" value={fmtInt(cur.ncNet)} color={cur.ncNet >= 0 ? T.green : T.red} hint="Non-commercial : long − short (sentiment directionnel)" />
            <MetricCard label="Net hedgers" value={fmtInt(cur.cNet)} color={cur.cNet >= 0 ? T.green : T.red} hint="Commercial : souvent à contre-sens des spéculateurs" />
            <MetricCard label="% long spéculateurs" value={`${fmt(cur.pctLongNC, 0)}%`} color={cur.pctLongNC > 65 ? T.red : cur.pctLongNC < 35 ? T.green : T.textDim} hint=">65% = foule très longue (risque de retournement)" />
            <MetricCard label="Open Interest" value={fmtInt(cur.oi)} />
            <MetricCard label="Δ net (1 semaine)" value={ncChange != null ? (ncChange >= 0 ? "+" : "") + fmtInt(ncChange) : "—"} color={ncChange >= 0 ? T.green : T.red} />
          </MetricGrid>
        ) : !loading && <div style={{ color: T.textFaint, fontSize: 12, padding: "16px 0" }}>Pas de données pour ce marché.</div>}
      </Panel>

      {series && series.length > 5 && (
        <Panel title={`Historique du net non-commercial — ${market.label}`}>
          <LineChart series={[{ data: series.slice(-260).map((p) => p.ncNet), color: T.orange }]} height={200} showZero yFormat={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)} />
          <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 6 }}>
            Au-dessus de 0 = spéculateurs nets longs. Extrêmes = zones de retournement potentiel. Source : CFTC (rapport hebdomadaire).
          </div>
        </Panel>
      )}
    </div>
  );
}
