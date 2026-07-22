// Mapping module id → composant page. Source unique consommée par App.jsx.
import { Building } from "./Building.jsx";
import { ALL_MODULES } from "../registry.js";

// STRATEGY ENGINE
import { CoreModeDeveloperPage } from "./strategyEngine/CoreModeDeveloper.jsx";
import { StrategyImporterPage } from "./strategyEngine/StrategyImporter.jsx";
// ANALYSE
import { BacktestPage } from "./analyse/Backtest.jsx";
import { OptimizerPage } from "./analyse/Optimizer.jsx";
import { TradesPage, AnalysePage } from "./analyse/TradesAnalyse.jsx";
// RISQUE
import { MonteCarloPage, WalkForwardPage } from "./risque/MonteCarloWF.jsx";
import { KellyEvPage, RobustessePage, AuditPage, HistoriquePage } from "./risque/RisqueTools.jsx";
import { PropfirmConvexPage } from "./risque/PropfirmConvex.jsx";
// TRADING
import { ChartLivePage, CockpitPage, MasterCockpitPage, OrchestrateurPage, NewsReactPage, LiveOptimPage } from "./trading/TradingLive.jsx";
import { ForwardTestPage } from "./trading/ForwardTest.jsx";
import { PerformancePage, VPFootprintPage, BehaviorTrackerPage, SpreadComparePage, HMMRegimePage, StrategiesPage, SignauxPage, SignalEnginePage, ExecQualityPage, RiskCalcPage } from "./trading/TradingTools.jsx";
// OPTIMISATION
import { FullAutoOptimPage } from "./optimisation/FullAutoOptim.jsx";
import { PostFaoSynthPage } from "./optimisation/PostFaoSynth.jsx";
import { QuantOptimizerPage } from "./optimisation/QuantOptimizer.jsx";
import { ValidatorPage } from "./optimisation/Validator.jsx";
import { Sensitivity2DPage, ParetoPage, CrossTFPage, CrossSymbolPage, PairsPage } from "./optimisation/AdvancedOptim.jsx";
import { QuantToolboxPage } from "./optimisation/QuantToolbox.jsx";
import { StrategyFactoryPage } from "./optimisation/StrategyFactory.jsx";
import { GeneticOptimPage } from "./optimisation/GeneticOptim.jsx";
// MACRO
import { RecoFinalePage } from "./macro/RecoFinale.jsx";
import { CPCVPage, DonneesSynthPage, FeatureMiningPage, SymbolicGPPage, TailRiskPage, CorrelationsPage, RegimeClockPage, MicrostructureLivePage, MacroMapPage, SeasonalPage } from "./macro/InternalModules.jsx";
import { makeExternalPage } from "./macro/ExternalModules.jsx";
import { YieldCurvePage, InflationPage, UsdLiquidityPage } from "./macro/MacroFred.jsx";
import { CotPage } from "./macro/CotPage.jsx";
// OUTILS
import { VPINPage, AnalyseQuantPage, LogsPage } from "./outils/Outils.jsx";
import { VpinCockpitPage } from "./outils/VpinCockpit.jsx";
import { DataManagerPage } from "./outils/DataManager.jsx";
// EXPORT
import { StrategyBuilderPage } from "./export/StrategyBuilder.jsx";
import { SavedStrategiesPage } from "./export/SavedStrategies.jsx";
import { DossiersPage } from "./export/Dossiers.jsx";

const REAL = {
  // Strategy Engine
  coreMode: CoreModeDeveloperPage,
  strategyImporter: StrategyImporterPage,
  // Analyse
  backtest: BacktestPage,
  optimizer: OptimizerPage,
  trades: TradesPage,
  analyse: AnalysePage,
  // Risque
  monteCarlo: MonteCarloPage,
  kellyEv: KellyEvPage,
  robustesse: RobustessePage,
  audit: AuditPage,
  walkForward: WalkForwardPage,
  historique: HistoriquePage,
  propfirm: PropfirmConvexPage,
  // Trading
  chartLive: ChartLivePage,
  performance: PerformancePage,
  liveTv: makeExternalPage("liveTv"),
  cockpit: CockpitPage,
  masterCockpit: MasterCockpitPage,
  vpFootprint: VPFootprintPage,
  behaviorTracker: BehaviorTrackerPage,
  spreadCompare: SpreadComparePage,
  hmmRegime: HMMRegimePage,
  strategies: StrategiesPage,
  orchestrateur: OrchestrateurPage,
  signaux: SignauxPage,
  signalEngine: SignalEnginePage,
  execQuality: ExecQualityPage,
  riskCalc: RiskCalcPage,
  newsReact: NewsReactPage,
  liveOptim: LiveOptimPage,
  forwardTest: ForwardTestPage,
  // Optimisation
  factory: StrategyFactoryPage,
  geneticOptim: GeneticOptimPage,
  fao: FullAutoOptimPage,
  postFao: PostFaoSynthPage,
  quantOptimizer: QuantOptimizerPage,
  validator: ValidatorPage,
  sensitivity: Sensitivity2DPage,
  pareto: ParetoPage,
  crossTf: CrossTFPage,
  crossSymbol: CrossSymbolPage,
  pairs: PairsPage,
  quantToolbox: QuantToolboxPage,
  // Macro
  recoFinale: RecoFinalePage,
  cpcv: CPCVPage,
  donneesSynth: DonneesSynthPage,
  featureMining: FeatureMiningPage,
  symbolicGp: SymbolicGPPage,
  tailRisk: TailRiskPage,
  correlations: CorrelationsPage,
  regimeClock: RegimeClockPage,
  microstructureLive: MicrostructureLivePage,
  macroMap: MacroMapPage,
  seasonal: SeasonalPage,
  macroCalendar: makeExternalPage("macroCalendar"),
  events: makeExternalPage("events"),
  cryptoWhales: makeExternalPage("cryptoWhales"),
  shipTracker: makeExternalPage("shipTracker"),
  optionsGamma: makeExternalPage("optionsGamma"),
  cot: CotPage,
  yieldCurve: YieldCurvePage,
  usdLiquidity: UsdLiquidityPage,
  riskOnOff: makeExternalPage("riskOnOff"),
  inflation: InflationPage,
  surpriseIndex: makeExternalPage("surpriseIndex"),
  // Outils
  dataManager: DataManagerPage,
  quantToolboxTool: QuantToolboxPage,
  vpin: VPINPage,
  vpinLive: VpinCockpitPage,
  analyseQuant: AnalyseQuantPage,
  onchain: makeExternalPage("onchain"),
  logs: LogsPage,
  performanceTool: PerformancePage,
  // Export
  strategyBuilder: StrategyBuilderPage,
  dossiers: DossiersPage,
  savedStrategies: SavedStrategiesPage,
};

export const PAGES = Object.fromEntries(
  ALL_MODULES.map((m) => [m.id, REAL[m.id] || (() => <Building name={m.label} />)])
);
