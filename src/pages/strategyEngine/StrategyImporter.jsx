// Strategy Importer — importe une config JSON (Rule Builder / mode), la VALIDE
// strictement (échec explicite, jamais silencieux), la teste, et permet de la
// sauvegarder comme stratégie custom réutilisable dans tout le pipeline.
import { useState } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { compileRules } from "../../engine/ruleBuilder.ts";
import { validateRules, saveCustomDef } from "../../engine/customStrategies.js";
import { runBacktestExt } from "../../engine/backtestExtended.js";
import { Panel, Button, MetricCard, MetricGrid, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";

const SAMPLE = JSON.stringify({
  name: "EMA Cross + RSI filter",
  rules: {
    long: [{ left: "close", op: "crossUp", right: "ema20" }, { left: "rsi14", op: "gt", right: "const", rightConst: 50 }],
    short: [{ left: "close", op: "crossDn", right: "ema20" }, { left: "rsi14", op: "lt", right: "const", rightConst: 50 }],
  },
}, null, 2);

export function StrategyImporterPage() {
  const { bars, ctx, symbol, refreshLibrary, setPipe, navigate } = usePipeline();
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  const importAndTest = () => {
    setSaved(null);
    try {
      const parsed = JSON.parse(text);
      // Validation stricte AVANT compilation : une source/op inconnue lève une erreur
      // explicite au lieu de produire un « 0 trades » silencieux et trompeur.
      const rules = validateRules(parsed.rules);
      const evalFn = compileRules(rules);
      const res = runBacktestExt(bars, ctx, evalFn, { contract: symbol, capital: 100000, slAtr: 2, direction: "both" });
      setResult({ name: parsed.name || "Import", rules, res });
      setError(null);
    } catch (e) {
      setError(e.message);
      setResult(null);
    }
  };

  const saveAsStrategy = () => {
    try {
      const def = saveCustomDef({ name: result.name, rules: result.rules });
      refreshLibrary();
      setPipe({ selectedStrategyId: def.id });
      setSaved(def);
      setError(null);
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
      <Panel title="Configuration JSON à importer" right={<Button primary onClick={importAndTest}>▶ Importer & tester</Button>}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
          style={{ width: "100%", height: 380, background: T.bg0, color: T.green, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontFamily: T.mono, fontSize: 12, boxSizing: "border-box", resize: "vertical" }} />
        {error && <div style={{ marginTop: 8, color: T.red, fontSize: 12 }}>Erreur : {error}</div>}
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Format : {"{ name, rules: { long: [conditions], short: [conditions] } }"} · condition : {"{ left, op, right, rightConst? }"}. Sources : close, ema20, rsi14, vwap, macd… Ops : gt, lt, crossUp, crossDn.</div>
      </Panel>
      <Panel title="Résultat du test">
        {!result && <div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Colle une config et clique sur Importer & tester.</div>}
        {result && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.orange, marginBottom: 12 }}>{result.name}</div>
            <MetricGrid min={120}>
              <MetricCard label="Trades" value={result.res.nTrades} />
              <MetricCard label="Win Rate" value={fmtPct(result.res.winRate)} color={result.res.winRate >= 50 ? T.green : T.red} />
              <MetricCard label="Profit Factor" value={fmt(result.res.profitFactor)} color={result.res.profitFactor >= 1.5 ? T.green : T.red} />
              <MetricCard label="Sharpe" value={fmt(result.res.sharpe)} />
              <MetricCard label="Total PnL" value={fmtUsd(result.res.totalPnL)} color={result.res.totalPnL >= 0 ? T.green : T.red} />
              <MetricCard label="Max DD" value={fmtPct(result.res.maxDD * 100)} color={T.red} />
            </MetricGrid>
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <Button primary onClick={saveAsStrategy}>💾 Sauvegarder comme stratégie</Button>
              {saved && <Button onClick={() => navigate("backtest")}>→ Backtester dans le pipeline</Button>}
            </div>
            {saved && <div style={{ marginTop: 8, fontSize: 12, color: T.green }}>✓ Sauvegardée <b>#{saved.id} · {saved.name}</b> — disponible dans toute la plateforme (sélectionnée dans le pipeline).</div>}
            {result.res.nTrades === 0 && <div style={{ marginTop: 8, fontSize: 11, color: T.yellow }}>⚠ 0 trade : les conditions sont valides mais ne se déclenchent jamais sur ces données ({bars.length} barres). Vérifie les seuils.</div>}
          </>
        )}
      </Panel>
    </div>
  );
}
