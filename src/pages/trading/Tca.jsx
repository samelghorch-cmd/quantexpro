// TCA — Transaction Cost Analysis : slippage observé vs modèle théorique (P1-TCA).
import { useState, useMemo, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { getDossier } from "../../engine/dossierStore.js";
import {
  runTCA,
  fillsFromTrades,
  modelCostBps,
  modelCostForAsset,
  classIdForAsset,
  addTcaFill,
  loadTcaFills,
  clearTcaFills,
  TCA_WORSE_RATIO,
  TCA_BETTER_RATIO,
} from "../../engine/tca.js";
import { COST_MODELS } from "../../engine/costModel.js";
import { Panel, Button, Badge, Field, NumberInput, MetricCard, MetricGrid, DataTable, Select, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";

const verdictMeta = {
  BETTER_THAN_MODEL: { label: "Meilleur que le modèle", color: T.green },
  CALIBRATED: { label: "Calibré", color: T.green },
  WORSE_THAN_MODEL: { label: "Pire que le modèle", color: T.red },
  INSUFFICIENT: { label: "Données insuffisantes", color: T.yellow },
};

export function TcaPage() {
  const { pipeline, bars, assetKey, symbol, activeDossierId, navigate } = usePipeline();
  const [manualFills, setManualFills] = useState(() => loadTcaFills());
  const [form, setForm] = useState({ signalPrice: "", fillPrice: "", side: "long", notional: 100000 });
  const [source, setSource] = useState("backtest"); // backtest | demo | manual
  const [error, setError] = useState(null);

  const classId = classIdForAsset(assetKey || symbol);
  const lastPx = bars?.[bars.length - 1]?.c || 100;
  const modelPreview = useMemo(() => modelCostForAsset(assetKey || symbol, lastPx), [assetKey, symbol, lastPx]);

  const fills = useMemo(() => {
    if (source === "manual") return manualFills;
    if (source === "backtest") {
      const trades = pipeline.lastBacktest?.res?.trades;
      if (!trades?.length || !bars?.length) return [];
      return fillsFromTrades(trades, bars, { notional: pipeline.lastBacktest?.params?.capital || 100000 });
    }
    return []; // demo loaded async into demoFills state
  }, [source, manualFills, pipeline.lastBacktest, bars]);

  const [demoFills, setDemoFills] = useState([]);

  const loadDemo = useCallback(async () => {
    setError(null);
    if (!activeDossierId) {
      setError("Aucun dossier actif — ouvre un dossier puis lance un Forward Test.");
      return;
    }
    try {
      const d = await getDossier(activeDossierId);
      const sessions = d?.demoSessions || [];
      if (!sessions.length) {
        setError("Aucune session de démo dans le dossier actif.");
        setDemoFills([]);
        return;
      }
      const last = sessions[sessions.length - 1];
      const trades = last.trades || [];
      if (!trades.length) {
        setError("La dernière session de démo n'a pas de trades.");
        setDemoFills([]);
        return;
      }
      setDemoFills(fillsFromTrades(trades, bars || [], { notional: last.params?.capital || 100000 }));
      setSource("demo");
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [activeDossierId, bars]);

  const activeFills = source === "demo" ? demoFills : fills;
  const report = useMemo(
    () => runTCA(activeFills, { assetKey: assetKey || symbol, classId, price: lastPx }),
    [activeFills, assetKey, symbol, classId, lastPx],
  );

  const onAddManual = () => {
    setError(null);
    const sig = Number(form.signalPrice);
    const fill = Number(form.fillPrice);
    if (!(sig > 0) || !(fill > 0)) {
      setError("Signal et fill doivent être > 0.");
      return;
    }
    addTcaFill({
      signalPrice: sig,
      fillPrice: fill,
      side: form.side,
      notional: Number(form.notional) || 100000,
      assetKey: assetKey || symbol,
    });
    setManualFills(loadTcaFills());
    setSource("manual");
    setForm((f) => ({ ...f, signalPrice: "", fillPrice: "" }));
  };

  const onClearManual = () => {
    clearTcaFills();
    setManualFills([]);
  };

  const vm = verdictMeta[report.verdict] || verdictMeta.INSUFFICIENT;

  const fillCols = [
    { key: "side", label: "Sens", render: (r) => (r.side === 1 ? "LONG" : "SHORT"), color: (r) => (r.side === 1 ? T.green : T.red) },
    { key: "signal", label: "Signal", align: "right", render: (r) => fmt(r.signalPrice, 4) },
    { key: "fill", label: "Fill", align: "right", render: (r) => fmt(r.fillPrice, 4) },
    { key: "entryBps", label: "Slip entrée (bps)", align: "right", render: (r) => fmt(r.entrySlipBps, 2), color: (r) => (r.entrySlipBps > 0 ? T.red : T.green) },
    { key: "rt", label: "A/R (bps)", align: "right", render: (r) => (r.roundTripSlipBps != null ? fmt(r.roundTripSlipBps, 2) : "—") },
    { key: "is", label: "IS $", align: "right", render: (r) => (Number.isFinite(r.isUsd) ? fmtUsd(r.isUsd, 2) : "—"), color: (r) => (r.isUsd > 0 ? T.red : T.green) },
    { key: "src", label: "Source", render: (r) => r.source || "—" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>TCA — Transaction Cost Analysis</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.5 }}>
          Slippage <b style={{ color: T.orange }}>observé</b> (next-open démo / backtest, ou fills manuels) vs modèle
          théorique <code style={{ color: T.textFaint }}>costModel.js</code> / contrats.
          Ratio &gt; {TCA_WORSE_RATIO} → modèle trop optimiste ; &lt; {TCA_BETTER_RATIO} → exécution meilleure que prévu.
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Panel title="Source des fills">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Button
                primary={source === "backtest"}
                onClick={() => { setSource("backtest"); setError(null); }}
                disabled={!pipeline.lastBacktest?.res?.trades?.length}
              >
                Dernier backtest {pipeline.lastBacktest?.res?.trades?.length ? `(${pipeline.lastBacktest.res.trades.length})` : ""}
              </Button>
              <Button primary={source === "demo"} onClick={loadDemo}>Session démo (dossier actif)</Button>
              <Button primary={source === "manual"} onClick={() => setSource("manual")}>Fills manuels ({manualFills.length})</Button>
              <Button onClick={() => navigate("forwardTest")} style={{ fontSize: 11 }}>→ Forward Test (passerelle démo)</Button>
            </div>
            {error && <div style={{ marginTop: 10, fontSize: 11, color: T.red, lineHeight: 1.4 }}>{error}</div>}
          </Panel>

          <Panel title="Modèle théorique">
            <MetricGrid min={120}>
              <MetricCard label="Classe" value={modelPreview.classId} />
              <MetricCard label="One-way" value={`${fmt(modelPreview.oneWayBps, 2)} bps`} color={T.orange} />
              <MetricCard label="Round-trip" value={`${fmt(modelPreview.roundTripBps, 2)} bps`} />
            </MetricGrid>
            <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>{modelPreview.label}</div>
            <div style={{ marginTop: 8, fontSize: 10, color: T.textFaint }}>
              Classes costModel : {Object.keys(COST_MODELS).join(", ")} · actif {assetKey || symbol} → {classId}
              {" · "}réf. {fmt(modelCostBps(classId).oneWayBps, 2)} bps
            </div>
          </Panel>

          <Panel title="Ajouter un fill manuel">
            <Field label="Prix signal">
              <NumberInput value={form.signalPrice} step={0.01} onChange={(v) => setForm((f) => ({ ...f, signalPrice: v }))} />
            </Field>
            <div style={{ height: 8 }} />
            <Field label="Prix fill">
              <NumberInput value={form.fillPrice} step={0.01} onChange={(v) => setForm((f) => ({ ...f, fillPrice: v }))} />
            </Field>
            <div style={{ height: 8 }} />
            <Field label="Sens">
              <Select
                value={form.side}
                onChange={(v) => setForm((f) => ({ ...f, side: v }))}
                options={[{ value: "long", label: "Long" }, { value: "short", label: "Short" }]}
              />
            </Field>
            <div style={{ height: 8 }} />
            <Field label="Notionnel $">
              <NumberInput value={form.notional} step={1000} onChange={(v) => setForm((f) => ({ ...f, notional: v }))} />
            </Field>
            <Button primary onClick={onAddManual} style={{ width: "100%", marginTop: 12 }}>Ajouter</Button>
            {manualFills.length > 0 && (
              <Button onClick={onClearManual} style={{ width: "100%", marginTop: 8 }}>Vider les fills manuels</Button>
            )}
          </Panel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Panel title="Verdict" right={<Badge color={vm.color}>{vm.label}</Badge>}>
            <MetricGrid min={130}>
              <MetricCard label="Fills" value={report.n} color={T.orange} />
              <MetricCard
                label="Slip entrée moy."
                value={Number.isFinite(report.observed.avgEntrySlipBps) ? `${fmt(report.observed.avgEntrySlipBps, 2)} bps` : "—"}
                color={report.observed.avgEntrySlipBps > 0 ? T.red : T.green}
              />
              <MetricCard
                label="Médiane / P95"
                value={
                  Number.isFinite(report.observed.medianEntrySlipBps)
                    ? `${fmt(report.observed.medianEntrySlipBps, 1)} / ${fmt(report.observed.p95EntrySlipBps, 1)}`
                    : "—"
                }
              />
              <MetricCard
                label="Ratio obs/modèle"
                value={Number.isFinite(report.ratio) ? fmt(report.ratio, 2) : "—"}
                color={report.verdict === "WORSE_THAN_MODEL" ? T.red : report.verdict === "BETTER_THAN_MODEL" ? T.green : T.yellow}
                hint="1.0 = aligné"
              />
              <MetricCard
                label="IS total $"
                value={fmtUsd(report.observed.totalImplementationShortfallUsd || 0, 2)}
                color={report.observed.totalImplementationShortfallUsd > 0 ? T.red : T.green}
              />
              <MetricCard
                label="% fills adverses"
                value={Number.isFinite(report.observed.pctAdverse) ? fmtPct(report.observed.pctAdverse * 100) : "—"}
              />
            </MetricGrid>
            <div style={{ marginTop: 10, fontSize: 11, color: T.textDim, lineHeight: 1.45 }}>
              {report.calibration.note}
              {report.verdict === "WORSE_THAN_MODEL" && (
                <span> SpreadPct suggéré ≈ <b style={{ color: T.orange }}>{fmt(report.calibration.suggestedSpreadPct * 1e4, 2)} bps</b> (one-way spread).</span>
              )}
            </div>
          </Panel>

          <Panel title={`Fills analysés (${source})`}>
            {report.n === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: T.textDim, fontSize: 12 }}>
                Lance un backtest, une session Forward Test, ou ajoute des fills manuels.
              </div>
            ) : (
              <DataTable columns={fillCols} rows={report.fills.slice(0, 200)} maxHeight={420} />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
