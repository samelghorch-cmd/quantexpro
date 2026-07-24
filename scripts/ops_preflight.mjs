#!/usr/bin/env node
/**
 * P5-OPS — preflight API go-live (health · edges · anti-library · option SSO).
 *
 *   node scripts/ops_preflight.mjs --dry-run
 *   QX_API_BASE_URL=… QX_API_KEY_PM=… node scripts/ops_preflight.mjs
 */
import { buildPaperSignal, assertSignalShape, assertExecutionShape, buildFilledAck } from "../mt5/smoke.mjs";

export const PREFLIGHT_STEPS = [
  { id: "health", path: "/health", method: "GET", auth: false },
  { id: "edges", path: "/v1/edges?status=active&limit=1", method: "GET", auth: true },
  { id: "anti", path: "/v1/anti-library?active=true&limit=1", method: "GET", auth: true },
];

export function resolveConfig(env = process.env) {
  const base = String(env.QX_API_BASE_URL || "").replace(/\/$/, "");
  const key = env.QX_API_KEY_PM || env.QX_API_KEY || "";
  return { base, key };
}

export function missingConfig(cfg) {
  const miss = [];
  if (!cfg.base) miss.push("QX_API_BASE_URL");
  if (!cfg.key) miss.push("QX_API_KEY_PM (ou QX_API_KEY)");
  return miss;
}

/** Construit les requêtes HTTP à exécuter (testable sans réseau). */
export function buildPreflightPlan(cfg) {
  return PREFLIGHT_STEPS.map((s) => ({
    ...s,
    url: `${cfg.base}${s.path}`,
    headers: s.auth
      ? { Accept: "application/json", "X-API-Key": cfg.key }
      : { Accept: "application/json" },
  }));
}

async function runLive(cfg, fetchImpl = fetch) {
  const plan = buildPreflightPlan(cfg);
  const results = [];
  for (const step of plan) {
    const t0 = Date.now();
    try {
      const res = await fetchImpl(step.url, { method: step.method, headers: step.headers });
      const ok = res.ok;
      results.push({
        id: step.id,
        ok,
        status: res.status,
        latencyMs: Date.now() - t0,
        detail: ok ? "ok" : `HTTP ${res.status}`,
      });
    } catch (e) {
      results.push({
        id: step.id,
        ok: false,
        status: 0,
        latencyMs: Date.now() - t0,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

function printResults(results) {
  for (const r of results) {
    const mark = r.ok ? "OK " : "FAIL";
    console.log(`${mark}  ${r.id.padEnd(8)} ${r.detail} (${r.latencyMs}ms)`);
  }
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  console.log("QuantEXPro ops preflight (P5-OPS)\n");

  const sig = buildPaperSignal({ mode: "paper" });
  const ack = buildFilledAck(sig.client_order_id);
  const se = assertSignalShape(sig);
  const ae = assertExecutionShape(ack);
  if (se.length || ae.length) {
    console.error("FAIL  smoke shapes", { se, ae });
    process.exit(1);
  }
  console.log("OK   mt5 smoke shapes (paper signal + filled ack)");

  if (dry) {
    const cfg = { base: "https://example.invalid", key: "dry-key" };
    const plan = buildPreflightPlan(cfg);
    console.log(`OK   plan ${plan.length} steps (dry-run, pas de réseau)`);
    for (const p of plan) console.log(`     - ${p.method} ${p.path}`);
    console.log("\nDoD: lancer sans --dry-run contre l'API réelle.");
    process.exit(0);
  }

  const cfg = resolveConfig();
  const miss = missingConfig(cfg);
  if (miss.length) {
    console.error("FAIL  config manquante:", miss.join(", "));
    process.exit(1);
  }

  const results = await runLive(cfg);
  printResults(results);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n${failed.length} check(s) en échec — voir docs/OPS_GO_LIVE.md`);
    process.exit(1);
  }
  console.log("\nOK  preflight API vert (health · edges · anti-library).");
  console.log("Suite MT5: mt5/VPS_DEPLOY.md · node mt5/smoke.mjs");
}

const invokedAsCli =
  process.argv[1] &&
  (process.argv[1].endsWith("ops_preflight.mjs") ||
    process.argv[1].endsWith("ops_preflight.js"));
if (invokedAsCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
