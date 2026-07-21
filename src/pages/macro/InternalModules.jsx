// Modules MACRO internes (techniques appliquées aux données synthétiques internes).
import { useState, useMemo, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { runCPCV, runFeatureMining, runSymbolicGP } from "../../engine/analyticsAdvanced.js";
import { dataSynthPreview } from "../../engine/dataSynth.js";
import { varCvar } from "../../engine/quantToolbox/index.js";
import { generateBasket, basketCorrelation } from "../../engine/multiAssetSynthetic.js";
import { hmmRegimes } from "../../engine/quantToolbox/index.js";
import { generateOrderBook } from "../../engine/microstructure.js";
import { computeVPIN } from "../../engine/vpin.js";
import { CorrelationMatrix } from "../../components/charts/CorrelationMatrix.jsx";
import { LineChart } from "../../components/charts/LineChart.jsx";
import { MCEnvelope } from "../../components/charts/MCEnvelope.jsx";
import { Panel, Button, Field, NumberInput, MetricCard, MetricGrid, DataTable, Badge, SimBadge, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { StrategyPicker } from "../../components/shared/StrategyPicker.jsx";
import { T } from "../../components/shared/theme.js";

export function CPCVPage() {
  const { bars, ctx, library, symbol, pipeline } = usePipeline();
  const [stratId, setStratId] = useState(pipeline.selectedStrategyId || 3);
  const [res, setRes] = useState(null);
  const run = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    setRes(runCPCV(bars, ctx, strat, { slAtr: 2, tpAtr: 0, direction: "both", contract: symbol, capital: 100000 }, { nGroups: 6, kTest: 2 }));
  }, [library, stratId, bars, ctx, symbol]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Stratégie"><StrategyPicker value={stratId} onChange={setStratId} compact /></Panel>
        <Panel title="CPCV"><Button primary onClick={run} style={{ width: "100%" }}>▶ Lancer CPCV</Button><div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Combinatorial Purged Cross-Validation : 6 groupes, 2 en test, purge des frontières. Estime la probabilité de surapprentissage (PBO).</div></Panel>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {res && (
          <Panel title="Résultat CPCV" right={<SimBadge />}>
            <MetricGrid min={130}>
              <MetricCard label="Chemins OOS" value={res.nPaths} />
              <MetricCard label="PBO" value={fmtPct(res.pbo * 100)} color={res.pbo < 0.3 ? T.green : T.red} hint="Prob. de backtest overfitting" />
              <MetricCard label="Sharpe OOS moyen" value={fmt(res.sharpeMean)} color={res.sharpeMean >= 0 ? T.green : T.red} />
              <MetricCard label="PnL P05" value={fmtUsd(res.pnlP05)} color={T.red} />
              <MetricCard label="PnL P50" value={fmtUsd(res.pnlP50)} />
              <MetricCard label="PnL P95" value={fmtUsd(res.pnlP95)} color={T.green} />
            </MetricGrid>
          </Panel>
        )}
        {res && <Panel title="Distribution des PnL OOS"><LineChart series={[{ data: res.paths.map((p) => p.pnl).sort((a, b) => a - b), color: T.orange }]} height={180} showZero /></Panel>}
        {!res && <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance la validation croisée combinatoire purgée.</div></Panel>}
      </div>
    </div>
  );
}

export function DonneesSynthPage() {
  const { pipeline, bars } = usePipeline();
  const [nPaths, setNPaths] = useState(300);
  const [res, setRes] = useState(null);
  const run = useCallback(() => {
    const bt = pipeline.lastBacktest;
    const pnls = bt ? bt.res.trades.map((t) => t.pnl) : [];
    setRes(dataSynthPreview(pnls, bars, { nPaths, initial: bt?.params.capital || 100000 }));
  }, [pipeline.lastBacktest, bars, nPaths]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <Panel title="Générateur">
        <Field label="Chemins synthétiques"><NumberInput value={nPaths} step={100} onChange={setNPaths} /></Field>
        <Button primary onClick={run} style={{ width: "100%", marginTop: 12 }}>▶ Générer</Button>
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Block Bootstrap sur les trades du dernier backtest. Seed 42 (reproductible). Config auto depuis le cache.</div>
      </Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!res && <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance un backtest, puis génère des chemins synthétiques par block-bootstrap.</div></Panel>}
        {res && res.error && <Panel><div style={{ padding: 20, color: T.yellow }}>{res.error}</div></Panel>}
        {res && !res.error && (
          <>
            <Panel title="Statistiques" right={<SimBadge />}>
              <MetricGrid min={130}>
                <MetricCard label="Taille de bloc" value={res.blockSize} />
                <MetricCard label="Chemins" value={res.curves.length} />
                <MetricCard label="Final P05" value={fmtUsd(res.p05)} color={T.red} />
                <MetricCard label="Final P50" value={fmtUsd(res.p50)} />
                <MetricCard label="Final P95" value={fmtUsd(res.p95)} color={T.green} />
              </MetricGrid>
            </Panel>
            <Panel title="Chemins synthétiques (block-bootstrap)"><MCEnvelope curves={res.curves} initial={res.initial} height={240} /></Panel>
          </>
        )}
      </div>
    </div>
  );
}

