// Kelly/EV, Robustesse, Audit, Historique — outils de risque sur le dernier backtest.
// P4-AUDIT-UI : page Audit = checklist qualité locale + journal serveur append-only.
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePipeline } from "../../state/PipelineContext.tsx";
import { drawdownDistribution, varCvar } from "../../engine/quantToolbox/index.ts";
import { deflatedSharpe } from "../../engine/backtestMetrics.ts";
import {
  fetchAuditLog,
  filterAuditEvents,
  auditEventsToCsv,
  summarizeAudit,
  verifyEventHash,
  isAuditApiConfigured,
} from "../../engine/auditLog.ts";
import { getApiBaseUrl, getApiKey, setApiBaseUrl, setApiKey } from "../../engine/apiClient.ts";
import {
  clearSession,
  createSessionFromApiKey,
  fetchAuthConfig,
  fetchAuthMe,
  getAccessToken,
  getAccessTokenMeta,
  startOidcLogin,
  ssoRedirectUri,
} from "../../engine/ssoAuth.ts";
import { Panel, MetricCard, MetricGrid, DataTable, Badge, Select, Button, Field, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { Histogram } from "../../components/charts/Histogram.jsx";
import { T } from "../../components/shared/theme.ts";

function NoBt() { return <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance d'abord un backtest — ces outils l'analysent.</div></Panel>; }

function downloadCsv(csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quantexpro-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function roleColor(role) {
  const r = String(role || "").toLowerCase();
  if (r === "pm") return T.orange;
  if (r === "risk") return T.red;
  if (r === "ea") return T.blue;
  if (r === "analyst") return T.green;
  return T.textDim;
}

const inputStyle = {
  width: "100%",
  background: T.bg0,
  border: `1px solid ${T.border}`,
  color: T.text,
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
};


export function KellyEvPage() {
  const { pipeline } = usePipeline();
  const bt = pipeline.lastBacktest;
  if (!bt) return <NoBt />;
  const r = bt.res;
  const kellyFull = r.kelly * 100;
  const payoff = r.avgLoss ? r.avgWin / r.avgLoss : 0;         // R:R réel (gain moyen / perte moyenne)
  const breakevenWR = payoff > 0 ? 100 / (1 + payoff) : NaN;   // winrate minimal pour être à l'équilibre
  const edge = r.winRate - breakevenWR;                        // marge réelle = winrate − seuil
  const scenarios = [0.25, 0.5, 1, 1.5, 2].map((f) => ({
    frac: f, sizing: Math.max(0, kellyFull * f),
    label: f === 0.5 ? "Half-Kelly (recommandé)" : f === 1 ? "Full Kelly" : `${f}× Kelly`,
  }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title={`Kelly / Espérance · ${bt.strat.name}`}>
        <MetricGrid min={150}>
          <MetricCard label="Kelly complet %" value={fmtPct(kellyFull)} color={T.orange} hint="W − (1−W)/R" />
          <MetricCard label="Half-Kelly %" value={fmtPct(r.kellyHalf)} color={T.green} />
          <MetricCard label="Expectancy R" value={fmt(r.expectancyR)} color={r.expectancyR >= 0 ? T.green : T.red} />
          <MetricCard label="EV / Trade" value={fmtUsd(r.evTrade)} color={r.evTrade >= 0 ? T.green : T.red} />
          <MetricCard label="Win Rate" value={fmtPct(r.winRate)} />
          <MetricCard label="Payoff (R)" value={fmt(payoff)} hint="Gain moyen ÷ perte moyenne (le R:R réellement réalisé)." />
          <MetricCard label="Winrate seuil (BE)" value={fmtPct(breakevenWR)} color={T.yellow} hint="Winrate minimal pour être à l'équilibre à ce payoff = 1/(1+R)." />
          <MetricCard label="Edge (WR − seuil)" value={fmtPct(edge)} color={edge > 0 ? T.green : T.red} hint="La seule chose qui compte : de combien ton winrate dépasse le seuil imposé par ton R:R." />
        </MetricGrid>
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint, lineHeight: 1.5 }}>
          Le winrate seul ne veut rien dire : à un payoff de {fmt(payoff)}R, il faut <b style={{ color: T.yellow }}>{fmtPct(breakevenWR)}</b> de réussite <i>juste pour ne pas perdre</i>. Un système à 40 % de winrate avec un payoff de 2R est gagnant ; un système à 70 % avec un payoff de 0,3R est perdant. Ce qui compte, c'est l'<b>edge</b> ({fmtPct(edge)}) et l'espérance ({fmt(r.expectancyR)}R/trade).
        </div>
      </Panel>
      <Panel title="Scénarios de sizing">
        <DataTable columns={[
          { key: "label", label: "Fraction", render: (x) => x.label, color: (x) => x.frac === 0.5 ? T.green : T.text },
          { key: "frac", label: "×", align: "right", render: (x) => `${x.frac}×` },
          { key: "sizing", label: "% du capital / trade", align: "right", render: (x) => fmtPct(x.sizing), color: () => T.orange },
        ]} rows={scenarios} maxHeight={240} />
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Le sizing Kelly suppose des trades i.i.d. — le Half-Kelly réduit la variance au prix d'un rendement légèrement inférieur.</div>
      </Panel>
    </div>
  );
}

export function RobustessePage() {
  const { pipeline } = usePipeline();
  const [nTrials, setNTrials] = useState(100);
  const bt = pipeline.lastBacktest;
  const pnls = useMemo(() => (bt ? bt.res.trades.map((t) => t.pnl) : []), [bt]);
  const dd = useMemo(() => (bt ? drawdownDistribution(bt.res.equityCurve) : null), [bt]);
  const vc = useMemo(() => (bt ? varCvar(pnls) : null), [bt, pnls]);
  const ds = useMemo(() => deflatedSharpe(pnls, Number(nTrials)), [pnls, nTrials]);
  if (!bt) return <NoBt />;
  const dsrPct = Number.isNaN(ds.dsr) ? NaN : ds.dsr * 100;
  const dsrColor = dsrPct >= 95 ? T.green : dsrPct >= 90 ? T.yellow : T.red;
  const dsrVerdict = dsrPct >= 95 ? "SOLIDE" : dsrPct >= 90 ? "LIMITE" : "PROBABLEMENT SUR-OPTIMISÉ";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Deflated Sharpe Ratio — garde-fou anti-overfitting" right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: T.textDim }}>Nb de configs testées</span>
          <Select value={String(nTrials)} onChange={(x) => setNTrials(Number(x))} options={[{ value: "1", label: "1 (aucun tri)" }, { value: "10", label: "10" }, { value: "100", label: "100" }, { value: "1000", label: "1 000" }, { value: "10000", label: "10 000" }]} />
        </div>
      }>
        <MetricGrid min={150}>
          <MetricCard label="Sharpe observé (par trade)" value={fmt(ds.sr, 3)} />
          <MetricCard label="Sharpe seuil (max sous H0)" value={fmt(ds.srStar, 3)} color={T.yellow} hint="Sharpe max attendu par pure chance sur N essais." />
          <MetricCard label="Deflated Sharpe Ratio" value={Number.isNaN(dsrPct) ? "—" : `${dsrPct.toFixed(1)}%`} color={dsrColor} hint="Probabilité que le Sharpe soit réel après N essais." />
          <MetricCard label="Verdict" value={dsrVerdict} color={dsrColor} />
        </MetricGrid>
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint, lineHeight: 1.5 }}>
          C'est ce qui sépare un quant d'un trader : quand ton Usine teste <b style={{ color: T.orange }}>{Number(nTrials).toLocaleString("fr-FR")}</b> configurations, le meilleur Sharpe est mécaniquement gonflé par la chance. Le DSR (López de Prado 2014) déflate le seuil de significativité par le Sharpe maximum attendu sous l'hypothèse « aucun edge », en tenant compte de la longueur d'historique, du skew et du kurtosis. Un DSR &lt; 90 % = le résultat ne survit probablement pas au biais de sélection.
        </div>
      </Panel>
      <Panel title="Robustesse — Drawdown Distribution">
        {dd && (
          <MetricGrid min={140}>
            <MetricCard label="Max DD %" value={fmtPct(dd.maxDD)} color={T.red} />
            <MetricCard label="Ulcer Index" value={fmt(dd.ulcer)} hint="RMS des drawdowns" />
            <MetricCard label="Calmar" value={fmt(dd.calmar)} color={dd.calmar >= 2 ? T.green : T.yellow} />
            <MetricCard label="Recovery moy. (barres)" value={fmt(dd.avgRecoveryBars, 0)} />
            <MetricCard label="Durée max DD (barres)" value={fmt(dd.maxDDLenBars, 0)} />
          </MetricGrid>
        )}
      </Panel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title="Distribution des drawdowns">
          {dd && <Histogram data={dd.dds.map((d) => -d * 100)} bins={24} color={T.red} />}
        </Panel>
        <Panel title="VaR / CVaR (par trade)">
          {vc && (
            <MetricGrid min={130}>
              <MetricCard label="VaR 95% (hist)" value={fmtUsd(vc.histVar)} color={T.red} />
              <MetricCard label="CVaR 95% (hist)" value={fmtUsd(vc.histCvar)} color={T.red} />
              <MetricCard label="VaR paramétrique" value={fmtUsd(vc.paramVar)} />
              <MetricCard label="VaR Cornish-Fisher" value={fmtUsd(vc.cfVar)} hint="Ajusté skew/kurt" />
              <MetricCard label="Skewness" value={fmt(vc.skew)} />
              <MetricCard label="Kurtosis excès" value={fmt(vc.kurt)} />
            </MetricGrid>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function AuditPage() {
  const { pipeline, navigate } = usePipeline();
  const bt = pipeline.lastBacktest;

  const [baseUrl, setBaseUrl] = useState(() => getApiBaseUrl());
  const [apiKey, setKey] = useState(() => getApiKey());
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [integrity, setIntegrity] = useState({ checked: 0, ok: 0, bad: 0 });
  const [ssoMe, setSsoMe] = useState(null);
  const [ssoCfg, setSsoCfg] = useState(null);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [ssoErr, setSsoErr] = useState(null);
  const tokenMeta = getAccessTokenMeta();

  const saveCfg = () => {
    setApiBaseUrl(baseUrl);
    setApiKey(apiKey);
  };

  const refreshSso = useCallback(async () => {
    setSsoErr(null);
    try {
      const cfg = await fetchAuthConfig();
      setSsoCfg(cfg);
      if (getAccessToken()) {
        const me = await fetchAuthMe();
        setSsoMe(me);
      } else {
        setSsoMe(null);
      }
    } catch (e) {
      setSsoCfg(null);
      setSsoMe(null);
      setSsoErr(e.message || String(e));
    }
  }, []);

  useEffect(() => {
    refreshSso();
  }, [refreshSso]);

  const issueSession = async () => {
    saveCfg();
    setSsoBusy(true);
    setSsoErr(null);
    try {
      await createSessionFromApiKey();
      await refreshSso();
    } catch (e) {
      setSsoErr(e.message || String(e));
    } finally {
      setSsoBusy(false);
    }
  };

  const loginOidc = async () => {
    saveCfg();
    setSsoBusy(true);
    setSsoErr(null);
    try {
      const cfg = ssoCfg || (await fetchAuthConfig());
      await startOidcLogin(cfg, ssoRedirectUri());
    } catch (e) {
      setSsoErr(e.message || String(e));
      setSsoBusy(false);
    }
  };

  const logoutSso = () => {
    clearSession();
    setSsoMe(null);
  };

  const load = useCallback(async () => {
    saveCfg();
    setBusy(true);
    setErr(null);
    try {
      const rows = await fetchAuditLog({ limit: 200 });
      setEvents(rows);
      // Vérifie hash sur les 40 derniers ayant details
      let checked = 0; let ok = 0; let bad = 0;
      for (const e of rows.slice(-40)) {
        if (!e.details) continue;
        checked++;
        if (await verifyEventHash(e)) ok++;
        else bad++;
      }
      setIntegrity({ checked, ok, bad });
    } catch (e) {
      setErr(e.message || String(e));
      setEvents([]);
    } finally {
      setBusy(false);
    }
  }, [baseUrl, apiKey]);

  useEffect(() => {
    if (isAuditApiConfigured()) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actions = useMemo(() => {
    const set = new Set(events.map((e) => e.action).filter(Boolean));
    return ["", ...[...set].sort()];
  }, [events]);

  const filtered = useMemo(
    () => filterAuditEvents(events, { q, action: actionFilter }),
    [events, q, actionFilter],
  );
  const summary = useMemo(() => summarizeAudit(events), [events]);

  const cols = [
    { key: "id", label: "#", align: "right", render: (r) => r.id },
    {
      key: "ts",
      label: "Horodatage",
      render: (r) => {
        const t = Date.parse(r.ts);
        return Number.isFinite(t) ? new Date(t).toLocaleString("fr-FR") : r.ts || "—";
      },
    },
    { key: "actor", label: "Actor", render: (r) => <span style={{ fontFamily: T.mono, fontSize: 11 }}>{r.actor}</span> },
    {
      key: "role",
      label: "Rôle",
      render: (r) => <Badge color={roleColor(r.role)}>{r.role}</Badge>,
    },
    { key: "action", label: "Action", render: (r) => <Badge color={T.blue}>{r.action}</Badge> },
    { key: "resource", label: "Resource", render: (r) => <span style={{ fontSize: 11 }}>{r.resource}</span> },
    {
      key: "hash",
      label: "Hash",
      render: (r) => (
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textFaint }} title={r.payload_hash}>
          {(r.payload_hash || "").slice(0, 12)}…
        </span>
      ),
    },
  ];

  const checks = bt
    ? [
        { name: "Nombre de trades ≥ 30", pass: bt.res.nTrades >= 30, val: bt.res.nTrades },
        { name: "Profit Factor ≥ 1.3", pass: bt.res.profitFactor >= 1.3, val: fmt(bt.res.profitFactor) },
        { name: "Sharpe ≥ 1.0", pass: bt.res.sharpe >= 1, val: fmt(bt.res.sharpe) },
        { name: "Max DD ≤ 20%", pass: bt.res.maxDD <= 0.2, val: fmtPct(bt.res.maxDD * 100) },
        { name: "Win Rate ≥ 40%", pass: bt.res.winRate >= 40, val: fmtPct(bt.res.winRate) },
        { name: "Expectancy R > 0", pass: bt.res.expectancyR > 0, val: fmt(bt.res.expectancyR) },
        { name: "Sortino ≥ 1.2", pass: bt.res.sortino >= 1.2, val: fmt(bt.res.sortino) },
        { name: "Calmar ≥ 1.5", pass: bt.res.calmar >= 1.5, val: fmt(bt.res.calmar) },
      ]
    : [];
  const passed = checks.filter((c) => c.pass).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Audit — journal serveur + qualité backtest</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.55, maxWidth: 720 }}>
          Lecture de <code style={{ color: T.orange }}>/v1/audit</code> (append-only, hash SHA-256). Rôles API{" "}
          <b>pm</b> / <b>risk</b>. La checklist locale reste disponible si un backtest est en mémoire.
        </div>
      </Panel>

      <Panel title="Connexion API">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <Field label="Base URL">
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:8000"
              style={inputStyle}
            />
          </Field>
          <Field label="API Key (pm / risk)">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setKey(e.target.value)}
              placeholder="clé X-API-Key"
              style={inputStyle}
            />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Button primary onClick={load} disabled={busy}>{busy ? "…" : "Charger"}</Button>
            <Button onClick={() => navigate("dataManager")}>Data Manager</Button>
          </div>
        </div>
        {err && <div style={{ marginTop: 8, fontSize: 12, color: T.red }}>{err}</div>}
      </Panel>

      <Panel title="SSO — session Bearer (P4)" right={ssoMe ? <Badge color={T.green}>{ssoMe.role}</Badge> : null}>
        <div style={{ fontSize: 12, color: T.textDim, marginBottom: 10, lineHeight: 1.5 }}>
          Échange la clé API contre un JWT de session, ou connecte-toi via OIDC (PKCE) si l’API expose{" "}
          <code>QX_OIDC_*</code>. Les appels suivants envoient <code>Authorization: Bearer</code>.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <Button primary disabled={ssoBusy || !apiKey} onClick={issueSession}>
            {ssoBusy ? "…" : "Émettre session (API key)"}
          </Button>
          <Button disabled={ssoBusy || !ssoCfg?.oidc_enabled} onClick={loginOidc} title={!ssoCfg?.oidc_enabled ? "OIDC off" : "Login OIDC"}>
            Login OIDC
          </Button>
          <Button disabled={!getAccessToken()} onClick={logoutSso}>Déconnexion SSO</Button>
          <Button onClick={refreshSso}>↻ /me</Button>
        </div>
        {ssoErr && <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>{ssoErr}</div>}
        <MetricGrid min={120}>
          <MetricCard label="OIDC" value={ssoCfg?.oidc_enabled ? "ON" : "off"} color={ssoCfg?.oidc_enabled ? T.green : T.textDim} />
          <MetricCard label="Session" value={ssoMe ? ssoMe.sub || ssoMe.key_id : "—"} color={ssoMe ? T.orange : T.textDim} />
          <MetricCard label="Méthode" value={ssoMe?.auth_method || tokenMeta?.auth_method || "—"} />
          <MetricCard label="Rôle" value={ssoMe?.role || "—"} color={T.blue} />
        </MetricGrid>
      </Panel>

      <MetricGrid min={120}>
        <MetricCard label="Événements" value={summary.n} color={T.orange} />
        <MetricCard label="Dernier id" value={summary.lastId ?? "—"} />
        <MetricCard
          label="Intégrité hash"
          value={integrity.checked ? `${integrity.ok}/${integrity.checked}` : "—"}
          color={integrity.bad ? T.red : T.green}
          hint="Vérif. SHA-256 sur events avec details"
        />
        <MetricCard label="Filtrés" value={filtered.length} />
      </MetricGrid>

      <Panel
        title={`Journal d'audit (${filtered.length})`}
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrer…"
              style={{ ...inputStyle, width: 140 }}
            />
            <Select
              value={actionFilter}
              onChange={setActionFilter}
              options={actions.map((a) => ({ value: a, label: a || "Toutes actions" }))}
            />
            <Button onClick={() => downloadCsv(auditEventsToCsv(filtered))} disabled={!filtered.length}>
              CSV
            </Button>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: T.textDim, fontSize: 12 }}>
            Aucun événement. Démarre l’API, utilise une clé <b>pm</b>/<b>risk</b>, puis « Charger ».
            Les écritures (MT5 create, etc.) alimentent ce journal côté serveur.
          </div>
        ) : (
          <DataTable columns={cols} rows={[...filtered].reverse()} maxHeight={360} />
        )}
      </Panel>

      {bt ? (
        <Panel title={`Checklist qualité · ${bt.strat.name}`} right={<Badge color={passed >= 6 ? T.green : passed >= 4 ? T.yellow : T.red}>{passed}/{checks.length} critères</Badge>}>
          {checks.map((c) => (
            <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", borderBottom: `1px solid ${T.borderSoft}` }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: c.pass ? T.green : T.red, fontSize: 16 }}>{c.pass ? "✓" : "✗"}</span>
                <span style={{ fontSize: 13 }}>{c.name}</span>
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 13, color: c.pass ? T.green : T.red }}>{c.val}</span>
            </div>
          ))}
        </Panel>
      ) : (
        <Panel>
          <div style={{ padding: 16, fontSize: 12, color: T.textDim }}>
            Checklist qualité backtest : lance un Backtest pour afficher les critères locaux (indépendants du journal serveur).
          </div>
        </Panel>
      )}
    </div>
  );
}


export function HistoriquePage() {
  const { journal } = usePipeline();
  const columns = [
    { key: "t", label: "Horodatage", render: (r) => new Date(r.t).toLocaleTimeString("fr-FR") },
    { key: "type", label: "Type", render: (r) => <Badge color={T.blue}>{r.type}</Badge> },
    { key: "strat", label: "Stratégie", render: (r) => r.strat || "—" },
    { key: "trades", label: "Trades", align: "right", render: (r) => r.trades ?? "—" },
    { key: "pnl", label: "PnL", align: "right", render: (r) => r.pnl != null ? fmtUsd(r.pnl) : "—", color: (r) => (r.pnl ?? 0) >= 0 ? T.green : T.red },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => r.sharpe != null ? fmt(r.sharpe) : "—" },
  ];
  return (
    <Panel title="Historique des exécutions" right={<span style={{ fontSize: 11, color: T.textDim }}>{journal.length} entrées</span>}>
      <DataTable columns={columns} rows={journal} maxHeight={520} />
    </Panel>
  );
}
