// Cloudflare Pages — proxy Binance public allowlisté (P4-FEEDS ping).
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/api\/binance/, "");
  if (path !== "/ping" && path !== "/ping/") {
    return new Response(JSON.stringify({ error: "endpoint Binance non autorisé (ping only)" }), {
      status: 403,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }
  try {
    const upstream = await fetch("https://api.binance.com/api/v3/ping", {
      headers: { Accept: "application/json", "User-Agent": "QuantEXPro/5.0 (+binance-ping)" },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=30",
      },
    });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
