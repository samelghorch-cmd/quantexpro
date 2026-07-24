// Anti-Library — registre des concepts involutifs (P1-ANT + P4-ANT-SYNC).
import { useState, useCallback, useMemo } from "react";
import {
  ensureSeeded,
  addAntiEntry,
  removeAntiEntry,
  clearAntiLibrary,
  SEED_CONCEPTS,
  blockedStrategyIds,
} from "../../engine/antiLibrary.ts";
import {
  pushAntiLibraryToApi,
  pullAntiLibraryFromApi,
  isAntiApiConfigured,
} from "../../engine/antiLibrarySync.ts";
import { buildStrategyLibrary } from "../../engine/strategyLibrary.ts";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { Panel, Button, Badge, MetricCard, MetricGrid, DataTable, Field } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";

export function AntiLibraryPage() {
  const { navigate } = usePipeline();
  const [entries, setEntries] = useState(() => ensureSeeded());
  const [form, setForm] = useState({ conceptId: "", label: "", reason: "", namePattern: "", strategyIds: "" });
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(() => setEntries(ensureSeeded()), []);

  const lib = useMemo(() => buildStrategyLibrary(), []);
  const blockedIds = useMemo(() => blockedStrategyIds(lib, entries), [lib, entries]);

  const flash = (text, isErr = false) => {
    if (isErr) {
      setError(text);
      setMsg("");
    } else {
      setMsg(text);
      setError(null);
    }
    setTimeout(() => {
      setMsg("");
      setError(null);
    }, 3500);
  };

  const onPush = async () => {
    try {
      const res = await pushAntiLibraryToApi();
      flash(`✓ Push API : ${res.written ?? 0} concept(s)`);
    } catch (e) {
      flash(String(e.message || e), true);
    }
  };

  const onPull = async () => {
    try {
      const { added, updated } = await pullAntiLibraryFromApi();
      refresh();
      flash(`✓ Pull API : +${added} · ~${updated}`);
    } catch (e) {
      flash(String(e.message || e), true);
    }
  };

  const onAdd = () => {
    setError(null);
    try {
      const ids = form.strategyIds
        .split(/[,;\s]+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      addAntiEntry({
        conceptId: form.conceptId,
        label: form.label,
        reason: form.reason,
        namePattern: form.namePattern,
        strategyIds: ids,
      });
      setForm({ conceptId: "", label: "", reason: "", namePattern: "", strategyIds: "" });
      refresh();
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const onRemove = (id) => {
    removeAntiEntry(id);
    refresh();
  };

  const onReset = () => {
    clearAntiLibrary({ keepSeeded: true });
    refresh();
  };

  const columns = [
    { key: "label", label: "Concept", render: (r) => (
      <span>
        {r.label}{" "}
        {r.seeded && <Badge color={T.blue}>seed</Badge>}
      </span>
    ) },
    { key: "conceptId", label: "ID", render: (r) => <span style={{ fontFamily: T.mono, fontSize: 11 }}>{r.conceptId}</span> },
    { key: "reason", label: "Raison", render: (r) => <span style={{ color: T.textDim, fontSize: 11 }}>{r.reason || "—"}</span> },
    { key: "namePattern", label: "Pattern nom", render: (r) => r.namePattern ? <code style={{ fontSize: 10 }}>{r.namePattern}</code> : "—" },
    { key: "ids", label: "IDs", render: (r) => r.strategyIds.length ? r.strategyIds.join(", ") : "—" },
    { key: "act", label: "", render: (r) => (
      <Button onClick={() => onRemove(r.id)} style={{ fontSize: 11, padding: "2px 8px" }}>Retirer</Button>
    ) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Anti-Library — concepts involutifs</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.5 }}>
          Bloque le re-screening / re-optimisation de familles qui échouent systématiquement
          (Z-Score MR, Bollinger MR, TRIX, Lotka-Volterra, résonance stochastique…).
          Appliqué automatiquement dans l'<b style={{ color: T.orange }}>Usine</b> et le <b style={{ color: T.orange }}>FAO</b>.
          Sync ZDL optionnelle : <code style={{ color: T.orange }}>/v1/anti-library</code>.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <Button onClick={() => navigate("dataManager")}>API</Button>
          <Button primary onClick={onPush} title={!isAntiApiConfigured() ? "Configure API d'abord" : ""}>
            ↑ Push Timescale
          </Button>
          <Button primary onClick={onPull}>↓ Pull Timescale</Button>
        </div>
        {(msg || error) && (
          <div style={{ marginTop: 8, fontSize: 12, color: error ? T.red : T.green }}>{error || msg}</div>
        )}
      </Panel>

      <MetricGrid min={140}>
        <MetricCard label="Entrées" value={entries.length} color={T.orange} />
        <MetricCard label="Seeds" value={SEED_CONCEPTS.length} />
        <MetricCard label="Stratégies bloquées" value={blockedIds.length} color={T.red} hint="sur la librairie courante" />
      </MetricGrid>

      <Panel title="Registre" right={<Button onClick={onReset}>Reset (garder seeds)</Button>}>
        <DataTable columns={columns} rows={entries} maxHeight={360} />
      </Panel>

      <Panel title="Ajouter un concept">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="conceptId *">
            <input
              value={form.conceptId}
              onChange={(e) => setForm((f) => ({ ...f, conceptId: e.target.value }))}
              placeholder="ex: my_concept"
              style={inp}
            />
          </Field>
          <Field label="Label">
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Nom affiché"
              style={inp}
            />
          </Field>
          <Field label="Raison">
            <input
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Pourquoi bloquer"
              style={inp}
            />
          </Field>
          <Field label="Regex sur le nom">
            <input
              value={form.namePattern}
              onChange={(e) => setForm((f) => ({ ...f, namePattern: e.target.value }))}
              placeholder="ex: \\bmacd\\b"
              style={inp}
            />
          </Field>
          <Field label="IDs stratégie (virgules)">
            <input
              value={form.strategyIds}
              onChange={(e) => setForm((f) => ({ ...f, strategyIds: e.target.value }))}
              placeholder="17, 22, 50"
              style={inp}
            />
          </Field>
        </div>
        {error && <div style={{ marginTop: 10, color: T.red, fontSize: 12 }}>{error}</div>}
        <Button primary onClick={onAdd} style={{ marginTop: 12 }}>Ajouter</Button>
      </Panel>
    </div>
  );
}

const inp = {
  width: "100%",
  background: T.bg0,
  border: `1px solid ${T.border}`,
  color: T.text,
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 12,
  boxSizing: "border-box",
};
