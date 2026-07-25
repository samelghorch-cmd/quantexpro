// Mes Stratégies — gestionnaire des stratégies sauvegardées (persistées IndexedDB).
// Rejouer un backtest sur les données courantes, comparer, exporter en MQL5/JSON, supprimer.
import { useState, useEffect, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.tsx";
import { listStrategies, deleteStrategy, clearStrategies, logBacktest } from "../../engine/strategyStore.ts";
import { runBacktestExt } from "../../engine/backtestExtended.ts";
import { downloadJSON } from "../../engine/exportUtils.ts";
import { generateEA, downloadMq5 } from "../../engine/mql5Export.ts";
import { Panel, Button, Badge, DataTable, MetricCard, MetricGrid, fmt, fmtInt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { T, verdictColor } from "../../components/shared/theme.ts";

function exportMq5(s) {
  const ea = generateEA({
    strategyId: s.strategyId,
    name: s.name,
    symbol: s.symbol,
    params: s.params || {},
    tradeParams: s.params || {},
  });
  downloadMq5(ea.code, ea.filename);
}

export function SavedStrategiesPage() {
  const { bars, ctx, library, symbol, tf, dataMode } = usePipeline();
  const [rows, setRows] = useState([]);
  const [replayed, setReplayed] = useState({}); // id → res (rejeu sur données courantes)
  const [busy, setBusy] = useState(null);

  const refresh = useCallback(() => { listStrategies().then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const replay = useCallback(async (s) => {
    const strat = library.find((x) => x.id === s.strategyId);
    if (!strat) { setReplayed((m) => ({ ...m, [s.id]: { error: "stratégie introuvable dans la librairie" } })); return; }
    setBusy(s.id);
    const p = s.params || {};
    const params = { contract: symbol, capital: p.capital || 100000, direction: p.direction || "both", slAtr: p.slAtr ?? 2, tpAtr: p.tpAtr ?? 0, beAtr: p.beAtr ?? 0, contracts: p.contracts || 1 };
    const res = runBacktestExt(bars, ctx, strat.eval, params);
    setReplayed((m) => ({ ...m, [s.id]: res }));
    await logBacktest({ tool: "Rejeu", name: s.name, strategyId: s.strategyId, symbol, tf, dataMode, params, metrics: res }).catch(() => {});
    setBusy(null);
  }, [library, bars, ctx, symbol, tf, dataMode]);

  const remove = useCallback(async (id) => { await deleteStrategy(id); refresh(); }, [refresh]);
  const removeAll = useCallback(async () => { await clearStrategies(); setReplayed({}); refresh(); }, [refresh]);

  const cols = [
    { key: "name", label: "Stratégie", render: (r) => <span>#{r.strategyId} {r.name}</span> },
    { key: "symbol", label: "Actif", render: (r) => r.symbol || "—" },
    { key: "params", label: "SL/TP/BE · Dir", render: (r) => `${r.params?.slAtr ?? "—"}/${r.params?.tpAtr ?? "—"}/${r.params?.beAtr ?? "—"} · ${r.params?.direction ?? "—"}` },
    { key: "sharpe", label: "Sharpe (sauv.)", align: "right", render: (r) => r.metrics?.sharpe != null ? fmt(r.metrics.sharpe) : "—" },
    { key: "replay", label: "Sharpe (rejeu)", align: "right", render: (r) => {
      const rp = replayed[r.id];
      if (rp?.error) return <span style={{ color: T.red }}>—</span>;
      return rp ? fmt(rp.sharpe) : <span style={{ color: T.textFaint }}>—</span>;
    }, color: (r) => { const rp = replayed[r.id]; return rp && !rp.error ? (rp.sharpe >= (r.metrics?.sharpe ?? 0) ? T.green : T.yellow) : T.text; } },
    { key: "verdict", label: "Verdict", render: (r) => r.verdict ? <Badge color={verdictColor(r.verdict)}>{r.verdict}</Badge> : "—" },
    { key: "date", label: "Enregistrée", render: (r) => new Date(r.updatedAt || r.savedAt).toLocaleString("fr-FR") },
    { key: "act", label: "Actions", render: (r) => (
      <span style={{ display: "flex", gap: 6, whiteSpace: "nowrap" }}>
        <Button onClick={() => replay(r)} disabled={busy === r.id}>{busy === r.id ? "…" : "▶ Rejouer"}</Button>
        <Button onClick={() => exportMq5(r)}>⬇ MQL5</Button>
        <Button onClick={() => downloadJSON(r, `strategy_${r.strategyId}_${r.symbol || "x"}.json`)}>JSON</Button>
        <span onClick={() => remove(r.id)} title="Supprimer" style={{ cursor: "pointer", color: T.red, fontSize: 14, alignSelf: "center" }}>✕</span>
      </span>
    ) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>💾 Mes Stratégies sauvegardées</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 3, lineHeight: 1.5 }}>
          Toutes les stratégies enregistrées (avec leurs paramètres) — persistées en local, <b style={{ color: T.orange }}>survivent au rechargement</b>. « Rejouer » relance le backtest sur l'actif × TF <b>courant</b> ({symbol}) pour comparer au score sauvegardé.
        </div>
      </Panel>

      <Panel title={`Stratégies (${rows.length})`} right={rows.length > 0 && <Button onClick={removeAll}>🗑 Tout vider</Button>}>
        <MetricGrid min={140}>
          <MetricCard label="Sauvegardées" value={rows.length} color={T.orange} />
          <MetricCard label="Rejouées" value={Object.keys(replayed).length} />
          <MetricCard label="Actif courant" value={symbol} sub={dataMode === "live" ? "données réelles" : "synthétique"} />
        </MetricGrid>
        <div style={{ marginTop: 12 }}>
          {rows.length === 0
            ? <div style={{ fontSize: 12, color: T.textFaint, padding: "22px 0", textAlign: "center" }}>Aucune stratégie sauvegardée. Depuis Backtest → Strategy Builder (ou Optim Génétique), clique « 💾 Sauvegarder ».</div>
            : <DataTable columns={cols} rows={rows} maxHeight={460} />}
        </div>
      </Panel>
    </div>
  );
}
