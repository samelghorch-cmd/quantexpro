// OUTILS : VPIN, Analyse Quant, Logs. (Quant Toolbox et Performance réutilisent les pages existantes.)
import { useMemo, useState } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { IND } from "../../engine/indicators.js";
import { computeVPIN, VPIN_PRESETS, resolveVpinClass } from "../../engine/vpin.js";
import { LineChart } from "../../components/charts/LineChart.jsx";
import { Panel, MetricCard, MetricGrid, DataTable, Badge, SimBadge, ScoreGauge, Select, fmt, fmtPct } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";

export function VPINPage() {
  const { bars, symbol } = usePipeline();
  const [method, setMethod] = useState("bvc");
  const [presetSel, setPresetSel] = useState("auto");
  const cls = presetSel === "auto" ? resolveVpinClass(symbol) : presetSel;
  const preset = VPIN_PRESETS[cls] || VPIN_PRESETS.synthetic;
  const v = useMemo(() => computeVPIN(bars, { buckets: preset.buckets, window: preset.window, sigmaWindow: preset.sigmaWindow, method, cdfWindow: 250 }), [bars, method, preset.buckets, preset.window, preset.sigmaWindow]);

  const cdfPct = Number.isNaN(v.lastCDF) ? NaN : v.lastCDF * 100;
  const tox = v.tox;
  const alertBg = { toxic: T.redSoft || "#ff4d4f1a", high: "#ffb0201a", warm: "#e6c2291a", normal: T.greenSoft || "#33c17a1a", "n/a": T.panelAlt }[tox.level];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Bandeau détecteur de krach — piloté par la CDF du VPIN, pas un seuil fixe */}
      <div style={{ background: alertBg, border: `1px solid ${tox.color}55`, borderLeft: `3px solid ${tox.color}`, borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <ScoreGauge score={cdfPct} label="CDF VPIN" size={92} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: tox.color, fontFamily: T.mono, letterSpacing: 0.5 }}>{tox.label}</span>
            <Badge color={T.blue}>{method === "bvc" ? "Bulk Volume Classification" : "Tick-rule"}</Badge>
          </div>
          <div style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.5 }}>
            Toxicité du flux d'ordres au percentile <b style={{ color: tox.color }}>{Number.isNaN(cdfPct) ? "—" : cdfPct.toFixed(0)}%</b> de sa propre distribution historique.
            {tox.level === "toxic" && " Flux extrêmement toxique — configuration typique d'avant-krach (le VPIN a spiké ainsi ~1 h avant le Flash Crash du 6 mai 2010). Réduire l'exposition / élargir les stops."}
            {tox.level === "high" && " Flux toxique — probabilité élevée de trading informé et de retournement violent. Prudence sur les entrées à contre-flux."}
            {tox.level === "warm" && " Flux qui se tend — à surveiller."}
            {tox.level === "normal" && " Flux sain — pas de toxicité anormale détectée."}
          </div>
        </div>
      </div>

      <Panel title="VPIN — Volume-Synchronized Probability of Informed Trading" right={<SimBadge />}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 12, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>PRESET (CLASSE D'ACTIF)</div>
            <Select value={presetSel} onChange={setPresetSel} options={[
              { value: "auto", label: `Auto — détecté : ${cls}` },
              { value: "indices", label: "Indices / Futures (référence)" },
              { value: "crypto", label: "Crypto (réactif)" },
              { value: "forex", label: "Forex (lissé)" },
              { value: "stocks", label: "Actions" },
              { value: "metals", label: "Métaux" },
              { value: "energy", label: "Énergie" },
            ]} /></div>
          <div><div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>MÉTHODE DE CLASSIFICATION</div>
            <Select value={method} onChange={setMethod} options={[{ value: "bvc", label: "Bulk Volume Classification (papier)" }, { value: "tick", label: "Tick-rule (grossier)" }]} /></div>
          <div style={{ fontSize: 10.5, color: T.textFaint, maxWidth: 260, lineHeight: 1.4 }}>{preset.label} · fenêtre {preset.window} · σ {preset.sigmaWindow}</div>
        </div>
        <MetricGrid min={140}>
          <MetricCard label="VPIN actuel" value={fmt(v.lastVPIN, 3)} color={v.lastCDF >= 0.9 ? T.red : v.lastCDF >= 0.7 ? T.yellow : T.green} />
          <MetricCard label="CDF (percentile)" value={Number.isNaN(cdfPct) ? "—" : `${cdfPct.toFixed(0)}%`} color={tox.color} hint="Position du VPIN dans sa distribution historique — c'est le vrai signal de krach." />
          <MetricCard label="VPIN moyen" value={fmt(v.avgVPIN, 3)} />
          <MetricCard label="VPIN max" value={fmt(v.maxVPIN, 3)} color={T.red} />
          <MetricCard label="Buckets" value={v.buckets.length} sub={`vol/bucket ≈ ${fmt(v.bucketVolume, 0)}`} />
        </MetricGrid>
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint, lineHeight: 1.5 }}>
          VPIN = déséquilibre moyen achats/ventes sur {preset.window} buckets à volume constant (Easley/López de Prado/O'Hara 2012). La <b>BVC</b> répartit une fraction du volume de chaque barre via la CDF normale de la variation de prix standardisée — bien moins bruité que le tick-rule. Le signal opérationnel n'est pas le VPIN brut mais sa <b>CDF</b> : un VPIN « élevé » ne compte que s'il est élevé <i>relativement à son propre historique</i>.
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <Panel title="VPIN dans le temps">
          <LineChart series={[{ data: v.vpinByBar, color: T.pink }, { data: v.vpinByBar.map(() => v.avgVPIN), color: T.textFaint, width: 1 }]} height={200} />
          <div style={{ marginTop: 4, fontSize: 10, color: T.textFaint }}>Rose = VPIN · gris = moyenne</div>
        </Panel>
        <Panel title="CDF du VPIN — détecteur de krach">
          <LineChart series={[{ data: v.cdfByBar, color: T.orange }, { data: v.cdfByBar.map(() => 0.9), color: T.yellow, width: 1 }, { data: v.cdfByBar.map(() => 0.99), color: T.red, width: 1 }]} height={200} />
          <div style={{ marginTop: 4, fontSize: 10, color: T.textFaint }}>Orange = CDF · jaune = 0,90 (élevé) · rouge = 0,99 (toxique)</div>
        </Panel>
      </div>
    </div>
  );
}

