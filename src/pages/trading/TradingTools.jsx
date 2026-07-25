// Modules TRADING purs (internes) : Performance, VP Footprint, Behavior Tracker, Spread Compare,
// HMM Regime, Stratégies, Signaux, Signal Engine, Exec Quality, Risk Calc.
import { useState, useMemo, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import {
  volumeProfileSessions,
  vpLevelsFromSession,
  oiLevelsFromGex,
  findConfluence,
  generateOrderBook,
} from "../../engine/microstructure.ts";
import { computeGexProfile, computeMaxPain, fetchDeribitOptions } from "../../engine/gex.ts";
import { hmmRegimes } from "../../engine/quantToolbox/index.ts";
import { CATS } from "../../engine/strategyLibrary.ts";
import { findSymbol } from "../../engine/marketData.ts";
import { eventsToCsv, filterEvents } from "../../engine/signalConsole.ts";
import { useSignalConsole } from "../../hooks/useSignalConsole.ts";
import { EquityChart } from "../../components/charts/EquityChart.jsx";
import { LineChart } from "../../components/charts/LineChart.jsx";
import { LiveOrderBookPanel } from "../../components/shared/LiveOrderBookPanel.tsx";
import { Panel, MetricCard, MetricGrid, DataTable, Badge, SimBadge, Field, NumberInput, Select, Button, fmt, fmtPct, fmtUsd, fmtInt } from "../../components/shared/ui.tsx";
import { T } from "../../components/shared/theme.ts";

function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function wsStatusColor(st) {
  if (st === "live") return T.green;
  if (st === "connecting") return T.yellow;
  if (st === "error") return T.red;
  return T.textDim;
}


export function PerformancePage() {
  const { pipeline, journal } = usePipeline();
  const bt = pipeline.lastBacktest;
  if (!bt) return <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance un backtest pour voir la performance.</div></Panel>;
  const r = bt.res;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title={`Performance · ${bt.strat.name}`} right={<SimBadge />}>
        <MetricGrid min={130}>
          <MetricCard label="Total PnL" value={fmtUsd(r.totalPnL)} color={r.totalPnL >= 0 ? T.green : T.red} />
          <MetricCard label="ROI %" value={fmtPct(r.totalPnLPct)} color={r.totalPnLPct >= 0 ? T.green : T.red} />
          <MetricCard label="Sharpe" value={fmt(r.sharpe)} />
          <MetricCard label="Sortino" value={fmt(r.sortino)} />
          <MetricCard label="Calmar" value={fmt(r.calmar)} />
          <MetricCard label="Max DD" value={fmtPct(r.maxDD * 100)} color={T.red} />
          <MetricCard label="Trades" value={fmtInt(r.nTrades)} />
          <MetricCard label="Win Rate" value={fmtPct(r.winRate)} />
        </MetricGrid>
      </Panel>
      <Panel title="Courbe d'équité"><EquityChart data={r.equityCurve} initial={bt.params.capital} /></Panel>
    </div>
  );
}

