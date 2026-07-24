// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Investor Tearsheet PDF — rapport institutionnel par dossier de stratégie (P1-PDF).
import { buildTextPdf } from "./pdfLite.ts";

const fmtN = (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d));
const fmtPct = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(1)}%`);
const fmtUsd = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `$${Number(v).toFixed(2)}`);
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19).replace("T", " ") : "—");

/**
 * Modèle structuré du tearsheet (testable sans PDF).
 * @param {object} dossier
 */
export function buildTearsheetModel(dossier) {
  if (!dossier || typeof dossier !== "object") {
    throw new Error("dossier requis");
  }
  const stages = dossier.stages || {};
  const bt = stages.backtest?.res || null;
  const fao = stages.fao || null;
  const validator = stages.validator || null;
  const reco = stages.reco || null;
  const grade = dossier.grade || null;

  return {
    title: "QuantEXPro — Investor Tearsheet",
    generatedAt: Date.now(),
    identity: {
      name: dossier.name || "Strategie",
      id: dossier.id || "—",
      strategyId: dossier.strategyId ?? null,
      symbol: dossier.symbol || "—",
      tf: dossier.tf ?? "—",
      dataMode: dossier.dataMode || "—",
      createdAt: dossier.createdAt || null,
      updatedAt: dossier.updatedAt || null,
    },
    grade: grade
      ? {
          letter: grade.letter || "—",
          verdict: grade.verdict || "—",
          score: grade.score ?? null,
          gradedAt: grade.gradedAt || null,
        }
      : null,
    params: { ...(dossier.params || {}) },
    toolsApplied: [...(dossier.toolsApplied || [])],
    backtest: bt
      ? {
          nTrades: bt.nTrades,
          winRate: bt.winRate,
          profitFactor: bt.profitFactor,
          sharpe: bt.sharpe,
          sortino: bt.sortino,
          maxDD: bt.maxDD,
          expectancyR: bt.expectancyR,
          totalPnL: bt.totalPnL,
          totalPnLPct: bt.totalPnLPct,
        }
      : null,
    fao: fao
      ? {
          attempts: fao.attempts,
          retained: fao.combos?.length ?? null,
          bestExpectancyR: fao.best?.expectancyR,
          bestPF: fao.best?.profitFactor,
          bestSharpe: fao.best?.sharpe,
        }
      : null,
    validator: validator
      ? {
          verdict: validator.verdict,
          gates: (validator.gates || []).map((g) => ({ name: g.name, verdict: g.verdict })),
        }
      : null,
    reco: reco
      ? {
          verdict: reco.verdict,
          finalScore: reco.finalScore,
          nTrials: reco.nTrials,
        }
      : null,
    demoSessions: (dossier.demoSessions || []).length,
    disclaimer:
      "Disclaimer: performances passees ne prejugent pas des resultats futurs. "
      + "Le trading comporte un risque de perte en capital. Document informatif QuantEXPro — pas un conseil en investissement.",
  };
}

/** Transforme le modèle en lignes texte pour le PDF. */
export function tearsheetLines(model) {
  const m = model;
  const lines = [];
  lines.push("## INVESTOR TEARSHEET");
  lines.push(`Genere le ${iso(m.generatedAt)} UTC`);
  lines.push("");
  lines.push("## 1. Identite");
  lines.push(`Strategie : ${m.identity.name}`);
  lines.push(`Dossier ID : ${m.identity.id}`);
  lines.push(`Strategy # : ${m.identity.strategyId ?? "—"}`);
  lines.push(`Actif / TF : ${m.identity.symbol} / ${m.identity.tf}`);
  lines.push(`Mode donnees : ${m.identity.dataMode}`);
  lines.push(`Cree : ${iso(m.identity.createdAt)} · MAJ : ${iso(m.identity.updatedAt)}`);
  lines.push("");

  lines.push("## 2. Note institutionnelle");
  if (m.grade) {
    lines.push(`Lettre : ${m.grade.letter} · Verdict : ${m.grade.verdict} · Score : ${fmtN(m.grade.score, 0)}/100`);
    lines.push(`Notee le : ${iso(m.grade.gradedAt)}`);
  } else {
    lines.push("Non note — lancer Reco Finale pour figer la note A-F.");
  }
  lines.push("");

  lines.push("## 3. Parametres");
  const keys = Object.keys(m.params);
  if (keys.length === 0) lines.push("(aucun)");
  else keys.forEach((k) => lines.push(`  ${k} = ${String(m.params[k])}`));
  lines.push("");

  lines.push("## 4. Backtest");
  if (m.backtest) {
    const b = m.backtest;
    lines.push(`Trades : ${b.nTrades ?? "—"} · WR : ${fmtPct(b.winRate)} · PF : ${fmtN(b.profitFactor)}`);
    lines.push(`Sharpe : ${fmtN(b.sharpe)} · Sortino : ${fmtN(b.sortino)} · MaxDD : ${fmtPct((b.maxDD || 0) * 100)}`);
    lines.push(`Expectancy R : ${fmtN(b.expectancyR)} · PnL : ${fmtUsd(b.totalPnL)} (${fmtPct(b.totalPnLPct)})`);
  } else {
    lines.push("(backtest non rattache au dossier)");
  }
  lines.push("");

  lines.push("## 5. Optimisation (FAO)");
  if (m.fao) {
    lines.push(`Essais : ${m.fao.attempts ?? "—"} · Retenus : ${m.fao.retained ?? "—"}`);
    lines.push(`Best Exp.R : ${fmtN(m.fao.bestExpectancyR)} · Best PF : ${fmtN(m.fao.bestPF)} · Best Sharpe : ${fmtN(m.fao.bestSharpe)}`);
  } else {
    lines.push("(FAO non rattache)");
  }
  lines.push("");

  lines.push("## 6. Validation");
  if (m.validator) {
    lines.push(`Verdict : ${m.validator.verdict || "—"}`);
    (m.validator.gates || []).forEach((g) => lines.push(`  Gate ${g.name} : ${g.verdict}`));
  } else {
    lines.push("(validator non rattache)");
  }
  lines.push("");

  lines.push("## 7. Reco Finale");
  if (m.reco) {
    lines.push(`Verdict : ${m.reco.verdict || "—"} · Score : ${fmtN(m.reco.finalScore, 0)} · nTrials : ${m.reco.nTrials ?? "—"}`);
  } else {
    lines.push("(reco non rattachee)");
  }
  lines.push("");

  lines.push("## 8. Pipeline & demo");
  lines.push(`Outils : ${(m.toolsApplied || []).length ? m.toolsApplied.join(", ") : "(aucun)"}`);
  lines.push(`Sessions demo : ${m.demoSessions}`);
  lines.push("");

  lines.push("## 9. Disclaimer");
  lines.push(m.disclaimer);
  return lines;
}

/**
 * Génère les octets PDF du tearsheet pour un dossier.
 * @returns {{ bytes: Uint8Array, model: object, filename: string }}
 */
export function generateTearsheetPdf(dossier, opts = {}) {
  const model = buildTearsheetModel(dossier);
  if (opts.generatedAt) model.generatedAt = opts.generatedAt;
  const lines = tearsheetLines(model);
  const bytes = buildTextPdf(lines, { title: "QuantEXPro Investor Tearsheet" });
  const safe = String(model.identity.name || "strategie").replace(/\W+/g, "_").slice(0, 40);
  const filename = opts.filename || `tearsheet_${safe}_${model.identity.id}.pdf`;
  return { bytes, model, filename, lines };
}
