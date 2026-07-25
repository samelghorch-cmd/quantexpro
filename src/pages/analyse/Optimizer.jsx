// Optimizer — Mode A (sweep auto) / Mode B (catégories), tri multi-métrique, export.
import { useState, useCallback } from "react";
import { usePipeline, usePersistentState } from "../../state/PipelineContext.tsx";
import { runFAO } from "../../engine/fao.ts";
import { downloadCSV } from "../../engine/exportUtils.ts";
import { Panel, Button, Field, Select, NumberInput, DataTable, Badge, SimBadge, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { StrategyPicker } from "../../components/shared/StrategyPicker.tsx";
import { T } from "../../components/shared/theme.ts";

const CATEGORIES = ["SL", "TP", "Break-Even", "Signal", "Regime", "Direction", "Risk", "ATR", "HTF", "Session", "Order Blocks", "Reverse-Range", "Signal Decay", "Adaptive", "PropFirm Guard", "ATR Regime"];

export function OptimizerPage() {
  const { bars, ctx, library, symbol } = usePipeline();
  const [mode, setMode] = useState("A");
  const [stratId, setStratId] = useState(3);
  const [nSamples, setNSamples] = useState(120);
  const [sortBy, setSortBy] = useState("expectancyR");
  const [cats, setCats] = useState(() => new Set(["SL", "TP", "Break-Even", "Signal"]));
  const [result, setResult] = usePersistentState("optimizer:result", null);
  const [busy, setBusy] = useState(false);

  const toggleCat = (c) => setCats((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const run = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    if (!strat) return;
    setBusy(true);
    setTimeout(() => {
      const res = runFAO(bars, ctx, strat, { nSamples, contract: symbol });
      setResult({ strat, ...res });
      setBusy(false);
    }, 20);
  }, [library, stratId, nSamples, bars, ctx, symbol]);

  const rows = result ? [...result.combos].sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0)) : [];
  const columns = [
    { key: "rank", label: "#", render: (_, ) => "" },
    { key: "sl", label: "SL", render: (r) => r.params.slAtr },
    { key: "tp", label: "TP", render: (r) => r.params.tpAtr || "—" },
    { key: "be", label: "BE", render: (r) => r.params.beAtr || "—" },
    { key: "dir", label: "Dir", render: (r) => r.params.direction },
    { key: "reg", label: "Régime", render: (r) => r.params.regime },
    { key: "nTrades", label: "Trades", align: "right", render: (r) => r.nTrades },
    { key: "winRate", label: "WR%", align: "right", render: (r) => fmt(r.winRate, 1), color: (r) => r.winRate >= 50 ? T.green : T.red },
    { key: "profitFactor", label: "PF", align: "right", render: (r) => fmt(r.profitFactor), color: (r) => r.profitFactor >= 1.5 ? T.green : T.red },
    { key: "expectancyR", label: "Exp.R", align: "right", render: (r) => fmt(r.expectancyR), color: (r) => r.expectancyR >= 0 ? T.green : T.red },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => fmt(r.sharpe) },
    { key: "maxDD", label: "MaxDD", align: "right", render: (r) => fmtPct(r.maxDD * 100), color: (r) => r.maxDD < 0.2 ? T.green : T.red },
    { key: "totalPnL", label: "PnL", align: "right", render: (r) => fmtUsd(r.totalPnL), color: (r) => r.totalPnL >= 0 ? T.green : T.red },
  ];

  const exportCsv = () => {
    const header = "sl,tp,be,dir,regime,trades,wr,pf,expR,sharpe,maxdd,pnl\n";
    const body = rows.map((r) => `${r.params.slAtr},${r.params.tpAtr},${r.params.beAtr},${r.params.direction},${r.params.regime},${r.nTrades},${r.winRate.toFixed(1)},${fmt(r.profitFactor)},${r.expectancyR.toFixed(3)},${r.sharpe.toFixed(2)},${(r.maxDD * 100).toFixed(1)},${r.totalPnL.toFixed(0)}`).join("\n");
    downloadCSV(header + body, `optimizer_${stratId}.csv`);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Stratégie à optimiser"><StrategyPicker value={stratId} onChange={setStratId} compact /></Panel>
        <Panel title="Mode">
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Button primary={mode === "A"} onClick={() => setMode("A")} style={{ flex: 1, ...(mode === "A" ? {} : {}) }}>A · Sweep auto</Button>
            <Button primary={mode === "B"} onClick={() => setMode("B")} style={{ flex: 1 }}>B · Catégories</Button>
          </div>
          {mode === "A" ? (
            <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
              Sweep automatique de tous les paramètres SL/TP/BE + Direction + Régime + ATR, random sampling sur <b style={{ color: T.orange }}>Max combos</b>, filtres qualité (WR ≥ 35%, DD ≤ 40%).
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CATEGORIES.map((c) => (
                <span key={c} onClick={() => toggleCat(c)} style={{ cursor: "pointer", fontSize: 10.5, padding: "3px 8px", borderRadius: 5, border: `1px solid ${cats.has(c) ? T.orange : T.border}`, color: cats.has(c) ? T.orange : T.textDim, background: cats.has(c) ? T.orangeSoft : "transparent" }}>{c}</span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <Field label="Max combos (random sampling)"><NumberInput value={nSamples} step={20} onChange={setNSamples} /></Field>
          </div>
          <Button primary onClick={run} disabled={busy} style={{ width: "100%", marginTop: 12 }}>{busy ? "Optimisation…" : "▶ Lancer l'optimisation"}</Button>
        </Panel>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {result && (
          <Panel title={`Baseline vs Best · ${result.strat.name}`} right={<SimBadge />}>
            <div style={{ display: "flex", gap: 20 }}>
              <div><div style={{ fontSize: 10, color: T.textDim }}>BASELINE (SL2)</div><div style={{ fontFamily: T.mono, fontSize: 13 }}>Exp.R {fmt(result.baseline.expectancyR)} · PF {fmt(result.baseline.profitFactor)} · {fmtUsd(result.baseline.totalPnL)}</div></div>
              <div><div style={{ fontSize: 10, color: T.orange }}>BEST</div><div style={{ fontFamily: T.mono, fontSize: 13, color: T.orange }}>Exp.R {fmt(result.best.expectancyR)} · PF {fmt(result.best.profitFactor)} · {fmtUsd(result.best.totalPnL)}</div></div>
              <div style={{ marginLeft: "auto", fontSize: 11, color: T.textDim }}>{result.combos.length} setups retenus / {result.attempts} testés</div>
            </div>
          </Panel>
        )}
        <Panel title="Setups sauvegardés" right={result && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: T.textDim }}>Trier :</span>
            <Select value={sortBy} onChange={setSortBy} options={[{ value: "expectancyR", label: "Expectancy R" }, { value: "sharpe", label: "Sharpe" }, { value: "profitFactor", label: "Profit Factor" }, { value: "totalPnL", label: "PnL" }, { value: "winRate", label: "Win Rate" }]} />
            <Button onClick={exportCsv}>CSV</Button>
          </div>
        )}>
          <DataTable columns={columns} rows={rows} maxHeight={520} />
        </Panel>
      </div>
    </div>
  );
}
