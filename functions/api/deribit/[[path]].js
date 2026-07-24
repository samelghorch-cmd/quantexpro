// Cloudflare Pages — proxy Deribit public allowlisté (P4-GEX).
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/api\/deribit/, "");
  // Only public book summary for options
  if (!path.startsWith("/public/get_book_summary_by_currency")) {
    return new Response(JSON.stringify({ error: "endpoint Deribit non autorisé" }), {
      status: 403,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }
  const currency = (url.searchParams.get("currency") || "BTC").toUpperCase();
  if (!["BTC", "ETH"].includes(currency)) {
    return new Response(JSON.stringify({ error: "currency BTC|ETH seulement" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const target =
    "https://www.deribit.com/api/v2" +
    path +
    `?currency=${encodeURIComponent(currency)}&kind=option`;
  try {
    const upstream = await fetch(target, {
      headers: {
        Accept: "application/json",
        "User-Agent": "QuantEXPro/5.0 (+deribit-gex)",
      },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=60",
      },
    });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