export function FeatureMiningPage() {
  const { bars, ctx } = usePipeline();
  const [horizon, setHorizon] = useState(5);
  const res = useMemo(() => runFeatureMining(bars, ctx, { horizon }), [bars, ctx, horizon]);
  const columns = [
    { key: "name", label: "Feature", render: (r) => r.name },
    { key: "ic", label: "IC (Spearman)", align: "right", render: (r) => fmt(r.ic, 4), color: (r) => Math.abs(r.ic) > 0.05 ? (r.ic > 0 ? T.green : T.red) : T.textDim },
    { key: "bar", label: "Force", render: (r) => (
      <div style={{ width: 120, height: 8, background: T.bg0, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.min(100, Math.abs(r.ic) * 400)}%`, height: "100%", background: r.ic > 0 ? T.green : T.red }} /></div>
    ) },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Feature Mining — Information Coefficient" right={<div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}><SimBadge /><Field label="Horizon (barres)"><NumberInput value={horizon} onChange={setHorizon} /></Field></div>}>
        <div style={{ fontSize: 11, color: T.textDim }}>Corrélation de rang (Spearman) entre chaque indicateur et le rendement futur à {horizon} barres. |IC| &gt; 0.05 = signal exploitable.</div>
      </Panel>
      <Panel title="Classement des features"><DataTable columns={columns} rows={res.features} maxHeight={440} /></Panel>
    </div>
  );
}

export function SymbolicGPPage() {
  const { bars, ctx } = usePipeline();
  const [res, setRes] = useState(null);
  const run = useCallback(() => setRes(runSymbolicGP(bars, ctx, { generations: 10, popSize: 30 })), [bars, ctx]);
  const columns = [
    { key: "expr", label: "Règle (expression)", render: (r) => <span style={{ fontFamily: T.mono }}>{r.expr}</span> },
    { key: "fit", label: "Fitness (accuracy)", align: "right", render: (r) => fmtPct(r.fit * 100), color: (r) => r.fit > 0.55 ? T.green : T.yellow },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Symbolic GP — recherche génétique de règles" right={<div style={{ display: "flex", gap: 8 }}><SimBadge /><Button primary onClick={run}>▶ Évoluer</Button></div>}>
        <div style={{ fontSize: 11, color: T.textDim }}>Algorithme génétique : population de règles (feature op seuil), fitness = accuracy de prédiction du signe du rendement futur.</div>
        {res && <div style={{ marginTop: 12, fontSize: 14 }}>Meilleure règle : <b style={{ color: T.orange, fontFamily: T.mono }}>{res.best.expr}</b> — fitness {fmtPct(res.best.fitness * 100)}</div>}
      </Panel>
      {res && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Panel title="Convergence"><LineChart series={[{ data: res.history.map((h) => h.best * 100), color: T.orange }, { data: res.history.map((h) => h.mean * 100), color: T.blue, width: 1 }]} height={180} /></Panel>
          <Panel title="Population finale"><DataTable columns={columns} rows={res.population} maxHeight={200} /></Panel>
        </div>
      )}
    </div>
  );
}

export function TailRiskPage() {
  const { pipeline, bars } = usePipeline();
  const bt = pipeline.lastBacktest;
  const pnls = bt ? bt.res.trades.map((t) => t.pnl) : (() => { const r = []; for (let i = 1; i < bars.length; i++) r.push((bars[i].c - bars[i - 1].c) * 50); return r; })();
  const vc = useMemo(() => varCvar(pnls, 0.05), [pnls]);
  const vc99 = useMemo(() => varCvar(pnls, 0.01), [pnls]);
  if (!vc) return <Panel><div style={{ padding: 20, color: T.textDim }}>Pas assez de données.</div></Panel>;
  return (
    <Panel title="Tail Risk" right={<div style={{ display: "flex", gap: 8 }}><SimBadge /><span style={{ fontSize: 11, color: T.textDim }}>{bt ? "trades du backtest" : "rendements marché"}</span></div>}>
      <MetricGrid min={150}>
        <MetricCard label="VaR 95%" value={fmtUsd(vc.histVar)} color={T.red} />
        <MetricCard label="CVaR 95%" value={fmtUsd(vc.histCvar)} color={T.red} />
        <MetricCard label="VaR 99%" value={fmtUsd(vc99.histVar)} color={T.red} />
        <MetricCard label="CVaR 99%" value={fmtUsd(vc99.histCvar)} color={T.red} />
        <MetricCard label="Skewness" value={fmt(vc.skew)} color={vc.skew >= 0 ? T.green : T.red} />
        <MetricCard label="Kurtosis excès" value={fmt(vc.kurt)} color={vc.kurt > 1 ? T.red : T.text} hint="> 0 = queues épaisses" />
        <MetricCard label="VaR Cornish-Fisher" value={fmtUsd(vc.cfVar)} hint="Ajusté moments d'ordre 3-4" />
      </MetricGrid>
    </Panel>
  );
}

export function CorrelationsPage() {
  const { seed } = usePipeline();
  const data = useMemo(() => { const basket = generateBasket(800, seed); return basketCorrelation(basket); }, [seed]);
  return (
    <Panel title="Corrélations (panier synthétique multi-marché)" right={<SimBadge />}>
      <div style={{ overflowX: "auto" }}><CorrelationMatrix matrix={data.matrix} labels={data.labels} /></div>
      <div style={{ marginTop: 10, fontSize: 10.5, color: T.textFaint }}>9 actifs synthétiques générés par facteurs communs. Matrice de corrélation des rendements. Données SIMULÉES.</div>
    </Panel>
  );
}

export function RegimeClockPage() {
  const { bars } = usePipeline();
  const returns = useMemo(() => { const r = []; for (let i = 1; i < bars.length; i++) r.push(Math.log(bars[i].c / bars[i - 1].c)); return r; }, [bars]);
  const h = useMemo(() => hmmRegimes(returns), [returns]);
  if (!h) return <Panel><div style={{ padding: 20, color: T.textDim }}>Pas assez de données.</div></Panel>;
  const cur = h.states[h.states.length - 1];
  const total = h.counts.reduce((a, b) => a + b, 0);
  const colors = [T.green, T.yellow, T.red];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <Panel title="Régime actuel" right={<SimBadge />}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 16 }}>
          <div style={{ width: 130, height: 130, borderRadius: "50%", border: `8px solid ${colors[cur]}`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: colors[cur] }}>{h.labels[cur]}</span>
            <span style={{ fontSize: 10, color: T.textDim }}>régime détecté</span>
          </div>
        </div>
      </Panel>
      <Panel title="Distribution des régimes">
        <MetricGrid min={150}>
          {h.labels.map((lab, i) => <MetricCard key={lab} label={lab} value={fmtPct((h.counts[i] / total) * 100)} sub={`vol σ≈${fmt(h.sigma[i], 5)}`} color={colors[i]} />)}
        </MetricGrid>
        <div style={{ marginTop: 14 }}><LineChart series={[{ data: h.states, color: T.orange, width: 1 }]} height={140} /></div>
      </Panel>
    </div>
  );
}

export function MicrostructureLivePage() {
  const { bars, symbol, CONTRACTS } = usePipeline();
  const [tick, setTick] = useState(0);
  const ob = useMemo(() => bars.length ? generateOrderBook(bars[bars.length - 1].c, CONTRACTS[symbol].tick, 12, bars.length + tick) : null, [bars, symbol, CONTRACTS, tick]);
  const vp = useMemo(() => computeVPIN(bars, { buckets: 200, window: 50, method: "bvc", cdfWindow: 250 }), [bars]);
  if (!ob) return null;
  const totalBid = ob.bids.reduce((s, b) => s + b.size, 0), totalAsk = ob.asks.reduce((s, a) => s + a.size, 0);
  const imbalance = ((totalBid - totalAsk) / (totalBid + totalAsk)) * 100;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14, alignItems: "start" }}>
      <Panel title="Microstructure Live (order book synthétique)" right={<div style={{ display: "flex", gap: 8 }}><SimBadge /><Button onClick={() => setTick((t) => t + 1)}>↻ Rafraîchir</Button></div>}>
        <div style={{ fontFamily: T.mono, fontSize: 12 }}>
          {ob.asks.slice().reverse().map((a, i) => {
            const w = (a.size / Math.max(totalAsk, totalBid)) * 100;
            return <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", position: "relative" }}><div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${w * 3}%`, background: `${T.red}18` }} /><span style={{ color: T.red, zIndex: 1 }}>{a.price.toFixed(2)}</span><span style={{ color: T.textDim, zIndex: 1 }}>{a.size}</span></div>;
          })}
          <div style={{ padding: "6px 8px", textAlign: "center", color: T.orange, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>mid {ob.mid.toFixed(2)}</div>
          {ob.bids.map((b, i) => {
            const w = (b.size / Math.max(totalAsk, totalBid)) * 100;
            return <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", position: "relative" }}><div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${w * 3}%`, background: `${T.green}18` }} /><span style={{ color: T.green, zIndex: 1 }}>{b.price.toFixed(2)}</span><span style={{ color: T.textDim, zIndex: 1 }}>{b.size}</span></div>;
          })}
        </div>
      </Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel title="Déséquilibre du carnet" right={<SimBadge />}>
          <MetricGrid min={110}>
            <MetricCard label="Bid total" value={totalBid} color={T.green} />
            <MetricCard label="Ask total" value={totalAsk} color={T.red} />
            <MetricCard label="Imbalance" value={fmtPct(imbalance)} color={imbalance >= 0 ? T.green : T.red} />
          </MetricGrid>
        </Panel>
        <Panel title="Toxicité du flux — VPIN">
          <MetricGrid min={110}>
            <MetricCard label="VPIN" value={fmt(vp.lastVPIN, 3)} color={vp.lastCDF >= 0.9 ? T.red : vp.lastCDF >= 0.7 ? T.yellow : T.green} />
            <MetricCard label="CDF" value={Number.isNaN(vp.lastCDF) ? "—" : `${(vp.lastCDF * 100).toFixed(0)}%`} color={vp.tox.color} />
            <MetricCard label="État" value={vp.tox.label} color={vp.tox.color} />
          </MetricGrid>
          <div style={{ marginTop: 6, fontSize: 10, color: T.textFaint, lineHeight: 1.5 }}>Signal réel (barres du marché) : au-delà du 90ᵉ percentile, le flux est toxique — risque de retournement violent / configuration d'avant-krach.</div>
        </Panel>
      </div>
    </div>
  );
}