export function AnalyseQuantPage() {
  const { bars, ctx } = usePipeline();
  const stats = useMemo(() => {
    const closes = bars.map((b) => b.c);
    const rets = [];
    for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
    let m3 = 0, m4 = 0;
    rets.forEach((r) => { const d = r - mean; m3 += d ** 3; m4 += d ** 4; });
    m3 /= rets.length; m4 /= rets.length;
    const hurst = ctx.hurst100[ctx.hurst100.length - 1];
    return { mean: mean * 10000, vol: sd * Math.sqrt(252 * 78) * 100, skew: m3 / sd ** 3, kurt: m4 / sd ** 4 - 3, hurst, adx: ctx.adx14.adx[ctx.adx14.adx.length - 1] };
  }, [bars, ctx]);
  return (
    <Panel title="Analyse Quant — statistiques de marché" right={<SimBadge />}>
      <MetricGrid min={150}>
        <MetricCard label="Rendement moy. (bps/barre)" value={fmt(stats.mean, 2)} color={stats.mean >= 0 ? T.green : T.red} />
        <MetricCard label="Volatilité annualisée %" value={fmt(stats.vol, 1)} />
        <MetricCard label="Skewness" value={fmt(stats.skew)} color={stats.skew >= 0 ? T.green : T.red} />
        <MetricCard label="Kurtosis excès" value={fmt(stats.kurt)} color={stats.kurt > 1 ? T.red : T.text} />
        <MetricCard label="Hurst (100)" value={fmt(stats.hurst)} color={stats.hurst > 0.55 ? T.green : stats.hurst < 0.45 ? T.red : T.yellow} hint=">0.5 tendance, <0.5 mean-reversion" />
        <MetricCard label="ADX (14)" value={fmt(stats.adx, 0)} color={stats.adx > 25 ? T.green : T.textDim} />
      </MetricGrid>
    </Panel>
  );
}

export function LogsPage() {
  const { logs } = usePipeline();
  const columns = [
    { key: "t", label: "Horodatage", render: (r) => new Date(r.t).toLocaleTimeString("fr-FR") },
    { key: "module", label: "Module", render: (r) => <Badge color={T.blue}>{r.module}</Badge> },
    { key: "message", label: "Message", render: (r) => r.message },
  ];
  return (
    <Panel title="Logs système" right={<span style={{ fontSize: 11, color: T.textDim }}>{logs.length} entrées</span>}>
      <DataTable columns={columns} rows={logs} maxHeight={540} />
      {logs.length === 0 && <div style={{ marginTop: 8, fontSize: 11, color: T.textFaint }}>Les actions du pipeline (FAO, Quant Optim, Validator, Reco Finale…) apparaissent ici.</div>}
    </Panel>
  );
}
