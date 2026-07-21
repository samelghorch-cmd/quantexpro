// Data Manager — pré-télécharge un univers d'actifs dans IndexedDB (gros stockage, hors-ligne),
// affiche la santé des données en cache, et permet de rafraîchir / supprimer.
// Une fois l'univers téléchargé, l'Usine à Stratégies tourne instantanément dessus.
import { useState, useEffect, useCallback } from "react";
import { usePersistentState } from "../../state/PipelineContext.jsx";
import { ASSET_CLASSES, TF_MAP, fetchCandles, importSeries, listCachedSeries, deleteCachedSeries, clearMarketCache, storageEstimate } from "../../engine/marketData.js";
import { Panel, Button, Badge, MetricCard, MetricGrid, DataTable, ProgressBar, fmt, fmtInt } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";

const TF_OPTS = [{ v: 3, l: "15m" }, { v: 12, l: "1h" }, { v: 48, l: "4h" }, { v: 288, l: "1j" }];
const fmtBytes = (b) => b > 1e6 ? `${(b / 1e6).toFixed(1)} Mo` : b > 1e3 ? `${(b / 1e3).toFixed(0)} Ko` : `${b} o`;
const fmtDate = (t) => t ? new Date(t).toISOString().slice(0, 10) : "—";

export function DataManagerPage() {
  const [assets, setAssets] = usePersistentState("datamgr:assets", ["BTC", "ETH", "SPX", "NDX", "EURUSD", "GBPUSD", "GOLD", "WTI"]);
  const [tfs, setTfs] = usePersistentState("datamgr:tfs", [12, 48, 288]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [cached, setCached] = useState([]);
  const [estimate, setEstimate] = useState(null);

  const refresh = useCallback(async () => {
    setCached(await listCachedSeries());
    setEstimate(await storageEstimate());
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toggleAsset = (k) => setAssets((a) => a.includes(k) ? a.filter((x) => x !== k) : [...a, k]);
  const toggleTf = (v) => setTfs((t) => t.includes(v) ? t.filter((x) => x !== v) : [...t, v]);

  const download = useCallback(async (force) => {
    const jobs = [];
    assets.forEach((a) => tfs.forEach((tf) => jobs.push({ a, tf })));
    if (jobs.length === 0) return;
    setRunning(true);
    let done = 0, ok = 0, fail = 0;
    // concurrence limitée (Yahoo)
    const CONC = 4; let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const { a, tf } = jobs[cursor++];
        setProgress({ label: `${a} ${TF_MAP[tf].label}`, pct: (done / jobs.length) * 100 });
        try { const { bars } = await fetchCandles(a, tf, { force }); if (bars.length) ok++; else fail++; }
        catch { fail++; }
        done++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, worker));
    setProgress(null); setRunning(false);
    await refresh();
    setProgress({ done: true, label: `${ok} séries chargées, ${fail} échecs`, pct: 100 });
    setTimeout(() => setProgress(null), 4000);
  }, [assets, tfs, refresh]);

  const removeOne = async (id) => { await deleteCachedSeries(id); await refresh(); };
  const clearAll = async () => { await clearMarketCache(); await refresh(); };

  // Import de séries profondes Dukascopy (JSON produit par tools/dukascopy) — 15-20 ans d'historique.
  const [importMsg, setImportMsg] = useState(null);
  const onImportFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg({ label: `Import de ${file.name}…` });
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : [data]; // 1 série ou tableau de séries
      let ok = 0, fail = 0;
      for (const s of list) {
        try { await importSeries(s.symbolKey, s.tf, s.bars, { provider: s.provider || "dukascopy" }); ok++; }
        catch { fail++; }
      }
      await refresh();
      setImportMsg({ done: true, label: `${ok} série(s) importée(s)${fail ? `, ${fail} échec(s)` : ""}` });
    } catch (err) {
      setImportMsg({ done: true, label: `Échec import : ${err.message}` });
    }
    e.target.value = "";
    setTimeout(() => setImportMsg(null), 5000);
  }, [refresh]);

  const totalBars = cached.reduce((s, c) => s + (c.bars || 0), 0);
  const totalBytes = cached.reduce((s, c) => s + (c.bytes || 0), 0);
  const avgHealth = cached.length ? Math.round(cached.reduce((s, c) => s + (c.health || 0), 0) / cached.length) : 0;

  const columns = [
    { key: "label", label: "Actif", render: (r) => <span style={{ color: T.text }}>{r.label || r.id}</span> },
    { key: "class", label: "Classe", render: (r) => <Badge color={T.blue}>{r.classLabel || "—"}</Badge> },
    { key: "tf", label: "TF", render: (r) => TF_MAP[r.tf]?.label || r.tf },
    { key: "bars", label: "Bougies", align: "right", render: (r) => fmtInt(r.bars) },
    { key: "span", label: "Période", render: (r) => r.span ? `${fmtDate(r.span[0])} → ${fmtDate(r.span[1])}` : "—" },
    { key: "health", label: "Santé", align: "right", render: (r) => `${fmt(r.health || 0, 0)}%`, color: (r) => (r.health || 0) >= 90 ? T.green : (r.health || 0) >= 70 ? T.yellow : T.red },
    { key: "gaps", label: "Gaps", align: "right", render: (r) => fmtInt(r.gaps || 0) },
    { key: "size", label: "Taille", align: "right", render: (r) => fmtBytes(r.bytes || 0) },
    { key: "age", label: "Âge", render: (r) => r.ts ? `${Math.round((Date.now() - r.ts) / 36e5)}h` : "—" },
    { key: "del", label: "", render: (r) => <span onClick={() => removeOne(r.id)} style={{ cursor: "pointer", color: T.red, fontSize: 14 }} title="Supprimer">✕</span> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>🗄️ Data Manager — stockage local des données réelles</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 3, lineHeight: 1.5 }}>
          Pré-télécharge un univers d'actifs dans <b>IndexedDB</b> (bien plus large que le cache navigateur classique). Ensuite, l'Usine à Stratégies et les backtests tournent <b style={{ color: T.orange }}>instantanément et hors-ligne</b> sur ces données propres.
        </div>
      </Panel>

      <Panel title="Univers à télécharger">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Actifs</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ASSET_CLASSES.flatMap((c) => c.symbols).map((s) => {
              const on = assets.includes(s.key);
              return <span key={s.key} onClick={() => toggleAsset(s.key)} style={{ cursor: "pointer", fontSize: 11, padding: "4px 9px", borderRadius: 6, border: `1px solid ${on ? T.orange : T.border}`, color: on ? T.orange : T.textDim, background: on ? T.orangeSoft : "transparent" }}>{s.label}</span>;
            })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Timeframes</div>
          <div style={{ display: "flex", gap: 6 }}>
            {TF_OPTS.map((t) => {
              const on = tfs.includes(t.v);
              return <span key={t.v} onClick={() => toggleTf(t.v)} style={{ cursor: "pointer", fontSize: 12, padding: "4px 12px", borderRadius: 6, border: `1px solid ${on ? T.orange : T.border}`, color: on ? T.orange : T.textDim, background: on ? T.orangeSoft : "transparent" }}>{t.l}</span>;
            })}
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Button primary onClick={() => download(false)} disabled={running}>{running ? "⏳ Téléchargement…" : `⬇ Télécharger (${assets.length * tfs.length} séries)`}</Button>
          <Button onClick={() => download(true)} disabled={running}>↻ Tout rafraîchir</Button>
          <label style={{ cursor: "pointer", fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, color: T.text, background: "transparent" }}>
            📥 Importer JSON (Dukascopy 15-20 ans)
            <input type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: "none" }} />
          </label>
          <span style={{ fontSize: 11, color: T.textFaint }}>Réutilise le cache existant sauf « Tout rafraîchir »</span>
        </div>
        {importMsg && <div style={{ marginTop: 8, fontSize: 11, color: importMsg.done ? T.green : T.textDim }}>{importMsg.label}</div>}
        {progress && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: progress.done ? T.green : T.textDim, marginBottom: 4 }}>{progress.label}</div>
            {!progress.done && <ProgressBar pct={progress.pct} />}
          </div>
        )}
      </Panel>

      <Panel title={`Données en cache (${cached.length} séries)`} right={cached.length > 0 && <Button onClick={clearAll}>🗑 Vider tout</Button>}>
        <MetricGrid min={150}>
          <MetricCard label="Séries" value={cached.length} color={T.orange} />
          <MetricCard label="Bougies totales" value={fmtInt(totalBars)} />
          <MetricCard label="Santé moyenne" value={`${avgHealth}%`} color={avgHealth >= 90 ? T.green : avgHealth >= 70 ? T.yellow : T.red} />
          <MetricCard label="Taille données" value={fmtBytes(totalBytes)} />
          {estimate && <MetricCard label="Stockage utilisé" value={fmtBytes(estimate.usage)} sub={estimate.quota ? `sur ${fmtBytes(estimate.quota)} dispo` : ""} />}
        </MetricGrid>
        <div style={{ marginTop: 12 }}>
          {cached.length === 0
            ? <div style={{ fontSize: 12, color: T.textFaint, padding: "20px 0", textAlign: "center" }}>Aucune donnée en cache. Télécharge un univers ci-dessus.</div>
            : <DataTable columns={columns} rows={cached} maxHeight={400} />}
        </div>
      </Panel>
    </div>
  );
}
