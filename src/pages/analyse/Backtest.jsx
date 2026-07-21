// Backtest étendu — 20+ métriques, config complète, courbe équité, distribution PnL.
import { useState, useMemo, useCallback } from "react";
import { usePipeline, usePersistentState } from "../../state/PipelineContext.jsx";
import { runBacktestExt } from "../../engine/backtestExtended.js";
import { advancedMetrics } from "../../engine/backtestMetrics.js";
import { logBacktest } from "../../engine/strategyStore.js";
import { tradesToCSV, downloadCSV } from "../../engine/exportUtils.js";
import { EquityChart } from "../../components/charts/EquityChart.jsx";
import { Histogram } from "../../components/charts/Histogram.jsx";
import { Panel, MetricCard, MetricGrid, Button, Field, Select, NumberInput, SimBadge, fmt, fmtInt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { StrategyPicker } from "../../components/shared/StrategyPicker.jsx";
import { NextStepBar } from "../../components/shared/NextStepBar.jsx";
import { T } from "../../components/shared/theme.js";

export function BacktestPage() {
  const { bars, ctx, library, symbol, tf, dataMode, pipeline, setPipe, addJournal } = usePipeline();
  const [stratId, setStratId] = useState(pipeline.selectedStrategyId || 3);
  const sp = pipeline.strategyParams || {};
  const [cfg, setCfg] = useState({
    lotMode: "RISK_PERCENT", riskPct: 1, fixedLots: 1, maxPositions: 1, slippagePts: 1,
    capital: 100000, warmup: 50,
    direction: sp.direction || "both", slAtr: sp.slAtr ?? 2, tpAtr: sp.tpAtr ?? 0, beAtr: sp.beAtr ?? 0,
  });
  const [result, setResult] = usePersistentState("backtest:result", null);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const run = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    if (!strat) return;
    const params = { contract: symbol, capital: cfg.capital, direction: cfg.direction, slAtr: cfg.slAtr, tpAtr: cfg.tpAtr, beAtr: cfg.beAtr, contracts: cfg.fixedLots };
    const res = runBacktestExt(bars, ctx, strat.eval, params);
    const adv = advancedMetrics(res, bars, cfg.capital);
    const scoreParts = [
      Math.min(1, (res.sharpe || 0) / 2.5), Math.min(1, res.winRate / 70),
      Math.min(1, (Number.isFinite(res.profitFactor) ? res.profitFactor : 3) / 2.5),
      Math.max(0, 1 - res.maxDD / 0.3), Math.min(1, Math.max(0, res.expectancyR) / 0.5),
    ];
    const score = (scoreParts.reduce((a, b) => a + b, 0) / scoreParts.length) * 100;
    const full = { strat, params, res, adv, score };
    setResult(full);
    setPipe({ lastBacktest: full, selectedStrategyId: stratId, strategyParams: params });
    addJournal({ type: "backtest", strat: strat.name, pnl: res.totalPnL, sharpe: res.sharpe, trades: res.nTrades });
    // Journal durable (survit au rechargement) — cohérence inter-outils
    logBacktest({ tool: "Backtest", name: strat.name, strategyId: strat.id, symbol, tf, dataMode, params, metrics: { ...res, score } })
      .catch(() => { /* IDB indisponible → run non journalisé, sans blocage */ });
  }, [library, stratId, symbol, tf, dataMode, cfg, bars, ctx, setPipe, addJournal]);

  const cards = useMemo(() => {
    if (!result) return [];
    const { res, adv, score } = result;
    const g = T.green, r = T.red, o = T.orange;
    const sign = (v) => (v >= 0 ? g : r);
    return [
      { label: "Score", value: fmt(score, 0), color: score >= 60 ? g : score >= 40 ? T.yellow : r },
      { label: "Trades", value: fmtInt(res.nTrades) },
      { label: "Win Rate", value: fmtPct(res.winRate), color: res.winRate >= 50 ? g : r },
      { label: "Profit Factor", value: fmt(res.profitFactor), color: res.profitFactor >= 1.5 ? g : r },
      { label: "Expectancy R", value: fmt(res.expectancyR), color: sign(res.expectancyR) },
      { label: "EV / Trade", value: fmtUsd(res.evTrade), color: sign(res.evTrade) },
      { label: "Max DD", value: fmtPct(res.maxDD * 100), color: res.maxDD < 0.15 ? g : r },
      { label: "Total PnL %", value: fmtPct(res.totalPnLPct), color: sign(res.totalPnLPct) },
      { label: "Sharpe", value: fmt(res.sharpe), color: res.sharpe >= 1 ? g : r },
      { label: "Sortino", value: fmt(res.sortino), color: res.sortino >= 1.5 ? g : r },
      { label: "Calmar", value: fmt(res.calmar), color: res.calmar >= 2 ? g : r },
      { label: "Capital Final", value: fmtUsd(res.finalEquity), color: sign(res.finalEquity - result.params.capital) },
      { label: "Kelly Half %", value: fmtPct(res.kellyHalf), color: o },
      { label: "CAGR %", value: fmtPct(res.cagr), color: sign(res.cagr) },
      { label: "MinTRL", value: Number.isFinite(adv.minTrl) ? fmtInt(adv.minTrl) : "∞", hint: "Minimum Track Record Length (Bailey·LdP)", color: adv.minTrl < 200 ? g : T.yellow },
      { label: "PSR", value: fmtPct(adv.psr * 100), hint: "Probabilistic Sharpe Ratio", color: adv.psr > 0.9 ? g : T.yellow },
      { label: "Beta vs Asset", value: fmt(adv.beta) },
      { label: "Quality LZ", value: fmt(adv.qualityLZ), hint: "Complexité Lempel-Ziv", color: o },
      { label: "Kyle's λ", value: fmt(adv.kylesLambda), hint: "Impact prix / volume (×1e6)" },
      { label: "Adverse Sel %", value: fmtPct(adv.adverseSel), color: adv.adverseSel < 50 ? g : r },
    ];
  }, [result]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ gridColumn: "1 / -1" }}><NextStepBar current="backtest" /></div>
      {/* Config */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Stratégie">
          <StrategyPicker value={stratId} onChange={setStratId} compact />
        </Panel>
        <Panel title="Configuration">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Lot Mode"><Select value={cfg.lotMode} onChange={(v) => set("lotMode", v)} options={["RISK_PERCENT", "FIXED_LOTS"]} /></Field>
            <Field label="Risk %"><NumberInput value={cfg.riskPct} step={0.5} onChange={(v) => set("riskPct", v)} /></Field>
            <Field label="Fixed Lots"><NumberInput value={cfg.fixedLots} onChange={(v) => set("fixedLots", v)} /></Field>
            <Field label="Max Positions"><NumberInput value={cfg.maxPositions} onChange={(v) => set("maxPositions", v)} /></Field>
            <Field label="Capital Initial"><NumberInput value={cfg.capital} step={10000} onChange={(v) => set("capital", v)} /></Field>
            <Field label="Warmup Bars"><NumberInput value={cfg.warmup} onChange={(v) => set("warmup", v)} /></Field>
            <Field label="Direction"><Select value={cfg.direction} onChange={(v) => set("direction", v)} options={[{ value: "both", label: "LONG_AND_SHORT" }, { value: "long", label: "LONG_ONLY" }, { value: "short", label: "SHORT_ONLY" }]} /></Field>
            <Field label="Slippage Pts"><NumberInput value={cfg.slippagePts} onChange={(v) => set("slippagePts", v)} /></Field>
            <Field label="SL (× ATR)"><NumberInput value={cfg.slAtr} step={0.5} onChange={(v) => set("slAtr", v)} /></Field>
            <Field label="TP (× ATR)"><NumberInput value={cfg.tpAtr} step={0.5} onChange={(v) => set("tpAtr", v)} /></Field>
            <Field label="Break-Even (× ATR)"><NumberInput value={cfg.beAtr} step={0.5} onChange={(v) => set("beAtr", v)} /></Field>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Button primary onClick={run} style={{ flex: 1 }}>▶ Lancer le backtest</Button>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: T.textFaint }}>
            Source de données : <b style={{ color: T.yellow }}>LSE synthétique</b> (générée en interne). L'auto-download Databento sera branché via une clé API dans un module dédié.
          </div>
        </Panel>
      </div>

      {/* Résultats */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!result && (
          <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Configure et lance un backtest pour afficher les 20 métriques, la courbe d'équité et la distribution des PnL.</div></Panel>
        )}
        {result && (
          <>
            <Panel title={`Métriques · ${result.strat.name}`} right={<SimBadge />}>
              <MetricGrid min={120}>
                {cards.map((c) => <MetricCard key={c.label} {...c} />)}
              </MetricGrid>
            </Panel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Panel title="Courbe d'équité" right={<span style={{ fontSize: 11, color: result.res.totalPnL >= 0 ? T.green : T.red, fontFamily: T.mono }}>{fmtUsd(result.res.finalEquity)}</span>}>
                <EquityChart data={result.res.equityCurve} initial={result.params.capital} />
              </Panel>
              <Panel title="Distribution des PnL par trade">
                <Histogram data={result.res.trades.map((t) => t.pnl)} bins={30} color={T.green} />
              </Panel>
            </div>
            <Panel title="Trades" right={<Button onClick={() => downloadCSV(tradesToCSV(result.res.trades), `backtest_${result.strat.id}.csv`)}>Export CSV</Button>}>
              <div style={{ maxHeight: 240, overflow: "auto", fontFamily: T.mono, fontSize: 11 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["#", "Entrée", "Sortie", "Sens", "Barres", "Raison", "PnL"].map((h) => <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: T.textDim, position: "sticky", top: 0, background: T.panel, fontSize: 10 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {result.res.trades.slice(0, 200).map((t, i) => (
                      <tr key={i}>
                        <td style={{ padding: "3px 8px", color: T.textFaint }}>{i + 1}</td>
                        <td style={{ padding: "3px 8px" }}>{t.entry.toFixed(2)}</td>
                        <td style={{ padding: "3px 8px" }}>{t.exit.toFixed(2)}</td>
                        <td style={{ padding: "3px 8px", color: t.side === 1 ? T.green : T.red }}>{t.side === 1 ? "LONG" : "SHORT"}</td>
                        <td style={{ padding: "3px 8px", color: T.textDim }}>{t.bars}</td>
                        <td style={{ padding: "3px 8px", color: T.textDim }}>{t.reason}</td>
                        <td style={{ padding: "3px 8px", color: t.pnl >= 0 ? T.green : T.red }}>{fmtUsd(t.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
