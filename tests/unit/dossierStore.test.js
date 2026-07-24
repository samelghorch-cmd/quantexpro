// CYCLE DE VIE DES DOSSIERS DE STRATÉGIE — invariants ZDL (P0-T5, docs/TESTING.md §3).
//
// Le dossier (`dossierStore.js`) traverse 6 étapes : création → paramètres → résultats
// d'outils (`stages`) → note (`grade`) → validation/archivage → sessions de démo, et doit
// TOUT accumuler sans perte. Ces tests prouvent, sur un vrai IndexedDB (fake-indexeddb,
// environnement node) :
//   1. `gradeLetter` : table de vérité complète (bornes 85/75/65/50, NO-GO → F) ;
//   2. accumulation sans perte : `attachStage` / `updateDossier` préservent les `stages` ;
//   3. sérialisation des écritures : N écritures concurrentes → aucun lost update
//      (la `writeChain` du store est la garantie ZDL locale) ;
//   4. tri `listDossiers` par `updatedAt` décroissant ;
//   5. idempotence de l'archivage et des sessions de démo (upsert par id) ;
//   6. cycle complet → snapshot de référence normalisé (champs volatils neutralisés).
//
// IMPORTANT : `fake-indexeddb/auto` doit être importé AVANT `dossierStore.js` (qui importe
// `dataStore.js`) — il installe le global `indexedDB` que le store consomme paresseusement.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDossier,
  getDossier,
  listDossiers,
  updateDossier,
  attachStage,
  setGrade,
  upsertDemoSession,
  deleteDossier,
  clearDossiers,
  gradeLetter,
} from "../../src/engine/dossierStore.ts";

beforeEach(async () => {
  await clearDossiers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gradeLetter — table de vérité (score × verdict → lettre)", () => {
  const cases = [
    // NO-GO / NOGO → F quel que soit le score
    [100, "NO-GO", "F"],
    [95, "NOGO", "F"],
    [50, "no-go", "F"],
    // Bornes hautes : 85 = A, juste en dessous = B
    [85, "GO", "A"],
    [84.99, "GO", "B"],
    [75, "GO", "B"],
    [74.99, "GO", "C"],
    [65, "GO", "C"],
    [64.99, "GO", "D"],
    [50, "GO", "D"],
    [49.99, "GO", "E"],
    [0, "GO", "E"],
  ];
  for (const [score, verdict, letter] of cases) {
    it(`score ${score} / verdict ${verdict} → ${letter}`, () => {
      expect(gradeLetter(score, verdict)).toBe(letter);
    });
  }

  it("score non numérique ou absent → 0 → E (jamais d'exception)", () => {
    expect(gradeLetter(undefined, "GO")).toBe("E");
    expect(gradeLetter(null, undefined)).toBe("E");
    expect(gradeLetter("abc", "GO")).toBe("E");
  });
});

describe("Accumulation sans perte entre outils", () => {
  it("attachStage préserve les stages déjà présents et déduplique toolsApplied", async () => {
    const d = await createDossier({ name: "EMA", params: { slAtr: 2 } });
    await attachStage(d.id, "backtest", "Backtest", { totalPnL: 123 });
    await attachStage(d.id, "fao", "FAO", { robustness: 0.8 });
    // Ré-appliquer le même outil ne duplique pas l'entrée toolsApplied.
    const rec = await attachStage(d.id, "validator", "Backtest", { verdict: "GO" });

    expect(rec.stages.backtest).toMatchObject({ tool: "Backtest", totalPnL: 123 });
    expect(rec.stages.fao).toMatchObject({ tool: "FAO", robustness: 0.8 });
    expect(rec.stages.validator).toMatchObject({ tool: "Backtest", verdict: "GO" });
    expect(rec.toolsApplied).toEqual(["Backtest", "FAO"]); // "Backtest" dédupliqué
    expect(rec.params).toEqual({ slAtr: 2 }); // les paramètres saisis ne sont jamais écrasés
  });

  it("updateDossier applique un patch sans effacer stages / grade / demoSessions", async () => {
    const d = await createDossier({ name: "X" });
    await attachStage(d.id, "backtest", "Backtest", { totalPnL: 10 });
    await setGrade(d.id, { verdict: "GO", score: 80 });
    const rec = await updateDossier(d.id, { symbol: "BTC", tf: "H1" });

    expect(rec.symbol).toBe("BTC");
    expect(rec.tf).toBe("H1");
    expect(rec.stages.backtest).toMatchObject({ totalPnL: 10 });
    expect(rec.grade).toMatchObject({ verdict: "GO", letter: "B" });
  });
});