export function VPFootprintPage() {
  const { bars } = usePipeline();
  const [currency, setCurrency] = useState("BTC");
  const [oiBusy, setOiBusy] = useState(false);
  const [oiErr, setOiErr] = useState(null);
  const [oiLevels, setOiLevels] = useState([]);
  const [oiMeta, setOiMeta] = useState(null);

  const sess = useMemo(() => volumeProfileSessions(bars, 40), [bars]);
  const vp = sess.developing;
  const maxV = vp.bins.length ? Math.max(...vp.bins, 1) : 1;
  const vpLevels = useMemo(() => vpLevelsFromSession(sess), [sess]);
  const confluence = useMemo(() => findConfluence(vpLevels, oiLevels, 0.35), [vpLevels, oiLevels]);

  const nearPrev = (price, level, step) => level != null && step > 0 && Math.abs(price - level) < step * 0.55;

  const loadOi = useCallback(async () => {
    setOiBusy(true);
    setOiErr(null);
    try {
      const res = await fetchDeribitOptions(currency);
      const profile = computeGexProfile(res.rows, res.spot);
      const maxPain = computeMaxPain(res.rows);
      setOiLevels(oiLevelsFromGex(profile, maxPain));
      setOiMeta({ source: "deribit", currency: res.currency, n: res.rows.length, spot: res.spot });
    } catch (e) {
      setOiErr(e.message || String(e));
    } finally {
      setOiBusy(false);
    }
  }, [currency]);

  const fmtLvl = (x) => (x == null ? "—" : Number(x).toFixed(2));

  if (!bars?.length || !vp.bins.length) {
    return <Panel title="Volume Profile / Footprint"><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Charge des barres (Data Manager) pour calculer POC / pPOC.</div></Panel>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel
        title="Volume Profile · pPOC / pVAL"
        right={
          <span style={{ fontSize: 10, color: T.textDim }}>
            {sess.sessionCount > 0
              ? `${sess.sessionCount} sess. · ${sess.currentKey || ""}${sess.previousKey ? ` ← p=${sess.previousKey}` : ""}`
              : "timestamps absents — pas de pPOC"}
          </span>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 20 }}>
          <div>
            {vp.bins.slice().reverse().map((v, ri) => {
              const i = vp.bins.length - 1 - ri;
              const price = vp.lo + vp.step * (i + 0.5);
              const isPoc = Math.abs(price - vp.poc) < vp.step;
              const inVA = price >= vp.val && price <= vp.vah;
              const isPPoc = nearPrev(price, sess.pPoc, vp.step);
              const isPVal = nearPrev(price, sess.pVal, vp.step) || nearPrev(price, sess.pVah, vp.step);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, height: 13 }}>
                  <span style={{ width: 60, fontSize: 9, color: T.textFaint, fontFamily: T.mono, textAlign: "right" }}>{price.toFixed(1)}</span>
                  <div style={{ flex: 1, height: 10, background: T.bg0, borderRadius: 2, position: "relative" }}>
                    <div style={{ width: `${(v / maxV) * 100}%`, height: "100%", background: isPoc ? T.orange : inVA ? T.blue : T.textFaint, borderRadius: 2 }} />
                    {(isPPoc || isPVal) && (
                      <div
                        title={isPPoc ? "pPOC" : "pVA"}
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: 0,
                          bottom: 0,
                          borderLeft: `2px solid ${isPPoc ? T.yellow : T.purple}`,
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div>
            <MetricCard label="POC (session)" value={fmtLvl(vp.poc)} color={T.orange} />
            <div style={{ height: 8 }} />
            <MetricCard label="VAH" value={fmtLvl(vp.vah)} color={T.blue} />
            <div style={{ height: 8 }} />
            <MetricCard label="VAL" value={fmtLvl(vp.val)} color={T.blue} />
            <div style={{ height: 12 }} />
            <MetricCard label="pPOC" value={fmtLvl(sess.pPoc)} color={T.yellow} sub="session précédente" />
            <div style={{ height: 8 }} />
            <MetricCard label="pVAH" value={fmtLvl(sess.pVah)} color={T.yellow} />
            <div style={{ height: 8 }} />
            <MetricCard label="pVAL" value={fmtLvl(sess.pVal)} color={T.yellow} />
          </div>
        </div>
      </Panel>

      <Panel title="Confluence OI / GEX" right={oiMeta ? <Badge color={T.green}>{oiMeta.source} · {oiMeta.currency}</Badge> : null}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
          <Field label="Deribit">
            <Select value={currency} onChange={setCurrency} options={["BTC", "ETH"]} />
          </Field>
          <Button onClick={loadOi} disabled={oiBusy}>{oiBusy ? "…" : "Charger OI / GEX"}</Button>
          {oiErr && <span style={{ fontSize: 11, color: T.red }}>{oiErr}</span>}
        </div>
        {!oiLevels.length ? (
          <div style={{ fontSize: 12, color: T.textDim }}>Charge Deribit (ou ouvre Options Gamma) pour croiser pPOC/VA avec walls / Max Pain / High OI (±0.35%).</div>
        ) : (
          <>
            <MetricGrid min={120}>
              <MetricCard label="Niveaux OI" value={oiLevels.length} />
              <MetricCard label="Confluences" value={confluence.length} color={confluence.length ? T.green : T.textDim} />
              {oiMeta?.spot != null && <MetricCard label="Spot" value={fmt(oiMeta.spot, 1)} />}
            </MetricGrid>
            <div style={{ height: 10 }} />
            {confluence.length === 0 ? (
              <div style={{ fontSize: 12, color: T.textDim }}>Aucune confluence dans la tolérance 0.35%.</div>
            ) : (
              <DataTable
                columns={[
                  { key: "vpLabel", label: "VP", render: (r) => r.vpLabel },
                  { key: "oiLabel", label: "OI/GEX", render: (r) => r.oiLabel },
                  { key: "mid", label: "Prix", align: "right", render: (r) => fmt(r.mid, 2) },
                  { key: "distPct", label: "Δ%", align: "right", render: (r) => fmt(r.distPct, 3), color: () => T.green },
                ]}
                rows={confluence}
                maxHeight={220}
              />
            )}
            <div style={{ marginTop: 10, fontSize: 10, color: T.textFaint }}>
              OI: {oiLevels.map((l) => `${l.label}@${fmt(l.price, 0)}`).join(" · ")}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

export function BehaviorTrackerPage() {
  const { pipeline } = usePipeline();
  const bt = pipeline.lastBacktest;
  if (!bt) return <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance un backtest pour analyser le comportement.</div></Panel>;
  const trades = bt.res.trades;
  const longs = trades.filter((t) => t.side === 1);
  const shorts = trades.filter((t) => t.side === -1);
  const avgHold = trades.reduce((s, t) => s + t.bars, 0) / (trades.length || 1);
  const byReason = {};
  trades.forEach((t) => { byReason[t.reason] = (byReason[t.reason] || 0) + 1; });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Behavior Tracker" right={<SimBadge />}>
        <MetricGrid min={140}>
          <MetricCard label="Durée moy. (barres)" value={fmt(avgHold, 1)} />
          <MetricCard label="Trades LONG" value={longs.length} color={T.green} />
          <MetricCard label="Trades SHORT" value={shorts.length} color={T.red} />
          <MetricCard label="Biais directionnel" value={fmtPct((longs.length / (trades.length || 1)) * 100)} sub="part de LONG" />
        </MetricGrid>
      </Panel>
      <Panel title="Répartition des sorties">
        {Object.entries(byReason).map(([reason, n]) => (
          <div key={reason} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.borderSoft}`, fontSize: 12 }}>
            <span>{reason}</span><span style={{ fontFamily: T.mono, color: T.orange }}>{n} ({fmtPct((n / trades.length) * 100, 0)})</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

export function SpreadComparePage() {
  const { CONTRACTS } = usePipeline();
  const columns = [
    { key: "sym", label: "Contrat", render: (r) => r.sym, color: () => T.orange },
    { key: "name", label: "Nom", render: (r) => r.name },
    { key: "pv", label: "Point Value", align: "right", render: (r) => fmtUsd(r.pv) },
    { key: "tick", label: "Tick", align: "right", render: (r) => r.tick },
    { key: "commission", label: "Commission", align: "right", render: (r) => fmtUsd(r.commission, 2) },
    { key: "slipCost", label: "Coût slippage", align: "right", render: (r) => fmtUsd(r.slippage * r.tick * r.pv, 2) },
    { key: "rtCost", label: "Coût A/R total", align: "right", render: (r) => fmtUsd(2 * (r.commission + r.slippage * r.tick * r.pv), 2), color: () => T.yellow },
  ];
  const rows = Object.entries(CONTRACTS).map(([sym, c]) => ({ sym, ...c }));
  return (
    <Panel title="Spread & coûts comparés (specs contrats)" right={<SimBadge />}>
      <DataTable columns={columns} rows={rows} maxHeight={400} />
    </Panel>
  );
}

export function HMMRegimePage() {
  const { bars } = usePipeline();
  const returns = useMemo(() => { const r = []; for (let i = 1; i < bars.length; i++) r.push(Math.log(bars[i].c / bars[i - 1].c)); return r; }, [bars]);
  const h = useMemo(() => hmmRegimes(returns), [returns]);
  if (!h) return <Panel><div style={{ padding: 20, color: T.textDim }}>Pas assez de données.</div></Panel>;
  const total = h.counts.reduce((a, b) => a + b, 0) || 1;
  const colors = [T.green, T.blue, T.red, T.yellow];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="HMM Regime — Trend / Range / Vol / Choppy" right={<div style={{ display: "flex", gap: 8 }}><Badge color={T.yellow}>Approximation JS</Badge></div>}>
        <div style={{ fontSize: 12, color: T.textDim, marginBottom: 10 }}>
          Clustering causal (vol × efficacité directionnelle). Régime courant :{" "}
          <b style={{ color: colors[h.current] }}>{h.currentLabel}</b>
        </div>
        <MetricGrid min={140}>
          {h.labels.map((lab, i) => (
            <MetricCard
              key={lab}
              label={lab}
              value={fmtPct((h.counts[i] / total) * 100)}
              sub={`vol≈${fmt(h.sigma[i], 5)} · eff≈${fmt(h.mu[i], 2)}`}
              color={colors[i]}
            />
          ))}
        </MetricGrid>
      </Panel>
      <Panel title="Séquence de régimes (0=Trend … 3=Choppy)">
        <LineChart series={[{ data: h.states, color: T.orange, width: 1 }]} height={140} />
      </Panel>
    </div>
  );
}

export function StrategiesPage() {
  const { library } = usePipeline();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    const base = s ? library.filter((x) => x.name.toLowerCase().includes(s) || CATS[x.cat].name.toLowerCase().includes(s)) : library;
    return base.slice(0, 300);
  }, [library, q]);
  const columns = [
    { key: "id", label: "#", render: (r) => r.id },
    { key: "name", label: "Stratégie", render: (r) => r.name },
    { key: "cat", label: "Catégorie", render: (r) => <Badge color={CATS[r.cat].color}>{CATS[r.cat].name}</Badge> },
  ];
  return (
    <Panel title="Bibliothèque de stratégies" right={<span style={{ fontSize: 11, color: T.orange }}>{library.length} stratégies</span>}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, catégorie)…" style={{ width: "100%", background: T.bg0, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 10px", marginBottom: 10, boxSizing: "border-box" }} />
      <DataTable columns={columns} rows={filtered} maxHeight={460} />
    </Panel>
  );
}

export function SignauxPage() {
  const { bars, ctx, library } = usePipeline();
  const slots = [1, 3, 4, 21, 31];
  const events = useMemo(() => {
    const evs = [];
    slots.forEach((id) => {
      const s = library.find((x) => x.id === id);
      for (let i = Math.max(1, bars.length - 150); i < bars.length; i++) {
        const sig = s.eval(ctx, i);
        if (sig.long) evs.push({ t: bars[i].t, side: "LONG", id, name: s.name, price: bars[i].c, bar: i });
        if (sig.short) evs.push({ t: bars[i].t, side: "SHORT", id, name: s.name, price: bars[i].c, bar: i });
      }
    });
    return evs.sort((a, b) => b.bar - a.bar).slice(0, 60);
  }, [bars, ctx, library]);
  const columns = [
    { key: "t", label: "Barre", render: (r) => new Date(r.t).toISOString().slice(11, 16) },
    { key: "side", label: "Sens", render: (r) => <Badge color={r.side === "LONG" ? T.green : T.red}>{r.side}</Badge> },
    { key: "id", label: "#", render: (r) => r.id },
    { key: "name", label: "Stratégie", render: (r) => r.name },
    { key: "price", label: "Prix", align: "right", render: (r) => r.price.toFixed(2) },
  ];
  return <Panel title="Signaux récents (150 dernières barres)" right={<SimBadge />}><DataTable columns={columns} rows={events} maxHeight={460} /></Panel>;
}

export function SignalEnginePage() {
  const { bars, ctx, library, symbol, tf, navigate } = usePipeline();
  const console_ = useSignalConsole({ library, ctx, bars, symbol, tfFactor: tf });
  const [kindFilter, setKindFilter] = useState("");
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () => filterEvents(console_.events, { kind: kindFilter, q }),
    [console_.events, kindFilter, q],
  );
  const { consensus, nLong, nShort, nSlots } = console_.consensus;

  const eventCols = [
    {
      key: "ts",
      label: "Heure",
      render: (r) => new Date(r.ts).toLocaleTimeString("fr-FR"),
    },
    {
      key: "kind",
      label: "Type",
      render: (r) => (
        <Badge color={r.kind === "bar_closed" ? T.blue : T.orange}>{r.kind}</Badge>
      ),
    },
    {
      key: "src",
      label: "Source",
      render: (r) => r.source || "—",
    },
    {
      key: "detail",
      label: "Détail",
      render: (r) => {
        if (r.kind === "bar_closed") {
          return (
            <span style={{ fontFamily: T.mono, fontSize: 11 }}>
              {r.symbol || "—"} {r.timeframe || ""} · c={r.close != null ? fmt(r.close) : "—"}
            </span>
          );
        }
        return (
          <span>
            <Badge color={r.consensus === "LONG" ? T.green : r.consensus === "SHORT" ? T.red : T.textDim}>
              {r.consensus}
            </Badge>{" "}
            <span style={{ fontSize: 11, color: T.textDim }}>
              {r.nLong}L / {r.nShort}S
              {r.signals?.length ? ` · ${r.signals.map((s) => `#${s.id}`).join(",")}` : ""}
            </span>
          </span>
        );
      },
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Signal Engine — console unifiée</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.55, maxWidth: 760 }}>
          Consensus multi-stratégies + journal. Mode <b>local</b> : réévalue sur le pipeline.
          Mode <b>WS</b> : tail <code style={{ color: T.orange }}>/stream/bars/{console_.streamTf}</code>{" "}
          (bus Redis ZDL) — journal bar-close + snapshot slots.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
          <Button primary={console_.mode === "local"} onClick={() => console_.setMode("local")}>Local</Button>
          <Button primary={console_.mode === "ws"} onClick={() => console_.setMode("ws")}>WebSocket</Button>
          {console_.mode === "ws" && (
            <>
              <Badge color={wsStatusColor(console_.wsStatus)}>{console_.wsStatus}</Badge>
              <Button onClick={console_.reconnect}>Reconnect</Button>
              <Button onClick={() => navigate("dataManager")}>API config</Button>
            </>
          )}
          {console_.mode === "local" && <SimBadge />}
        </div>
        {console_.wsError && (
          <div style={{ marginTop: 8, fontSize: 12, color: T.red }}>{console_.wsError}</div>
        )}
      </Panel>

      <Panel title="Consensus" right={console_.mode === "ws" ? <Badge color={wsStatusColor(console_.wsStatus)}>WS {console_.wsStatus}</Badge> : <SimBadge />}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{
            fontSize: 30, fontWeight: 800, borderRadius: 10, padding: "6px 24px",
            color: consensus === "LONG" ? T.green : consensus === "SHORT" ? T.red : T.textDim,
            border: `2px solid ${consensus === "LONG" ? T.green : consensus === "SHORT" ? T.red : T.border}`,
          }}>
            {consensus}
          </div>
          <MetricGrid min={100}>
            <MetricCard label="Signaux LONG" value={nLong} color={T.green} />
            <MetricCard label="Signaux SHORT" value={nShort} color={T.red} />
            <MetricCard label="Slots" value={nSlots} />
            <MetricCard label="Events" value={console_.events.length} color={T.orange} />
          </MetricGrid>
        </div>
      </Panel>

      <Panel title="Détail par stratégie">
        {console_.signals.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.borderSoft}` }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: (CATS[s.cat] && CATS[s.cat].color) || T.textFaint }} />
              #{s.id} {s.name}
              {s.missing && <Badge color={T.yellow}>missing</Badge>}
            </span>
            <span>
              {s.long ? <Badge color={T.green}>LONG</Badge> : s.short ? <Badge color={T.red}>SHORT</Badge> : <span style={{ color: T.textFaint }}>FLAT</span>}
            </span>
          </div>
        ))}
      </Panel>

      <Panel
        title={`Journal (${filtered.length})`}
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Select
              value={kindFilter}
              onChange={setKindFilter}
              options={[
                { value: "", label: "Tous types" },
                { value: "signal_snapshot", label: "Snapshots" },
                { value: "bar_closed", label: "Bar close" },
              ]}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrer…"
              style={{
                width: 120, background: T.bg0, border: `1px solid ${T.border}`,
                color: T.text, borderRadius: 6, padding: "6px 8px", fontSize: 12,
              }}
            />
            <Button onClick={() => downloadText(eventsToCsv(filtered), `signal-console-${Date.now()}.csv`)} disabled={!filtered.length}>
              CSV
            </Button>
            <Button onClick={console_.clearEvents}>Clear</Button>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: T.textDim, fontSize: 12 }}>
            Aucun événement. Charge des barres (mode local) ou connecte le WS avec bus Redis activé.
          </div>
        ) : (
          <DataTable columns={eventCols} rows={filtered} maxHeight={320} />
        )}
      </Panel>
    </div>
  );
}


