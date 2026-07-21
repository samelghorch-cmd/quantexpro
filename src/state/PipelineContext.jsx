// Contexte global : données de marché, navigation, résultats du pipeline ET magasin de
// résultats persistant par module (survit aux changements de page).
import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { CONTRACTS } from "../engine/contracts.js";
import { generateSyntheticCandles, aggregateBars } from "../engine/syntheticData.js";
import { buildContext } from "../engine/context.js";
import { buildStrategyLibrary } from "../engine/strategyLibrary.js";
import { fetchCandles } from "../engine/marketData.js";

const Ctx = createContext(null);

export function PipelineProvider({ children }) {
  // Navigation (pilotable depuis n'importe quelle page)
  const [activeModule, setActiveModule] = useState("factory");
  const navigate = useCallback((id) => setActiveModule(id), []);

  // Magasin de résultats persistant : { [key]: data } — ne se vide pas quand on change de page
  const [store, setStore] = useState({});

  // Paramètres de marché globaux
  const [symbol, setSymbol] = useState("MES");
  const [nBars, setNBars] = useState(1500);
  const [seed, setSeed] = useState(42);
  const [tf, setTf] = useState(1);

  // Mode données : synthétique vs réel
  const [dataMode, setDataMode] = useState("synthetic");
  const [assetKey, setAssetKey] = useState("BTC");
  const [liveBars, setLiveBars] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [dataMeta, setDataMeta] = useState(null);
  const reqId = useRef(0);

  // Résultats du pipeline scientifique
  const [pipeline, setPipeline] = useState({
    lastBacktest: null, faoResults: null, postFaoTop10: null,
    quantOptimizerBest: null, validatorVerdict: null, recoFinale: null,
    selectedStrategyId: 3, strategyParams: null,
  });
  const [logs, setLogs] = useState([]);
  const [journal, setJournal] = useState([]);

  const log = useCallback((module, message, level = "info") => {
    setLogs((l) => [{ t: Date.now(), module, message, level }, ...l].slice(0, 500));
  }, []);

  const library = useMemo(() => buildStrategyLibrary(), []);
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
      setDataError(String(e.message || e)); setLiveBars(null);
      log("Data", `Erreur ${assetKey} : ${e.message || e}`, "error");
    } finally { if (id === reqId.current) setDataLoading(false); }
  }, [assetKey, tf, log]);

  useEffect(() => { if (dataMode === "live") loadLive(); }, [dataMode, assetKey, tf, loadLive]);

  const usingReal = dataMode === "live" && liveBars && liveBars.length >= 60;
  const bars = usingReal ? liveBars : synthBars;
  const rawBars = usingReal ? liveBars : synthRaw;
  const ctx = useMemo(() => buildContext(bars), [bars]);

  const setPipe = useCallback((patch) => {
    setPipeline((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }));
  }, []);
  const addJournal = useCallback((entry) => {
    setJournal((j) => [{ t: Date.now(), ...entry }, ...j].slice(0, 300));
  }, []);

  const value = {
    activeModule, navigate,
    _store: store, _setStore: setStore,
    symbol, setSymbol, nBars, setNBars, seed, setSeed, tf, setTf,
    CONTRACTS, library, rawBars, bars, ctx,
    dataMode, setDataMode, assetKey, setAssetKey, liveBars, dataLoading, dataError, dataMeta,
    usingReal, reloadData: () => loadLive(true),
    pipeline, setPipe, logs, log, journal, addJournal,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePipeline() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePipeline must be used within PipelineProvider");
  return v;
}

// Hook drop-in remplaçant useState : l'état est stocké dans le magasin central et
// SURVIT aux changements de page. `key` doit être unique par module.
export function usePersistentState(key, initial) {
  const { _store, _setStore } = usePipeline();
  const has = Object.prototype.hasOwnProperty.call(_store, key);
  const value = has ? _store[key] : initial;
  const setValue = useCallback((v) => {
    _setStore((s) => {
      const cur = Object.prototype.hasOwnProperty.call(s, key) ? s[key] : initial;
      return { ...s, [key]: typeof v === "function" ? v(cur) : v };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, setValue];
}
