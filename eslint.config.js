// ESLint flat config — ciblé "vrais bugs", pas le style.
// Priorité : règles des Hooks React (rules-of-hooks, exhaustive-deps) et pièges JS
// que `tsc` ne voit pas sur la couche .jsx non typée. Le moteur .ts reste couvert
// par `npm run typecheck` (gate bloquant) — ici on complète côté React/UI.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "backend/**",
      "functions/**",
      "tools/**",
      "**/*.worker.js",
    ],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.worker },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      // --- Hooks : capture les bugs que le typage ne voit pas ---
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // --- Bruit de style désactivé : on ne bloque pas sur des variables inutilisées ---
      "no-unused-vars": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
];
