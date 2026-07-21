// Strategy Importer — importe une config JSON (Rule Builder / mode) et la teste.
import { useState } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { compileRules } from "../../engine/ruleBuilder.js";
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
  const { bars, ctx, symbol } = usePipeline();
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const importAndTest = () => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed.rules) throw new Error("Champ 'rules' manquant");
      const evalFn = compileRules(parsed.rules);
      const res = runBacktestExt(bars, ctx, evalFn, { contract: symbol, capital: 100000, slAtr: 2, direction: "both" });
      setResult({ name: parsed.name || "Import", res });
      setError(null);
    } catch (e) {
      setError(e.message);
      setResult(null);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
      <Panel title="Configuration JSON à importer" right={<Button primary onClick={importAndTest}>▶ Importer & tester</Button>}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
          style={{ width: "100%", height: 380, background: T.bg0, color: T.green, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontFamily: T.mono, fontSize: 12, boxSizing: "border-box", resize: "vertical" }} />
        {error && <div style={{ marginTop: 8, color: T.red, fontSize: 12 }}>Erreur : {error}</div>}
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Format : {"{ name, rules: { long: [conditions], short: [conditions] } }"}. Sources : close, ema20, rsi14, vwap, macd… Ops : gt, lt, crossUp, crossDn.</div>
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
          </>
        )}
      </Panel>
    </div>
  );
}
