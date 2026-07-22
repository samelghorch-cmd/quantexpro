// Panneau VPIN temps réel (WebSocket Binance) — réutilisable partout.
// Crypto uniquement : pour les autres actifs, il n'existe pas de flux tick gratuit fiable.
// Détecteur ACTIF : alerte sonore + visuelle quand la CDF franchit le niveau toxique (krach imminent).
import { useState, useRef, useEffect } from "react";
import { useBinanceVpinFeed } from "../../hooks/useBinanceVpinFeed.js";
import { Panel, MetricCard, MetricGrid, ScoreGauge, Badge, Button, fmt } from "./ui.jsx";
import { T } from "./theme.js";

export function LiveVpinPanel({ ticker, label, window = 50 }) {
  const [on, setOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [flash, setFlash] = useState(false);
  const feed = useBinanceVpinFeed(ticker, { enabled: on && !!ticker, window });
  const audioRef = useRef(null);
  const prevToxic = useRef(false);

  // Prépare l'audio sur le geste utilisateur (Connecter) — les navigateurs l'exigent.
  const toggle = () => {
    setOn((o) => {
      const next = !o;
      if (next && !audioRef.current) {
        try { audioRef.current = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* pas d'audio */ }
      }
      audioRef.current?.resume?.();
      return next;
    });
  };

  const beep = () => {
    const ctx = audioRef.current;
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      [0, 0.22].forEach((dt) => { // deux bips d'alerte
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square"; o.frequency.value = 920;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + dt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0 + dt); o.stop(t0 + dt + 0.19);
      });
    } catch { /* noop */ }
  };

  // Détecte la TRANSITION vers l'état toxique (CDF ≥ 0,99) → alerte.
  useEffect(() => {
    const toxic = feed.tox.level === "toxic";
    if (toxic && !prevToxic.current) {
      if (soundOn) beep();
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 5000);
      return () => clearTimeout(id);
    }
    prevToxic.current = toxic;
  }, [feed.tox.level, soundOn]);

  if (!ticker) {
    return (
      <Panel title="VPIN Live — temps réel">
        <div style={{ padding: 16, fontSize: 12.5, color: T.textDim, lineHeight: 1.6 }}>
          Flux tick live disponible <b style={{ color: T.orange }}>uniquement sur crypto</b> (WebSocket Binance, sans clé). Bascule en mode Réel et choisis BTC/ETH/SOL… pour activer le VPIN en direct.
        </div>
      </Panel>
    );
  }

  const cdfPct = Number.isNaN(feed.cdf) ? NaN : feed.cdf * 100;
  const toxic = feed.tox.level === "toxic";
  const high = feed.tox.level === "high";
  const alertBorder = toxic ? T.red : high ? T.yellow : T.border;

  return (
    <div style={{ borderRadius: 10, boxShadow: flash ? `0 0 0 2px ${T.red}, 0 0 24px ${T.red}66` : "none", transition: "box-shadow .3s", animation: flash ? "vpinKrach 0.7s ease-in-out infinite" : "none" }}>
      <style>{`@keyframes vpinKrach { 0%,100% { box-shadow: 0 0 0 2px ${T.red}, 0 0 22px ${T.red}55; } 50% { box-shadow: 0 0 0 2px ${T.red}, 0 0 4px ${T.red}22; } }`}</style>
      <Panel title={`VPIN Live — ${label || ticker} (Binance WebSocket)`} style={{ border: `1px solid ${alertBorder}` }} right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge color={feed.connected ? T.green : on ? T.yellow : T.textFaint}>{feed.connected ? "● EN DIRECT" : on ? "connexion…" : "○ arrêté"}</Badge>
          <Button onClick={() => setSoundOn((s) => !s)} title="Alerte sonore">{soundOn ? "🔔" : "🔕"}</Button>
          <Button onClick={toggle}>{on ? "⏹ Stop" : "● Connecter"}</Button>
        </div>
      }>
        {toxic && on && (
          <div style={{ background: `${T.red}1a`, border: `1px solid ${T.red}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: T.red, fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span> FLUX TOXIQUE — CDF ≥ 99ᵉ pct. Configuration d'avant-krach : réduire l'exposition / élargir les stops.
          </div>
        )}
        {!on ? (
          <div style={{ padding: 12, fontSize: 12, color: T.textDim }}>Connecte-toi au flux d'ordres réel de Binance pour surveiller la toxicité VPIN tick par tick (classification acheteur/vendeur réelle). Une alerte se déclenche si le flux devient toxique.</div>
        ) : (
          <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <ScoreGauge score={cdfPct} label="CDF VPIN" size={92} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: feed.tox.color, fontFamily: T.mono, marginBottom: 8 }}>{feed.tox.label}</div>
              <MetricGrid min={110}>
                <MetricCard label="VPIN" value={fmt(feed.vpin, 3)} color={feed.cdf >= 0.9 ? T.red : feed.cdf >= 0.7 ? T.yellow : T.green} />
                <MetricCard label="CDF" value={Number.isNaN(cdfPct) ? "—" : `${cdfPct.toFixed(0)}%`} color={feed.tox.color} />
                <MetricCard label="Prix" value={fmt(feed.lastPrice, 2)} color={T.orange} />
                <MetricCard label="Trades/s" value={fmt(feed.tps, 0)} sub={`${feed.buckets} buckets`} />
              </MetricGrid>
            </div>
          </div>
        )}
        {feed.error && <div style={{ marginTop: 8, fontSize: 10.5, color: T.red }}>⚠️ {feed.error} (réseau/pare-feu ? le WebSocket Binance peut être bloqué).</div>}
        <div style={{ marginTop: 8, fontSize: 10, color: T.textFaint, lineHeight: 1.5 }}>Classification order-flow réelle via le flag maker de chaque trade agrégé. Amorçage depuis les klines 1m. Au-delà du 90ᵉ percentile = flux toxique. ⚠️ Signal de risque, pas un conseil d'investissement.</div>
      </Panel>
    </div>
  );
}
