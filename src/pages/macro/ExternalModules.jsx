// Modules qui nécessitent une vraie source de données externe — état "connecte ta source".
// Aucune donnée n'est inventée : EmptyStateExternalData + champ clé API en localStorage.
import { EmptyStateExternalData } from "../../components/shared/EmptyStateExternalData.jsx";

const EXT = {
  macroCalendar: { title: "Macro Calendar", providers: ["Trading Economics", "Finnhub", "FRED"], description: "Calendrier des événements macroéconomiques (NFP, CPI, décisions de taux…). Nécessite un flux d'agenda économique en temps réel." },
  events: { title: "Events", providers: ["Finnhub", "Benzinga"], description: "Flux d'événements de marché (earnings, splits, dividendes, annonces). Nécessite une API d'événements corporatifs." },
  cryptoWhales: { title: "Crypto Whales", providers: ["Whale Alert", "Arkham", "Nansen"], description: "Suivi des mouvements de gros portefeuilles on-chain. Nécessite une API on-chain / whale tracking." },
  shipTracker: { title: "Ship Tracker", providers: ["MarineTraffic", "Spire AIS"], description: "Labs — suivi AIS du trafic maritime pour les flux de matières premières. Nécessite un connecteur AIS (pas de données inventées)." },
  cot: { title: "COT — Commitments of Traders", providers: ["CFTC", "Quandl/Nasdaq Data Link"], description: "Positionnement des acteurs (commercials, large specs) publié hebdomadairement par la CFTC." },
  yieldCurve: { title: "Yield Curve", providers: ["FRED", "US Treasury"], description: "Courbe des taux réels (2Y/10Y/30Y) et spreads. Nécessite les données de taux souverains." },
  usdLiquidity: { title: "USD Liquidity", providers: ["FRED (WALCL, RRP, TGA)"], description: "Liquidité nette du dollar (bilan Fed − RRP − TGA). Nécessite les séries FRED de la Réserve fédérale." },
  inflation: { title: "Inflation", providers: ["FRED (CPI, PCE)", "BLS"], description: "Séries d'inflation réalisée et anticipée (breakevens). Nécessite les données officielles CPI/PCE." },
  surpriseIndex: { title: "Surprise Index", providers: ["Citi Economic Surprise", "Bloomberg"], description: "Indice de surprise économique (réalisé vs consensus). Nécessite un flux consensus + réalisé." },
  riskOnOff: { title: "Risk On/Off", providers: ["Spreads crédit (FRED)", "VIX (CBOE)"], description: "Jauge risk-on/risk-off basée sur spreads de crédit, VIX et corrélations inter-marchés. Nécessite de vraies données de marché pour être significative." },
  liveTv: { title: "Live TV", providers: ["Bloomberg TV", "CNBC", "YouTube Live"], description: "Labs — flux vidéo / actualité financière en direct. Nécessite une source de streaming externe (aucune vidéo mockée)." },
  onchain: { title: "Onchain", providers: ["Glassnode", "Dune", "Nansen"], description: "Métriques on-chain (SOPR, MVRV, flux exchanges…). Nécessite une API de données blockchain." },
};

export function makeExternalPage(key) {
  const cfg = EXT[key];
  return function ExternalPage() {
    return <EmptyStateExternalData moduleKey={key} title={cfg.title} description={cfg.description} providers={cfg.providers} />;
  };
}

export const EXTERNAL_KEYS = Object.keys(EXT);
