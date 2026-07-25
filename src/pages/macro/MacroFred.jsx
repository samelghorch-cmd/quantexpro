// Pages macro RÉELLES via FRED (Réserve Fédérale US), sans clé API.
// Yield Curve · Inflation · USD Liquidity — données réelles, mises à jour, en cache IndexedDB.
import { useState, useEffect, useCallback } from "react";
import { usePersistentState } from "../../state/PipelineContext.jsx";
import { fetchFredMany, lastVal, lastDate, yoy, FRED } from "../../engine/macroData.ts";
import { LineChart } from "../../components/charts/LineChart.jsx";
import { Panel, Button, Badge, MetricCard, MetricGrid, fmt } from "../../components/shared/ui.tsx";
import { T } from "../../components/shared/theme.ts";

const fmtDate = (t) => t ? new Date(t).toISOString().slice(0, 10) : "—";

// Hook commun : charge des séries FRED, les garde (persistant), gère loading/erreur.
function useFred(storeKey, ids) {
  const [data, setData] = usePersistentState(`macro:${storeKey}`, null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const load = useCallback(async (force) => {
    setLoading(true); setError(null);
    try { setData(await fetchFredMany(ids, { force })); }
    catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  useEffect(() => { if (!data) load(false); /* eslint-disable-next-line */ }, []);
  return { data, loading, error, reload: () => load(true) };
}

function Source({ loading, error, reload, date }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: T.textFaint }}>
      <Badge color={T.green}>FRED · réel</Badge>
      {date && <span>maj {fmtDate(date)}</span>}
      {loading && <span style={{ color: T.yellow }}>chargement…</span>}
      {error && <span style={{ color: T.red }}>{error}</span>}
      <Button onClick={reload}>↻</Button>
    </div>
  );
}

/* ===================== YIELD CURVE ===================== */
const CURVE_IDS = ["DGS1MO", "DGS3MO", "DGS6MO", "DGS1", "DGS2", "DGS5", "DGS10", "DGS30"];
export function YieldCurvePage() {
  const { data, loading, error, reload } = useFred("yield", [...CURVE_IDS, "T10Y2Y", "T10Y3M"]);
  const curve = data ? CURVE_IDS.map((id) => ({ id, label: FRED[id].label, v: lastVal(data[id]) })) : [];
  const spread = data ? lastVal(data.T10Y2Y) : null;
  const inverted = spread != null && spread < 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Courbe des taux du Trésor US" right={<Source loading={loading} error={error} reload={reload} date={data && lastDate(data.DGS10)} />}>
        {inverted != null && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ ...(inverted ? { color: T.red } : { color: T.green }), fontSize: 13, fontWeight: 700 }}>
              {inverted ? "⚠️ COURBE INVERSÉE" : "✓ Courbe normale"}
            </span>
            <span style={{ color: T.textDim, fontSize: 12, marginLeft: 8 }}>
              Spread 10A-2A = {fmt(spread, 2)}% {inverted && "— signal historique de récession"}
            </span>
          </div>
        )}
        <MetricGrid min={90}>
          {curve.map((c) => <MetricCard key={c.id} label={c.label} value={c.v != null ? `${fmt(c.v, 2)}%` : "—"} color={T.orange} />)}
        </MetricGrid>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>Forme de la courbe (1M → 30A)</div>
          <LineChart series={[{ data: curve.map((c) => c.v), color: T.orange, width: 2.5 }]} height={180} yFormat={(v) => `${v.toFixed(1)}%`} />
        </div>
      </Panel>
      {data && (
        <Panel title="Historique du spread 10A-2A (inversion = récession probable)">
          <LineChart series={[{ data: data.T10Y2Y.slice(-1200).map((p) => p.v), color: T.blue }]} height={200} showZero yFormat={(v) => `${v.toFixed(1)}%`} />
        </Panel>
      )}
    </div>
  );
}

