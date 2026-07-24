// QuantEXPro — Collecteur 24/7 (paper-trading en continu sur données réelles Binance).
// Service Node SANS dépendance npm : il RÉUTILISE le moteur JS du dashboard (mêmes stratégies
// exactement qu'au backtest — aucune divergence), poll Binance à intervalle, fait tourner chaque
// stratégie « job » en démo, accumule la data au fil du temps, et l'expose via une petite API HTTP.
//
// Déploiement : cloud gratuit (Railway/Fly/Render). Voir collector/README.md.
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildStrategyLibrary } from "../src/engine/strategyLibrary.js";
import { buildContext } from "../src/engine/context.js";
import { runBacktestExt } from "../src/engine/backtestExtended.js";
import { compileRules } from "../src/engine/ruleBuilder.ts";
import { validateRules } from "../src/engine/customStrategies.js";
import {
  ingestConfigFromEnv,
  tickerToSymbol,
  selectBarsForIngest,
  pushBarsToBackend,
} from "./barsIngest.js";

const PORT = process.env.PORT || 8787;
const POLL_MS = Number(process.env.POLL_MS || 60000);      // fréquence de collecte (défaut 60 s)
const DATA_DIR = process.env.DATA_DIR || ".";               // mettre un volume persistant en prod
const DATA_FILE = path.join(DATA_DIR, "collector-data.json");
const MAX_BARS = 6000;                                       // borne la série par job
const ALLOWED_INTERVALS = new Set(["5m", "15m", "1h", "4h", "1d"]);
const INGEST = ingestConfigFromEnv(process.env);

const lib = buildStrategyLibrary();
let jobs = {}; // id -> { id, name, strategyId, ticker, interval, params, series, result, createdAt, updatedAt, polls, lastError }

// ---- Persistance (fichier JSON ; utiliser un volume Railway/Fly pour survivre aux redéploiements) ----
async function load() {
  try { jobs = JSON.parse(await readFile(DATA_FILE, "utf8")) || {}; }
  catch { jobs = {}; }
}
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await mkdir(DATA_DIR, { recursive: true }); await writeFile(DATA_FILE, JSON.stringify(jobs)); } catch { /* noop */ }
  }, 400);
}

