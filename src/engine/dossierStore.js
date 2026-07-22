// DOSSIER DE STRATÉGIE — enregistrement unique qui traverse tout le cycle de vie et accumule
// TOUT, sans perte : paramètres saisis, résultat COMPLET de chaque outil (backtest équity+trades,
// FAO, Validator, Reco…), note figée (Reco Finale + lettre A-F), et sessions de démo live.
// Persisté en IndexedDB (survit au rechargement, contrairement au PipelineContext en mémoire).
import { idbPut, idbGet, idbAll, idbDelete, idbClear, DOSSIERS } from "./dataStore.js";

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Lettre A-F dérivée du score Reco Finale (0-100) et du verdict.
export function gradeLetter(score, verdict) {
  const v = String(verdict || "").toUpperCase();
  if (v === "NO-GO" || v === "NOGO") return "F";
  const s = Number(score) || 0;
  if (s >= 85) return "A";
  if (s >= 75) return "B";
  if (s >= 65) return "C";
  if (s >= 50) return "D";
  return "E";
}

export async function createDossier({ name, strategyId = null, symbol = null, tf = null, dataMode = null, params = {} } = {}) {
  const rec = {
    id: uid(),
    name: name || "Stratégie",
    strategyId,
    symbol, tf, dataMode,
    params,                    // paramètres saisis { slAtr, tpAtr, beAtr, direction, capital, ... }
    stages: {},                // { backtest, fao, validator, reco, ... } → résultat complet de chaque outil
    toolsApplied: [],          // liste dédupliquée des outils passés sur la stratégie
    grade: null,               // note figée { verdict, score, letter, components, gradedAt }
    demoSessions: [],          // sessions de démo live (bougies + trades papier accumulés)
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await idbPut(rec, DOSSIERS);
  return rec;
}

export async function getDossier(id) { return id ? idbGet(id, DOSSIERS) : null; }
export async function listDossiers() {
  const all = await idbAll(DOSSIERS);
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export async function deleteDossier(id) { return idbDelete(id, DOSSIERS); }
export async function clearDossiers() { return idbClear(DOSSIERS); }
export async function updateDossier(id, patch) {
  const d = await getDossier(id);
  if (!d) return null;
  const rec = { ...d, ...patch, updatedAt: Date.now() };
  await idbPut(rec, DOSSIERS);
  return rec;
}

// Rattache le résultat COMPLET d'un outil au dossier (aucune perte entre outils).
// stageKey : "backtest" | "fao" | "postFao" | "quantOpt" | "validator" | "reco" | "geneticOptim" | …
export async function attachStage(dossierId, stageKey, toolLabel, fullResult) {
  const d = await getDossier(dossierId);
  if (!d) return null;
  const stages = { ...(d.stages || {}), [stageKey]: { ranAt: Date.now(), tool: toolLabel, ...fullResult } };
  const toolsApplied = Array.from(new Set([...(d.toolsApplied || []), toolLabel]));
  const rec = { ...d, stages, toolsApplied, updatedAt: Date.now() };
  await idbPut(rec, DOSSIERS);
  return rec;
}

// Fige la note issue de la Reco Finale + lettre A-F.
export async function setGrade(dossierId, { verdict, score, components } = {}) {
  const d = await getDossier(dossierId);
  if (!d) return null;
  const grade = { verdict, score, letter: gradeLetter(score, verdict), components: components || [], gradedAt: Date.now() };
  const rec = { ...d, grade, updatedAt: Date.now() };
  await idbPut(rec, DOSSIERS);
  return rec;
}

// Ajoute / met à jour une session de démo live (data accumulée au fil de l'eau).
export async function upsertDemoSession(dossierId, session) {
  const d = await getDossier(dossierId);
  if (!d) return null;
  const sessions = [...(d.demoSessions || [])];
  const idx = session.id ? sessions.findIndex((s) => s.id === session.id) : -1;
  const rec2 = { id: session.id || uid(), updatedAt: Date.now(), ...session };
  if (idx >= 0) sessions[idx] = { ...sessions[idx], ...rec2 };
  else sessions.push(rec2);
  const rec = { ...d, demoSessions: sessions, updatedAt: Date.now() };
  await idbPut(rec, DOSSIERS);
  return rec2.id;
}
