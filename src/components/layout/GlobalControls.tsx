// Contrôles globaux : bascule Synthétique/Réel, sélecteur d'actif réel, timeframe, seed.
import { usePipeline } from "../../state/PipelineContext.jsx";
import { ASSET_CLASSES } from "../../engine/marketData.ts";
import { T, S } from "../shared/theme.ts";

export function GlobalControls() {
  const {
    symbol, setSymbol, nBars, setNBars, seed, setSeed, tf, setTf, CONTRACTS, bars,
    dataMode, setDataMode, assetKey, setAssetKey, dataLoading, dataError, usingReal, dataMeta, reloadData,
  } = usePipeline() as {
    symbol: string;
    setSymbol: (v: string) => void;
    nBars: number;
    setNBars: (v: number) => void;
    seed: number;
    setSeed: (v: number) => void;
    tf: number;
    setTf: (v: number) => void;
    CONTRACTS: Record<string, unknown>;
    bars: unknown[];
    dataMode: string;
    setDataMode: (v: string) => void;
    assetKey: string;
    setAssetKey: (v: string) => void;
    dataLoading: boolean;
    dataError: string | null;
    usingReal: boolean;
    dataMeta?: { symbol?: { label?: string } } | null;
    reloadData: () => void;
  };

  const cell = { display: "flex", flexDirection: "column" as const, gap: 2 };
  const lab = { fontSize: 8.5, color: T.textFaint, textTransform: "uppercase" as const, letterSpacing: 0.5 };
  const inp = { ...S.input, width: 92, padding: "4px 6px", fontSize: 11 };

  const badge = usingReal
    ? { txt: "RÉEL", color: T.green, title: `Données réelles : ${dataMeta?.symbol?.label} · ${bars.length} bougies` }
    : dataMode === "live"
      ? { txt: dataLoading ? "CHARGEMENT…" : dataError ? "ERREUR" : "…", color: dataError ? T.red : T.yellow, title: dataError || "Chargement des données réelles" }
      : { txt: "SIMULÉ", color: T.yellow, title: "Données synthétiques générées en interne" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span title={badge.title} style={{ ...S.chip(badge.color), border: `1px solid ${badge.color}55`, fontSize: 10, padding: "3px 8px" }}>{badge.txt}</span>

      <div style={{ display: "flex", border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden" }}>
        {[{ id: "synthetic", l: "Synthétique" }, { id: "live", l: "Réel" }].map((m) => (
          <button key={m.id} onClick={() => setDataMode(m.id)} style={{
            padding: "5px 10px", fontSize: 11, fontFamily: T.sans, border: "none", cursor: "pointer",
            background: dataMode === m.id ? T.orange : "transparent", color: dataMode === m.id ? "#0a0c10" : T.textDim,
            fontWeight: dataMode === m.id ? 700 : 500,
          }}>{m.l}</button>
        ))}
      </div>

      {dataMode === "live" ? (
        <>
          <div style={cell}>
            <span style={lab}>Actif réel</span>
            <select value={assetKey} onChange={(e) => setAssetKey(e.target.value)} style={{ ...inp, width: 150 }}>
              {ASSET_CLASSES.map((c) => (
                <optgroup key={c.id} label={c.label}>
                  {c.symbols.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <button onClick={reloadData} title="Recharger" style={{ ...S.btn, padding: "5px 9px", fontSize: 11, alignSelf: "flex-end" }}>↻</button>
        </>
      ) : (
        <div style={cell}>
          <span style={lab}>Symbole (frais)</span>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inp}>
            {Object.keys(CONTRACTS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}

      {dataMode === "synthetic" && (
        <div style={cell}>
          <span style={lab}>Barres</span>
          <select value={nBars} onChange={(e) => setNBars(Number(e.target.value))} style={inp}>
            {[500, 1000, 1500, 2500, 4000].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      <div style={cell}>
        <span style={lab}>Timeframe</span>
        <select value={tf} onChange={(e) => setTf(Number(e.target.value))} style={inp}>
          <option value={1}>5m</option><option value={3}>15m</option><option value={12}>1h</option><option value={48}>4h</option><option value={288}>1j</option>
        </select>
      </div>

      {dataMode === "synthetic" && (
        <div style={cell}>
          <span style={lab}>Seed</span>
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={inp} />
        </div>
      )}

      <div style={{ ...cell, alignItems: "flex-end" }}>
        <span style={lab}>Bougies</span>
        <span style={{ fontSize: 12, fontFamily: T.mono, color: dataError ? T.red : T.textDim }}>{dataError ? "—" : bars.length}</span>
      </div>
    </div>
  );
}