describe("Sérialisation des écritures (writeChain) — aucun lost update concurrent", () => {
  it("4 écritures read-modify-write lancées en parallèle sont toutes conservées", async () => {
    // Sans la file d'écriture sérialisée, ces opérations liraient toutes la MÊME base `d`
    // puis s'écraseraient mutuellement (lost update). La writeChain les ordonne → tout persiste.
    const d = await createDossier({ name: "Concurrent" });
    await Promise.all([
      attachStage(d.id, "backtest", "Backtest", { totalPnL: 1 }),
      attachStage(d.id, "fao", "FAO", { robustness: 2 }),
      attachStage(d.id, "validator", "Validator", { verdict: "GO" }),
      setGrade(d.id, { verdict: "GO", score: 82 }),
      updateDossier(d.id, { symbol: "ETH" }),
      upsertDemoSession(d.id, { id: "s1", bars: 5 }),
    ]);

    const f = await getDossier(d.id);
    expect(Object.keys(f.stages).sort()).toEqual(["backtest", "fao", "validator"]);
    expect(f.stages.backtest).toMatchObject({ totalPnL: 1 });
    expect(f.stages.fao).toMatchObject({ robustness: 2 });
    expect(f.stages.validator).toMatchObject({ verdict: "GO" });
    expect(f.grade).toMatchObject({ verdict: "GO", letter: "B" });
    expect(f.symbol).toBe("ETH");
    expect(f.demoSessions).toHaveLength(1);
    expect(f.demoSessions[0]).toMatchObject({ id: "s1", bars: 5 });
  });
});

describe("setGrade — fige verdict + lettre dérivée", () => {
  it("GO score 88 → lettre A ; NO-GO → F même avec un score élevé", async () => {
    const d = await createDossier({ name: "G" });
    const a = await setGrade(d.id, { verdict: "GO", score: 88, components: [{ k: "sharpe", v: 1.5 }] });
    expect(a.grade).toMatchObject({ verdict: "GO", score: 88, letter: "A" });
    expect(a.grade.components).toEqual([{ k: "sharpe", v: 1.5 }]);

    const b = await setGrade(d.id, { verdict: "NO-GO", score: 90 });
    expect(b.grade.letter).toBe("F");
  });
});

describe("listDossiers — tri par updatedAt décroissant", () => {
  it("le plus récemment mis à jour est en tête", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    now = 1_000; const a = await createDossier({ name: "A" });
    now = 2_000; const b = await createDossier({ name: "B" });
    now = 3_000; const c = await createDossier({ name: "C" });
    // On « touche » A en dernier → il doit repasser en tête.
    now = 4_000; await updateDossier(a.id, { symbol: "X" });

    const ordered = (await listDossiers()).map((d) => d.name);
    expect(ordered).toEqual(["A", "C", "B"]);
    expect(a.id && b.id && c.id).toBeTruthy();
  });
});

