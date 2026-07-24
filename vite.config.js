import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Proxy RSS allowlisté en dev (équivalent `functions/api/rss.js` en prod). */
const RSS_FEEDS = {
  fed: "https://www.federalreserve.gov/feeds/press_all.xml",
  sec: "https://www.sec.gov/news/pressreleases.rss",
  imf: "https://www.imf.org/en/News/RSS?language=eng",
};

function rssDevProxy() {
  return {
    name: "qx-rss-allowlist-proxy",
    configureServer(server) {
      server.middlewares.use("/api/rss", async (req, res) => {
        try {
          const host = req.headers.host || "localhost";
          const u = new URL(req.url || "/", `http://${host}`);
          const src = u.searchParams.get("src") || "";
          const target = RSS_FEEDS[src];
          if (!target) {
            res.statusCode = 403;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "src non autorisé", allowed: Object.keys(RSS_FEEDS) }));
            return;
          }
          const upstream = await fetch(target, {
            headers: {
              "User-Agent": "QuantEXPro/5.0 (+sentiment-rss-dev)",
              Accept: "application/rss+xml, application/xml, text/xml, */*",
            },
          });
          const body = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader("content-type", upstream.headers.get("content-type") || "application/xml; charset=utf-8");
          res.setHeader("cache-control", "public, max-age=300");
          res.setHeader("x-qx-feed", src);
          res.end(body);
        } catch (e) {
          res.statusCode = 502;
          res.end(String(e));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), rssDevProxy()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api/yf": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/yf/, ""),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TradoBot/5.0)" },
      },
      "/api/fred": {
        target: "https://fred.stlouisfed.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/fred/, ""),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TradoBot/5.0)" },
      },
      "/api/deribit": {
        target: "https://www.deribit.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/deribit/, "/api/v2"),
        headers: { "User-Agent": "QuantEXPro/5.0 (+deribit-gex)" },
      },
    },
  },
});
