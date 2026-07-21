import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy Yahoo Finance (contourne le CORS en dev — même rôle que la Cloudflare Function en prod)
      "/api/yf": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/yf/, ""),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TradoBot/5.0)" },
      },
      // Proxy FRED (données macro réelles de la Réserve Fédérale, sans clé)
      "/api/fred": {
        target: "https://fred.stlouisfed.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/fred/, ""),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TradoBot/5.0)" },
      },
    },
  },
});