export function ExecQualityPage() {
  const { bars, symbol, CONTRACTS, assetKey, navigate } = usePipeline();
  const liveSym = findSymbol(assetKey);
  const liveTicker = liveSym?.provider === "binance" ? liveSym.ticker : null;
  const mockOb = useMemo(
    () => (bars.length ? generateOrderBook(bars[bars.length - 1].c, CONTRACTS[symbol]?.tick || 0.01, 10, bars.length) : null),
    [bars, symbol, CONTRACTS],
  );
  const spec = CONTRACTS[symbol];
  if (!mockOb && !liveTicker) return null;
  const slipCost = spec ? spec.slippage * spec.tick * spec.pv : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
      <LiveOrderBookPanel
        ticker={liveTicker}
        label={liveSym?.label || symbol}
        levels={10}
        mockBook={mockOb}
      />
      <Panel title="Qualité d'exécution estimée" right={<Button onClick={() => navigate("tca")}>→ TCA observé vs modèle</Button>}>
        {spec && (
          <MetricGrid min={130}>
            <MetricCard label="Spread contrat" value={`${spec.tick} pt`} />
            <MetricCard label="Slippage / trade" value={fmtUsd(slipCost, 2)} color={T.yellow} />
            <MetricCard label="Commission A/R" value={fmtUsd(2 * spec.commission, 2)} />
            <MetricCard label="Coût total A/R" value={fmtUsd(2 * (spec.commission + slipCost), 2)} color={T.orange} />
          </MetricGrid>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: T.textDim, lineHeight: 1.45 }}>
          À gauche : carnet <b style={{ color: T.orange }}>Binance L2 live</b> sur crypto (sinon mock).
          TCA compare le slippage observé au modèle théorique.
        </div>
      </Panel>
    </div>
  );
}

