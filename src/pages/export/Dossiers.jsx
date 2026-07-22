// 📁 Dossiers de stratégie — la fiche COMPLÈTE du cycle de vie.
// Chaque dossier accumule, sans perte : les paramètres saisis, le résultat de chaque outil
// (backtest/FAO/Validator/Reco…), la note figée (Reco Finale + lettre A-F), et les sessions de démo.
// Le dossier « actif » reçoit automatiquement le résultat de chaque outil lancé.
import { useState, useEffect, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { listDossiers, getDossier, deleteDossier, clearDossiers, createDossier, updateDossier, upsertDemoSession } from "../../engine/dossierStore.js";
import { getCollectorUrl, setCollectorUrl, collectorHealth, listJobs, createJob, getJob, deleteJob } from "../../engine/collectorClient.js";
import { downloadJSON } from "../../engine/exportUtils.js";
import { Panel, Button, Badge, Select, MetricCard, MetricGrid, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { T, verdictColor } from "../../components/shared/theme.js";

const gradeColor = (letter) => ({ A: T.green, B: T.green, C: T.yellow, D: T.orange, E: T.red, F: T.red }[letter] || T.textDim);

// Résumé compact d'une étape selon son type.
function StageSummary({ k, s }) {
  const line = (label, val, color) => <span style={{ color: color || T.textDim }}>{label} <b style={{ color: color || T.text }}>{val}</b></span>;
  const items = [];
  if (k === "backtest" && s.res) {
    items.push(line("Trades", s.res.nTrades), line("WR", fmtPct(s.res.winRate)), line("PF", fmt(s.res.profitFactor)),
      line("Exp.R", fmt(s.res.expectancyR)), line("Sharpe", fmt(s.res.sharpe)), line("Score", fmt(s.score, 0)),
      line("PnL", fmtUsd(s.res.totalPnL), s.res.totalPnL >= 0 ? T.green : T.red));
  } else if (k === "fao") {
    items.push(line("Essais", s.attempts), line("Retenus", s.combos?.length ?? "—"),
      line("Best Exp.R", fmt(s.best?.expectancyR)), line("Best PF", fmt(s.best?.profitFactor)));
  } else if (k === "validator") {
    items.push(<Badge color={verdictColor(s.verdict)}>{s.verdict}</Badge>,
      ...(s.gates || []).map((g, i) => <Badge key={i} color={verdictColor(g.verdict)}>{g.name}: {g.verdict}</Badge>));
  } else if (k === "reco") {
    items.push(<Badge color={verdictColor(s.verdict)}>{s.verdict}</Badge>, line("Score", fmt(s.finalScore, 0)), line("Essais", s.nTrials));
  } else if (k === "postFao") {
    items.push(line("Top", s.ranked?.length ?? "—"), line("Best score", fmt(s.best?.score100, 0)), line("PF", fmt(s.best?.profitFactor)));
  } else if (k === "quantOpt") {
    items.push(line("Essais TPE", s.nTrials), line("Rejetés", s.rejected), line("Score Quant", fmt(s.best?.score, 0)));
  } else {
    items.push(line("—", ""));
  }
  return <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, fontFamily: T.mono, alignItems: "center" }}>{items.map((it, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>{it}</span>)}</div>;
}

const STAGE_LABELS = { backtest: "Backtest", fao: "Full Auto Optim", postFao: "Post-FAO", quantOpt: "Quant Optimizer", validator: "Validator", reco: "Reco Finale", geneticOptim: "Optim Génétique" };

const TICKERS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
const INTERVALS = ["5m", "15m", "1h", "4h", "1d"];

// Panneau 24/7 : lance la stratégie du dossier sur le collecteur cloud et synchronise la data collectée.
function Cloud24Panel({ d, refresh }) {
  const [url, setUrl] = useState(getCollectorUrl() || "http://localhost:8787");
  const [health, setHealth] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [ticker, setTicker] = useState("BTCUSDT");
  const [interval, setIntervalV] = useState("1h");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const probe = useCallback(async () => {
    if (!getCollectorUrl()) { setHealth(null); setJobs([]); return; }
    try { setHealth(await collectorHealth()); setJobs(await listJobs()); }
    catch (e) { setHealth({ error: String(e.message || e) }); setJobs([]); }
  }, []);
  useEffect(() => { probe(); }, [probe]);

  const job = jobs.find((j) => j.id === d.cloudJobId);

  const launch = async () => {
    setBusy(true); setMsg("");
    try {
      const j = await createJob({ name: d.name, strategyId: d.strategyId, ticker, interval, params: d.params });
      await updateDossier(d.id, { cloudJobId: j.id });
      setMsg("✓ Lancé en 24/7"); await probe(); await refresh();
    } catch (e) { setMsg("⚠️ " + (e.message || e)); }
    setBusy(false);
  };
  const sync = async () => {
    setBusy(true); setMsg("");
    try {
      const full = await getJob(d.cloudJobId);
      const r = full.result || {};
      await upsertDemoSession(d.id, { id: `cloud-${d.cloudJobId}`, source: "24/7", startedAt: full.createdAt, symbol: full.ticker, tf: full.interval,
        snapshots: (r.equityCurve || []).map((e, i) => ({ i, equity: e })), trades: r.trades || [],
        finalMetrics: { sessionPnL: r.totalPnL, totalPnL: r.totalPnL, nTrades: r.nTrades, winRate: r.winRate, profitFactor: r.profitFactor, sharpe: r.sharpe } });
      setMsg(`✓ Synchronisé (${(r.trades || []).length} trades · ${(r.equityCurve || []).length} pts)`); await refresh();
    } catch (e) { setMsg("⚠️ " + (e.message || e)); }
    setBusy(false);
  };
  const stop = async () => {
    setBusy(true); setMsg("");
    try { await deleteJob(d.cloudJobId); } catch { /* déjà arrêté */ }
    await updateDossier(d.id, { cloudJobId: null });
    await probe(); await refresh(); setBusy(false);
  };

  return (
    <Panel title="24/7 Cloud — collecte permanente (démo réelle)" right={health && !health.error ? <Badge color={T.green}>● connecté</Badge> : <Badge color={T.textFaint}>○ non connecté</Badge>}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…up.railway.app" style={{ flex: 1, minWidth: 220, background: T.bg0, color: T.text, border: `1px solid ${T.border}`, padding: "7px 9px", borderRadius: 6, fontSize: 12 }} />
        <Button onClick={() => { setCollectorUrl(url); probe(); }}>Enregistrer & tester</Button>
      </div>
      {health?.error && <div style={{ fontSize: 11, color: T.red, marginBottom: 8 }}>⚠️ {health.error}</div>}
      {!getCollectorUrl() ? (
        <div style={{ fontSize: 11.5, color: T.textFaint, lineHeight: 1.6 }}>Déploie le collecteur (voir <code style={{ color: T.orange }}>collector/README.md</code> — Railway), puis colle son URL ici. Il fera tourner la stratégie de ce dossier <b>en continu, même app fermée</b> ; récupère la data avec « Synchroniser ».</div>
      ) : !job ? (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>PAIRE (Binance)</div><Select value={ticker} onChange={setTicker} options={TICKERS} /></div>
          <div><div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>TIMEFRAME</div><Select value={interval} onChange={setIntervalV} options={INTERVALS} /></div>
          <Button primary onClick={launch} disabled={busy || d.strategyId == null}>{busy ? "…" : "🚀 Lancer en 24/7"}</Button>
          {d.strategyId == null && <span style={{ fontSize: 10.5, color: T.textFaint }}>Ce dossier n'a pas de stratégie — lance d'abord un backtest.</span>}
        </div>
      ) : (
        <div>
          <MetricGrid min={120}>
            <MetricCard label="Job" value={job.name} sub={`${job.ticker} · ${job.interval}`} />
            <MetricCard label="Collectes" value={job.polls} sub={`${job.bars} bougies`} />
            <MetricCard label="Trades" value={job.metrics?.nTrades ?? "—"} />
            <MetricCard label="PnL démo" value={fmtUsd(job.metrics?.totalPnL ?? 0)} color={(job.metrics?.totalPnL ?? 0) >= 0 ? T.green : T.red} />
            <MetricCard label="Sharpe" value={fmt(job.metrics?.sharpe)} />
            <MetricCard label="Mise à jour" value={job.updatedAt ? new Date(job.updatedAt).toLocaleTimeString("fr-FR") : "—"} />
          </MetricGrid>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button primary onClick={sync} disabled={busy}>{busy ? "…" : "⤓ Synchroniser dans le dossier"}</Button>
            <Button onClick={stop} disabled={busy}>⏹ Arrêter</Button>
          </div>
          {job.lastError && <div style={{ fontSize: 10.5, color: T.red, marginTop: 6 }}>⚠️ {job.lastError}</div>}
        </div>
      )}
      {msg && <div style={{ fontSize: 11, color: msg.startsWith("✓") ? T.green : T.red, marginTop: 8 }}>{msg}</div>}
      <div style={{ marginTop: 8, fontSize: 10, color: T.textFaint }}>Aucun ordre réel, aucune clé — klines publiques Binance, 100 % paper-trading.</div>
    </Panel>
  );
}

export function DossiersPage() {
  const { activeDossierId, setActiveDossier } = usePipeline();
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(null);

  const refresh = useCallback(async () => {
    const all = await listDossiers().catch(() => []);
    setRows(all);
    if (all.length && !all.find((d) => d.id === sel?.id)) setSel(all[0]);
    else if (sel) setSel(all.find((d) => d.id === sel.id) || null);
  }, [sel]);
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const openDossier = async (id) => setSel(await getDossier(id));
  const newDossier = async () => { const d = await createDossier({ name: `Dossier ${new Date().toLocaleString("fr-FR")}` }); setActiveDossier(d.id); await refresh(); setSel(d); };
  const remove = async (id) => { await deleteDossier(id); if (activeDossierId === id) setActiveDossier(null); await refresh(); };
  const wipe = async () => { await clearDossiers(); setActiveDossier(null); setSel(null); setRows([]); };

  const d = sel;
  const stages = d ? Object.entries(d.stages || {}) : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      {/* Liste des dossiers */}
      <Panel title={`Dossiers (${rows.length})`} right={<Button onClick={newDossier}>+ Nouveau</Button>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 520, overflow: "auto" }}>
          {rows.length === 0 && <div style={{ fontSize: 11.5, color: T.textFaint, padding: "16px 4px", lineHeight: 1.6 }}>Aucun dossier. Lance un Backtest : un dossier est créé automatiquement et reçoit le résultat de chaque outil.</div>}
          {rows.map((r) => {
            const active = r.id === activeDossierId, selected = r.id === d?.id;
            return (
              <div key={r.id} onClick={() => openDossier(r.id)} style={{ cursor: "pointer", padding: "9px 11px", borderRadius: 8, border: `1px solid ${selected ? T.orange : T.border}`, background: selected ? T.orangeSoft : T.panelAlt }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  {r.grade?.letter && <span style={{ fontFamily: T.mono, fontWeight: 800, color: gradeColor(r.grade.letter) }}>{r.grade.letter}</span>}
                </div>
                <div style={{ fontSize: 10, color: T.textFaint, marginTop: 3, display: "flex", gap: 8 }}>
                  {active && <span style={{ color: T.green }}>● active</span>}
                  <span>{(r.toolsApplied || []).length} outils</span>
                  <span>{new Date(r.updatedAt).toLocaleDateString("fr-FR")}</span>
                </div>
              </div>
            );
          })}
        </div>
        {rows.length > 0 && <div style={{ marginTop: 10 }}><Button onClick={wipe}>🗑 Tout vider</Button></div>}
      </Panel>

      {/* Détail du dossier */}
      {!d ? (
        <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Sélectionne un dossier, ou lance un Backtest pour en créer un.</div></Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 3 }}>
                  #{d.strategyId ?? "—"} · {d.symbol || "—"} · créé le {new Date(d.createdAt).toLocaleString("fr-FR")}
                  {d.id === activeDossierId ? <span style={{ color: T.green }}> · ● dossier actif</span> : null}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {d.grade ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${gradeColor(d.grade.letter)}`, borderRadius: 10, padding: "6px 14px" }}>
                    <span style={{ fontSize: 30, fontWeight: 800, fontFamily: T.mono, color: gradeColor(d.grade.letter) }}>{d.grade.letter}</span>
                    <div style={{ fontSize: 11 }}><Badge color={verdictColor(d.grade.verdict)}>{d.grade.verdict}</Badge><div style={{ color: T.textDim, marginTop: 3 }}>score {fmt(d.grade.score, 0)}</div></div>
                  </div>
                ) : <Badge color={T.textFaint}>non noté — lance la Reco Finale</Badge>}
                {d.id !== activeDossierId && <Button primary onClick={() => setActiveDossier(d.id)}>Définir comme actif</Button>}
                <Button onClick={() => downloadJSON(d, `dossier_${d.name.replace(/\W+/g, "_")}.json`)}>⬇ Export complet</Button>
                <span onClick={() => remove(d.id)} title="Supprimer" style={{ cursor: "pointer", color: T.red, fontSize: 16 }}>✕</span>
              </div>
            </div>
          </Panel>

          <Panel title="Paramètres saisis">
            {Object.keys(d.params || {}).length === 0 ? <div style={{ fontSize: 12, color: T.textFaint }}>—</div> : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontFamily: T.mono, fontSize: 12 }}>
                {Object.entries(d.params).map(([k, v]) => <span key={k} style={{ border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 9px" }}>{k} <b style={{ color: T.orange }}>{String(v)}</b></span>)}
              </div>
            )}
          </Panel>

          <Panel title="Outils appliqués" right={<span style={{ fontSize: 11, color: T.textDim }}>{(d.toolsApplied || []).length} / pipeline</span>}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(d.toolsApplied || []).length === 0 ? <span style={{ fontSize: 12, color: T.textFaint }}>Aucun encore — lance un outil sur ce dossier (il doit être actif).</span>
                : (d.toolsApplied || []).map((t) => <Badge key={t} color={T.blue}>{t}</Badge>)}
            </div>
          </Panel>

          <Panel title="Étapes du cycle (résultats complets conservés)">
            {stages.length === 0 ? <div style={{ fontSize: 12, color: T.textFaint }}>Aucune étape. Backtest → FAO → Validator → Reco Finale : chaque résultat se rattache ici automatiquement.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {stages.map(([k, s]) => (
                  <div key={k} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", background: T.panelAlt }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <b style={{ fontSize: 12.5 }}>{STAGE_LABELS[k] || k}</b>
                      <span style={{ fontSize: 10, color: T.textFaint }}>{s.ranAt ? new Date(s.ranAt).toLocaleString("fr-FR") : ""}</span>
                    </div>
                    <StageSummary k={k} s={s} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`Sessions de démo live (${(d.demoSessions || []).length})`}>
            {(d.demoSessions || []).length === 0 ? <div style={{ fontSize: 12, color: T.textFaint }}>Aucune session. Lance un Forward Test (démo réel) : la data collectée s'accumule ici.</div> : (
              <MetricGrid min={140}>
                {(d.demoSessions || []).map((se, i) => (
                  <MetricCard key={se.id || i} label={`Session ${i + 1} · ${new Date(se.startedAt).toLocaleDateString("fr-FR")}`}
                    value={fmtUsd(se.finalMetrics?.sessionPnL ?? se.finalMetrics?.totalPnL ?? 0)}
                    sub={`${(se.trades || []).length} trades · ${(se.snapshots || []).length} snapshots`}
                    color={(se.finalMetrics?.sessionPnL ?? 0) >= 0 ? T.green : T.red} />
                ))}
              </MetricGrid>
            )}
          </Panel>

          <Cloud24Panel d={d} refresh={refresh} />
        </div>
      )}
    </div>
  );
}
