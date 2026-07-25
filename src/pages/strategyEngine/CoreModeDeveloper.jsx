// Core Mode Developer — 4 onglets : INDICATEURS, CONFLUENCE (Rule Builder), PATTERNS LIBRARY 616, JSON.
import { useState, useMemo, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { runBacktestExt } from "../../engine/backtestExtended.ts";
import { compileRules, RULE_SOURCES, RULE_OPS, describeRule } from "../../engine/ruleBuilder.ts";
import { saveCustomDef } from "../../engine/customStrategies.ts";
import { buildPatternsLibrary, filterPatterns, PATTERN_FILTERS } from "../../engine/patternsLibrary.ts";
import { CandlestickChart } from "../../components/charts/CandlestickChart.jsx";
import { Panel, Tabs, Button, Badge, MetricCard, MetricGrid, DataTable, Select, fmt, fmtPct, fmtUsd, fmtInt } from "../../components/shared/ui.tsx";
import { T } from "../../components/shared/theme.ts";

const IND_CATALOG = {
  TREND: ["SMA", "EMA", "WMA", "DEMA", "TEMA", "HMA", "KAMA", "LinReg", "SuperTrend", "ParabolicSAR", "Ichimoku"],
  MOMENTUM: ["RSI", "Stoch", "StochRSI", "MACD", "CCI", "Williams%R", "ROC", "Momentum", "TSI", "TRIX"],
  VOLATILITÉ: ["ATR", "Bollinger", "Keltner", "Donchian", "StdDev"],
  VOLUME: ["OBV", "MFI", "CMF", "VWAP", "VPIN"],
  STATISTIQUE: ["Z-Score", "Hurst", "Skew", "Kurtosis"],
};

export function CoreModeDeveloperPage() {
  const [tab, setTab] = useState("indicateurs");
  return (
    <div>
      <Tabs tabs={[
        { id: "indicateurs", label: "INDICATEURS" },
        { id: "confluence", label: "CONFLUENCE D'ENTRÉE" },
        { id: "patterns", label: "PATTERNS LIBRARY (616)" },
        { id: "json", label: "JSON" },
      ]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 14 }}>
        {tab === "indicateurs" && <IndicateursTab />}
        {tab === "confluence" && <ConfluenceTab />}
        {tab === "patterns" && <PatternsTab />}
        {tab === "json" && <JsonTab />}
      </div>
    </div>
  );
}

