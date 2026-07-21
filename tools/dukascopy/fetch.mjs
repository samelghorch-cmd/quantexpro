#!/usr/bin/env node
// Ingestion Dukascopy → OHLCV JSON importable dans QuantExPro (Data Manager → 📥 Importer JSON).
//
// Dukascopy = data GRATUITE, tick bid/ask, 60+ instruments, historique ~2003→aujourd'hui (15-20+ ans).
// Le dump de ticks complet pèse des centaines de Go ; ce script NE stocke PAS les ticks : il les
// agrège en barres OHLCV (léger : ~20 ans en 1h ≈ quelques Mo) que l'app peut charger dans IndexedDB.
//
// Usage :
//   cd web/dashboard/tools/dukascopy && npm install
//   node fetch.mjs --symbols EURUSD,GBPUSD,GOLD --tf h1,h4,d1 --from 2005-01-01 --to 2025-01-01
//   → écrit ./out/<SYMBOL>_<tf>.json  et  ./out/import-all.json (tableau prêt à importer d'un coup)
//
// Puis dans l'app : Outils → Data Manager → « 📥 Importer JSON » → sélectionne import-all.json.

import { getHistoricalRates } from "dukascopy-node";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Map symbolKey de l'app (ASSET_CLASSES) → instrument Dukascopy.
const INSTRUMENT = {
  // Forex
  EURUSD: "eurusd", GBPUSD: "gbpusd", USDJPY: "usdjpy", AUDUSD: "audusd", USDCAD: "usdcad",
  // Métaux
  GOLD: "xauusd", SILVER: "xagusd",
  // Indices (CFD Dukascopy)
  SPX: "usa500idxusd", NDX: "usatechidxusd", DJI: "usa30idxusd", DAX: "deuidxeur",
  // Énergie
  WTI: "lightcmdusd", BRENT: "brentcmdusd",
  // Crypto
  BTC: "btcusd", ETH: "ethusd",
};

// Map timeframe Dukascopy → facteur TF interne de l'app (1=5m,3=15m,12=1h,48=4h,288=1j).
const TF = { m5: 1, m15: 3, h1: 12, h4: 48, d1: 288 };

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const symbols = arg("symbols", "EURUSD,GBPUSD,GOLD").split(",").map((s) => s.trim().toUpperCase());
const tfs = arg("tf", "h1,h4,d1").split(",").map((s) => s.trim());
const from = new Date(arg("from", "2005-01-01"));
const to = new Date(arg("to", new Date().toISOString().slice(0, 10)));
const outDir = join(process.cwd(), "out");

console.log(`Dukascopy → OHLCV | ${symbols.join(", ")} | ${tfs.join(", ")} | ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`);

const all = [];
await mkdir(outDir, { recursive: true });

for (const sym of symbols) {
  const instrument = INSTRUMENT[sym];
  if (!instrument) { console.warn(`⚠ ${sym} : pas de mapping Dukascopy — ignoré`); continue; }
  for (const tfName of tfs) {
    const tf = TF[tfName];
    if (!tf) { console.warn(`⚠ TF inconnu : ${tfName} — ignoré`); continue; }
    process.stdout.write(`  ${sym} (${instrument}) ${tfName}… `);
    try {
      const rows = await getHistoricalRates({
        instrument, dates: { from, to }, timeframe: tfName,
        format: "json", priceType: "bid", volumes: true, batchSize: 10, pauseBetweenBatchesMs: 500,
      });
      // Normalise vers le format interne {t,o,h,l,c,v}
      const bars = rows
        .filter((r) => r && r.open != null)
        .map((r) => ({ t: r.timestamp, o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume || 0 }));
      const series = { symbolKey: sym, tf, provider: "dukascopy", bars };
      await writeFile(join(outDir, `${sym}_${tfName}.json`), JSON.stringify(series));
      all.push(series);
      const span = bars.length ? `${new Date(bars[0].t).toISOString().slice(0, 10)}→${new Date(bars[bars.length - 1].t).toISOString().slice(0, 10)}` : "vide";
      console.log(`${bars.length} barres (${span})`);
    } catch (e) {
      console.log(`échec : ${e.message}`);
    }
  }
}

await writeFile(join(outDir, "import-all.json"), JSON.stringify(all));
console.log(`\n✓ Terminé — ${all.length} séries dans ./out/  (importe import-all.json dans le Data Manager)`);
