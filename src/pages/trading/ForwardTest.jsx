// Forward Test — « démo live » en PAPER TRADING sur données RÉELLES (near-real-time).
// Fait tourner une stratégie sur le flux réel (Binance/Yahoo) et simule un compte démo qui se met
// à jour à chaque nouvelle bougie. AUCUN ordre réel, aucun identifiant broker — 100 % simulation.
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { usePipeline, usePersistentState } from "../../state/PipelineContext.jsx";
import { evalForwardTest } from "../../engine/forwardTest.ts";
import { logBacktest } from "../../engine/strategyStore.ts";
import { EquityChart } from "../../components/charts/EquityChart.jsx";
import { Panel, Button, Badge, MetricCard, MetricGrid, DataTable, Field, NumberInput, fmt, fmtInt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { StrategyPicker } from "../../components/shared/StrategyPicker.jsx";
import { T } from "../../components/shared/theme.js";

const stateColor = (s) => (s === "LONG" ? T.green : s === "SHORT" ? T.red : T.textFaint);

export function ForwardTestPage() {
  const { bars, ctx, library, symbol, tf, assetKey, dataMode, setDataMode, usingReal, reloadData, dataMeta, dataLoading, saveDemoSession } = usePipeline();
  const session = useRef(null); // session de démo accumulée dans le dossier actif
  const [stratId, setStratId] = usePersistentState("fwd:stratId", 3);
  const [slAtr, setSlAtr] = usePersistentState("fwd:sl", 2);
  const [tpAtr, setTpAtr] = usePersistentState("fwd:tp", 3);
  const [beAtr, setBeAtr] = usePersistentState("fwd:be", 0);
  const [interval, setIntervalSec] = usePersistentState("fwd:int", 15);

  const [running, setRunning] = useState(false);
  const [startTs, setStartTs] = useState(null);
  const [startEquity, setStartEquity] = useState(100000);
  const [lastPoll, setLastPoll] = useState(null);
  const [ticks, setTicks] = useState(0);
  const [savedMsg, setSavedMsg] = useState("");
  const timer = useRef(null);

  const strat = useMemo(() => library.find((s) => s.id === stratId), [library, stratId]);
  const params = useMemo(() => ({ contract: symbol, capital: 100000, direction: "both", slAtr, tpAtr, beAtr, contracts: 1 }), [symbol, slAtr, tpAtr, beAtr]);

  // Résultat live recalculé dès que les barres réelles changent (nouvelle bougie récupérée).
  const fwd = useMemo(() => {
    if (!strat || !bars || bars.length < 120 || startTs == null) return null;
    return evalForwardTest(bars, ctx, strat, params, startTs);
  }, [strat, bars, ctx, params, startTs]);

  // Boucle de polling : rafraîchit le flux réel toutes les N secondes.
  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(async () => {
      await reloadData();
      setLastPoll(Date.now());
      setTicks((t) => t + 1);
    }, Math.max(5, interval) * 1000);
    return () => clearInterval(timer.current);
  }, [running, interval, reloadData]);

  const start = useCallback(() => {
    setStartTs(bars[bars.length - 1]?.t || Date.now());
    setStartEquity(100000);
    setLastPoll(Date.now()); setTicks(0);
    session.current = { startedAt: Date.now(), symbol, tf, dataMode, snapshots: [], trades: [], id: null };
    setRunning(true);
  }, [bars, symbol, tf, dataMode]);

  // Accumule la data de démo (bougies + trades papier) dans le dossier actif, à chaque tick.
  useEffect(() => {
    if (!running || !session.current || !fwd) return;
    session.current.snapshots.push({ t: Date.now(), price: fwd.lastPrice, equity: fwd.equity, sessionPnL: fwd.sessionPnL, state: fwd.liveState });
    session.current.trades = fwd.sessionTrades || [];
    session.current.finalMetrics = { sessionPnL: fwd.sessionPnL, equity: fwd.equity, nTrades: (fwd.sessionTrades || []).length };
    saveDemoSession({ ...session.current }, { name: strat?.name, strategyId: stratId, params }).then((id) => { if (id && session.current) session.current.id = id; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticks]);

  const stop = useCallback(async () => {
    setRunning(false);
    clearInterval(timer.current);
    if (fwd) {
      await logBacktest({ tool: "Forward Test", name: strat?.name, strategyId: stratId, symbol, tf, dataMode, params, metrics: fwd.res }).catch(() => {});
      setSavedMsg("✓ Session journalisée");
      setTimeout(() => setSavedMsg(""), 2500);
    }
    // Finalise la session de démo dans le dossier actif (data complète conservée).
    if (session.current) {
      session.current.endedAt = Date.now();
      if (fwd) session.current.finalMetrics = { sessionPnL: fwd.sessionPnL, equity: fwd.equity, nTrades: (fwd.sessionTrades || []).length };
      await saveDemoSession({ ...session.current }, { name: strat?.name, strategyId: stratId, params }).catch(() => {});
      session.current = null;
    }
  }, [fwd, strat, stratId, symbol, tf, dataMode, params, saveDemoSession]);

  // Garde-fou : le forward-test n'a de sens que sur données réelles.
  if (!usingReal) {
    return (
      <Panel title="Forward Test — démo live (paper trading, données réelles)">
        <div style={{ padding: 20, lineHeight: 1.6 }}>
          <div style={{ fontSize: 14, color: T.text, marginBottom: 10 }}>⚠️ Ce module a besoin de <b style={{ color: T.orange }}>données réelles</b> (le mode Synthétique est actif).</div>
          <div style={{ fontSize: 12.5, color: T.textDim, marginBottom: 16 }}>Bascule sur « Réel » (barre du haut) et choisis un actif — <b>la crypto (BTC/ETH via Binance)</b> est la plus proche du temps réel et sans clé API. Le forward-test fera tourner ta stratégie sur les nouvelles bougies au fil de l'eau, en simulant un compte démo. Aucun ordre réel n'est passé.</div>
          <Button primary onClick={() => setDataMode("live")}>Passer en données réelles</Button>
        </div>
      </Panel>
    );
  }

  const sessTrades = fwd?.sessionTrades || [];
  const sessWR = sessTrades.length ? (fwd.sessionWins / sessTrades.length) * 100 : 0;
  const cols = [
    { key: "t", label: "Sortie", render: (r) => new Date(r.exitTime).toLocaleString("fr-FR") },
    { key: "side", label: "Sens", render: (r) => <Badge color={r.side === 1 ? T.green : T.red}>{r.side === 1 ? "LONG" : "SHORT"}</Badge> },
    { key: "entry", label: "Entrée", align: "right", render: (r) => fmt(r.entry, 2) },
    { key: "exit", label: "Sortie", align: "right", render: (r) => fmt(r.exit, 2) },
    { key: "reason", label: "Motif", render: (r) => r.reason },
    { key: "pnl", label: "PnL", align: "right", render: (r) => fmtUsd(r.pnl), color: (r) => r.pnl >= 0 ? T.green : T.red },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Stratégie">
          <StrategyPicker value={stratId} onChange={setStratId} compact />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <Field label="SL (×ATR)"><NumberInput value={slAtr} onChange={setSlAtr} min={0} step={0.5} /></Field>
            <Field label="TP (×ATR)"><NumberInput value={tpAtr} onChange={setTpAtr} min={0} step={0.5} /></Field>
            <Field label="BE (×ATR)"><NumberInput value={beAtr} onChange={setBeAtr} min={0} step={0.5} /></Field>
            <Field label="Poll (s)"><NumberInput value={interval} onChange={setIntervalSec} min={5} step={5} /></Field>
          </div>
          <div style={{ marginTop: 12 }}>
            {!running
              ? <Button primary onClick={start}>▶ Démarrer la démo</Button>
              : <Button onClick={stop}>⏹ Arrêter & journaliser</Button>}
          </div>
          {savedMsg && <div style={{ marginTop: 8, fontSize: 11, color: T.green }}>{savedMsg}</div>}
          <div style={{ marginTop: 10, fontSize: 10.5, color: T.textFaint, lineHeight: 1.5 }}>
            Paper trading sur {dataMeta?.symbol?.label || assetKey}. Aucun ordre réel. Rafraîchit toutes les {interval}s {dataLoading && "· ⟳"}.
          </div>
        </Panel>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel title="Compte démo — live" right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge color={running ? T.green : T.textFaint}>{running ? "● EN COURS" : "○ ARRÊTÉ"}</Badge>
            {fwd && <Badge color={stateColor(fwd.liveState)}>Signal : {fwd.liveState}</Badge>}
          </div>
        }>
          {!fwd
            ? <div style={{ padding: 20, textAlign: "center", color: T.textDim, fontSize: 12 }}>Démarre la démo pour lancer le paper trading sur le flux réel.</div>
            : <>
              <MetricGrid min={120}>
                <MetricCard label="Prix actuel" value={fmt(fwd.lastPrice, 2)} color={T.orange} />
                <MetricCard label="Signal live" value={fwd.liveState} color={stateColor(fwd.liveState)} />
                <MetricCard label="P&L session" value={fmtUsd(fwd.sessionPnL)} color={fwd.sessionPnL >= 0 ? T.green : T.red} />
                <MetricCard label="Trades session" value={fmtInt(sessTrades.length)} sub={`${fmt(sessWR, 0)}% gagnants`} />
                <MetricCard label="Équité (totale)" value={fmtUsd(fwd.equity)} color={fwd.equity >= startEquity ? T.green : T.red} />
                <MetricCard label="Ticks" value={fmtInt(ticks)} sub={lastPoll ? `MàJ ${new Date(lastPoll).toLocaleTimeString("fr-FR")}` : ""} />
              </MetricGrid>
              <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>« Session » = trades clôturés depuis le démarrage. L'équité totale inclut tout l'historique réel. Simulation — pas un conseil, pas d'ordre réel.</div>
            </>}
        </Panel>

        {fwd && (
          <Panel title="Courbe d'équité (historique réel + live)" right={<span style={{ fontSize: 11, color: fwd.equity >= startEquity ? T.green : T.red, fontFamily: T.mono }}>{fmtUsd(fwd.equity)}</span>}>
            <EquityChart data={fwd.res.equityCurve} initial={100000} />
          </Panel>
        )}

        {sessTrades.length > 0 && (
          <Panel title={`Paper trades de la session (${sessTrades.length})`}>
            <DataTable columns={cols} rows={[...sessTrades].reverse()} maxHeight={280} />
          </Panel>
        )}
      </div>
    </div>
  );
}
