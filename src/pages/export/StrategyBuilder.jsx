// Strategy Builder — assemble la config finale du pipeline et l'exporte (JSON + MQL5 stub).
import { useMemo } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { downloadJSON, downloadCSV } from "../../engine/exportUtils.js";
import { Panel, Button, Badge, MetricCard, MetricGrid, fmt } from "../../components/shared/ui.jsx";
import { T, verdictColor } from "../../components/shared/theme.js";

export function StrategyBuilderPage() {
  const { pipeline, symbol } = usePipeline();
  const bt = pipeline.lastBacktest;
  const strat = pipeline.quantOptimizerBest?.strat || pipeline.faoResults?.strat || bt?.strat;
  const bestParams = pipeline.quantOptimizerBest?.best?.params || pipeline.postFaoTop10?.best?.params || pipeline.faoResults?.best?.params || bt?.params;

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Résumé de la stratégie" right={pipeline.recoFinale && <Badge color={verdictColor(pipeline.recoFinale.verdict)}>{pipeline.recoFinale.verdict}</Badge>}>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title="Configuration JSON" right={<Button onClick={() => downloadJSON(config, `strategy_${strat?.id || "build"}.json`)} disabled={!strat}>⬇ Export JSON</Button>}>
          <pre style={{ background: T.bg0, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontSize: 11.5, color: T.green, fontFamily: T.mono, overflow: "auto", maxHeight: 360, margin: 0 }}>{JSON.stringify(config, null, 2)}</pre>
        </Panel>
        <Panel title="Stub MQL5" right={<Button onClick={() => downloadCSV(mql5, `EA_${strat?.id || "build"}.mq5`)} disabled={!strat}>⬇ Export .mq5</Button>}>
          <pre style={{ background: T.bg0, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontSize: 11.5, color: T.blue, fontFamily: T.mono, overflow: "auto", maxHeight: 360, margin: 0 }}>{mql5}</pre>
        </Panel>
      </div>
    </div>
  );
}
