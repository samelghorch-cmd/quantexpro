// Prompt Mode — idée en langage naturel → stratégie JSON via le LLM local (P0-D).
// Appelle POST /v1/strategy/from-prompt, revalide côté JS (validateRules), teste et
// sauvegarde comme custom #9001+ — même parcours que Strategy Importer.
import { useState } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { compileRules } from "../../engine/ruleBuilder.ts";
import { validateRules, saveCustomDef } from "../../engine/customStrategies.js";
import { runBacktestExt } from "../../engine/backtestExtended.js";
import { apiFetch, getApiBaseUrl, getApiKey, setApiBaseUrl, setApiKey } from "../../engine/apiClient.ts";
import { Panel, Button, MetricCard, MetricGrid, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";

export function PromptModePage() {
  const { bars, ctx, symbol, refreshLibrary, setPipe, navigate } = usePipeline();
  const [prompt, setPrompt] = useState("Acheter quand EMA20 croise au-dessus de EMA50 et RSI < 70 ; vendre au croisement inverse.");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState(getApiBaseUrl());
  const [apiKey, setKey] = useState(getApiKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(null);
  const [rawJson, setRawJson] = useState("");

  const generate = async () => {
    setBusy(true); setError(null); setSaved(null); setResult(null);
    setApiBaseUrl(baseUrl); setApiKey(apiKey);
    try {
      const body = await apiFetch("/v1/strategy/from-prompt", {
        method: "POST",
        body: JSON.stringify({ prompt: prompt.trim(), name: name.trim() || null }),
      });
      const strategy = body?.strategy;
      if (!strategy?.rules) throw new Error("Réponse LLM sans stratégie valide.");
      // Revalidation JS (parité stricte avec le backend) — échec explicite si dérive.
      const rules = validateRules(strategy.rules);
      const evalFn = compileRules(rules);
      const res = runBacktestExt(bars, ctx, evalFn, { contract: symbol, capital: 100000, slAtr: 2, direction: "both" });
      const draft = { name: strategy.name || name || "Prompt Mode", rules, res };
      setResult(draft);
      setRawJson(JSON.stringify({ name: draft.name, rules }, null, 2));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveAsStrategy = () => {
    try {
      const def = saveCustomDef({ name: result.name, rules: result.rules });
      refreshLibrary();
      setPipe({ selectedStrategyId: def.id });
      setSaved(def);
      setError(null);
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel title="Connexion LLM local (opt-in backend)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ fontSize: 11, color: T.textDim }}>
              URL API
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                style={inputStyle} placeholder="http://localhost:8000" />
            </label>
            <label style={{ fontSize: 11, color: T.textDim }}>
              Clé API (X-API-Key)
              <input value={apiKey} onChange={(e) => setKey(e.target.value)} type="password"
                style={inputStyle} placeholder="(vide en dev)" />
            </label>
          </div>
          <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>
            Backend : <code>QX_LLM_ENABLED=true</code> + Ollama (<code>qwen2.5-coder:7b</code>). Zero-token — aucune API cloud.
          </div>
        </Panel>

        <Panel title="Prompt Mode — idée → stratégie"
          right={<Button primary disabled={busy || !prompt.trim()} onClick={generate}>
            {busy ? "Génération…" : "✦ Générer"}
          </Button>}>
          <label style={{ fontSize: 11, color: T.textDim }}>
            Nom (optionnel)
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="ex. EMA Cross RSI" />
          </label>
          <label style={{ fontSize: 11, color: T.textDim, display: "block", marginTop: 8 }}>
            Description de la stratégie
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} spellCheck={false}
              style={{ ...inputStyle, height: 160, resize: "vertical", fontFamily: T.mono, color: T.text }} />
          </label>
          {error && <div style={{ marginTop: 8, color: T.red, fontSize: 12 }}>Erreur : {error}</div>}
        </Panel>
      </div>

      <Panel title="Stratégie générée">
        {!result && !busy && (
          <div style={{ padding: 30, textAlign: "center", color: T.textDim }}>
            Décris une idée, clique sur Générer. La sortie est validée contre le Rule Builder (parité Importer).
          </div>
        )}
        {busy && <div style={{ padding: 30, textAlign: "center", color: T.orange }}>Inférence locale en cours (30–90 s typiques)…</div>}
        {result && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.orange, marginBottom: 12 }}>{result.name}</div>
            <MetricGrid min={120}>
              <MetricCard label="Trades" value={result.res.nTrades} />
              <MetricCard label="Win Rate" value={fmtPct(result.res.winRate)} color={result.res.winRate >= 50 ? T.green : T.red} />
              <MetricCard label="Profit Factor" value={fmt(result.res.profitFactor)} color={result.res.profitFactor >= 1.5 ? T.green : T.red} />
              <MetricCard label="Sharpe" value={fmt(result.res.sharpe)} />
              <MetricCard label="Total PnL" value={fmtUsd(result.res.totalPnL)} color={result.res.totalPnL >= 0 ? T.green : T.red} />
              <MetricCard label="Max DD" value={fmtPct(result.res.maxDD * 100)} color={T.red} />
            </MetricGrid>
            <pre style={{ marginTop: 12, background: T.bg0, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontSize: 11, color: T.green, overflow: "auto", maxHeight: 220 }}>{rawJson}</pre>
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <Button primary onClick={saveAsStrategy}>💾 Sauvegarder comme stratégie</Button>
              {saved && <Button onClick={() => navigate("backtest")}>→ Backtester dans le pipeline</Button>}
            </div>
            {saved && <div style={{ marginTop: 8, fontSize: 12, color: T.green }}>✓ Sauvegardée <b>#{saved.id} · {saved.name}</b> — disponible partout (pipeline sélectionné).</div>}
            {result.res.nTrades === 0 && <div style={{ marginTop: 8, fontSize: 11, color: T.yellow }}>⚠ 0 trade sur ces données ({bars.length} barres) — conditions valides mais non déclenchées.</div>}
          </>
        )}
      </Panel>
    </div>
  );
}

const inputStyle = {
  display: "block", width: "100%", marginTop: 4, boxSizing: "border-box",
  background: T.bg0, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6,
  padding: "8px 10px", fontSize: 12,
};