export function RiskCalcPage() {
  const { CONTRACTS } = usePipeline();
  const [inp, setInp] = useState({ capital: 100000, riskPct: 1, contract: "MES", stopTicks: 40 });
  const set = (k, v) => setInp((x) => ({ ...x, [k]: v }));
  const spec = CONTRACTS[inp.contract];
  const riskDollars = inp.capital * (inp.riskPct / 100);
  const riskPerContract = inp.stopTicks * spec.tick * spec.pv + 2 * spec.commission;
  const contracts = riskPerContract > 0 ? Math.floor(riskDollars / riskPerContract) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <Panel title="Paramètres">
        <Field label="Capital $"><NumberInput value={inp.capital} step={10000} onChange={(v) => set("capital", v)} /></Field>
        <div style={{ height: 8 }} />
        <Field label="Risque %"><NumberInput value={inp.riskPct} step={0.25} onChange={(v) => set("riskPct", v)} /></Field>
        <div style={{ height: 8 }} />
        <Field label="Contrat"><Select value={inp.contract} onChange={(v) => set("contract", v)} options={Object.keys(CONTRACTS)} /></Field>
        <div style={{ height: 8 }} />
        <Field label="Stop (ticks)"><NumberInput value={inp.stopTicks} onChange={(v) => set("stopTicks", v)} /></Field>
      </Panel>
      <Panel title="Position sizing">
        <MetricGrid min={150}>
          <MetricCard label="Risque $" value={fmtUsd(riskDollars)} color={T.orange} />
          <MetricCard label="Risque / contrat" value={fmtUsd(riskPerContract, 2)} />
          <MetricCard label="Contrats" value={contracts} color={T.green} hint="Arrondi à l'entier inférieur" />
          <MetricCard label="Stop en $" value={fmtUsd(inp.stopTicks * spec.tick * spec.pv, 2)} />
          <MetricCard label="Point value" value={fmtUsd(spec.pv)} />
        </MetricGrid>
      </Panel>
    </div>
  );
}
