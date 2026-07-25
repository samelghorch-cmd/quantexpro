// P4-GEX — Options Gamma / GEX / Max Pain / PCR (Module 5).
import { useCallback, useMemo, useState } from "react";
import {
  computeGexProfile,
  computeMaxPain,
  impliedMove,
  fetchDeribitOptions,
  parseOptionsImport,
} from "../../engine/gex.ts";
import { Panel, Button, Badge, MetricCard, MetricGrid, DataTable, Select, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { T } from "../../components/shared/theme.ts";

export function OptionsGammaPage() {
  const [currency, setCurrency] = useState("BTC");
  const [rows, setRows] = useState([]);
  const [spot, setSpot] = useState(null);
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [jsonText, setJsonText] = useState("");

  const profile = useMemo(
    () => (rows.length && spot ? computeGexProfile(rows, spot) : null),
    [rows, spot],
  );
  const maxPain = useMemo(() => computeMaxPain(rows), [rows]);
  const iMove = useMemo(
    () => (rows.length && spot ? impliedMove(rows, spot) : null),
    [rows, spot],
  );

  const loadDeribit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetchDeribitOptions(currency);
      setRows(res.rows);
      setSpot(res.spot);
      setMeta({ source: "deribit", currency: res.currency, fetchedAt: res.fetchedAt, n: res.rows.length });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [currency]);

  const loadJson = useCallback(() => {
    setErr(null);
    try {
      const { rows: r, spot: s } = parseOptionsImport(jsonText);
      if (!r.length) throw new Error("Aucune option parsée");
      if (!(s > 0)) throw new Error("spot manquant dans le JSON");
      setRows(r);
      setSpot(s);
      setMeta({ source: "json", fetchedAt: Date.now(), n: r.length });
    } catch (e) {
      setErr(e.message || String(e));
    }
  }, [jsonText]);

  const topStrikes = useMemo(() => {
    if (!profile) return [];
    return [...profile.profile].sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, 25);
  }, [profile]);

  const cols = [
    { key: "strike", label: "Strike", align: "right", render: (r) => fmt(r.strike, 0) },
    {
      key: "gex",
      label: "GEX",
      align: "right",
      render: (r) => fmt(r.gex, 0),
      color: (r) => (r.gex >= 0 ? T.green : T.red),
    },
    { key: "callOi", label: "Call OI", align: "right", render: (r) => fmt(r.callOi, 0) },
    { key: "putOi", label: "Put OI", align: "right", render: (r) => fmt(r.putOi, 0) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Options Gamma — GEX / Max Pain / PCR</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.55, maxWidth: 760 }}>
          Module 5 : exposition gamma dealers (convention call +, put −), zero-gamma, call/put walls,
          max pain, PCR OI, implied move 1σ. Source <b style={{ color: T.orange }}>Deribit public</b> (BTC/ETH)
          ou import JSON. Equity options CBOE = connecteur payant hors scope.
        </div>
      </Panel>

      <Panel title="Source">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
          <div>
            <div style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>Deribit</div>
            <Select
              value={currency}
              onChange={setCurrency}
              options={[
                { value: "BTC", label: "BTC" },
                { value: "ETH", label: "ETH" },
              ]}
            />
          </div>
          <Button primary onClick={loadDeribit} disabled={busy}>
            {busy ? "…" : "Charger Deribit"}
          </Button>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>
            Import JSON — array d’options ou {"{ spot, options: [{ strike, right, oi, gamma|iv, expiry }] }"}
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={4}
            placeholder='{"spot":100,"options":[{"strike":100,"right":"C","oi":50,"iv":0.3,"expiry":"2026-08-01"}]}'
            style={{
              width: "100%",
              background: T.bg0,
              border: `1px solid ${T.border}`,
              color: T.text,
              borderRadius: 6,
              padding: 8,
              fontFamily: T.mono,
              fontSize: 11,
            }}
          />
          <div style={{ marginTop: 8 }}>
            <Button onClick={loadJson}>Importer JSON</Button>
          </div>
        </div>
        {err && <div style={{ marginTop: 8, fontSize: 12, color: T.red }}>{err}</div>}
        {meta && (
          <div style={{ marginTop: 8, fontSize: 11, color: T.textFaint }}>
            {meta.source} · {meta.currency || ""} · {meta.n} contracts ·{" "}
            {new Date(meta.fetchedAt).toLocaleTimeString("fr-FR")}
          </div>
        )}
      </Panel>

      {!profile ? (
        <Panel>
          <div style={{ padding: 24, textAlign: "center", color: T.textDim, fontSize: 12 }}>
            Charge Deribit (dev : proxy Vite `/api/deribit`) ou colle une chaîne JSON.
          </div>
        </Panel>
      ) : (
        <>
          <MetricGrid min={120}>
            <MetricCard label="Spot" value={fmtUsd(spot, 0)} color={T.orange} />
            <MetricCard
              label="Net GEX"
              value={fmt(profile.netGex, 0)}
              color={profile.netGex >= 0 ? T.green : T.red}
              hint="Call GEX − |Put GEX| (convention desk)"
            />
            <MetricCard
              label="Régime"
              value={profile.regime === "LONG_GAMMA" ? "Long γ" : "Short γ"}
              color={profile.regime === "LONG_GAMMA" ? T.green : T.red}
            />
            <MetricCard label="Zero-γ" value={profile.zeroGamma != null ? fmt(profile.zeroGamma, 0) : "—"} />
            <MetricCard label="Call wall" value={profile.callWall != null ? fmt(profile.callWall, 0) : "—"} color={T.green} />
            <MetricCard label="Put wall" value={profile.putWall != null ? fmt(profile.putWall, 0) : "—"} color={T.red} />
            <MetricCard label="Max Pain" value={maxPain ? fmt(maxPain.strike, 0) : "—"} />
            <MetricCard label="PCR OI" value={profile.pcrOi != null ? fmt(profile.pcrOi, 2) : "—"} />
            <MetricCard
              label="Implied move 1σ"
              value={iMove ? fmtPct(iMove.movePct, 2) : "—"}
              sub={iMove ? fmtUsd(iMove.moveAbs, 0) : ""}
            />
            <MetricCard label="Contracts" value={profile.n} />
          </MetricGrid>

          <Panel
            title="Top strikes |GEX|"
            right={
              <Badge color={profile.regime === "LONG_GAMMA" ? T.green : T.red}>{profile.regime}</Badge>
            }
          >
            <DataTable columns={cols} rows={topStrikes} maxHeight={400} />
          </Panel>
        </>
      )}
    </div>
  );
}
