// P4-REV — historique de signaux externes → replay + règles proposées.
import { useMemo, useState } from "react";
import { usePipeline } from "../../state/PipelineContext.tsx";
import {
  parseSignalHistory,
  alignSignalsToBars,
  replayExternalSignals,
  reverseEngineerRules,
} from "../../engine/signalReverse.ts";
import { describeRule } from "../../engine/ruleBuilder.ts";
import { validateRules, saveCustomDef } from "../../engine/customStrategies.ts";
import { Panel, Button, MetricCard, MetricGrid, DataTable, Badge, Field, NumberInput, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { T } from "../../components/shared/theme.ts";

const SAMPLE = `date,side
2024-01-15,long
2024-02-01,short
2024-02-20,buy
2024-03-10,sell
`;

export function SignalReversePage() {
  const { bars, ctx, symbol, refreshLibrary, setPipe, navigate } = usePipeline();
  const [text, setText] = useState(SAMPLE);
  const [slAtr, setSlAtr] = useState(2);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [bundle, setBundle] = useState(null);

  const run = () => {
    setSaved(null);
    setError(null);
    try {
      if (!bars?.length) throw new Error("Charge des barres (Data Manager) avant reverse.");
      const parsed = parseSignalHistory(text);
      if (!parsed.signals.length) throw new Error(`Aucun signal parsé (${parsed.errors[0] || "format?"})`);
      const aligned = alignSignalsToBars(parsed.signals, bars);
      if (!aligned.length) {
        throw new Error(
          `${parsed.signals.length} signal(s) mais 0 aligné — vérifie que les timestamps chevauchent la série (${bars.length} barres).`,
        );
      }
      const replay = replayExternalSignals(bars, ctx, aligned, {
        contract: symbol,
        slAtr,
        warmup: 1,
      });
      const reverse = reverseEngineerRules(bars, ctx, aligned, { topK: 3, minHits: 2 });
      setBundle({ parsed, aligned, replay, reverse });
    } catch (e) {
      setError(e.message);
      setBundle(null);
    }
  };

  const proposedJson = useMemo(() => {
    if (!bundle?.reverse?.proposedRules) return "";
    return JSON.stringify(
      {
        name: "Reverse Engineered",
        rules: bundle.reverse.proposedRules,
      },
      null,
      2,
    );
  }, [bundle]);

  const saveProposed = () => {
    try {
      const rules = validateRules(bundle.reverse.proposedRules);
      const def = saveCustomDef({ name: "Reverse Engineered", rules });
      refreshLibrary();
      setPipe({ selectedStrategyId: def.id });
      setSaved(def);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const scoreCols = [
    { key: "cond", label: "Condition", render: (r) => describeRule(r) },
    { key: "hitRate", label: "Hit%", align: "right", render: (r) => fmtPct(r.hitRate * 100), color: () => T.green },
    { key: "lift", label: "Lift", align: "right", render: (r) => fmt(r.lift, 2), color: () => T.orange },
    { key: "hits", label: "Hits", align: "right", render: (r) => `${r.hits}/${r.n}` },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Signal Reverse — historique externe">
        <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.55, maxWidth: 780 }}>
          Colle un CSV (<code>date,side</code>) ou un JSON de signaux broker / Telegram / desk.
          Alignement <b>causal</b> sur les barres chargées, replay moteur, puis proposition de conditions Rule Builder
          (lift vs baseline).
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <Panel
          title="Historique signaux"
          right={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Field label="SL ATR">
                <NumberInput value={slAtr} onChange={setSlAtr} min={0} max={10} step={0.5} />
              </Field>
              <Button primary onClick={run}>▶ Analyser</Button>
            </div>
          }
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              height: 320,
              background: T.bg0,
              color: T.green,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: 12,
              fontFamily: T.mono,
              fontSize: 12,
              boxSizing: "border-box",
              resize: "vertical",
            }}
          />
          {error && <div style={{ marginTop: 8, color: T.red, fontSize: 12 }}>Erreur : {error}</div>}
          <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>
            side : long|buy|1 / short|sell|-1 · dates ISO ou unix · JSON : [{"{"} t, side {"}"}]
          </div>
        </Panel>

        <Panel title="Replay & métriques" right={bundle ? <Badge color={T.blue}>{bundle.parsed.format}</Badge> : null}>
          {!bundle && (
            <div style={{ padding: 30, textAlign: "center", color: T.textDim }}>
              Lance l’analyse sur la série courante ({bars?.length || 0} barres · {symbol}).
            </div>
          )}
          {bundle && (
            <>
              <MetricGrid min={110}>
                <MetricCard label="Parsés" value={bundle.parsed.signals.length} />
                <MetricCard label="Alignés" value={bundle.aligned.length} color={T.orange} />
                <MetricCard label="Long / Short" value={`${bundle.replay.nLong} / ${bundle.replay.nShort}`} />
                <MetricCard label="Trades" value={bundle.replay.nTrades} />
                <MetricCard label="Win Rate" value={fmtPct(bundle.replay.winRate)} color={bundle.replay.winRate >= 50 ? T.green : T.red} />
                <MetricCard label="PF" value={fmt(bundle.replay.profitFactor)} color={bundle.replay.profitFactor >= 1.3 ? T.green : T.red} />
                <MetricCard label="Sharpe" value={fmt(bundle.replay.sharpe)} />
                <MetricCard label="PnL" value={fmtUsd(bundle.replay.totalPnL)} color={bundle.replay.totalPnL >= 0 ? T.green : T.red} />
              </MetricGrid>
            </>
          )}
        </Panel>
      </div>

      {bundle && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Panel title="Candidats LONG (lift)">
            <DataTable columns={scoreCols} rows={bundle.reverse.long.slice(0, 8)} maxHeight={260} />
          </Panel>
          <Panel title="Candidats SHORT (lift)">
            <DataTable columns={scoreCols} rows={bundle.reverse.short.slice(0, 8)} maxHeight={260} />
          </Panel>
        </div>
      )}

      {bundle && (
        <Panel
          title="Règles proposées"
          right={
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                primary
                disabled={!bundle.reverse.proposedRules.long.length && !bundle.reverse.proposedRules.short.length}
                onClick={saveProposed}
              >
                💾 Sauver custom
              </Button>
              {saved && <Button onClick={() => navigate("strategyImporter")}>→ Importer</Button>}
              {saved && <Button onClick={() => navigate("backtest")}>→ Backtest</Button>}
            </div>
          }
        >
          {!(bundle.reverse.proposedRules.long.length || bundle.reverse.proposedRules.short.length) ? (
            <div style={{ fontSize: 12, color: T.textDim }}>
              Pas assez de lift — augmente l’historique ou vérifie l’alignement timestamps ↔ barres.
            </div>
          ) : (
            <pre
              style={{
                margin: 0,
                fontSize: 11,
                fontFamily: T.mono,
                color: T.green,
                background: T.bg0,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: 12,
                overflow: "auto",
                maxHeight: 280,
              }}
            >
              {proposedJson}
            </pre>
          )}
          {saved && (
            <div style={{ marginTop: 8, fontSize: 12, color: T.green }}>
              ✓ Sauvegardée <b>#{saved.id} · {saved.name}</b>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
