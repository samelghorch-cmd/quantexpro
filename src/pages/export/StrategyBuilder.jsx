// Strategy Builder — assemble la config finale du pipeline, l'exporte (JSON + MQL5 stub),
// LA SAUVEGARDE durablement (IndexedDB) avec ses paramètres, et affiche les stratégies
// enregistrées + le journal des backtests de tous les outils.
import { useMemo, useState, useEffect, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { downloadJSON, downloadCSV } from "../../engine/exportUtils.js";
import { saveStrategy, listStrategies, deleteStrategy, listBacktests } from "../../engine/strategyStore.js";
import { Panel, Button, Badge, MetricCard, MetricGrid, DataTable, fmt } from "../../components/shared/ui.jsx";
import { T, verdictColor } from "../../components/shared/theme.js";

export function StrategyBuilderPage() {
  const { pipeline, symbol, tf, dataMode } = usePipeline();
  const bt = pipeline.lastBacktest;
  const strat = pipeline.quantOptimizerBest?.strat || pipeline.faoResults?.strat || bt?.strat;
  const bestParams = pipeline.quantOptimizerBest?.best?.params || pipeline.postFaoTop10?.best?.params || pipeline.faoResults?.best?.params || bt?.params;

  const [saved, setSaved] = useState([]);
  const [journal, setJournal] = useState([]);
  const [savedMsg, setSavedMsg] = useState("");

  const refresh = useCallback(() => {
    listStrategies().then(setSaved).catch(() => setSaved([]));
    listBacktests(50).then(setJournal).catch(() => setJournal([]));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const config = useMemo(() => ({
    meta: { name: strat?.name || "—", strategyId: strat?.id, symbol, generatedAt: new Date().toISOString() },
    params: bestParams || {},
    pipeline: {
      faoBest: pipeline.faoResults?.best?.params,
      postFaoScore: pipeline.postFaoTop10?.best?.score100,
      quantScore: pipeline.quantOptimizerBest?.best?.score,
      validator: pipeline.validatorVerdict?.verdict,
      recoVerdict: pipeline.recoFinale?.verdict,
      recoScore: pipeline.recoFinale?.finalScore,
    },
    performance: bt ? { sharpe: bt.res.sharpe, profitFactor: bt.res.profitFactor, winRate: bt.res.winRate, maxDD: bt.res.maxDD, totalPnL: bt.res.totalPnL } : null,
  }), [strat, symbol, bestParams, pipeline, bt]);

  const onSave = useCallback(async () => {
    if (!strat) return;
    await saveStrategy({
      name: strat.name, strategyId: strat.id, symbol, tf, dataMode,
      params: bestParams || {},
      metrics: bt ? { ...bt.res, score: bt.score } : {},
      verdict: pipeline.recoFinale?.verdict || pipeline.validatorVerdict?.verdict || null,
    });
    setSavedMsg("✓ Stratégie sauvegardée");
    setTimeout(() => setSavedMsg(""), 2500);
    refresh();
  }, [strat, symbol, tf, dataMode, bestParams, bt, pipeline, refresh]);

  const onDelete = useCallback(async (id) => { await deleteStrategy(id); refresh(); }, [refresh]);

  const mql5 = useMemo(() => {
    const p = bestParams || {};
    return `// EA généré par TradoBot Quant v5 — ${strat?.name || "Strategy"}
// Symbole : ${symbol}
input int    MagicNumber   = 5000;
input double SL_ATR_Mult   = ${p.slAtr ?? 2};
input double TP_ATR_Mult   = ${p.tpAtr ?? 0};
input double BE_ATR_Mult   = ${p.beAtr ?? 0};
input string Direction     = "${p.direction ?? "both"}";
// ... logique du signal à brancher depuis la stratégie #${strat?.id ?? "?"}
// Verdict pipeline : ${pipeline.recoFinale?.verdict ?? "non calculé"}`;
  }, [bestParams, strat, symbol, pipeline.recoFinale]);

  const savedCols = [
    { key: "name", label: "Stratégie", render: (r) => <span>#{r.strategyId} {r.name}</span> },
    { key: "symbol", label: "Actif", render: (r) => r.symbol || "—" },
    { key: "params", label: "SL/TP/BE", render: (r) => `${r.params?.slAtr ?? "—"}/${r.params?.tpAtr ?? "—"}/${r.params?.beAtr ?? "—"}` },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => r.metrics?.sharpe != null ? fmt(r.metrics.sharpe) : "—" },
    { key: "pf", label: "PF", align: "right", render: (r) => r.metrics?.profitFactor != null ? fmt(r.metrics.profitFactor) : "—" },
    { key: "verdict", label: "Verdict", render: (r) => r.verdict ? <Badge color={verdictColor(r.verdict)}>{r.verdict}</Badge> : "—" },
    { key: "savedAt", label: "Enregistrée", render: (r) => new Date(r.updatedAt || r.savedAt).toLocaleString("fr-FR") },
    { key: "act", label: "", render: (r) => <Button onClick={() => onDelete(r.id)}>🗑</Button> },
  ];
  const journalCols = [
    { key: "tool", label: "Outil", render: (r) => <Badge color={T.blue}>{r.tool}</Badge> },
    { key: "name", label: "Stratégie", render: (r) => <span>#{r.strategyId ?? "?"} {r.name}</span> },
    { key: "symbol", label: "Actif", render: (r) => r.symbol || "—" },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => r.metrics?.sharpe != null ? fmt(r.metrics.sharpe) : "—" },
    { key: "pnl", label: "PnL", align: "right", render: (r) => r.metrics?.totalPnL != null ? fmt(r.metrics.totalPnL, 0) : "—", color: (r) => (r.metrics?.totalPnL || 0) >= 0 ? T.green : T.red },
    { key: "ranAt", label: "Lancé", render: (r) => new Date(r.ranAt).toLocaleString("fr-FR") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Résumé de la stratégie" right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {savedMsg && <span style={{ fontSize: 11, color: T.green }}>{savedMsg}</span>}
          {pipeline.recoFinale && <Badge color={verdictColor(pipeline.recoFinale.verdict)}>{pipeline.recoFinale.verdict}</Badge>}
          <Button primary onClick={onSave} disabled={!strat}>💾 Sauvegarder</Button>
        </div>
      }>
        {!strat ? (
          <div style={{ padding: 20, textAlign: "center", color: T.textDim }}>Fais tourner au moins un backtest (idéalement le pipeline complet) pour construire une stratégie exportable.</div>
        ) : (
          <MetricGrid min={130}>
            <MetricCard label="Stratégie" value={`#${strat.id}`} sub={strat.name} color={T.orange} />
            <MetricCard label="SL / TP / BE" value={`${bestParams?.slAtr ?? "—"}/${bestParams?.tpAtr ?? "—"}/${bestParams?.beAtr ?? "—"}`} />
            <MetricCard label="Post-FAO" value={pipeline.postFaoTop10?.best ? fmt(pipeline.postFaoTop10.best.score100, 0) : "—"} />
            <MetricCard label="Score Quant" value={pipeline.quantOptimizerBest?.best ? fmt(pipeline.quantOptimizerBest.best.score, 0) : "—"} />
            <MetricCard label="Validator" value={pipeline.validatorVerdict?.verdict || "—"} color={verdictColor(pipeline.validatorVerdict?.verdict)} />
            <MetricCard label="Reco finale" value={pipeline.recoFinale ? fmt(pipeline.recoFinale.finalScore, 0) : "—"} color={verdictColor(pipeline.recoFinale?.verdict)} />
          </MetricGrid>
        )}
      </Panel>

      <Panel title={`💾 Stratégies sauvegardées (${saved.length})`} right={<span style={{ fontSize: 10.5, color: T.textFaint }}>Persistées en local — survivent au rechargement</span>}>
        {saved.length === 0
          ? <div style={{ padding: 16, color: T.textDim, fontSize: 12 }}>Aucune stratégie enregistrée. Clique sur « 💾 Sauvegarder » ci-dessus pour conserver la config actuelle avec ses paramètres.</div>
          : <DataTable columns={savedCols} rows={saved} maxHeight={280} />}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title="Configuration JSON" right={<Button onClick={() => downloadJSON(config, `strategy_${strat?.id || "build"}.json`)} disabled={!strat}>⬇ Export JSON</Button>}>
          <pre style={{ background: T.bg0, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontSize: 11.5, color: T.green, fontFamily: T.mono, overflow: "auto", maxHeight: 360, margin: 0 }}>{JSON.stringify(config, null, 2)}</pre>
        </Panel>
        <Panel title="Stub MQL5" right={<Button onClick={() => downloadCSV(mql5, `EA_${strat?.id || "build"}.mq5`)} disabled={!strat}>⬇ Export .mq5</Button>}>
          <pre style={{ background: T.bg0, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontSize: 11.5, color: T.blue, fontFamily: T.mono, overflow: "auto", maxHeight: 360, margin: 0 }}>{mql5}</pre>
        </Panel>
      </div>

      <Panel title={`📓 Journal des backtests — tous outils (${journal.length})`} right={<span style={{ fontSize: 10.5, color: T.textFaint }}>Chaque run de chaque outil y est enregistré</span>}>
        {journal.length === 0
          ? <div style={{ padding: 16, color: T.textDim, fontSize: 12 }}>Aucun backtest journalisé pour l'instant. Lance un backtest depuis n'importe quel outil.</div>
          : <DataTable columns={journalCols} rows={journal} maxHeight={300} />}
      </Panel>
    </div>
  );
}
