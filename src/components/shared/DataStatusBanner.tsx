// Bandeau honnête de statut des données réelles — visible sur toutes les pages.
// Politique produit : en mode réel, si la vraie donnée est indisponible, on le DIT
// clairement (raison + comment résoudre) au lieu de retomber en silence sur le synthétique.
import { usePipeline } from "../../state/PipelineContext.tsx";
import { Button } from "./ui.tsx";
import { T } from "./theme.ts";

// Traduit l'erreur technique en action concrète pour l'utilisateur.
function fixHint(err: string): string {
  const e = err.toLowerCase();
  if (e.includes("historique insuffisant")) return "Choisis un timeframe plus grand (1h, 4h, 1j) ou un autre actif — la source gratuite manque d'historique ici.";
  if (e.includes("inconnu")) return "Cet actif n'est pas couvert par la source gratuite. Choisis-en un autre dans la liste.";
  if (e.includes("429") || e.includes("rate") || e.includes("limit")) return "Trop de requêtes vers la source gratuite (rate limit). Attends ~30 s et réessaie.";
  if (e.includes("fetch") || e.includes("network") || e.includes("failed") || e.includes("load") || e.includes("cors")) return "Problème réseau, ou l'API (Binance/Yahoo) est momentanément indisponible. Vérifie ta connexion et réessaie.";
  return "Réessaie ; si ça persiste, change d'actif/timeframe, ou bascule en mode synthétique le temps que la source revienne.";
}

export function DataStatusBanner() {
  const { dataMode, dataError, dataLoading, assetKey, usingReal, reloadData, setDataMode } = usePipeline();

  // Pas en mode réel, ou données réelles OK → aucun bruit.
  if (dataMode !== "live") return null;
  if (usingReal && !dataError) return null;

  // Chargement en cours (transition synthétique → réel).
  if (dataLoading && !dataError) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 18px",
        background: T.bg1, borderBottom: `1px solid ${T.yellow}44`, flexShrink: 0, fontSize: 12,
      }}>
        <span>⏳</span>
        <span style={{ color: T.textDim }}>Chargement des données réelles pour <b style={{ color: T.text }}>{assetKey}</b>…</span>
      </div>
    );
  }

  // Erreur : message honnête (raison + comment résoudre) + actions.
  if (dataError) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "9px 18px",
        background: `${T.red}14`, borderBottom: `1px solid ${T.red}55`, borderLeft: `3px solid ${T.red}`, flexShrink: 0,
      }}>
        <span style={{ fontSize: 15 }}>⚠️</span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>
            Données réelles indisponibles — <span style={{ color: T.red }}>{assetKey}</span>
          </div>
          <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 1 }}>
            <b style={{ color: T.textDim }}>{dataError}</b> · {fixHint(dataError)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button primary onClick={reloadData}>↻ Réessayer</Button>
          <Button onClick={() => setDataMode("synthetic")}>Mode synthétique</Button>
        </div>
      </div>
    );
  }

  return null;
}
