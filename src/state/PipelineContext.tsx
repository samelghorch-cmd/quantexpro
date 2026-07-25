// Contexte global : données de marché, navigation, résultats du pipeline ET magasin de
// résultats persistant par module (survit aux changements de page).
import {
  createContext, useContext, useMemo, useState, useCallback, useEffect, useRef,
  type Dispatch, type SetStateAction, type ReactNode,
} from "react";
import { CONTRACTS } from "../engine/contracts.ts";
import { generateSyntheticCandles, aggregateBars } from "../engine/syntheticData.ts";
import { buildContext, type OHLCVBar, type TradingContext } from "../engine/context.ts";
import { buildFullLibrary } from "../engine/customStrategies.ts";
import { fetchCandles, type CatalogSymbol, type QualityReport } from "../engine/marketData.ts";
import {
  createDossier, getDossier, updateDossier, attachStage, setGrade as setDossierGrade, upsertDemoSession,
  type CreateDossierInput, type DemoSession,
} from "../engine/dossierStore.ts";

// --- Types exposés par le contexte (consommés par toutes les pages via usePipeline). ---
export interface LogEntry { t: number; module: string; message: string; level: string; }
export type JournalEntry = { t: number } & Record<string, unknown>;

// Résultats du pipeline scientifique. Les payloads d'outils sont hétérogènes (sorties
// moteur variées) → typés `any`, honnête et sans friction pour les pages consommatrices.
export interface PipelineState {
  lastBacktest: any;
  faoResults: any;
  postFaoTop10: any;
  quantOptimizerBest: any;
  validatorVerdict: any;
  recoFinale: any;
  selectedStrategyId: number | string | null;
  strategyParams: any;
}

export interface DataMeta {
  symbol: CatalogSymbol;
  cached: boolean;
  count: number;
  at: number;
  report?: QualityReport;
}

type GradeInput = { verdict?: unknown; score?: unknown; components?: unknown[] };

export interface PipelineValue {
  activeModule: string;
  navigate: (id: string) => void;
  _store: Record<string, unknown>;
  _setStore: Dispatch<SetStateAction<Record<string, unknown>>>;
  symbol: string;
  setSymbol: Dispatch<SetStateAction<string>>;
  nBars: number; setNBars: Dispatch<SetStateAction<number>>;
  seed: number; setSeed: Dispatch<SetStateAction<number>>;
  tf: number; setTf: Dispatch<SetStateAction<number>>;
  CONTRACTS: typeof CONTRACTS;
  library: ReturnType<typeof buildFullLibrary>;
  refreshLibrary: () => void;
  rawBars: OHLCVBar[];
  bars: OHLCVBar[];
  ctx: TradingContext;
  dataMode: string; setDataMode: Dispatch<SetStateAction<string>>;
  assetKey: string; setAssetKey: Dispatch<SetStateAction<string>>;
  liveBars: OHLCVBar[] | null;
  dataLoading: boolean;
  dataError: string | null;
  dataMeta: DataMeta | null;
  usingReal: boolean;
  reloadData: () => Promise<void>;
  pipeline: PipelineState;
  setPipe: (patch: Partial<PipelineState> | ((p: PipelineState) => Partial<PipelineState>)) => void;
  logs: LogEntry[];
  log: (module: string, message: string, level?: string) => void;
  journal: JournalEntry[];
  addJournal: (entry: Record<string, unknown>) => void;
  activeDossierId: string | null;
  setActiveDossier: (id: string | null) => void;
  attachToActive: (stageKey: string, toolLabel: string, fullResult: Record<string, unknown>, meta?: CreateDossierInput) => Promise<unknown>;
  gradeActive: (grade: GradeInput, meta?: CreateDossierInput) => Promise<unknown>;
  saveDemoSession: (session: Partial<DemoSession> & Record<string, unknown>, meta?: CreateDossierInput) => Promise<unknown>;
}

const Ctx = createContext<PipelineValue | null>(null);

