// Cloudflare Pages Function — proxy FRED (Réserve Fédérale) en production. Équivalent du proxy Vite en dev.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/api\/fred/, "");
  const target = "https://fred.stlouisfed.org" + path + url.search;
  try {
    const upstream = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TradoBot/5.0)" } });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
