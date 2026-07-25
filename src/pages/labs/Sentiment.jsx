// Labs — Sentiment RSS légal (Module 6 / P2-SCRAPE).
// Pas de scraping social (X / StockTwits / Telegram / TV) — ToS.
import { useCallback, useMemo, useState } from "react";
import { usePipeline } from "../../state/PipelineContext.tsx";
import {
  listSentimentFeeds,
  fetchSentimentFeed,
  aggregateSentiment,
  toAlphaForgeHint,
  sentimentRateLimiter,
} from "../../engine/sentimentFeed.ts";
import { Panel, Button, Badge, MetricCard, MetricGrid, DataTable, fmt } from "../../components/shared/ui.tsx";
import { T, sideColor } from "../../components/shared/theme.ts";

function labelColor(label) {
  if (label === "LONG" || label === "SHORT") return sideColor(label);
  return T.textDim;
}

export function SentimentPage() {
  const { navigate, setPipe } = usePipeline();
  const feeds = useMemo(() => listSentimentFeeds(), []);
  const [feedId, setFeedId] = useState(feeds[0]?.id || "fed");
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sentMsg, setSentMsg] = useState("");

  const agg = useMemo(() => aggregateSentiment(items), [items]);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetchSentimentFeed(feedId);
      setItems(res.items);
      setMeta({ feed: res.feed, fetchedAt: res.fetchedAt });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [feedId]);

  const sendToForge = useCallback(() => {
    if (!items.length) return;
    const hint = toAlphaForgeHint(agg, items);
    setPipe({ sentimentHint: hint });
    setSentMsg("Hint sentiment → pipeline (Usine / Core Mode)");
    setTimeout(() => setSentMsg(""), 3500);
    navigate("factory");
  }, [items, agg, setPipe, navigate]);

  const cols = [
    {
      key: "label",
      label: "Bias",
      render: (r) => <Badge color={labelColor(r.label)}>{r.label}</Badge>,
    },
    {
      key: "score",
      label: "Score",
      align: "right",
      render: (r) => fmt(r.score, 2),
      color: (r) => labelColor(r.label),
    },
    {
      key: "title",
      label: "Titre",
      render: (r) => (
        <a href={r.link || "#"} target="_blank" rel="noreferrer" style={{ color: T.text, textDecoration: "none" }}>
          {r.title}
        </a>
      ),
    },
    {
      key: "publishedAt",
      label: "Publié",
      render: (r) => (r.publishedAt ? new Date(r.publishedAt).toLocaleString("fr-FR") : "—"),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Sentiment — flux RSS légaux</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.55, maxWidth: 720 }}>
          Module 6 : headlines institutionnelles (Fed · SEC · IMF) + recherche (arXiv q-fin · NBER · BIS)
          via proxy allowlisté + lexique LONG/SHORT/NEUTRAL. X / Reddit / QC scrapers = hors scope ToS.
          + Jaccard co-thématique. <b style={{ color: T.orange }}>Pas de scraping</b> X / StockTwits / Telegram /
          TradingView (ToS). Rate limit client : 5 s min · 30 req/h.
        </div>
      </Panel>

      <Panel title="Source" right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {sentMsg && <span style={{ fontSize: 11, color: T.green }}>{sentMsg}</span>}
          <Button onClick={() => sentimentRateLimiter.reset()} title="Reset rate limiter (dev)">Reset RL</Button>
          <Button primary onClick={load} disabled={busy}>{busy ? "…" : "Charger le flux"}</Button>
          <Button onClick={sendToForge} disabled={!items.length}>↗ Alpha Forge</Button>
        </div>
      }>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {feeds.map((f) => (
            <Button key={f.id} primary={feedId === f.id} onClick={() => setFeedId(f.id)}>
              {f.kind === "research" ? "📄 " : ""}{f.label}
            </Button>
          ))}
        </div>
        {err && <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>{err}</div>}
        {meta && (
          <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 8 }}>
            {meta.feed.provider} · {meta.feed.url} · {new Date(meta.fetchedAt).toLocaleTimeString("fr-FR")}
          </div>
        )}
        <MetricGrid min={120}>
          <MetricCard label="Headlines" value={agg.n} color={T.orange} />
          <MetricCard label="Bias" value={agg.bias} color={labelColor(agg.bias)} />
          <MetricCard label="Mean score" value={fmt(agg.meanScore, 2)} />
          <MetricCard label="LONG / SHORT" value={`${agg.long} / ${agg.short}`} sub={`${agg.neutral} neutres`} />
          <MetricCard label="Jaccard moyen" value={fmt(agg.jaccard, 3)} hint="Co-mouvement lexical des titres" />
        </MetricGrid>
      </Panel>

      <Panel title={`Headlines scorées (${items.length})`}>
        {items.length === 0
          ? <div style={{ padding: 20, textAlign: "center", color: T.textDim, fontSize: 12 }}>
              Aucune donnée chargée. Choisis un flux allowlisté puis « Charger » (requiert `npm run dev` ou Pages + Function RSS).
            </div>
          : <DataTable columns={cols} rows={items} maxHeight={420} />}
      </Panel>
    </div>
  );
}
