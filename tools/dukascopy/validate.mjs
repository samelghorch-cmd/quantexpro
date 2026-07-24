#!/usr/bin/env node
// Valide les JSON Dukascopy dans ./out avant import Data Manager.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateImportSeries, parseImportPayload } from "../../src/engine/dukascopyImport.js";

const outDir = join(process.cwd(), "out");
const files = (await readdir(outDir).catch(() => [])).filter((f) => f.endsWith(".json") && f !== "manifest.json");

if (!files.length) {
  console.error("Aucun JSON dans ./out — lance d'abord npm run fetch");
  process.exit(1);
}

let okN = 0, failN = 0;
for (const f of files) {
  const raw = JSON.parse(await readFile(join(outDir, f), "utf8"));
  if (f === "import-all.json") {
    const { ok, failed } = parseImportPayload(raw);
    console.log(`${f}: ${ok.length} OK, ${failed.length} KO`);
    okN += ok.length; failN += failed.length;
    failed.forEach((x) => console.warn(`  · [${x.index}] ${x.symbolKey}: ${x.errors.join(", ")}`));
    continue;
  }
  const v = validateImportSeries(raw);
  if (v.ok) {
    console.log(`✓ ${f}: ${v.series.meta.n} barres, ${v.series.meta.years.toFixed(1)} ans`);
    okN++;
  } else {
    console.warn(`✗ ${f}: ${v.errors.join("; ")}`);
    failN++;
  }
}
console.log(`\nRésultat : ${okN} OK / ${failN} KO`);
process.exit(failN ? 1 : 0);
