// Optim Génétique — recherche évolutionnaire de variantes (« à l'infini ») sur l'actif × TF courant.
// Évolue {stratégie, SL, TP, BE, direction} par générations. La meilleure variante est sauvegardable
// durablement (avec ses paramètres) et journalisée comme un backtest.
import { useState, useCallback, useRef } from "react";
import { usePipeline, usePersistentState } from "../../state/PipelineContext.jsx";
import { createGA } from "../../engine/geneticOptimizer.ts";
import { saveStrategy, logBacktest } from "../../engine/strategyStore.ts";
import { Panel, Button, Badge, MetricCard, MetricGrid, DataTable, ProgressBar, SimBadge, Field, NumberInput, fmt, fmtInt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { StrategyPicker } from "../../components/shared/StrategyPicker.jsx";
import { T } from "../../components/shared/theme.js";

const sleep = () => new Promise((r) => setTimeout(r, 0));

// Petite sparkline SVG de convergence (meilleur score par génération).
function Convergence({ history }) {
  if (history.length < 2) return null;
  const w = 520, h = 90, pad = 6;
  const max = Math.max(...history, 1), min = Math.min(...history, 0);
  const rng = max - min || 1;
  const pts = history.map((v, i) => {
    const x = pad + (i / (history.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / rng) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={T.orange} strokeWidth="2" />
      {history.map((v, i) => {
        const x = pad + (i / (history.length - 1)) * (w - 2 * pad);
        const y = h - pad - ((v - min) / rng) * (h - 2 * pad);
        return <circle key={i} cx={x} cy={y} r={i === history.length - 1 ? 3.5 : 1.8} fill={T.orange} />;
      })}
    </svg>
  );
}

export function GeneticOptimPage() {
  const { bars, ctx, library, symbol, tf, dataMode } = usePipeline();
  const [lockStrat, setLockStrat] = usePersistentState("ga:lock", false);
  const [stratId, setStratId] = usePersistentState("ga:stratId", 3);
  const [popSize, setPopSize] = usePersistentState("ga:pop", 40);
  const [generations, setGenerations] = usePersistentState("ga:gens", 20);
  const [mutation, setMutation] = usePersistentState("ga:mut", 0.3);
  const [seed, setSeed] = usePersistentState("ga:seed", 42);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [history, setHistory] = useState([]);
  const [result, setResult] = usePersistentState("ga:result", null);
  const [savedMsg, setSavedMsg] = useState("");
  const abort = useRef(false);

  const run = useCallback(async () => {
    if (!bars || bars.length < 120) return;
    setRunning(true); setHistory([]); setResult(null); abort.current = false;
    const ga = createGA({
      bars, ctx, library, symbol, capital: 100000,
      popSize: Math.max(10, popSize | 0), lockStratId: lockStrat ? stratId : null,
      seed: seed | 0, mutationRate: mutation,
    });
    const hist = [ga.best.score];
    setHistory([...hist]);
    for (let g = 0; g < generations; g++) {
      if (abort.current) break;
      const { gen, best, evaluated } = ga.step();
      hist.push(best.score);
      setHistory([...hist]);
      setProgress({ pct: ((g + 1) / generations) * 100, label: `Génération ${gen}/${generations} · ${fmtInt(evaluated)} variantes évaluées · meilleur score ${fmt(best.score, 0)}` });
      await sleep(); // rend la main à l'UI
    }
    const best = ga.best;
    const leaderboard = ga.population.filter((p) => p.score > 0).slice(0, 20);
    setResult({ best, leaderboard, evaluated: ga.evaluated, generations, popSize, symbol, tf, spaceSize: ga.spaceSize });
    setProgress(null); setRunning(false);
  }, [bars, ctx, library, symbol, tf, popSize, generations, mutation, seed, lockStrat, stratId, setResult]);

  const stop = () => { abort.current = true; };

  const saveBest = useCallback(async () => {
    if (!result?.best) return;
    const b = result.best;
    const params = { contract: symbol, capital: 100000, direction: b.direction, slAtr: b.slAtr, tpAtr: b.tpAtr, beAtr: b.beAtr, contracts: 1 };
    await saveStrategy({ name: b.name, strategyId: b.stratId, symbol, tf, dataMode, params, metrics: b.res, note: "Optim génétique" });
    await logBacktest({ tool: "Optim Génétique", name: b.name, strategyId: b.stratId, symbol, tf, dataMode, params, metrics: b.res }).catch(() => {});
    setSavedMsg("✓ Meilleure variante sauvegardée");
    setTimeout(() => setSavedMsg(""), 2500);
  }, [result, symbol, tf, dataMode]);

  const cols = [
    { key: "rank", label: "#", render: (_r, i) => i + 1 },
    { key: "strat", label: "Stratégie", render: (r) => <span>#{r.stratId} {r.name}</span> },
    { key: "dir", label: "Dir", render: (r) => <Badge color={r.direction === "long" ? T.green : r.direction === "short" ? T.red : T.blue}>{r.direction}</Badge> },
    { key: "sltpbe", label: "SL/TP/BE", render: (r) => `${r.slAtr}/${r.tpAtr}/${r.beAtr}` },
    { key: "score", label: "Score", align: "right", render: (r) => fmt(r.score, 0), color: (r) => r.score >= 60 ? T.green : r.score >= 40 ? T.yellow : T.red },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => fmt(r.res?.sharpe) },
    { key: "pf", label: "PF", align: "right", render: (r) => fmt(r.res?.profitFactor) },
    { key: "dd", label: "MaxDD", align: "right", render: (r) => fmtPct((r.res?.maxDD || 0) * 100), color: (r) => (r.res?.maxDD || 0) < 0.15 ? T.green : T.red },
    { key: "tr", label: "Trades", align: "right", render: (r) => fmtInt(r.res?.nTrades || 0) },
  ];

  const b = result?.best;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Espace de recherche">
          <div style={{ fontSize: 11.5, color: T.textDim, marginBottom: 10, lineHeight: 1.5 }}>
            Évolution génétique de <b style={{ color: T.orange }}>{'{'}stratégie, SL, TP, BE, direction{'}'}</b> sur l'actif × TF courant. Espace continu — bien au-delà de la grille fixe.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12 }}>
            <input type="checkbox" checked={lockStrat} onChange={(e) => setLockStrat(e.target.checked)} id="lockstrat" />
            <label htmlFor="lockstrat" style={{ color: T.text }}>Verrouiller sur une stratégie</label>
          </div>
          {lockStrat && <StrategyPicker value={stratId} onChange={setStratId} compact />}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <Field label="Population"><NumberInput value={popSize} onChange={setPopSize} min={10} max={200} step={5} /></Field>
            <Field label="Générations"><NumberInput value={generations} onChange={setGenerations} min={3} max={100} step={1} /></Field>
            <Field label="Mutation"><NumberInput value={mutation} onChange={setMutation} min={0.05} max={0.9} step={0.05} /></Field>
            <Field label="Seed"><NumberInput value={seed} onChange={setSeed} min={1} step={1} /></Field>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            {!running
              ? <Button primary onClick={run}>🧬 Lancer l'évolution</Button>
              : <Button onClick={stop}>⏹ Arrêter</Button>}
          </div>
          <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Espace ≈ {fmtInt((lockStrat ? 1 : library.length) * 12 * 22 * 3)} combinaisons · exploré intelligemment.</div>
        </Panel>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel title="Convergence" right={<SimBadge />}>
          {progress && <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>{progress.label}</div><ProgressBar pct={progress.pct} /></div>}
          {history.length > 1
            ? <Convergence history={history} />
            : <div style={{ padding: 24, textAlign: "center", color: T.textDim, fontSize: 12 }}>Lance l'évolution pour voir le meilleur score progresser par génération.</div>}
        </Panel>

        {b && (
          <Panel title={`Meilleure variante · #${b.stratId} ${b.name}`} right={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {savedMsg && <span style={{ fontSize: 11, color: T.green }}>{savedMsg}</span>}
              <Button primary onClick={saveBest}>💾 Sauvegarder</Button>
            </div>
          }>
            <MetricGrid min={120}>
              <MetricCard label="Score" value={fmt(b.score, 0)} color={b.score >= 60 ? T.green : T.yellow} />
              <MetricCard label="SL/TP/BE" value={`${b.slAtr}/${b.tpAtr}/${b.beAtr}`} sub={b.direction} color={T.orange} />
              <MetricCard label="Sharpe" value={fmt(b.res?.sharpe)} color={(b.res?.sharpe || 0) >= 1 ? T.green : T.red} />
              <MetricCard label="Profit Factor" value={fmt(b.res?.profitFactor)} color={(b.res?.profitFactor || 0) >= 1.5 ? T.green : T.red} />
              <MetricCard label="Max DD" value={fmtPct((b.res?.maxDD || 0) * 100)} color={(b.res?.maxDD || 0) < 0.15 ? T.green : T.red} />
              <MetricCard label="Win Rate" value={fmtPct(b.res?.winRate)} />
              <MetricCard label="Trades" value={fmtInt(b.res?.nTrades || 0)} />
              <MetricCard label="PnL" value={fmtUsd(b.res?.totalPnL)} color={(b.res?.totalPnL || 0) >= 0 ? T.green : T.red} />
            </MetricGrid>
            <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>{fmtInt(result.evaluated)} variantes distinctes évaluées sur {result.generations} générations. ⚠️ Score in-sample — valide via Validator / CPCV avant décision.</div>
          </Panel>
        )}

        {result?.leaderboard?.length > 0 && (
          <Panel title={`Population finale (${result.leaderboard.length})`}>
            <DataTable columns={cols} rows={result.leaderboard} maxHeight={340} />
          </Panel>
        )}
      </div>
    </div>
  );
}
