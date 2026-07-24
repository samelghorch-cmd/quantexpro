// Alpha Forge — hub Validated Edges (P4-AF).
// Registre des edges GO (lettres A–C) promus depuis les dossiers Reco Finale.
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { listDossiers } from "../../engine/dossierStore.js";
import {
  loadValidatedEdges,
  listActiveEdges,
  listRetiredEdges,
  promoteFromDossier,
  retireEdge,
  removeEdge,
  isEligibleDossier,
  edgesToCsv,
} from "../../engine/validatedEdges.js";
import { Panel, Button, Badge, MetricCard, MetricGrid, DataTable, fmt } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";

function letterColor(letter) {
  if (letter === "A") return T.green;
  if (letter === "B") return T.orange;
  if (letter === "C") return T.blue || T.text;
  return T.textDim;
}

function downloadCsv(csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quantexpro-validated-edges-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AlphaForgePage() {
  const { navigate } = usePipeline();
  const [edges, setEdges] = useState(() => loadValidatedEdges());
  const [dossiers, setDossiers] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(null);
  const [showRetired, setShowRetired] = useState(false);

  const refresh = useCallback(() => {
    setEdges(loadValidatedEdges());
  }, []);

  const loadDossiers = useCallback(async () => {
    const all = await listDossiers().catch(() => []);
    setDossiers(all);
  }, []);

  useEffect(() => {
    loadDossiers();
  }, [loadDossiers]);

  const active = useMemo(() => listActiveEdges(edges), [edges]);
  const retired = useMemo(() => listRetiredEdges(edges), [edges]);
  const eligible = useMemo(
    () => dossiers.filter((d) => isEligibleDossier(d).ok),
    [dossiers],
  );

  const flash = (text, isErr = false) => {
    if (isErr) {
      setErr(text);
      setMsg("");
    } else {
      setMsg(text);
      setErr(null);
    }
    setTimeout(() => {
      setMsg("");
      setErr(null);
    }, 3500);
  };

  const onPromote = (d) => {
    try {
      const { created, entry } = promoteFromDossier(d);
      refresh();
      flash(created ? `✓ Edge promu : ${entry.name}` : `✓ Edge mis à jour : ${entry.name}`);
    } catch (e) {
      flash(String(e.message || e), true);
    }
  };

  const onPromoteAll = () => {
    let n = 0;
    for (const d of eligible) {
      try {
        promoteFromDossier(d);
        n++;
      } catch {
        /* skip */
      }
    }
    refresh();
    flash(`✓ ${n} edge(s) promu(s) / mis à jour`);
  };

  const edgeCols = [
    {
      key: "letter",
      label: "Note",
      render: (r) => (
        <span style={{ fontFamily: T.mono, fontWeight: 800, color: letterColor(r.letter) }}>{r.letter}</span>
      ),
    },
    {
      key: "name",
      label: "Edge",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: 10, color: T.textFaint }}>
            #{r.strategyId ?? "—"} · {r.symbol || "—"} · {r.tf || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "score",
      label: "Score",
      align: "right",
      render: (r) => fmt(r.score, 0),
    },
    {
      key: "sharpe",
      label: "Sharpe",
      align: "right",
      render: (r) => (r.metrics?.sharpe != null ? fmt(r.metrics.sharpe, 2) : "—"),
    },
    {
      key: "pf",
      label: "PF",
      align: "right",
      render: (r) => (r.metrics?.profitFactor != null ? fmt(r.metrics.profitFactor, 2) : "—"),
    },
    {
      key: "dd",
      label: "Max DD",
      align: "right",
      render: (r) => (r.metrics?.maxDd != null ? fmt(r.metrics.maxDd, 2) : "—"),
    },
    {
      key: "verdict",
      label: "Verdict",
      render: (r) => <Badge color={T.green}>{r.verdict}</Badge>,
    },
    {
      key: "act",
      label: "",
      render: (r) => (
        <div style={{ display: "flex", gap: 6 }}>
          {r.status === "active" ? (
            <Button onClick={() => { retireEdge(r.id); refresh(); }} style={{ fontSize: 11, padding: "2px 8px" }}>
              Retirer
            </Button>
          ) : (
            <Button onClick={() => { removeEdge(r.id); refresh(); }} style={{ fontSize: 11, padding: "2px 8px" }}>
              Supprimer
            </Button>
          )}
        </div>
      ),
    },
  ];

  const dossierCols = [
    { key: "name", label: "Dossier", render: (r) => r.name },
    {
      key: "letter",
      label: "Note",
      render: (r) => (
        <span style={{ fontFamily: T.mono, fontWeight: 800, color: letterColor(r.grade?.letter) }}>
          {r.grade?.letter}
        </span>
      ),
    },
    {
      key: "score",
      label: "Score",
      align: "right",
      render: (r) => fmt(r.grade?.score, 0),
    },
    {
      key: "meta",
      label: "Actif",
      render: (r) => `${r.symbol || "—"} · ${r.tf || "—"} · #${r.strategyId ?? "—"}`,
    },
    {
      key: "act",
      label: "",
      render: (r) => (
        <Button primary onClick={() => onPromote(r)} style={{ fontSize: 11, padding: "2px 10px" }}>
          Promouvoir
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Alpha Forge — Validated Edges</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.55, maxWidth: 760 }}>
          Registre des edges validés (Reco Finale <b style={{ color: T.green }}>GO</b>, lettres{" "}
          <b style={{ color: T.orange }}>A–C</b>). Complément de l’Anti-Library : ici on archive ce qui passe ;
          là-bas on bloque les concepts involutifs. Pipeline typique : Usine → FAO → Validator → Reco → promote.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <Button onClick={() => navigate("factory")}>⚡ Usine</Button>
          <Button onClick={() => navigate("fao")}>FAO</Button>
          <Button onClick={() => navigate("validator")}>Validator</Button>
          <Button onClick={() => navigate("recoFinale")}>Reco Finale</Button>
          <Button onClick={() => navigate("antiLibrary")}>🚫 Anti-Library</Button>
          <Button onClick={() => navigate("dossiers")}>📁 Dossiers</Button>
        </div>
      </Panel>

      <MetricGrid min={120}>
        <MetricCard label="Edges actifs" value={active.length} color={T.orange} />
        <MetricCard label="Retirés" value={retired.length} />
        <MetricCard label="Dossiers GO éligibles" value={eligible.length} color={T.green} />
        <MetricCard label="Dossiers totaux" value={dossiers.length} />
      </MetricGrid>

      {(msg || err) && (
        <div style={{ fontSize: 12, color: err ? T.red : T.green }}>{err || msg}</div>
      )}

      <Panel
        title={`Validated Edges (${active.length})`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => downloadCsv(edgesToCsv(edges))} disabled={!active.length}>
              Export CSV
            </Button>
            <Button onClick={() => setShowRetired((v) => !v)}>
              {showRetired ? "Masquer retirés" : `Retirés (${retired.length})`}
            </Button>
          </div>
        }
      >
        {active.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: T.textDim, fontSize: 12 }}>
            Aucun edge validé. Note un dossier en Reco Finale (GO · A–C) puis promeus-le ici ou depuis Dossiers.
          </div>
        ) : (
          <DataTable columns={edgeCols} rows={active} maxHeight={360} />
        )}
        {showRetired && retired.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: T.textDim }}>Retirés</div>
            <DataTable columns={edgeCols} rows={retired} maxHeight={200} />
          </div>
        )}
      </Panel>

      <Panel
        title={`Dossiers éligibles (${eligible.length})`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={loadDossiers}>Rafraîchir</Button>
            <Button primary onClick={onPromoteAll} disabled={!eligible.length}>
              Promouvoir tous
            </Button>
          </div>
        }
      >
        {eligible.length === 0 ? (
          <div style={{ padding: 16, color: T.textDim, fontSize: 12 }}>
            Aucun dossier GO A–C. Lance Backtest → FAO → Validator → Reco Finale, ou ouvre{" "}
            <button
              type="button"
              onClick={() => navigate("dossiers")}
              style={{ background: "none", border: "none", color: T.orange, cursor: "pointer", padding: 0 }}
            >
              Dossiers
            </button>
            .
          </div>
        ) : (
          <DataTable columns={dossierCols} rows={eligible} maxHeight={280} />
        )}
      </Panel>
    </div>
  );
}
