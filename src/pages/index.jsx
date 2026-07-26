// Mapping module id → composant page. Source unique consommée par App.jsx.
// Code-split (P11-UI) : chaque page est chargée en lazy → un chunk par fichier,
// téléchargé seulement quand l'utilisateur ouvre le module. Le shell (Sidebar,
// TickerBar, GlobalControls) et le fallback restent dans le bundle initial.
// App.jsx enveloppe le rendu dans <Suspense> (fallback de chargement).
import { lazy } from "react";
import { Building } from "./Building.jsx";
import { makeExternalPage } from "./macro/ExternalModules.jsx";
import { ALL_MODULES, MODULE_ALIASES } from "../registry.ts";

// Charge un export NOMMÉ d'un module en lazy (React.lazy attend un default).
const L = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));

const REAL = {
  // Strategy Engine
  coreMode: L(() => import("./strategyEngine/CoreModeDeveloper.jsx"), "CoreModeDeveloperPage"),
  promptMode: L(() => import("./strategyEngine/PromptMode.jsx"), "PromptModePage"),
  strategyImporter: L(() => import("./strategyEngine/StrategyImporter.jsx"), "StrategyImporterPage"),
  signalReverse: L(() => import("./strategyEngine/SignalReverse.jsx"), "SignalReversePage"),
  // Analyse
  backtest: L(() => import("./analyse/Backtest.jsx"), "BacktestPage"),
  optimizer: L(() => import("./analyse/Optimizer.jsx"), "OptimizerPage"),
  trades: L(() => import("./analyse/TradesAnalyse.jsx"), "TradesPage"),
  analyse: L(() => import("./analyse/TradesAnalyse.jsx"), "AnalysePage"),
  // Risque
  monteCarlo: L(() => import("./risque/MonteCarloWF.jsx"), "MonteCarloPage"),
  kellyEv: L(() => import("./risque/RisqueTools.jsx"), "KellyEvPage"),
  robustesse: L(() => import("./risque/RisqueTools.jsx"), "RobustessePage"),
  audit: L(() => import("./risque/RisqueTools.jsx"), "AuditPage"),
  walkForward: L(() => import("./risque/MonteCarloWF.jsx"), "WalkForwardPage"),
  historique: L(() => import("./risque/RisqueTools.jsx"), "HistoriquePage"),
  propfirm: L(() => import("./risque/PropfirmConvex.jsx"), "PropfirmConvexPage"),
  // Trading
  chartLive: L(() => import("./trading/TradingLive.jsx"), "ChartLivePage"),
  performance: L(() => import("./trading/TradingTools.jsx"), "PerformancePage"),
  cockpit: L(() => import("./trading/TradingLive.jsx"), "CockpitPage"),
  masterCockpit: L(() => import("./trading/TradingLive.jsx"), "MasterCockpitPage"),
  pmDesk: L(() => import("./trading/PmDesk.jsx"), "PmDeskPage"),
  vpFootprint: L(() => import("./trading/TradingTools.jsx"), "VPFootprintPage"),
  behaviorTracker: L(() => import("./trading/TradingTools.jsx"), "BehaviorTrackerPage"),
  spreadCompare: L(() => import("./trading/TradingTools.jsx"), "SpreadComparePage"),
  hmmRegime: L(() => import("./trading/TradingTools.jsx"), "HMMRegimePage"),
  strategies: L(() => import("./trading/TradingTools.jsx"), "StrategiesPage"),
  orchestrateur: L(() => import("./trading/TradingLive.jsx"), "OrchestrateurPage"),
  signaux: L(() => import("./trading/TradingTools.jsx"), "SignauxPage"),
  signalEngine: L(() => import("./trading/TradingTools.jsx"), "SignalEnginePage"),
  execQuality: L(() => import("./trading/TradingTools.jsx"), "ExecQualityPage"),
  tca: L(() => import("./trading/Tca.jsx"), "TcaPage"),
  riskCalc: L(() => import("./trading/TradingTools.jsx"), "RiskCalcPage"),
  newsReact: L(() => import("./trading/TradingLive.jsx"), "NewsReactPage"),
  liveOptim: L(() => import("./trading/TradingLive.jsx"), "LiveOptimPage"),
  forwardTest: L(() => import("./trading/ForwardTest.jsx"), "ForwardTestPage"),
  // Optimisation
  alphaForge: L(() => import("./optimisation/AlphaForge.jsx"), "AlphaForgePage"),
  factory: L(() => import("./optimisation/StrategyFactory.jsx"), "StrategyFactoryPage"),
  antiLibrary: L(() => import("./optimisation/AntiLibrary.jsx"), "AntiLibraryPage"),
  geneticOptim: L(() => import("./optimisation/GeneticOptim.jsx"), "GeneticOptimPage"),
  fao: L(() => import("./optimisation/FullAutoOptim.jsx"), "FullAutoOptimPage"),
  postFao: L(() => import("./optimisation/PostFaoSynth.jsx"), "PostFaoSynthPage"),
  quantOptimizer: L(() => import("./optimisation/QuantOptimizer.jsx"), "QuantOptimizerPage"),
  validator: L(() => import("./optimisation/Validator.jsx"), "ValidatorPage"),
  sensitivity: L(() => import("./optimisation/AdvancedOptim.jsx"), "Sensitivity2DPage"),
  pareto: L(() => import("./optimisation/AdvancedOptim.jsx"), "ParetoPage"),
  crossTf: L(() => import("./optimisation/AdvancedOptim.jsx"), "CrossTFPage"),
  crossSymbol: L(() => import("./optimisation/AdvancedOptim.jsx"), "CrossSymbolPage"),
  pairs: L(() => import("./optimisation/AdvancedOptim.jsx"), "PairsPage"),
  quantToolbox: L(() => import("./optimisation/QuantToolbox.jsx"), "QuantToolboxPage"),
  // Macro
  recoFinale: L(() => import("./macro/RecoFinale.jsx"), "RecoFinalePage"),
  cpcv: L(() => import("./macro/InternalModules.jsx"), "CPCVPage"),
  donneesSynth: L(() => import("./macro/InternalModules.jsx"), "DonneesSynthPage"),
  featureMining: L(() => import("./macro/InternalModules.jsx"), "FeatureMiningPage"),
  symbolicGp: L(() => import("./macro/InternalModules.jsx"), "SymbolicGPPage"),
  tailRisk: L(() => import("./macro/InternalModules.jsx"), "TailRiskPage"),
  correlations: L(() => import("./macro/InternalModules.jsx"), "CorrelationsPage"),
  regimeClock: L(() => import("./macro/InternalModules.jsx"), "RegimeClockPage"),
  microstructureLive: L(() => import("./macro/InternalModules.jsx"), "MicrostructureLivePage"),
  macroMap: L(() => import("./macro/InternalModules.jsx"), "MacroMapPage"),
  seasonal: L(() => import("./macro/InternalModules.jsx"), "SeasonalPage"),
  macroCalendar: makeExternalPage("macroCalendar"),
  events: makeExternalPage("events"),
  cryptoWhales: makeExternalPage("cryptoWhales"),
  optionsGamma: L(() => import("./macro/OptionsGamma.jsx"), "OptionsGammaPage"),
  cot: L(() => import("./macro/CotPage.jsx"), "CotPage"),
  yieldCurve: L(() => import("./macro/MacroFred.jsx"), "YieldCurvePage"),
  usdLiquidity: L(() => import("./macro/MacroFred.jsx"), "UsdLiquidityPage"),
  riskOnOff: L(() => import("./macro/MacroFred.jsx"), "RiskOnOffPage"),
  inflation: L(() => import("./macro/MacroFred.jsx"), "InflationPage"),
  surpriseIndex: makeExternalPage("surpriseIndex"),
  // Labs
  labsHub: L(() => import("./labs/LabsHub.jsx"), "LabsHubPage"),
  sentiment: L(() => import("./labs/Sentiment.jsx"), "SentimentPage"),
  shipTracker: makeExternalPage("shipTracker"),
  liveTv: makeExternalPage("liveTv"),
  // Outils
  dataManager: L(() => import("./outils/DataManager.jsx"), "DataManagerPage"),
  vpin: L(() => import("./outils/Outils.jsx"), "VPINPage"),
  vpinLive: L(() => import("./outils/VpinCockpit.jsx"), "VpinCockpitPage"),
  analyseQuant: L(() => import("./outils/Outils.jsx"), "AnalyseQuantPage"),
  statisticalEdge: L(() => import("./outils/StatisticalEdge.jsx"), "StatisticalEdgePage"),
  onchain: makeExternalPage("onchain"),
  logs: L(() => import("./outils/Outils.jsx"), "LogsPage"),
  // Export
  strategyBuilder: L(() => import("./export/StrategyBuilder.jsx"), "StrategyBuilderPage"),
  dossiers: L(() => import("./export/Dossiers.jsx"), "DossiersPage"),
  savedStrategies: L(() => import("./export/SavedStrategies.jsx"), "SavedStrategiesPage"),
};

const basePages = Object.fromEntries(
  ALL_MODULES.map((m) => [m.id, REAL[m.id] || (() => <Building name={m.label} />)])
);

/** Aliases sidebar retirés (P2-UI) — même page que le canonical. */
export const PAGES = {
  ...basePages,
  ...Object.fromEntries(
    Object.entries(MODULE_ALIASES).map(([alias, canon]) => [
      alias,
      basePages[canon] || REAL[alias] || (() => <Building name={alias} />),
    ])
  ),
};
