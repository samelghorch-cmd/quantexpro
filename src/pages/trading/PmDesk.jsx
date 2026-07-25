// P4-DESK — Desk PM unifié (flotte equity / réserve risque).
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePipeline } from "../../state/PipelineContext.tsx";
import { listDossiers } from "../../engine/dossierStore.ts";
import { loadValidatedEdges, listActiveEdges } from "../../engine/validatedEdges.ts";
import { getCollectorUrl, listJobs } from "../../engine/collectorClient.ts";
import {
  loadDeskConfig,
  saveDeskConfig,
  buildPmDesk,
  deskToCsv,
} from "../../engine/portfolioDesk.ts";
import { Panel, Button, Badge, MetricCard, MetricGrid, DataTable, Field, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { T } from "../../components/shared/theme.ts";

const inputStyle = {
  width: "100%",
  background: T.bg0,
  border: `1px solid ${T.border}`,
  color: T.text,
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
};

function statusColor(st) {
  if (st === "booked" || st === "validated" || st === "promoted") return T.green;
  if (st === "demo" || st === "running") return T.orange;
  if (st === "research") return T.blue;
  return T.textDim;
}

function downloadCsv(csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quantexpro-pm-desk-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PmDeskPage() {
  const { navigate } = usePipeline();
  const [cfg, setCfg] = useState(() => loadDeskConfig());
  const [dossiers, setDossiers] = useState([]);
  const [edges, setEdges] = useState(() => listActiveEdges(loadValidatedEdges()));
  const [jobs, setJobs] = useState([]);
  const [jobErr, setJobErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setJobErr(null);
    try {
      const all = await listDossiers().catch(() => []);
      setDossiers(all);
      setEdges(listActiveEdges(loadValidatedEdges()));
      if (getCollectorUrl()) {
        try {
          setJobs(await listJobs());
        } catch (e) {
          setJobs([]);
          setJobErr(e.message || String(e));
        }
      } else {
        setJobs([]);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const desk = useMemo(
    () => buildPmDesk({ dossiers, edges, jobs, config: cfg }),
    [dossiers, edges, jobs, cfg],
  );
  const m = desk.metrics;

  const onSaveCfg = () => {
    setCfg(saveDeskConfig(cfg));
  };

  const cols = [
    {
      key: "status",
      label: "Statut",
      render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge>,
    },
    {
      key: "name",
      label: "Sleeve",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: 10, color: T.textFaint }}>
            {r.kind} · #{r.strategyId ?? "—"} · {r.symbol || "—"} · {r.tf || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "letter",
      label: "Note",
      render: (r) => (r.letter ? <span style={{ fontFamily: T.mono, fontWeight: 800 }}>{r.letter}</span> : "—"),
    },
    {
      key: "pnl",
      label: "PnL réalisé",
      align: "right",
      render: (r) => fmtUsd(r.realizedPnL || 0),
      color: (r) => (r.realizedPnL || 0) >= 0 ? T.green : T.red,
    },
    {
      key: "risk",
      label: "Risque alloué",
      align: "right",
      render: (r) => fmtUsd(r.riskAllocated || 0),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Desk PM — flotte & réserve risque</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.55, maxWidth: 760 }}>
          Vue gouvernance : capital desk, equity (capital + PnL démo/collector), budget risque
          (défaut <b style={{ color: T.orange }}>{fmtPct(1.4)}</b> du capital). Sources : Alpha Forge,
          dossiers GO / démo, jobs collector. Aucun ordre réel.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <Button onClick={() => navigate("alphaForge")}>✦ Alpha Forge</Button>
          <Button onClick={() => navigate("dossiers")}>📁 Dossiers</Button>
          <Button onClick={() => navigate("forwardTest")}>Forward Test</Button>
          <Button onClick={() => navigate("masterCockpit")}>Master Cockpit</Button>
          <Button onClick={refresh} disabled={busy}>{busy ? "…" : "Rafraîchir"}</Button>
          <Button onClick={() => downloadCsv(deskToCsv(desk))} disabled={!desk.sleeves.length}>CSV</Button>
        </div>
      </Panel>

      <Panel title="Paramètres desk">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr) auto", gap: 10, alignItems: "end" }}>
          <Field label="Capital">
            <input
              type="number"
              value={cfg.capital}
              onChange={(e) => setCfg((c) => ({ ...c, capital: Number(e.target.value) }))}
              style={inputStyle}
            />
          </Field>
          <Field label="Budget risque %">
            <input
              type="number"
              step="0.1"
              value={cfg.riskBudgetPct}
              onChange={(e) => setCfg((c) => ({ ...c, riskBudgetPct: Number(e.target.value) }))}
              style={inputStyle}
            />
          </Field>
          <Field label="% / sleeve">
            <input
              type="number"
              step="0.05"
              value={cfg.riskPerSleevePct}
              onChange={(e) => setCfg((c) => ({ ...c, riskPerSleevePct: Number(e.target.value) }))}
              style={inputStyle}
            />
          </Field>
          <Field label="Devise">
            <input
              value={cfg.currency}
              onChange={(e) => setCfg((c) => ({ ...c, currency: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Button primary onClick={onSaveCfg}>Sauver</Button>
        </div>
      </Panel>

      <MetricGrid min={130}>
        <MetricCard label={`Equity (${m.currency})`} value={fmtUsd(m.equity)} color={T.orange} hint="Capital + PnL réalisé démo/jobs" />
        <MetricCard label="Capital" value={fmtUsd(m.capital)} />
        <MetricCard label="PnL réalisé" value={fmtUsd(m.realizedPnL)} color={m.realizedPnL >= 0 ? T.green : T.red} />
        <MetricCard label="Budget risque" value={fmtUsd(m.riskBudget)} sub={`${fmt(m.riskBudgetPct, 2)} % capital`} />
        <MetricCard
          label="Risque utilisé"
          value={fmtUsd(m.riskUsed)}
          color={m.overloaded ? T.red : T.yellow}
          sub={`${fmt(m.riskUsedPct, 1)} % du budget`}
        />
        <MetricCard
          label="Réserve restante"
          value={fmtUsd(m.riskRemaining)}
          color={m.overloaded ? T.red : T.green}
          sub={`${fmt(m.reservePctOfCapital, 2)} % capital`}
          hint="Cible type 1.4 % : budget − alloué"
        />
        <MetricCard label="Sleeves" value={m.nSleeves} sub={`${m.nBooked} book · ${m.nJobs} jobs`} />
        <MetricCard label="GO / démo" value={`${m.nGo} / ${m.nDemo}`} />
      </MetricGrid>

      {m.overloaded && (
        <div style={{ fontSize: 12, color: T.red }}>
          ⚠ Budget risque dépassé — retire des sleeves Alpha Forge ou baisse le % / sleeve.
        </div>
      )}
      {jobErr && (
        <div style={{ fontSize: 11, color: T.yellow }}>Collector : {jobErr}</div>
      )}

      <Panel title={`Book (${desk.sleeves.length})`}>
        {desk.sleeves.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: T.textDim, fontSize: 12 }}>
            Aucune sleeve. Promeus un edge GO dans Alpha Forge, lance une démo Forward Test, ou configure le collector.
          </div>
        ) : (
          <DataTable columns={cols} rows={desk.sleeves} maxHeight={420} />
        )}
      </Panel>
    </div>
  );
}
