// Pattern unique pour les modules qui nécessitent une vraie source de données externe.
import { useState } from "react";
import { T, S } from "./theme.ts";
import { Badge } from "./ui.tsx";

export function EmptyStateExternalData({
  moduleKey,
  title,
  description,
  providers = [],
  fields = ["Clé API"],
}: {
  moduleKey: string;
  title: string;
  description: string;
  providers?: string[];
  fields?: string[];
}) {
  const storeKey = `tradobot.datasource.${moduleKey}`;
  const [connected, setConnected] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem(storeKey) || "null"); } catch { return false; }
  });
  const [vals, setVals] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) || "null")?.fields || {}; } catch { return {}; }
  });

  const connect = () => {
    const hasAll = fields.every((f) => (vals[f] || "").trim().length > 0);
    if (!hasAll) return;
    localStorage.setItem(storeKey, JSON.stringify({ connectedAt: Date.now(), fields: vals }));
    setConnected(true);
  };
  const disconnect = () => { localStorage.removeItem(storeKey); setConnected(false); };

  return (
    <div style={{ ...S.panel, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
        <div style={S.h}>{title}</div>
        <Badge color={connected ? T.green : T.red}>{connected ? "SOURCE CONFIGURÉE" : "NON CONNECTÉ"}</Badge>
      </div>
      <div style={{ padding: 28, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", border: `2px dashed ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🔌</div>
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>Ce module nécessite une source de données externe</div>
          <div style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.6 }}>{description}</div>
        </div>

        {connected ? (
          <div style={{ background: T.greenSoft, border: `1px solid ${T.green}44`, borderRadius: 8, padding: "12px 16px", fontSize: 12, color: T.text, maxWidth: 520 }}>
            Clé enregistrée localement (navigateur). Le branchement réel du flux de données sera activé quand le connecteur backend correspondant sera implémenté. Aucune requête réseau n'est effectuée pour l'instant.
            <div style={{ marginTop: 10 }}>
              <button style={S.btn} onClick={disconnect}>Déconnecter / effacer la clé</button>
            </div>
          </div>
        ) : (
          <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 10 }}>
            {providers.length > 0 && (
              <div style={{ fontSize: 11, color: T.textFaint }}>
                Fournisseurs compatibles : {providers.join(" · ")}
              </div>
            )}
            {fields.map((f) => (
              <div key={f} style={{ textAlign: "left" }}>
                <label style={S.label}>{f}</label>
                <input type="password" autoComplete="off" style={S.input} placeholder={`Colle ta ${f.toLowerCase()} ici`}
                  value={vals[f] || ""} onChange={(e) => setVals((v) => ({ ...v, [f]: e.target.value }))} />
              </div>
            ))}
            <button style={{ ...S.btnPrimary, marginTop: 4 }} onClick={connect}>Connecter la source</button>
            <div style={{ fontSize: 10.5, color: T.textFaint }}>
              La clé reste dans ton navigateur (localStorage). Elle n'est envoyée nulle part tant que le connecteur n'est pas branché.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
