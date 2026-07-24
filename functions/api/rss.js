// Cloudflare Pages Function — proxy RSS allowlisté (P2-SCRAPE).
// Refuse toute URL hors catalogue (anti open-proxy).

const FEEDS = {
  fed: "https://www.federalreserve.gov/feeds/press_all.xml",
  sec: "https://www.sec.gov/news/pressreleases.rss",
  imf: "https://www.imf.org/en/News/RSS?language=eng",
};

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const src = url.searchParams.get("src") || "";
  const target = FEEDS[src];
  if (!target) {
    return new Response(JSON.stringify({ error: "src non autorisé", allowed: Object.keys(FEEDS) }), {
      status: 403,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }
  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "QuantEXPro/5.0 (+https://github.com/samelghorch-cmd/quantexpro; sentiment-rss)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/xml; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=300",
        "x-qx-feed": src,
      },
    });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
