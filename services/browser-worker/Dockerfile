FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=8787

WORKDIR /app

COPY services/browser-worker/package.json ./services/browser-worker/package.json

WORKDIR /app/services/browser-worker
RUN npm install --omit=dev --no-audit --no-fund \
    && npx playwright install --with-deps chromium \
    && mkdir -p /ms-playwright \
    && chown -R node:node /app /ms-playwright

WORKDIR /app
COPY src ./src
COPY services/browser-worker ./services/browser-worker
RUN chown -R node:node /app

USER node
WORKDIR /app/services/browser-worker
EXPOSE 8787

CMD ["node", "server.js"]
