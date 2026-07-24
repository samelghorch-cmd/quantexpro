// Registre des sections / modules — source de vérité de la navigation.
// P2-UI : section Labs + fusion doublons Quant Toolbox / Performance (aliases hors sidebar).
export const SECTIONS = [
  {
    id: "strategy", label: "Strategy Engine", icon: "◆",
    modules: [
      { id: "coreMode", label: "Core Mode Developer" },
      { id: "promptMode", label: "Prompt Mode (LLM local)" },
      { id: "strategyImporter", label: "Strategy Importer" },
    ],
  },
  {
    id: "analyse", label: "Analyse", icon: "▤",
    modules: [
      { id: "backtest", label: "Backtest" },
      { id: "optimizer", label: "Optimizer" },
      { id: "trades", label: "Trades" },
      { id: "analyse", label: "Analyse" },
    ],
  },
  {
    id: "risque", label: "Risque", icon: "⚠",
    modules: [
      { id: "monteCarlo", label: "Monte Carlo" },
      { id: "kellyEv", label: "Kelly / EV" },
      { id: "robustesse", label: "Robustesse" },
      { id: "audit", label: "Audit" },
      { id: "walkForward", label: "Walk-Forward" },
      { id: "historique", label: "Historique" },
      { id: "propfirm", label: "Propfirm Convex" },
    ],
  },
  {
    id: "trading", label: "Trading", icon: "▲",
    modules: [
      { id: "chartLive", label: "Chart Live" },
      { id: "performance", label: "Performance" },
      { id: "cockpit", label: "Cockpit" },
      { id: "masterCockpit", label: "Master Cockpit" },
      { id: "pmDesk", label: "▣ Desk PM" },
      { id: "vpFootprint", label: "VP Footprint" },
      { id: "behaviorTracker", label: "Behavior Tracker" },
      { id: "spreadCompare", label: "Spread Compare" },
      { id: "hmmRegime", label: "HMM Regime" },
      { id: "strategies", label: "Stratégies" },
      { id: "orchestrateur", label: "Orchestrateur" },
      { id: "signaux", label: "Signaux" },
      { id: "signalEngine", label: "Signal Engine" },
      { id: "execQuality", label: "Exec Quality" },
      { id: "tca", label: "TCA (slippage)" },
      { id: "riskCalc", label: "Risk Calc" },
      { id: "newsReact", label: "News React" },
      { id: "liveOptim", label: "Live Optim" },
      { id: "forwardTest", label: "🟢 Forward Test (démo réel)" },
    ],
  },
  {
    id: "optimisation", label: "Optimisation", icon: "⚙",
    modules: [
      { id: "alphaForge", label: "✦ Alpha Forge (Validated Edges)" },
      { id: "factory", label: "⚡ Usine à Stratégies" },
      { id: "antiLibrary", label: "🚫 Anti-Library" },
      { id: "geneticOptim", label: "🧬 Optim Génétique" },
      { id: "fao", label: "Full Auto Optim" },
      { id: "postFao", label: "Post-FAO Synth" },
      { id: "quantOptimizer", label: "Quant Optimizer" },
      { id: "validator", label: "Validator" },
      { id: "sensitivity", label: "Sensitivity 2D" },
      { id: "pareto", label: "Pareto Front" },
      { id: "crossTf", label: "Cross-TF Stability" },
      { id: "crossSymbol", label: "Cross-Symbol" },
      { id: "pairs", label: "Pairs Trading" },
      { id: "quantToolbox", label: "Quant Toolbox" },
    ],
  },
  {
    id: "macro", label: "Macro", icon: "◍",
    modules: [
      { id: "recoFinale", label: "Reco Finale" },
      { id: "cpcv", label: "CPCV Explorer" },
      { id: "donneesSynth", label: "Données Synth" },
      { id: "featureMining", label: "Feature Mining" },
      { id: "symbolicGp", label: "Symbolic GP" },
      { id: "tailRisk", label: "Tail Risk" },
      { id: "correlations", label: "Correlations" },
      { id: "regimeClock", label: "Regime Clock" },
      { id: "microstructureLive", label: "Microstructure Live" },
      { id: "macroMap", label: "Macro Map" },
      { id: "seasonal", label: "Seasonal" },
      { id: "macroCalendar", label: "Macro Calendar" },
      { id: "events", label: "Events" },
      { id: "cryptoWhales", label: "Crypto Whales" },
      { id: "optionsGamma", label: "Options Gamma" },
      { id: "cot", label: "COT" },
      { id: "yieldCurve", label: "Yield Curve" },
      { id: "usdLiquidity", label: "USD Liquidity" },
      { id: "riskOnOff", label: "Risk On/Off" },
      { id: "inflation", label: "Inflation" },
      { id: "surpriseIndex", label: "Surprise Index" },
    ],
  },
  {
    id: "labs", label: "Labs", icon: "◎",
    modules: [
      { id: "labsHub", label: "Labs Hub" },
      { id: "sentiment", label: "Sentiment (RSS)" },
      { id: "shipTracker", label: "Ship Tracker" },
      { id: "liveTv", label: "Live TV" },
    ],
  },
  {
    id: "outils", label: "Outils", icon: "⛭",
    modules: [
      { id: "dataManager", label: "🗄️ Data Manager" },
      { id: "vpin", label: "VPIN" },
      { id: "vpinLive", label: "🔴 VPIN Live Cockpit" },
      { id: "analyseQuant", label: "Analyse Quant" },
      { id: "statisticalEdge", label: "Statistical Edge" },
      { id: "onchain", label: "Onchain" },
      { id: "logs", label: "Logs" },
    ],
  },
  {
    id: "export", label: "Export", icon: "⇱",
    modules: [
      { id: "strategyBuilder", label: "Strategy Builder" },
      { id: "dossiers", label: "📁 Dossiers Stratégie" },
      { id: "savedStrategies", label: "💾 Mes Stratégies" },
    ],
  },
];

/** Aliases retirés de la sidebar (P2-UI) — navigate() reste valide. */
export const MODULE_ALIASES = {
  performanceTool: "performance",
  quantToolboxTool: "quantToolbox",
};

export const ALL_MODULES = SECTIONS.flatMap((s) => s.modules.map((m) => ({ ...m, section: s.id })));
export const MODULE_COUNT = ALL_MODULES.length;
