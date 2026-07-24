#!/usr/bin/env node
// Ingestion Dukascopy production (P2-DUKA) → OHLCV JSON pour Data Manager.
//
// Améliorations vs v1 : retry/backoff, découpage annuel, --resume, validation schéma,
// failover optionnel Twelve Data (TWELVE_DATA_API_KEY).
//
// Usage :
//   cd tools/dukascopy && npm install
//   npm run fetch:deep
//   node fetch.mjs --symbols EURUSD,GOLD --tf h1,d1 --from 2005-01-01 --resume
//
// Import app : Outils → Data Manager → 📥 Importer JSON → out/import-all.json

import { getHistoricalRates } from "dukascopy-node";
import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DUKA_INSTRUMENT,
  DUKA_TF,
  normalizeDukaRows,
  validateImportSeries,
  yearChunks,
} from "../../src/engine/dukascopyImport.js";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (process.argv.includes(`--${name}`) && (def === false || def === true) && (i < 0 || process.argv[i + 1]?.startsWith("--"))) {
    return true;
  }
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, { retries = 3, baseMs = 1500, label = "" } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === retries) break;
      const wait = baseMs * 2 ** i;
      console.warn(`    retry ${i + 1}/${retries} ${label}: ${e.message} (wait ${wait}ms)`);
      await sleep(wait);
    }
  }
  throw last;
}

/** Failover Twelve Data (optionnel, nécessite clé). */
async function fetchTwelveData(symbolKey, tfName, from, to) {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) return null;
  // Mapping approximatif Twelve Data
  const symMap = {
    EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", AUDUSD: "AUD/USD", USDCAD: "USD/CAD",
    GOLD: "XAU/USD", SILVER: "XAG/USD", BTC: "BTC/USD", ETH: "ETH/USD",
    SPX: "SPX", NDX: "NDX", DJI: "DJI",
  };
  const intervalMap = { m5: "5min", m15: "15min", h1: "1h", h4: "4h", d1: "1day" };
  const symbol = symMap[symbolKey];
  const interval = intervalMap[tfName];
  if (!symbol || !interval) return null;

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("start_date", from.toISOString().slice(0, 10));
  url.searchParams.set("end_date", to.toISOString().slice(0, 10));
  url.searchParams.set("apikey", key);
  url.searchParams.set("outputsize", "5000");
  url.searchParams.set("order", "ASC");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const body = await res.json();
  if (body.status === "error") throw new Error(body.message || "Twelve Data error");
  const values = body.values || [];
  return values.map((r) => ({
    timestamp: new Date(r.datetime).getTime(),
    open: +r.open,
    high: +r.high,
    low: +r.low,
    close: +r.close,
    volume: +(r.volume || 0),
  }));
}

async function fetchDukaChunk(instrument, tfName, from, to) {
  return getHistoricalRates({
    instrument,
    dates: { from, to },
    timeframe: tfName,
    format: "json",
    priceType: "bid",
    volumes: true,
    batchSize: 15,
    pauseBetweenBatchesMs: 400,
  });
}

async function fetchSeries(sym, tfName, from, to) {
  const instrument = DUKA_INSTRUMENT[sym];
  const chunks = yearChunks(from, to);
  const allRows = [];
  for (const ch of chunks) {
    const label = `${sym} ${tfName} ${ch.from.toISOString().slice(0, 10)}`;
    try {
      const rows = await withRetry(
        () => fetchDukaChunk(instrument, tfName, ch.from, ch.to),
        { retries: 3, label },
      );
      allRows.push(...(rows || []));
    } catch (e) {
      console.warn(`    Duka échec ${label}: ${e.message} — tentative Twelve Data…`);
      const td = await withRetry(
        () => fetchTwelveData(sym, tfName, ch.from, ch.to),
        { retries: 2, label: `TD ${label}` },
      ).catch(() => null);
      if (td?.length) {
        allRows.push(...td);
        console.warn(`    ✓ failover Twelve Data (${td.length} pts)`);
      } else {
        throw e;
      }
    }
    await sleep(200);
  }
  return allRows;
}

const symbols = String(arg("symbols", "EURUSD,GBPUSD,GOLD")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const tfs = String(arg("tf", "h1,h4,d1")).split(",").map((s) => s.trim()).filter(Boolean);
const from = new Date(arg("from", "2008-01-01"));
const to = new Date(arg("to", new Date().toISOString().slice(0, 10)));
const resume = process.argv.includes("--resume");
const outDir = join(process.cwd(), "out");

console.log(`Dukascopy PRO → OHLCV | ${symbols.join(", ")} | ${tfs.join(", ")} | ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}${resume ? " | resume" : ""}`);
if (process.env.TWELVE_DATA_API_KEY) console.log("  failover Twelve Data : ON");

await mkdir(outDir, { recursive: true });
const all = [];
const manifest = { generatedAt: new Date().toISOString(), from: from.toISOString(), to: to.toISOString(), series: [] };

for (const sym of symbols) {
  if (!DUKA_INSTRUMENT[sym]) { console.warn(`⚠ ${sym} : pas de mapping — ignoré`); continue; }
  for (const tfName of tfs) {
    const tf = DUKA_TF[tfName];
    if (!tf) { console.warn(`⚠ TF inconnu : ${tfName}`); continue; }
    const file = join(outDir, `${sym}_${tfName}.json`);

    if (resume) {
      try {
        await access(file);
        const existing = JSON.parse(await readFile(file, "utf8"));
        const v = validateImportSeries(existing);
        if (v.ok) {
          all.push(v.series);
          manifest.series.push({ symbolKey: sym, tf, file: `${sym}_${tfName}.json`, n: v.series.bars.length, skipped: true });
          console.log(`  ${sym} ${tfName}… skip (resume, ${v.series.bars.length} barres)`);
          continue;
        }
      } catch { /* fetch */ }
    }

    process.stdout.write(`  ${sym} (${DUKA_INSTRUMENT[sym]}) ${tfName}… `);
    try {
      const rows = await fetchSeries(sym, tfName, from, to);
      const bars = normalizeDukaRows(rows);
      const series = { symbolKey: sym, tf, provider: "dukascopy", bars };
      const v = validateImportSeries(series);
      if (!v.ok) throw new Error(v.errors.join("; "));
      await writeFile(file, JSON.stringify(v.series));
      all.push(v.series);
      const span = `${new Date(v.series.meta.from).toISOString().slice(0, 10)}→${new Date(v.series.meta.to).toISOString().slice(0, 10)}`;
      console.log(`${v.series.bars.length} barres (${span}, ${v.series.meta.years.toFixed(1)} ans)`);
      manifest.series.push({ symbolKey: sym, tf, file: `${sym}_${tfName}.json`, n: v.series.bars.length, years: v.series.meta.years });
    } catch (e) {
      console.log(`échec : ${e.message}`);
      manifest.series.push({ symbolKey: sym, tf, error: e.message });
    }
  }
}

await writeFile(join(outDir, "import-all.json"), JSON.stringify(all));
await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\n✓ ${all.length} séries → ./out/import-all.json (+ manifest.json)`);
console.log("  Importe dans QuantEXPro : Outils → Data Manager → 📥 Importer JSON");
