// Usine à Stratégies — orchestrateur « 1 bouton » : screening → refine → portefeuille corrélé,
// résultats PERSISTANTS (survivent au changement de page) + enchaînement vers l'étape suivante.
import { useState, useCallback, useMemo } from "react";
import { usePipeline, usePersistentState } from "../../state/PipelineContext.jsx";
import { runFactory, coveredSpace, FACTORY_DEFAULT_ASSETS, FACTORY_DEFAULT_TFS } from "../../engine/strategyFactory.ts";
import { ASSET_CLASSES } from "../../engine/marketData.ts";
import { CATS } from "../../engine/strategyLibrary.ts";
import { downloadJSON } from "../../engine/exportUtils.ts";
import { EquityChart } from "../../components/charts/EquityChart.jsx";
import { Panel, Button, Badge, MetricCard, MetricGrid, DataTable, ProgressBar, ScoreGauge, fmt, fmtPct, fmtUsd, fmtInt } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";
import { STRESS_MAX_DD_LIMIT } from "../../engine/portfolioStress.ts";

const TF_OPTS = [{ v: 12, l: "1h" }, { v: 48, l: "4h" }, { v: 288, l: "1j" }, { v: 3, l: "15m" }];

export function StrategyFactoryPage() {
  const { setPipe, log, navigate, setDataMode, setAssetKey, setTf } = usePipeline();
  // état PERSISTANT (magasin central) → conservé quand on quitte la page
  const [assets, setAssets] = usePersistentState("factory:assets", FACTORY_DEFAULT_ASSETS);
  const [tfs, setTfs] = usePersistentState("factory:tfs", FACTORY_DEFAULT_TFS);
  const [result, setResult] = usePersistentState("factory:result", null);
  const [selectedIdx, setSelectedIdx] = usePersistentState("factory:selIdx", 0);
  // état transitoire (UI uniquement)
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [stressIdx, setStressIdx] = useState(0);

  const space = useMemo(() => coveredSpace(assets.length, tfs.length), [assets, tfs]);
  const toggleAsset = (k) => setAssets((a) => a.includes(k) ? a.filter((x) => x !== k) : [...a, k]);
  const toggleTf = (v) => setTfs((t) => t.includes(v) ? t.filter((x) => x !== v) : [...t, v]);

  const launch = useCallback(async () => {
    if (assets.length === 0 || tfs.length === 0) return;
    setRunning(true); setError(null); setResult(null); setSelectedIdx(0); setStressIdx(0);
    setProgress({ phase: "fetch", label: "Démarrage…", pct: 0 });
    log("Usine", `Lancement : ${assets.length} actifs × ${tfs.length} TF × 700 stratégies`);
    try {
      const res = await runFactory({ assets, tfs, topK: 6 }, (p) => setProgress(p));
      setResult(res);
      const top = res.leaderboard[0];
      if (top) log("Usine", `Terminé : ${res.stats.nVariants} variantes · meilleure #${top.stratId} ${top.asset} ${top.tf} (score ${top.score.toFixed(0)})`);
    } catch (e) {
      setError(String(e.message || e));
      log("Usine", `Erreur : ${e.message || e}`, "error");
    } finally { setRunning(false); }
  }, [assets, tfs, setResult, setSelectedIdx, log]);

  // Envoie une variante vers l'étape suivante (charge le bon actif/TF + paramètres, puis navigue)
  const sendTo = useCallback((variant, target) => {
    if (!variant) return;
    const [aKey, tfStr] = variant.key.split(":");
    setDataMode("live"); setAssetKey(aKey); setTf(Number(tfStr));
    setPipe({ selectedStrategyId: variant.stratId, strategyParams: { ...variant.params, contract: "MES" } });
    log("Usine", `→ ${target} : #${variant.stratId} sur ${variant.asset} ${variant.tf}`);
    navigate(target);
  }, [setDataMode, setAssetKey, setTf, setPipe, log, navigate]);

  const selected = result?.leaderboard?.[selectedIdx] || result?.leaderboard?.[0] || null;

  const robustColor = (r) => r.robustness >= 70 ? T.green : r.robustness >= 40 ? T.yellow : T.red;
  const lbColumns = [
    { key: "rank", label: "#", render: (_, i) => i + 1 },
    { key: "score", label: "Score OOS", align: "right", render: (r) => fmt(r.score, 0), color: () => T.orange },
    { key: "name", label: "Stratégie", render: (r) => <span><span style={{ color: T.textFaint }}>#{r.stratId}</span> {r.name}</span> },
    { key: "cat", label: "Cat.", render: (r) => <Badge color={CATS[r.cat]?.color}>{CATS[r.cat]?.name}</Badge> },
    { key: "asset", label: "Actif", render: (r) => r.asset },
    { key: "tf", label: "TF", render: (r) => <Badge color={T.blue}>{r.tf}</Badge> },
    { key: "params", label: "SL/TP/BE/Dir", render: (r) => `${r.params.slAtr}/${r.params.tpAtr || "—"}/${r.params.beAtr || "—"}/${r.params.direction[0].toUpperCase()}` },
    { key: "robust", label: "Robust.", align: "right", render: (r) => r.oos ? `${fmt(r.robustness, 0)}%` : "—", color: robustColor },
    { key: "isoos", label: "Sharpe IS→OOS", align: "right", render: (r) => r.oos ? `${fmt(r.isMetrics.sharpe, 1)}→${fmt(r.metrics.sharpe, 1)}` : fmt(r.metrics.sharpe, 1), color: (r) => r.metrics.sharpe >= 1 ? T.green : T.textDim },
    { key: "dsr", label: "DSR", align: "right", render: (r) => r.dsr == null ? "—" : fmtPct(r.dsr * 100), color: (r) => r.dsr == null ? T.textFaint : r.dsr >= 0.9 ? T.green : r.dsr >= 0.5 ? T.yellow : T.red },
    { key: "pf", label: "PF", align: "right", render: (r) => fmt(r.metrics.profitFactor) },
    { key: "dd", label: "MaxDD", align: "right", render: (r) => fmtPct(r.metrics.maxDD * 100), color: () => T.red },
    { key: "pnl", label: "PnL OOS%", align: "right", render: (r) => fmtPct(r.metrics.totalPnLPct), color: (r) => r.metrics.totalPnLPct >= 0 ? T.green : T.red },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 28 }}>⚡</div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Usine à Stratégies — découverte automatique</div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 3, lineHeight: 1.5 }}>
              Un seul bouton. On teste <b style={{ color: T.orange }}>700 stratégies × {assets.length} actifs × {tfs.length} timeframes × 54 jeux de paramètres</b>,
              coûts par trade réels déduits. Optimisation sur <b>70% du passé</b>, puis <b style={{ color: T.green }}>validation sur 30% de données jamais vues (out-of-sample)</b> — on ne garde que ce qui tient. Enfin, <b style={{ color: T.orange }}>portefeuille décorrélé</b>.
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: T.textFaint }}>ESPACE COUVERT</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.orange, fontFamily: T.mono }}>{(space.total / 1e6).toFixed(1)} M</div>
            <div style={{ fontSize: 10, color: T.textFaint }}>configurations</div>
          </div>
        </div>
      </Panel>

      <Panel title="Périmètre de recherche">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Actifs (données réelles)</div>
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
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Button primary onClick={launch} disabled={running || assets.length === 0 || tfs.length === 0} style={{ fontSize: 14, padding: "10px 22px" }}>
            {running ? "⏳ Recherche en cours…" : "⚡ Lancer l'usine"}
          </Button>
          <div style={{ fontSize: 11, color: T.textFaint }}>
            ~{fmtInt((assets.length * tfs.length) * (700 + 6 * 54))} backtests via l'entonnoir · {navigator.hardwareConcurrency || "?"} cœurs
          </div>
        </div>
        {progress && running && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textDim, marginBottom: 4 }}>
              <span>{progress.phase === "fetch" ? "① Données" : progress.phase === "compute" ? "② Analyse multi-cœurs" : "③ Portefeuille"} — {progress.label}</span>
              <span>{progress.pairsDone != null ? `${progress.pairsDone}/${progress.totalPairs} paires` : ""}</span>
            </div>
            <ProgressBar pct={progress.pct} />
          </div>
        )}
        {error && <div style={{ marginTop: 12, color: T.red, fontSize: 12 }}>Erreur : {error}</div>}
      </Panel>

      {result && (
        <>
          {/* ÉTAPE SUIVANTE — enchaînement */}
          {selected && (
            <Panel title="→ Étape suivante" style={{ border: `1px solid ${T.orange}55` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 11, color: T.textDim }}>Variante sélectionnée (clique une ligne du leaderboard pour changer)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.orange, marginTop: 2 }}>
                    #{selected.stratId} {selected.name}
                  </div>
                  <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>
                    {selected.asset} · {selected.tf} · SL/TP/BE {selected.params.slAtr}/{selected.params.tpAtr || "—"}/{selected.params.beAtr || "—"} · score {fmt(selected.score, 0)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button onClick={() => sendTo(selected, "backtest")}>🔍 Backtest détaillé</Button>
                  <Button onClick={() => sendTo(selected, "validator")}>🛡️ Valider (robustesse)</Button>
                  <Button primary onClick={() => sendTo(selected, "propfirm")}>🏆 Simuler prop firm</Button>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>
                Ces boutons chargent l'actif <b>{selected.asset}</b> en {selected.tf} avec les paramètres trouvés, puis ouvrent l'étape choisie.
                Score {fmt(selected.score, 0)} {selected.oos ? "(out-of-sample)" : ""} · robustesse {selected.oos ? `${fmt(selected.robustness, 0)}%` : "—"}. Recommandé : Valider → Prop firm avant toute décision.
              </div>
            </Panel>
          )}

          <Panel title="Résultat de la recherche">
            <MetricGrid min={140}>
              <MetricCard label="Variantes retenues" value={fmtInt(result.stats.nVariants)} color={T.orange} />
              <MetricCard label="Rejetées DSR" value={fmtInt(result.stats.rejectedByDsr || 0)} color={T.red} hint="DSR &lt; 50 % (overfit)" />
              <MetricCard label="Skip Anti-Lib" value={fmtInt(result.stats.rejectedByAnti || 0)} color={T.yellow} hint={`${result.stats.antiBlocked || 0} IDs bloqués × paires`} />
              <MetricCard label="nTrials / paire" value={fmtInt(result.stats.nTrialsPerPair || 0)} hint="essais pour déflater le Sharpe" />
              <MetricCard label="Paires actif×TF" value={result.stats.nPairs} />
              <MetricCard label="Cœurs utilisés" value={result.stats.nWorkers} />
              <MetricCard label="Espace couvert" value={`${(result.stats.covered / 1e6).toFixed(1)} M`} hint="stratégie×actif×TF×params" />
              <MetricCard label="Backtests évalués" value={fmtInt(result.stats.evaluated)} />
            </MetricGrid>
          </Panel>

          {result.portfolio && (
            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
              <Panel title="Portefeuille diversifié">
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <ScoreGauge score={Math.max(0, Math.min(100, result.portfolio.sharpe * 33))} label="Sharpe portefeuille" size={110} />
                  <MetricGrid min={120}>
                    <MetricCard label="Sharpe" value={fmt(result.portfolio.sharpe)} color={result.portfolio.sharpe >= 1 ? T.green : T.yellow} />
                    <MetricCard label="Max DD" value={fmtPct(result.portfolio.maxDD * 100)} color={T.red} />
                    <MetricCard label="PnL net" value={fmtUsd(result.portfolio.totalPnL)} color={result.portfolio.totalPnL >= 0 ? T.green : T.red} />
                    <MetricCard label="Corrélation moy." value={fmt(result.portfolio.avgCorr)} color={result.portfolio.avgCorr < 0.3 ? T.green : T.yellow} hint="Décorrélation du panier (plus bas = mieux)" />
                    <MetricCard label="Stratégies" value={result.portfolio.picks.length} />
                  </MetricGrid>
                </div>
              </Panel>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Panel title="Équité combinée du portefeuille"><EquityChart data={result.portfolio.curve} initial={100000} /></Panel>
                <Panel title="Composants du portefeuille (décorrélés)">
                  <DataTable columns={[
                    { key: "score", label: "Score", align: "right", render: (r) => fmt(r.score, 0), color: () => T.orange },
                    { key: "name", label: "Stratégie", render: (r) => `#${r.stratId} ${r.name}` },
                    { key: "asset", label: "Actif", render: (r) => r.asset },
                    { key: "tf", label: "TF", render: (r) => r.tf },
                    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => fmt(r.metrics.sharpe) },
                    { key: "pnl", label: "PnL%", align: "right", render: (r) => fmtPct(r.metrics.totalPnLPct), color: (r) => r.metrics.totalPnLPct >= 0 ? T.green : T.red },
                  ]} rows={result.portfolio.picks} maxHeight={240} />
                </Panel>
              </div>
            </div>
          )}

          {result.stress && (
            <Panel
              title="Stress-test historique (2008 / 2010 / 2020)"
              right={
                <Badge color={result.stress.allPass ? T.green : T.red}>
                  {result.stress.allPass ? "PASS" : "FAIL"} · limite DD {fmtPct(STRESS_MAX_DD_LIMIT * 100)}
                </Badge>
              }
            >
              <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.5 }}>
                Overlay des chocs marché stylisés (SPX) sur l'équité du portefeuille. Pendant la crise,
                la décorrélation s'effondre (<b style={{ color: T.orange }}>corrSpike</b>) — le panier suit le facteur marché.
              </div>
              <MetricGrid min={140}>
                <MetricCard label="MaxDD base" value={fmtPct(result.stress.baseMaxDD * 100)} color={T.red} />
                <MetricCard
                  label="Pire scénario"
                  value={result.stress.worst.label}
                  sub={`DD ${fmtPct(result.stress.worst.maxDD * 100)}`}
                  color={result.stress.worst.pass ? T.yellow : T.red}
                />
                <MetricCard
                  label="Δ DD vs base"
                  value={fmtPct(result.stress.worst.ddDelta * 100)}
                  color={T.red}
                  hint="hausse du drawdown sous stress"
                />
                <MetricCard
                  label="Scénarios PASS"
                  value={`${result.stress.results.filter((r) => r.pass).length}/${result.stress.results.length}`}
                  color={result.stress.allPass ? T.green : T.yellow}
                />
              </MetricGrid>
              <div style={{ marginTop: 12 }}>
                <DataTable
                  columns={[
                    { key: "year", label: "Année", render: (r) => r.year },
                    { key: "label", label: "Scénario", render: (r) => r.label },
                    { key: "maxDD", label: "MaxDD stress", align: "right", render: (r) => fmtPct(r.maxDD * 100), color: (r) => r.pass ? T.yellow : T.red },
                    { key: "ddDelta", label: "Δ DD", align: "right", render: (r) => fmtPct(r.ddDelta * 100), color: () => T.red },
                    { key: "corr", label: "corrSpike", align: "right", render: (r) => fmt(r.corrSpike, 2) },
                    { key: "pass", label: "Verdict", render: (r) => <Badge color={r.pass ? T.green : T.red}>{r.pass ? "PASS" : "FAIL"}</Badge> },
                  ]}
                  rows={result.stress.results}
                  maxHeight={220}
                  selectedIdx={stressIdx}
                  onRowClick={(_, i) => setStressIdx(i)}
                />
              </div>
              {result.stress.results[stressIdx] && result.portfolio && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6 }}>
                    Équité sous stress — {result.stress.results[stressIdx].label}
                    <span style={{ color: T.textFaint }}> · {result.stress.results[stressIdx].description}</span>
                  </div>
                  <EquityChart data={result.stress.results[stressIdx].curve} initial={result.portfolio.curve[0]} />
                </div>
              )}
            </Panel>
          )}

          <Panel title="Meilleure stratégie par actif">
            <DataTable columns={[
              { key: "asset", label: "Actif", render: (r) => r.asset, color: () => T.orange },
              { key: "name", label: "Stratégie", render: (r) => `#${r.stratId} ${r.name}` },
              { key: "tf", label: "TF", render: (r) => <Badge color={T.blue}>{r.tf}</Badge> },
              { key: "params", label: "SL/TP/BE/Dir", render: (r) => `${r.params.slAtr}/${r.params.tpAtr || "—"}/${r.params.beAtr || "—"}/${r.params.direction[0].toUpperCase()}` },
              { key: "score", label: "Score", align: "right", render: (r) => fmt(r.score, 0), color: () => T.orange },
              { key: "sharpe", label: "Sharpe", align: "right", render: (r) => fmt(r.metrics.sharpe), color: (r) => r.metrics.sharpe >= 1 ? T.green : T.textDim },
              { key: "pnl", label: "PnL net%", align: "right", render: (r) => fmtPct(r.metrics.totalPnLPct), color: (r) => r.metrics.totalPnLPct >= 0 ? T.green : T.red },
            ]} rows={result.bestByAsset} maxHeight={260} onRowClick={(r) => { const idx = result.leaderboard.findIndex((x) => x.stratId === r.stratId && x.key === r.key); if (idx >= 0) setSelectedIdx(idx); }} />
          </Panel>

          <Panel title="Leaderboard des variantes (clique pour sélectionner)" right={<Button onClick={() => downloadJSON(result.leaderboard, "usine_variantes.json")}>⬇ Export JSON</Button>}>
            <DataTable columns={lbColumns} rows={result.leaderboard} maxHeight={480} selectedIdx={selectedIdx} onRowClick={(_, i) => setSelectedIdx(i)} />
            <div style={{ marginTop: 10, fontSize: 10.5, color: T.textFaint, lineHeight: 1.5 }}>
              <b style={{ color: T.textDim }}>Score OOS / PnL OOS / MaxDD</b> = mesurés sur les 30% de données <b>jamais vues</b> pendant l'optimisation.
              <b style={{ color: T.textDim }}> Robust.</b> = tenue hors-échantillon vs in-sample (100% = tient parfaitement ; &lt;40% = surajusté).
              <b style={{ color: T.textDim }}> Sharpe IS→OOS</b> = dégradation entre l'optimisé et le réel.
              <b style={{ color: T.textDim }}> DSR</b> = Deflated Sharpe (López de Prado) : probabilité que le Sharpe survive après <b>nTrials</b> essais — les variantes &lt; 50 % sont <b>filtrées avant le leaderboard</b>.
              Le classement privilégie ce qui marche sur données inconnues. Performances passées — ne préjugent pas du futur, aucun gain garanti.
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
