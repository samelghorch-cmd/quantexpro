# Collecteur 24/7 TradoBot — image minimale, AUCUNE dépendance npm.
# Réutilise le moteur JS du dashboard (src/engine) → mêmes stratégies qu'au backtest.
# Contexte de build attendu : la racine web/dashboard.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./package.json
COPY src ./src
COPY collector ./collector
ENV PORT=8787
ENV POLL_MS=300000
# Répertoire de données : monte un volume persistant dessus en prod (sinon reset au redéploiement).
ENV DATA_DIR=/data
EXPOSE 8787
CMD ["node", "collector/index.js"]
