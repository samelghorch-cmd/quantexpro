// Module 6 — Retail Sentiment via flux RSS / API légaux (P2-SCRAPE).
// Hors scope volontaire : scraping X, StockTwits, Telegram, TradingView (ToS).
// Sources : allowlist gouvernementale / institutionnelle uniquement + Finnhub optionnel (clé user).

export type SentimentLabel = "LONG" | "SHORT" | "NEUTRAL";

export interface FeedDef {
  id: string;
  label: string;
  /** URL absolue HTTPS — seule liste autorisée côté proxy. */
  url: string;
  provider: string;
}

/** Catalogue allowlist — synchroniser avec `functions/api/rss.js` + proxy Vite. */
export const SENTIMENT_FEEDS: Record<string, FeedDef> = {
  fed: {
    id: "fed",
    label: "Federal Reserve — Press",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
    provider: "federalreserve.gov",
  },
  sec: {
    id: "sec",
    label: "SEC — Press Releases",
    url: "https://www.sec.gov/news/pressreleases.rss",
    provider: "sec.gov",
  },
  imf: {
    id: "imf",
    label: "IMF — News",
    url: "https://www.imf.org/en/News/RSS?language=eng",
    provider: "imf.org",
  },
};

export function listSentimentFeeds(): FeedDef[] {
  return Object.values(SENTIMENT_FEEDS);
}

export function resolveFeed(id: string): FeedDef | null {
  return SENTIMENT_FEEDS[id] || null;
}

// --- Lexique finance EN (proxy NLP léger, pas un modèle ML) ---
const LONG_WORDS = [
  "hike", "hiking", "tighten", "tightening", "hawkish", "surge", "rally", "bull", "bullish",
  "growth", "expansion", "strong", "strength", "record", "high", "gain", "gains", "approve",
  "approval", "beat", "outperform", "upgrade", "recovery", "rebound", "stimulus", "cut rates",
  "rate cut", "easing", "dovish", "accommodative",
];
const SHORT_WORDS = [
  "cut", "cutting", "slash", "slump", "crash", "bear", "bearish", "recession", "contraction",
  "weak", "weakness", "low", "decline", "drop", "fall", "falls", "loss", "losses", "downgrade",
  "default", "bankruptcy", "sanction", "sanctions", "warning", "risk", "risks", "inflation spike",
  "selloff", "sell-off", "panic", "fraud", "probe", "investigation", "fine", "penalty",
];

export interface SentimentItem {
  title: string;
  link: string;
  publishedAt: number | null;
  sourceId: string;
  sourceLabel: string;
  score: number;
  label: SentimentLabel;
  tokens: string[];
}

export function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/** Score ∈ [-1, 1] → label LONG / SHORT / NEUTRAL. */
export function scoreSentiment(title: string): { score: number; label: SentimentLabel; tokens: string[] } {
  const tokens = tokenize(title);
  const set = new Set(tokens);
  let longHits = 0;
  let shortHits = 0;
  for (const w of LONG_WORDS) {
    if (w.includes(" ")) {
      if (title.toLowerCase().includes(w)) longHits++;
    } else if (set.has(w)) longHits++;
  }
  for (const w of SHORT_WORDS) {
    if (w.includes(" ")) {
      if (title.toLowerCase().includes(w)) shortHits++;
    } else if (set.has(w)) shortHits++;
  }
  const denom = longHits + shortHits;
  const score = denom === 0 ? 0 : (longHits - shortHits) / denom;
  let label: SentimentLabel = "NEUTRAL";
  if (score >= 0.25) label = "LONG";
  else if (score <= -0.25) label = "SHORT";
  return { score, label, tokens };
}

/** Similarité Jaccard entre deux ensembles de tokens. */
export function jaccard(a: string[] | Set<string>, b: string[] | Set<string>): number {
  const A = a instanceof Set ? a : new Set(a);
  const B = b instanceof Set ? b : new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Moyenne Jaccard sur paires d'items (co-mouvement thématique). */
export function meanPairwiseJaccard(items: { tokens: string[] }[]): number {
  if (items.length < 2) return 0;
  let sum = 0;
  let n = 0;
  const lim = Math.min(items.length, 40);
  for (let i = 0; i < lim; i++) {
    for (let j = i + 1; j < lim; j++) {
      sum += jaccard(items[i].tokens, items[j].tokens);
      n++;
    }
  }
  return n ? sum / n : 0;
}

export function decodeXmlEntities(s: string): string {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function tagText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1].trim()) : "";
}