function IndicateursTab() {
  const { bars, ctx } = usePipeline();
  const [selected, setSelected] = useState(["EMA", "RSI", "ATR"]);
  const toggle = (n) => setSelected((s) => s.includes(n) ? s.filter((x) => x !== n) : [...s, n]);

  const overlays = useMemo(() => {
    const list = [];
    if (selected.includes("EMA")) list.push({ name: "EMA 20", data: ctx.ema[20], color: T.blue, width: 1.5 });
    if (selected.includes("SMA")) list.push({ name: "SMA 50", data: ctx.sma[50], color: T.purple, width: 1.5 });
    if (selected.includes("VWAP")) list.push({ name: "VWAP", data: ctx.vwap, color: T.yellow, width: 1.5 });
    if (selected.includes("Bollinger")) { list.push({ name: "BB up", data: ctx.bb["20_2"].up, color: T.green, width: 1, dash: [4, 4] }); list.push({ name: "BB lo", data: ctx.bb["20_2"].lo, color: T.green, width: 1, dash: [4, 4] }); }
    if (selected.includes("SuperTrend")) list.push({ name: "ST", data: ctx.st["10_3"].st, color: T.pink, width: 1.5 });
    if (selected.includes("KAMA")) list.push({ name: "KAMA 21", data: ctx.kama?.[21], color: T.orange, width: 1.5 });
    if (selected.includes("LinReg")) list.push({ name: "LinReg 20", data: ctx.linreg?.[20], color: "#7dd3fc", width: 1.5 });
    if (selected.includes("Ichimoku") && ctx.ich?.["9_26"]) {
      list.push({ name: "Tenkan", data: ctx.ich["9_26"].tk, color: T.red, width: 1 });
      list.push({ name: "Kijun", data: ctx.ich["9_26"].kj, color: T.blue, width: 1 });
      list.push({ name: "Span A", data: ctx.ich["9_26"].spanA, color: T.green, width: 1, dash: [3, 3] });
      list.push({ name: "Span B", data: ctx.ich["9_26"].spanB, color: T.yellow, width: 1, dash: [3, 3] });
    }
    return list;
  }, [selected, ctx]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 220px", gap: 14, alignItems: "start" }}>
      <Panel title="Catalogue d'indicateurs">
        {Object.entries(IND_CATALOG).map(([cat, inds]) => (
          <div key={cat} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: T.orange, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{cat}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {inds.map((n) => (
                <span key={n} onClick={() => toggle(n)} style={{ cursor: "pointer", fontSize: 10.5, padding: "3px 7px", borderRadius: 5, border: `1px solid ${selected.includes(n) ? T.orange : T.border}`, color: selected.includes(n) ? T.orange : T.textDim, background: selected.includes(n) ? T.orangeSoft : "transparent" }}>{n}</span>
              ))}
            </div>
          </div>
        ))}
      </Panel>
      <Panel title="Chart Preview + Confluence Replay">
        <CandlestickChart bars={bars} ctx={ctx} overlays={overlays} signals={[]} height={420} />
      </Panel>
      <Panel title={`Dans ce mode (${selected.length})`}>
        {selected.map((n) => (
          <div key={n} style={{ padding: "8px 10px", background: T.panelAlt, borderRadius: 6, marginBottom: 6, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{n}</div>
            <div style={{ fontSize: 10, color: T.textFaint }}>SOURCE close · LENGTH 20 · PRESET défaut</div>
          </div>
        ))}
        {selected.length === 0 && <div style={{ fontSize: 11, color: T.textDim }}>Sélectionne des indicateurs dans le catalogue.</div>}
      </Panel>
    </div>
  );
}

const emptyCond = () => ({ left: "close", op: "crossUp", right: "ema20", rightConst: 0 });

function ConfluenceTab() {
  const { bars, ctx, symbol, refreshLibrary, setPipe, navigate } = usePipeline();
  const [rules, setRules] = useState({ long: [emptyCond()], short: [{ left: "close", op: "crossDn", right: "ema20", rightConst: 0 }] });
  const [result, setResult] = useState(null);
  const [stratName, setStratName] = useState("");
  const [saved, setSaved] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const saveAsStrategy = () => {
    try {
      const def = saveCustomDef({ name: stratName, rules });
      refreshLibrary();
      setPipe({ selectedStrategyId: def.id });
      setSaved(def);
      setSaveError(null);
    } catch (e) { setSaveError(e.message); setSaved(null); }
  };

  const addCond = (side) => setRules((r) => ({ ...r, [side]: [...r[side], emptyCond()] }));
  const rmCond = (side, i) => setRules((r) => ({ ...r, [side]: r[side].filter((_, k) => k !== i) }));
  const updateCond = (side, i, patch) => setRules((r) => ({ ...r, [side]: r[side].map((c, k) => k === i ? { ...c, ...patch } : c) }));

  const runBt = useCallback(() => {
    const evalFn = compileRules(rules);
    const res = runBacktestExt(bars, ctx, evalFn, { contract: symbol, capital: 100000, slAtr: 2, direction: "both" });
    setResult(res);
  }, [rules, bars, ctx, symbol]);

  const RuleSide = ({ side, color }) => (
    <Panel title={`${side === "long" ? "LONG" : "SHORT"} • ${rules[side].length ? "ON" : "OFF"}`} right={<Badge color={color}>ALL (AND)</Badge>}>
      {rules[side].map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <div style={{ flex: 1 }}><Select value={c.left} onChange={(v) => updateCond(side, i, { left: v })} options={RULE_SOURCES.map((s) => ({ value: s.id, label: s.label }))} /></div>
          <div style={{ width: 130 }}><Select value={c.op} onChange={(v) => updateCond(side, i, { op: v })} options={RULE_OPS.map((o) => ({ value: o.id, label: o.label }))} /></div>
          <div style={{ flex: 1 }}><Select value={c.right} onChange={(v) => updateCond(side, i, { right: v })} options={RULE_SOURCES.map((s) => ({ value: s.id, label: s.label }))} /></div>
          {c.right === "const" && <input type="number" value={c.rightConst} onChange={(e) => updateCond(side, i, { rightConst: Number(e.target.value) })} style={{ width: 60, background: T.bg0, color: T.text, border: `1px solid ${T.border}`, borderRadius: 4, padding: 4 }} />}
          <button onClick={() => rmCond(side, i)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      ))}
      <Button onClick={() => addCond(side)} style={{ fontSize: 11 }}>+ Condition</Button>
    </Panel>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <RuleSide side="long" color={T.green} />
        <RuleSide side="short" color={T.red} />
      </div>
      <Panel title="Compilation & Test" right={<Button primary onClick={runBt}>▶ Backtester la règle</Button>}>
        <div style={{ fontSize: 12, fontFamily: T.mono, color: T.textDim, marginBottom: 10 }}>
          <div>LONG si : {rules.long.map(describeRule).join(" ET ") || "—"}</div>
          <div>SHORT si : {rules.short.map(describeRule).join(" ET ") || "—"}</div>
        </div>
        {result && (
          <MetricGrid min={120}>
            <MetricCard label="Trades" value={fmtInt(result.nTrades)} />
            <MetricCard label="Win Rate" value={fmtPct(result.winRate)} color={result.winRate >= 50 ? T.green : T.red} />
            <MetricCard label="Profit Factor" value={fmt(result.profitFactor)} color={result.profitFactor >= 1.5 ? T.green : T.red} />
            <MetricCard label="Sharpe" value={fmt(result.sharpe)} />
            <MetricCard label="Total PnL" value={fmtUsd(result.totalPnL)} color={result.totalPnL >= 0 ? T.green : T.red} />
            <MetricCard label="Max DD" value={fmtPct(result.maxDD * 100)} color={T.red} />
          </MetricGrid>
        )}
        {result && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={stratName} onChange={(e) => setStratName(e.target.value)} placeholder="Nom de la stratégie…"
              style={{ flex: 1, minWidth: 180, background: T.bg0, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 9px" }} />
            <Button primary onClick={saveAsStrategy}>💾 Sauvegarder comme stratégie</Button>
            {saved && <Button onClick={() => navigate("backtest")}>→ Backtester dans le pipeline</Button>}
          </div>
        )}
        {saved && <div style={{ marginTop: 8, fontSize: 12, color: T.green }}>✓ Sauvegardée <b>#{saved.id} · {saved.name}</b> — disponible dans Backtest, Optimizer, Walk-Forward, dossiers et collector 24/7 (sélectionnée dans le pipeline).</div>}
        {saveError && <div style={{ marginTop: 8, fontSize: 12, color: T.red }}>Erreur : {saveError}</div>}
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Les conditions sont interprétées comme un AST (pas d'eval), branchées directement dans le moteur de backtest.</div>
      </Panel>
    </div>
  );
}

function PatternsTab() {
  const patterns = useMemo(() => buildPatternsLibrary(616), []);
  const [f, setF] = useState({
    timeframe: "all",
    tfFamily: "all",
    asset: "all",
    difficulty: "all",
    indicators: "all",
    search: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const filtered = useMemo(() => filterPatterns(patterns, f), [patterns, f]);
  const columns = [
    { key: "id", label: "#", render: (r) => r.id },
    { key: "name", label: "Pattern", render: (r) => r.name },
    { key: "timeframe", label: "TF", render: (r) => <Badge color={T.blue}>{r.timeframe}</Badge> },
    { key: "difficulty", label: "Difficulté", render: (r) => <Badge color={r.difficulty === "simple" ? T.green : r.difficulty === "medium" ? T.yellow : T.red}>{r.difficulty}</Badge> },
    { key: "nIndicators", label: "Indic.", align: "right", render: (r) => r.nIndicators },
    { key: "assets", label: "Actifs", render: (r) => r.assets.join(", ") },
    { key: "wr", label: "WR hint", align: "right", render: (r) => fmtPct(r.winRateHint, 0) },
  ];
  return (
    <div>
      <Panel
        title="Filtres · TF M1–MN"
        right={<span style={{ fontSize: 11, color: T.orange }}>{filtered.length} / {patterns.length} patterns</span>}
      >
        <div style={{ fontSize: 11, color: T.textDim, marginBottom: 10 }}>
          Grille timeframes : {PATTERN_FILTERS.TIMEFRAMES.join(" · ")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>FAMILLE TF</div>
            <Select
              value={f.tfFamily}
              onChange={(v) => set("tfFamily", v)}
              options={[
                { value: "all", label: "all" },
                { value: "scalp", label: "scalp (M1–M15)" },
                { value: "intraday", label: "intraday (M30–H4)" },
                { value: "swing", label: "swing (D1–MN)" },
              ]}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>TIMEFRAME</div>
            <Select value={f.timeframe} onChange={(v) => set("timeframe", v)} options={["all", ...PATTERN_FILTERS.TIMEFRAMES]} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>ACTIFS</div>
            <Select value={f.asset} onChange={(v) => set("asset", v)} options={["all", ...PATTERN_FILTERS.ASSETS]} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>DIFFICULTÉ</div>
            <Select value={f.difficulty} onChange={(v) => set("difficulty", v)} options={["all", ...PATTERN_FILTERS.DIFFICULTY]} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>INDICATEURS</div>
            <Select value={f.indicators} onChange={(v) => set("indicators", v)} options={["all", "1", "2", "3", "4+"]} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>RECHERCHE</div>
            <input
              value={f.search}
              onChange={(e) => set("search", e.target.value)}
              placeholder="nom…"
              style={{ width: "100%", background: T.bg0, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 9px", boxSizing: "border-box" }}
            />
          </div>
        </div>
      </Panel>
      <div style={{ marginTop: 14 }}>
        <Panel title="Patterns"><DataTable columns={columns} rows={filtered.slice(0, 200)} maxHeight={460} /></Panel>
      </div>
    </div>
  );
}

function JsonTab() {
  const { pipeline } = usePipeline();
  const json = useMemo(() => JSON.stringify({
    mode: "CoreModeDeveloper",
    selectedStrategyId: pipeline.selectedStrategyId,
    strategyParams: pipeline.strategyParams,
    hasBacktest: !!pipeline.lastBacktest,
    hasFAO: !!pipeline.faoResults,
    pipeline: {
      faoBest: pipeline.faoResults?.best?.params,
      postFaoBest: pipeline.postFaoTop10?.best?.params,
      quantScore: pipeline.quantOptimizerBest?.best?.score,
      validator: pipeline.validatorVerdict?.verdict,
      reco: pipeline.recoFinale?.verdict,
    },
  }, null, 2), [pipeline]);
  return (
    <Panel title="Export JSON du mode courant">
      <pre style={{ background: T.bg0, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, fontSize: 12, color: T.green, fontFamily: T.mono, overflow: "auto", maxHeight: 480 }}>{json}</pre>
    </Panel>
  );
}