describe("Idempotence — archivage & sessions de démo", () => {
  it("archiver deux fois laisse le même état (archived: true)", async () => {
    const d = await createDossier({ name: "Arch" });
    const once = await updateDossier(d.id, { archived: true });
    const twice = await updateDossier(d.id, { archived: true });
    expect(once.archived).toBe(true);
    expect(twice.archived).toBe(true);
    expect((await listDossiers()).filter((x) => x.archived)).toHaveLength(1);
  });

  it("upsertDemoSession met à jour la session existante au lieu d'en créer une nouvelle", async () => {
    const d = await createDossier({ name: "Demo" });
    await upsertDemoSession(d.id, { id: "sess", bars: 10, trades: 1 });
    await upsertDemoSession(d.id, { id: "sess", bars: 20, trades: 3 });
    const f = await getDossier(d.id);
    expect(f.demoSessions).toHaveLength(1);
    expect(f.demoSessions[0]).toMatchObject({ id: "sess", bars: 20, trades: 3 });
  });
});

describe("Robustesse — opérations sur un id inexistant", () => {
  it("update / attach / setGrade / upsert sur un id absent renvoient null sans lever", async () => {
    expect(await updateDossier("nope", { a: 1 })).toBeNull();
    expect(await attachStage("nope", "backtest", "Backtest", {})).toBeNull();
    expect(await setGrade("nope", { verdict: "GO", score: 50 })).toBeNull();
    expect(await upsertDemoSession("nope", { id: "s" })).toBeNull();
    expect(await getDossier(null)).toBeNull();
  });

  it("deleteDossier retire le dossier du store", async () => {
    const d = await createDossier({ name: "Del" });
    expect(await getDossier(d.id)).not.toBeNull();
    await deleteDossier(d.id);
    expect(await getDossier(d.id)).toBeNull();
  });
});

describe("Cycle de vie complet (6 étapes) — snapshot normalisé", () => {
  it("création → params → stages → grade → archivage → démo : JSON final conforme", async () => {
    const d = await createDossier({
      name: "EMA Cross",
      strategyId: 101,
      symbol: "BTC",
      tf: "H1",
      dataMode: "real",
      params: { slAtr: 2, tpAtr: 3, direction: "both", capital: 100000 },
    });
    await attachStage(d.id, "backtest", "Backtest", { totalPnL: 1500, nTrades: 42 });
    await attachStage(d.id, "fao", "FAO", { robustness: 0.82 });
    await attachStage(d.id, "validator", "Validator", { verdict: "GO" });
    await setGrade(d.id, { verdict: "GO", score: 88, components: [{ k: "sharpe", v: 1.4 }] });
    await updateDossier(d.id, { archived: true }); // validation / archivage
    await upsertDemoSession(d.id, { id: "s1", bars: 10, trades: 2 });

    const final = normalize(await getDossier(d.id));

    expect(final).toEqual({
      id: "<id>",
      name: "EMA Cross",
      strategyId: 101,
      symbol: "BTC",
      tf: "H1",
      dataMode: "real",
      params: { slAtr: 2, tpAtr: 3, direction: "both", capital: 100000 },
      stages: {
        backtest: { ranAt: 0, tool: "Backtest", totalPnL: 1500, nTrades: 42 },
        fao: { ranAt: 0, tool: "FAO", robustness: 0.82 },
        validator: { ranAt: 0, tool: "Validator", verdict: "GO" },
      },
      toolsApplied: ["Backtest", "FAO", "Validator"],
      grade: { verdict: "GO", score: 88, letter: "A", components: [{ k: "sharpe", v: 1.4 }], gradedAt: 0 },
      demoSessions: [{ id: "s1", updatedAt: 0, bars: 10, trades: 2 }],
      archived: true,
      createdAt: 0,
      updatedAt: 0,
    });
  });
});

// Neutralise les champs volatils (id aléatoire, timestamps) pour une comparaison déterministe.
function normalize(rec) {
  const out = JSON.parse(JSON.stringify(rec));
  out.id = "<id>";
  out.createdAt = 0;
  out.updatedAt = 0;
  if (out.grade) out.grade.gradedAt = 0;
  for (const k of Object.keys(out.stages || {})) out.stages[k].ranAt = 0;
  for (const s of out.demoSessions || []) s.updatedAt = 0;
  return out;
}
