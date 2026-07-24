// P2-SCRAPE — sentiment RSS légal (pas de scraping social)
import { describe, it, expect, beforeEach } from "vitest";
import {
  parseRssXml,
  scoreSentiment,
  jaccard,
  meanPairwiseJaccard,
  enrichItems,
  aggregateSentiment,
  RateLimiter,
  resolveFeed,
  listSentimentFeeds,
  fetchSentimentFeed,
  toAlphaForgeHint,
  SENTIMENT_FEEDS,
} from "../../src/engine/sentimentFeed.ts";

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<title>Test</title>
<item><title>Fed signals hawkish tightening and rate hike</title><link>https://example.com/1</link><pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate></item>
<item><title>Markets fear recession and crash risk</title><link>https://example.com/2</link><pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate></item>
<item><title>Routine administrative notice</title><link>https://example.com/3</link><pubDate>Wed, 03 Jan 2024 12:00:00 GMT</pubDate></item>
</channel></rss>`;

describe("parseRssXml", () => {
  it("extrait titres et liens RSS 2.0", () => {
    const items = parseRssXml(SAMPLE_RSS);
    expect(items).toHaveLength(3);
    expect(items[0].title).toMatch(/hawkish/);
    expect(items[0].link).toContain("example.com/1");
    expect(items[0].publishedAt).toBeTruthy();
  });

  it("parse Atom entry", () => {
    const atom = `<feed><entry><title>Hello</title><link href="https://x.test/a"/><updated>2024-06-01T00:00:00Z</updated></entry></feed>`;
    const items = parseRssXml(atom);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe("https://x.test/a");
  });
});

describe("scoreSentiment", () => {
  it("classe hawkish / crash / neutre", () => {
    expect(scoreSentiment("Fed hawkish hike tightening").label).toBe("LONG");
    expect(scoreSentiment("Recession crash selloff panic").label).toBe("SHORT");
    expect(scoreSentiment("Meeting schedule update").label).toBe("NEUTRAL");
  });
});

describe("jaccard", () => {
  it("mesure overlap", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard(["a"], ["a"])).toBe(1);
    expect(meanPairwiseJaccard([
      { tokens: ["fed", "rate"] },
      { tokens: ["fed", "hike"] },
    ])).toBeGreaterThan(0);
  });
});

describe("aggregate + enrich", () => {
  it("agrège un flux parsé", () => {
    const feed = resolveFeed("fed");
    const items = enrichItems(parseRssXml(SAMPLE_RSS), feed);
    const agg = aggregateSentiment(items);
    expect(agg.n).toBe(3);
    expect(agg.long + agg.short + agg.neutral).toBe(3);
    expect(toAlphaForgeHint(agg, items).type).toBe("sentiment_bias");
  });
});

describe("allowlist + rate limit", () => {
  it("catalogue policy + research", () => {
    const ids = listSentimentFeeds().map((f) => f.id).sort();
    expect(ids).toEqual(["arxiv_qfin", "bis", "fed", "imf", "nber", "sec"]);
    expect(SENTIMENT_FEEDS.fed.url).toMatch(/^https:/);
    expect(listSentimentFeeds("research").every((f) => f.kind === "research")).toBe(true);
    expect(listSentimentFeeds("research").map((f) => f.id).sort()).toEqual(["arxiv_qfin", "bis", "nber"]);
  });

  it("RateLimiter bloque sous minInterval", () => {
    const rl = new RateLimiter(1000, 10, 60_000);
    expect(rl.tryAcquire(1000)).toBe(0);
    expect(rl.tryAcquire(1500)).toBeGreaterThan(0);
    expect(rl.tryAcquire(2100)).toBe(0);
  });

  it("fetchSentimentFeed refuse id inconnu", async () => {
    await expect(fetchSentimentFeed("twitter", { limiter: new RateLimiter(0, 100, 99999) }))
      .rejects.toThrow(/non autorisé/);
  });

  it("fetchSentimentFeed parse via fetch mock", async () => {
    const rl = new RateLimiter(0, 100, 99999);
    const fetchImpl = async () => ({
      ok: true,
      text: async () => SAMPLE_RSS,
    });
    const res = await fetchSentimentFeed("fed", { fetchImpl, limiter: rl });
    expect(res.items.length).toBe(3);
    expect(res.feed.id).toBe("fed");
  });
});
