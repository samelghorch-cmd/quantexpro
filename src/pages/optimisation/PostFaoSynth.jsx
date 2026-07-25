// Post-FAO Synth — scoring composite (Robustesse 40 / Stabilité 35 / Performance 25), Top 10 + Δ%.
import { useState, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.tsx";
import { runPostFAO } from "../../engine/postFaoSynth.ts";
import { Panel, Button, DataTable, SimBadge, Badge, ScoreGauge, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { PipelineStepper } from "../../components/shared/PipelineStepper.tsx";
import { T } from "../../components/shared/theme.ts";

export function PostFaoSynthPage() {
  const { bars, ctx, pipeline, setPipe, log, attachToActive } = usePipeline();
  const [busy, setBusy] = useState(false);
  const fao = pipeline.faoResults;

  const run = useCallback(() => {
    if (!fao) return;
    setBusy(true);
    setTimeout(() => {
      const res = runPostFAO(fao, bars, ctx, fao.strat, 100000);
      setPipe({ postFaoTop10: res });
      log("Post-FAO", `Top ${res.ranked.length} rescalé — best score ${res.best?.score100?.toFixed(0)}`);
      // Rattache le Top rescalé au dossier actif (aucune perte entre outils).
      attachToActive("postFao", "Post-FAO Synth", { best: res.best, ranked: res.ranked },
        { name: fao.strat?.name, strategyId: fao.strat?.id, params: res.best?.params });
      setBusy(false);
    }, 20);
  }, [fao, bars, ctx, setPipe, log, attachToActive]);

  const post = pipeline.postFaoTop10;
  const columns = [
    { key: "rank", label: "#", render: (_, i) => i + 1 },
    { key: "score", label: "Score", align: "right", render: (r) => fmt(r.score100, 0), color: () => T.orange },
    { key: "robust", label: "Robust.", align: "right", render: (r) => fmtPct(r.robust * 100) },
    { key: "stab", label: "Stab.", align: "right", render: (r) => fmtPct(r.stab * 100) },
    { key: "perf", label: "Perf.", align: "right", render: (r) => fmtPct(r.perf * 100) },
    { key: "sl", label: "SL/TP/BE", render: (r) => `${r.params.slAtr}/${r.params.tpAtr || "—"}/${r.params.beAtr || "—"}` },
    { key: "pf", label: "PF", align: "right", render: (r) => fmt(r.profitFactor) },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => fmt(r.sharpe) },
    { key: "pnl", label: "PnL", align: "right", render: (r) => fmtUsd(r.totalPnL), color: (r) => r.totalPnL >= 0 ? T.green : T.red },
  ];

  return (
    <div>
      <PipelineStepper current="postFao" />
      {!fao ? (
        <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance d'abord <b style={{ color: T.orange }}>Full Auto Optim</b> — Post-FAO score ses résultats.</div></Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title="Scoring composite pondéré" right={<div style={{ display: "flex", gap: 10, alignItems: "center" }}><SimBadge /><Button primary onClick={run} disabled={busy}>{busy ? "Calcul…" : "▶ Synthétiser"}</Button></div>}>
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <Badge color={T.orange}>Robustesse 40%</Badge>
                <Badge color={T.blue}>Stabilité 35%</Badge>
                <Badge color={T.green}>Performance 25%</Badge>
              </div>
              {post?.best && <div style={{ marginLeft: "auto" }}><ScoreGauge score={post.best.score100} label="Best score" /></div>}
            </div>
          </Panel>

          {post && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14, alignItems: "start" }}>
              <Panel title="Top 10 rescalé"><DataTable columns={columns} rows={post.ranked} maxHeight={420} /></Panel>
              <Panel title="Δ% par paramètre (best vs baseline)">
                {post.deltas.map((d) => (
                  <div key={d.param} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${T.borderSoft}`, fontSize: 12 }}>
                    <span style={{ color: T.textDim, fontFamily: T.mono }}>{d.param}</span>
                    <span style={{ fontFamily: T.mono }}>{String(d.baseline)} → <b style={{ color: T.orange }}>{String(d.best)}</b>{d.deltaPct != null && <span style={{ color: d.deltaPct >= 0 ? T.green : T.red, marginLeft: 6 }}>({d.deltaPct >= 0 ? "+" : ""}{fmt(d.deltaPct, 0)}%)</span>}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12, fontSize: 11, color: T.textDim }}>Prochaine étape → <b style={{ color: T.orange }}>Quant Optimizer</b>.</div>
              </Panel>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