export function MacroMapPage() {
  const { seed } = usePipeline();
  const basket = useMemo(() => generateBasket(400, seed), [seed]);
  const perf = basket.assets.map((a) => {
    const b = basket.series[a.sym];
    const ret = ((b[b.length - 1].c - b[0].c) / b[0].c) * 100;
    return { ...a, ret };
  });
  const maxAbs = Math.max(...perf.map((p) => Math.abs(p.ret)), 1);
  return (
    <Panel title="Macro Map — heatmap de performance (panier synthétique)" right={<SimBadge />}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {perf.map((p) => {
          const intensity = Math.min(1, Math.abs(p.ret) / maxAbs);
          const bg = p.ret >= 0 ? `rgba(0,229,160,${0.1 + intensity * 0.5})` : `rgba(255,77,106,${0.1 + intensity * 0.5})`;
          return (
            <div key={p.sym} style={{ background: bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{p.sym}</div>
              <div style={{ fontSize: 10, color: T.textDim }}>{p.name}</div>
              <div style={{ fontSize: 20, fontFamily: T.mono, color: p.ret >= 0 ? T.green : T.red, marginTop: 4 }}>{p.ret >= 0 ? "+" : ""}{fmt(p.ret, 1)}%</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 10.5, color: T.textFaint }}>Performance sur la période du panier synthétique multi-marché. Données SIMULÉES.</div>
    </Panel>
  );
}

export function SeasonalPage() {
  const { bars } = usePipeline();
  const byHour = useMemo(() => {
    const acc = Array(24).fill(null).map(() => ({ sum: 0, n: 0 }));
    for (let i = 1; i < bars.length; i++) {
      const h = new Date(bars[i].t).getUTCHours();
      acc[h].sum += (bars[i].c - bars[i - 1].c) / bars[i - 1].c;
      acc[h].n++;
    }
    return acc.map((a) => a.n ? (a.sum / a.n) * 10000 : 0);
  }, [bars]);
  const max = Math.max(...byHour.map(Math.abs), 1);
  return (
    <Panel title="Seasonal — rendement moyen par heure (UTC)" right={<div style={{ display: "flex", gap: 8 }}><SimBadge /></div>}>
      <div style={{ background: T.yellow + "15", border: `1px solid ${T.yellow}44`, borderRadius: 6, padding: 10, fontSize: 11, color: T.text, marginBottom: 14 }}>
        ⚠ Pattern calculé sur le marché synthétique interne — statistiquement significatif seulement avec un vrai historique long. À titre méthodologique.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 3, height: 180 }}>
        {byHour.map((v, h) => (
          <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
            <div style={{ height: "50%", display: "flex", alignItems: "flex-end" }}>{v > 0 && <div style={{ width: "100%", height: `${(v / max) * 100}%`, background: T.green, borderRadius: "2px 2px 0 0" }} />}</div>
            <div style={{ height: "50%", display: "flex", alignItems: "flex-start" }}>{v < 0 && <div style={{ width: "100%", height: `${(-v / max) * 100}%`, background: T.red, borderRadius: "0 0 2px 2px" }} />}</div>
            <div style={{ fontSize: 8, color: T.textFaint, textAlign: "center" }}>{h}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: T.textFaint, marginTop: 4, textAlign: "center" }}>Rendement moyen en points de base (bps) par heure de la journée.</div>
    </Panel>
  );
}