// ---- Binance : klines réelles (k[9] = taker-buy → classification order-flow réelle) ----
async function fetchKlines(ticker, interval, limit = 1000, endTime) {
  let url = `https://api.binance.com/api/v3/klines?symbol=${ticker}&interval=${interval}&limit=${limit}`;
  if (endTime) url += `&endTime=${endTime}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const d = await r.json();
  return d.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], vBuy: +k[9] }));
}

function mergeBars(series, incoming) {
  const map = new Map((series || []).map((b) => [b.t, b]));
  for (const b of incoming) map.set(b.t, b);            // les nouvelles bougies closes s'ajoutent → data forward accumulée
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-MAX_BARS);
}

// Évalue la stratégie du job sur sa série accumulée — MÊME moteur que le dashboard.
// Stratégie du job : custom (règles AST transportées dans le job, compilées avec le MÊME
// ruleBuilder que le dashboard) ou intégrée (lookup par id dans la librairie partagée).
function resolveStrat(job) {
  if (job.rules) return { id: job.strategyId, name: job.name, eval: compileRules(job.rules) };
  return lib.find((s) => s.id === job.strategyId);
}

function evalJob(job) {
  const strat = resolveStrat(job);
  if (!strat || (job.series || []).length < 120) return null;
  const ctx = buildContext(job.series);
  const p = job.params || {};
  const params = { contract: p.contract || "MES", capital: p.capital || 100000, direction: p.direction || "both",
    slAtr: p.slAtr ?? 2, tpAtr: p.tpAtr ?? 0, beAtr: p.beAtr ?? 0, contracts: p.contracts || 1,
    lotMode: p.lotMode || "FIXED_LOTS", riskPct: p.riskPct ?? 1, warmup: p.warmup ?? 50 };
  return runBacktestExt(job.series, ctx, strat.eval, params);
}

async function ingestJobBars(job) {
  if (!INGEST.enabled) return;
  try {
    const symbol = tickerToSymbol(job.ticker);
    const bars = selectBarsForIngest(job.series, job.lastIngestTs ?? null, INGEST.backfillMax);
    if (!bars.length) return;
    const res = await pushBarsToBackend({
      baseUrl: INGEST.baseUrl,
      apiKey: INGEST.apiKey,
      timeframe: job.interval,
      symbol,
      bars,
      chunkSize: INGEST.chunkSize,
    });
    if (res.lastTs != null) job.lastIngestTs = res.lastTs;
    job.lastIngestAt = Date.now();
    job.lastIngestWritten = res.written;
    job.lastIngestError = null;
  } catch (e) {
    job.lastIngestError = String(e.message || e);
  }
}

async function pollJob(job) {
  try {
    const incoming = await fetchKlines(job.ticker, job.interval, 200);
    job.series = mergeBars(job.series, incoming);
    const res = evalJob(job);
    if (res) job.result = res;                            // résultat COMPLET (équity + trades)
    job.updatedAt = Date.now();
    job.polls = (job.polls || 0) + 1;
    job.lastError = null;
    await ingestJobBars(job);
  } catch (e) { job.lastError = String(e.message || e); }
  persist();
}

async function loop() {
  for (const id of Object.keys(jobs)) await pollJob(jobs[id]);
  setTimeout(loop, POLL_MS);
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
function summary(j) {
  const r = j.result || {};
  return { id: j.id, name: j.name, strategyId: j.strategyId, ticker: j.ticker, interval: j.interval,
    bars: (j.series || []).length, polls: j.polls || 0, updatedAt: j.updatedAt, createdAt: j.createdAt, lastError: j.lastError,
    ingest: INGEST.enabled ? { lastIngestTs: j.lastIngestTs, lastIngestAt: j.lastIngestAt, lastIngestWritten: j.lastIngestWritten, lastIngestError: j.lastIngestError } : null,
    metrics: { nTrades: r.nTrades, winRate: r.winRate, profitFactor: r.profitFactor, expectancyR: r.expectancyR, sharpe: r.sharpe, totalPnL: r.totalPnL, maxDD: r.maxDD } };
}

// ---- API HTTP (CORS ouvert : l'app la lit depuis un autre domaine) ----
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
function send(res, code, body) { res.writeHead(code, { "Content-Type": "application/json", ...CORS }); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } }); }); }

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  try {
    if (url.pathname === "/" || url.pathname === "/health") {
      return send(res, 200, {
        ok: true,
        service: "quantexpro-collector",
        jobs: Object.keys(jobs).length,
        pollMs: POLL_MS,
        barsIngest: INGEST.enabled,
        apiBase: INGEST.enabled ? INGEST.baseUrl : null,
      });
    }

    if (parts[0] === "jobs" && parts.length === 1) {
      if (req.method === "GET") return send(res, 200, { jobs: Object.values(jobs).map(summary) });
      if (req.method === "POST") {
        const b = await readBody(req);
        if (!b.ticker || !ALLOWED_INTERVALS.has(b.interval) || b.strategyId == null) return send(res, 400, { error: "champs requis : ticker, interval (5m/15m/1h/4h/1d), strategyId" });
        // Stratégie custom : les règles voyagent avec le job (le collector ne peut pas lire
        // le localStorage du navigateur) — validées ici avec le même validateur que l'app.
        let rules = null;
        if (b.rules) {
          try { rules = validateRules(b.rules); } catch (e) { return send(res, 400, { error: `rules invalides : ${e.message}` }); }
        } else if (b.strategyId >= 9001 || !lib.some((s) => s.id === b.strategyId)) {
          return send(res, 400, { error: `stratégie #${b.strategyId} inconnue du collector — joindre 'rules' pour une stratégie custom` });
        }
        const job = { id: uid(), name: b.name || `${b.ticker} #${b.strategyId}`, strategyId: b.strategyId, rules, ticker: String(b.ticker).toUpperCase(), interval: b.interval, params: b.params || {}, series: [], result: null, createdAt: Date.now(), updatedAt: Date.now(), polls: 0, lastError: null };
        try {
          job.series = await fetchKlines(job.ticker, job.interval, 1000);
          const r = evalJob(job);
          if (r) job.result = r;
          await ingestJobBars(job);
        } catch (e) { job.lastError = String(e.message || e); }
        jobs[job.id] = job; persist();
        return send(res, 201, { job: summary(job) });
      }
    }

    if (parts[0] === "jobs" && parts.length === 2) {
      const job = jobs[parts[1]];
      if (!job) return send(res, 404, { error: "job introuvable" });
      if (req.method === "GET") return send(res, 200, { job }); // complet : série + résultat (équity + trades)
      if (req.method === "DELETE") { delete jobs[parts[1]]; persist(); return send(res, 200, { ok: true }); }
    }

    return send(res, 404, { error: "route inconnue" });
  } catch (e) { return send(res, 500, { error: String(e.message || e) }); }
});

await load();
server.listen(PORT, () => console.log(
  `[collector] écoute sur :${PORT} · ${Object.keys(jobs).length} jobs · poll ${POLL_MS}ms`
  + (INGEST.enabled ? ` · ingest → ${INGEST.baseUrl}` : " · ingest OFF"),
));
loop();