/** Parse RSS 2.0 / Atom minimal → items bruts. */
export function parseRssXml(xml: string): { title: string; link: string; publishedAt: number | null }[] {
  if (!xml || typeof xml !== "string") return [];
  const items: { title: string; link: string; publishedAt: number | null }[] = [];

  // RSS <item>
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const title = tagText(block, "title");
    let link = tagText(block, "link");
    if (!link) {
      const atomLink = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (atomLink) link = atomLink[1];
    }
    const pub = tagText(block, "pubDate") || tagText(block, "dc:date");
    const publishedAt = pub ? Date.parse(pub) : NaN;
    if (title) {
      items.push({
        title,
        link,
        publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
      });
    }
  }

  // Atom <entry>
  if (!items.length) {
    const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const block of entries) {
      const title = tagText(block, "title");
      const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      const link = linkMatch ? linkMatch[1] : tagText(block, "link");
      const pub = tagText(block, "updated") || tagText(block, "published");
      const publishedAt = pub ? Date.parse(pub) : NaN;
      if (title) {
        items.push({
          title,
          link,
          publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
        });
      }
    }
  }

  return items;
}

export function enrichItems(
  raw: { title: string; link: string; publishedAt: number | null }[],
  feed: FeedDef,
): SentimentItem[] {
  return raw.map((r) => {
    const { score, label, tokens } = scoreSentiment(r.title);
    return {
      title: r.title,
      link: r.link,
      publishedAt: r.publishedAt,
      sourceId: feed.id,
      sourceLabel: feed.label,
      score,
      label,
      tokens,
    };
  });
}

export interface SentimentAggregate {
  n: number;
  long: number;
  short: number;
  neutral: number;
  meanScore: number;
  bias: SentimentLabel;
  jaccard: number;
}

export function aggregateSentiment(items: SentimentItem[]): SentimentAggregate {
  const n = items.length;
  if (!n) {
    return { n: 0, long: 0, short: 0, neutral: 0, meanScore: 0, bias: "NEUTRAL", jaccard: 0 };
  }
  let long = 0, short = 0, neutral = 0, sum = 0;
  for (const it of items) {
    sum += it.score;
    if (it.label === "LONG") long++;
    else if (it.label === "SHORT") short++;
    else neutral++;
  }
  const meanScore = sum / n;
  let bias: SentimentLabel = "NEUTRAL";
  if (meanScore >= 0.15) bias = "LONG";
  else if (meanScore <= -0.15) bias = "SHORT";
  return {
    n, long, short, neutral, meanScore, bias,
    jaccard: meanPairwiseJaccard(items),
  };
}

/** Rate limiter mémoire (navigateur / tests). */
export class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private minIntervalMs: number,
    private maxPerWindow: number,
    private windowMs: number,
  ) {}

  /** @returns ms à attendre, ou 0 si autorisé */
  tryAcquire(now = Date.now()): number {
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxPerWindow) {
      const oldest = this.timestamps[0];
      return Math.max(1, this.windowMs - (now - oldest));
    }
    const last = this.timestamps[this.timestamps.length - 1];
    if (last != null && now - last < this.minIntervalMs) {
      return this.minIntervalMs - (now - last);
    }
    this.timestamps.push(now);
    return 0;
  }

  reset() {
    this.timestamps = [];
  }
}

/** Limiteur global : ≥5 s entre appels, ≤30 / heure. */
export const sentimentRateLimiter = new RateLimiter(5_000, 30, 3_600_000);

export function rssProxyUrl(feedId: string): string {
  return `/api/rss?src=${encodeURIComponent(feedId)}`;
}

/**
 * Charge un flux allowlisté via le proxy (dev Vite / prod Cloudflare).
 * Ne fetch jamais une URL arbitraire depuis le client.
 */
export async function fetchSentimentFeed(
  feedId: string,
  opts: { fetchImpl?: typeof fetch; limiter?: RateLimiter } = {},
): Promise<{ items: SentimentItem[]; feed: FeedDef; fetchedAt: number }> {
  const feed = resolveFeed(feedId);
  if (!feed) throw new Error(`Flux non autorisé : ${feedId}`);

  const limiter = opts.limiter || sentimentRateLimiter;
  const wait = limiter.tryAcquire();
  if (wait > 0) throw new Error(`Rate limit — réessaie dans ${Math.ceil(wait / 1000)}s`);

  const fetchImpl = opts.fetchImpl || fetch;
  const res = await fetchImpl(rssProxyUrl(feedId), {
    headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur flux ${feedId}`);
  const xml = await res.text();
  const raw = parseRssXml(xml);
  if (!raw.length) throw new Error(`Aucune entrée RSS parsée (${feedId})`);
  return { items: enrichItems(raw, feed), feed, fetchedAt: Date.now() };
}

/** Payload pour « Envoyer vers Alpha Forge ». */
export function toAlphaForgeHint(agg: SentimentAggregate, items: SentimentItem[]) {
  return {
    type: "sentiment_bias" as const,
    bias: agg.bias,
    meanScore: agg.meanScore,
    jaccard: agg.jaccard,
    n: agg.n,
    sampleTitles: items.slice(0, 5).map((i) => i.title),
    generatedAt: new Date().toISOString(),
  };
}
