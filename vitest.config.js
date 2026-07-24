// Config Vitest — suite invariants + goldens + intégration.
// Les seuils de couverture sont BLOQUANTS (`npm run coverage` échoue sous le seuil) :
// 100 % sur les métriques critiques (annualize), ≥90 % sur les moteurs de backtest.
// Extension progressive au reste de src/engine — voir docs/TESTING.md.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/engine/backtest.js",
        "src/engine/backtestExtended.js",
        "src/engine/annualize.ts",
        "src/engine/contracts.ts",
        "src/engine/random.js",
      ],
      thresholds: {
        "src/engine/annualize.ts":        { lines: 100, functions: 100, branches: 90 },
        "src/engine/backtestExtended.js": { lines: 100, functions: 100, branches: 90 },
        "src/engine/backtest.js":         { lines: 100, functions: 100, branches: 80 },
        "src/engine/random.js":           { lines: 100 },
      },
    },
  },
});