/* ===================== INFLATION ===================== */
export function InflationPage() {
  const { data, loading, error, reload } = useFred("inflation", ["CPIAUCSL", "T10YIE", "T5YIFR", "FEDFUNDS", "UNRATE"]);
  const cpiYoY = data ? yoy(data.CPIAUCSL) : null;
  // série CPI en glissement annuel
  const cpiYoYSeries = data && data.CPIAUCSL ? data.CPIAUCSL.map((p, i, arr) => {
    if (i < 12) return null;
    const prev = arr[i - 12].v;
    return prev ? ((p.v - prev) / prev) * 100 : null;
  }).filter((v) => v != null) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Inflation & politique monétaire" right={<Source loading={loading} error={error} reload={reload} date={data && lastDate(data.T10YIE)} />}>
        <MetricGrid min={140}>
          <MetricCard label="CPI (glissement annuel)" value={cpiYoY != null ? `${fmt(cpiYoY, 1)}%` : "—"} color={cpiYoY > 3 ? T.red : cpiYoY > 2 ? T.yellow : T.green} hint="Inflation réalisée sur 12 mois" />
          <MetricCard label="Point mort 10A" value={data ? `${fmt(lastVal(data.T10YIE), 2)}%` : "—"} hint="Inflation anticipée par le marché" />
          <MetricCard label="Inflation 5A dans 5A" value={data ? `${fmt(lastVal(data.T5YIFR), 2)}%` : "—"} />
          <MetricCard label="Taux directeur Fed" value={data ? `${fmt(lastVal(data.FEDFUNDS), 2)}%` : "—"} color={T.orange} />
          <MetricCard label="Chômage US" value={data ? `${fmt(lastVal(data.UNRATE), 1)}%` : "—"} />
        </MetricGrid>
      </Panel>
      {cpiYoYSeries.length > 0 && (
        <Panel title="Inflation CPI en glissement annuel (%)">
          <LineChart series={[{ data: cpiYoYSeries.slice(-600), color: T.red }]} height={200} yFormat={(v) => `${v.toFixed(1)}%`} />
          <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 6 }}>Cible Fed = 2%. Source : FRED (CPIAUCSL).</div>
        </Panel>
      )}
    </div>
  );
}

/* ===================== USD LIQUIDITY ===================== */
export function UsdLiquidityPage() {
  const { data, loading, error, reload } = useFred("usdliq", ["WALCL", "RRPONTSYD", "WTREGEN", "VIXCLS", "BAMLH0A0HYM2", "DTWEXBGS"]);
  // Liquidité nette ≈ Bilan Fed − Reverse Repo − Compte du Trésor (en milliards $)
  const walclB = data ? lastVal(data.WALCL) / 1000 : null;   // WALCL en millions → milliards
  const rrp = data ? lastVal(data.RRPONTSYD) : null;         // déjà en milliards
  const tga = data ? lastVal(data.WTREGEN) / 1000 : null;    // WTREGEN en millions → milliards
  const netLiq = walclB != null && rrp != null && tga != null ? walclB - rrp - tga : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Liquidité USD & risque" right={<Source loading={loading} error={error} reload={reload} date={data && lastDate(data.WALCL)} />}>
        <MetricGrid min={150}>
          <MetricCard label="Liquidité nette" value={netLiq != null ? `${fmt(netLiq / 1000, 2)} T$` : "—"} color={T.orange} hint="Bilan Fed − Reverse Repo − TGA" />
          <MetricCard label="Bilan de la Fed" value={walclB != null ? `${fmt(walclB / 1000, 2)} T$` : "—"} />
          <MetricCard label="Reverse Repo" value={rrp != null ? `${fmt(rrp, 0)} Md$` : "—"} />
          <MetricCard label="Compte Trésor (TGA)" value={tga != null ? `${fmt(tga, 0)} Md$` : "—"} />
          <MetricCard label="VIX" value={data ? fmt(lastVal(data.VIXCLS), 1) : "—"} color={data && lastVal(data.VIXCLS) > 25 ? T.red : T.green} />
          <MetricCard label="Spread High Yield" value={data ? `${fmt(lastVal(data.BAMLH0A0HYM2), 2)}%` : "—"} color={data && lastVal(data.BAMLH0A0HYM2) > 5 ? T.red : T.green} hint="Stress crédit (>5% = risk-off)" />
          <MetricCard label="Dollar (indice large)" value={data ? fmt(lastVal(data.DTWEXBGS), 1) : "—"} />
        </MetricGrid>
      </Panel>
      {data && (
        <Panel title="Bilan de la Réserve Fédérale (milliards $)">
          <LineChart series={[{ data: data.WALCL.slice(-600).map((p) => p.v / 1000), color: T.orange }]} height={200} yFormat={(v) => `${(v / 1000).toFixed(1)}T`} />
          <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 6 }}>QE = expansion (liquidité) · QT = contraction. Source : FRED (WALCL).</div>
        </Panel>
      )}
    </div>
  );
}