export function PipelineProvider({ children }: { children: ReactNode }) {
  // Navigation (pilotable depuis n'importe quelle page)
  const [activeModule, setActiveModule] = useState("factory");
  const navigate = useCallback((id: string) => setActiveModule(id), []);

  // Magasin de résultats persistant : { [key]: data } — ne se vide pas quand on change de page
  const [store, setStore] = useState<Record<string, unknown>>({});

  // Paramètres de marché globaux — futSymbol = contrat du mode synthétique ;
  // le `symbol` exposé (clé de trading/coûts) est calculé plus bas selon le mode.
  const [futSymbol, setSymbol] = useState("MES");
  const [nBars, setNBars] = useState(1500);
  const [seed, setSeed] = useState(42);
  const [tf, setTf] = useState(1);

  // Mode données : RÉEL par défaut (vraie donnée Binance/Yahoo, sans clé API).
  // Le mode "synthetic" reste dispo comme bac à sable rapide (données générées, hors-ligne).
  const [dataMode, setDataMode] = useState("live");
  const [assetKey, setAssetKey] = useState("BTC");
  const [liveBars, setLiveBars] = useState<OHLCVBar[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataMeta, setDataMeta] = useState<DataMeta | null>(null);
  const reqId = useRef(0);

  // Résultats du pipeline scientifique
  const [pipeline, setPipeline] = useState<PipelineState>({
    lastBacktest: null, faoResults: null, postFaoTop10: null,
    quantOptimizerBest: null, validatorVerdict: null, recoFinale: null,
    selectedStrategyId: 3, strategyParams: null,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);

  // Dossier de stratégie ACTIF — chaque outil y rattache son résultat (aucune perte). Persisté.
  const [activeDossierId, setActiveDossierId] = useState<string | null>(() => {
    try { return localStorage.getItem("activeDossierId") || null; } catch { return null; }
  });
  const setActiveDossier = useCallback((id: string | null) => {
    setActiveDossierId(id);
    try { id ? localStorage.setItem("activeDossierId", id) : localStorage.removeItem("activeDossierId"); } catch { /* noop */ }
  }, []);

  const log = useCallback((module: string, message: string, level = "info") => {
    setLogs((l) => [{ t: Date.now(), module, message, level }, ...l].slice(0, 500));
  }, []);

  // Librairie = 700 intégrées + stratégies CUSTOM persistées. libVersion invalide le memo
  // quand une custom est sauvegardée/supprimée (refreshLibrary) — dispo instantanément partout.
  const [libVersion, setLibVersion] = useState(0);
  const refreshLibrary = useCallback(() => setLibVersion((v) => v + 1), []);
  const library = useMemo(() => buildFullLibrary(), [libVersion]);
  const synthRaw = useMemo(() => generateSyntheticCandles(nBars, seed, 4500), [nBars, seed]);
  const synthBars = useMemo(() => aggregateBars(synthRaw, tf), [synthRaw, tf]);

  const loadLive = useCallback(async (force = false) => {
    const id = ++reqId.current;
    setDataLoading(true); setDataError(null);
    try {
      const { bars, symbol: sym, cached, report } = await fetchCandles(assetKey, tf, { force });
      if (id !== reqId.current) return;
      if (!bars || bars.length < 60) throw new Error("Historique insuffisant pour ce timeframe.");
      setLiveBars(bars);
      setDataMeta({ symbol: sym, cached, count: bars.length, at: Date.now(), report });
      log("Data", `${sym.label} (${sym.classLabel}) — ${bars.length} bougies ${cached ? "(cache)" : "chargées"}`);
    } catch (e) {
      if (id !== reqId.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setDataError(msg); setLiveBars(null);
      log("Data", `Erreur ${assetKey} : ${msg}`, "error");
    } finally { if (id === reqId.current) setDataLoading(false); }
  }, [assetKey, tf, log]);

  useEffect(() => { if (dataMode === "live") loadLive(); }, [dataMode, assetKey, tf, loadLive]);

  const usingReal = dataMode === "live" && liveBars != null && liveBars.length >= 60;
  // LA clé de trading : en mode réel c'est l'actif réel (BTC, SPX, EURUSD…) → resolveSpec
  // applique ses coûts propres (fee % + spread). Fini le Bitcoin facturé comme un Micro S&P.
  const symbol = usingReal ? assetKey : futSymbol;
  const bars: OHLCVBar[] = usingReal && liveBars ? liveBars : synthBars;
  const rawBars: OHLCVBar[] = usingReal && liveBars ? liveBars : synthRaw;
  const ctx = useMemo(() => buildContext(bars), [bars]);

  const setPipe = useCallback<PipelineValue["setPipe"]>((patch) => {
    setPipeline((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }));
  }, []);
  const addJournal = useCallback((entry: Record<string, unknown>) => {
    setJournal((j) => [{ t: Date.now(), ...entry }, ...j].slice(0, 300));
  }, []);

  // Garantit un dossier actif (auto-création au 1er outil), puis rattache le résultat complet de l'outil.
  const ensureActiveDossier = useCallback(async ({ name, strategyId, params }: CreateDossierInput = {}) => {
    if (activeDossierId) {
      const d = await getDossier(activeDossierId).catch(() => null);
      if (d) {
        // Réutilise le dossier actif SAUF si on backteste une stratégie différente (évite d'écraser le dossier d'une autre stratégie).
        const matches = strategyId == null || d.strategyId == null || d.strategyId === strategyId;
        if (matches) {
          if (d.strategyId == null && strategyId != null) await updateDossier(activeDossierId, { strategyId, name: name || d.name }); // adopte une stratégie si le dossier était vierge
          return activeDossierId;
        }
      }
    }
    const nd = await createDossier({ name, strategyId, symbol, tf, dataMode, params });
    setActiveDossier(nd.id);
    return nd.id;
  }, [activeDossierId, symbol, tf, dataMode, setActiveDossier]);

  const attachToActive = useCallback(async (stageKey: string, toolLabel: string, fullResult: Record<string, unknown>, meta: CreateDossierInput = {}) => {
    try { const id = await ensureActiveDossier(meta); return await attachStage(id, stageKey, toolLabel, fullResult); } catch { return null; }
  }, [ensureActiveDossier]);
  const gradeActive = useCallback(async (grade: GradeInput, meta: CreateDossierInput = {}) => {
    try { const id = await ensureActiveDossier(meta); return await setDossierGrade(id, grade); } catch { return null; }
  }, [ensureActiveDossier]);
  const saveDemoSession = useCallback(async (session: Partial<DemoSession> & Record<string, unknown>, meta: CreateDossierInput = {}) => {
    try { const id = await ensureActiveDossier(meta); return await upsertDemoSession(id, session); } catch { return null; }
  }, [ensureActiveDossier]);

  const value: PipelineValue = {
    activeModule, navigate,
    _store: store, _setStore: setStore,
    symbol, setSymbol, nBars, setNBars, seed, setSeed, tf, setTf,
    CONTRACTS, library, refreshLibrary, rawBars, bars, ctx,
    dataMode, setDataMode, assetKey, setAssetKey, liveBars, dataLoading, dataError, dataMeta,
    usingReal, reloadData: () => loadLive(true),
    pipeline, setPipe, logs, log, journal, addJournal,
    activeDossierId, setActiveDossier, attachToActive, gradeActive, saveDemoSession,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePipeline(): PipelineValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePipeline must be used within PipelineProvider");
  return v;
}

// Hook drop-in remplaçant useState : l'état est stocké dans le magasin central et
// SURVIT aux changements de page. `key` doit être unique par module.
export function usePersistentState<T = unknown>(key: string, initial: T): [T, (v: T | ((cur: T) => T)) => void] {
  const { _store, _setStore } = usePipeline();
  const has = Object.prototype.hasOwnProperty.call(_store, key);
  const value = (has ? _store[key] : initial) as T;
  const setValue = useCallback((v: T | ((cur: T) => T)) => {
    _setStore((s) => {
      const cur = (Object.prototype.hasOwnProperty.call(s, key) ? s[key] : initial) as T;
      return { ...s, [key]: typeof v === "function" ? (v as (cur: T) => T)(cur) : v };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, setValue];
}
