// Cloudflare Pages Function — proxy Yahoo Finance en production (équivalent du proxy Vite en dev).
// Déploiement : `npm run build` puis Cloudflare Pages sur le dossier dist/ ; functions/ est détecté automatiquement.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/api\/yf/, "");
  const target = "https://query1.finance.yahoo.com" + path + url.search;
  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TradoBot/5.0)", "Accept": "application/json" },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=300",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { "content-type": "application/json" } });
  }
}
