FROM node:24-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY package*.json ./
RUN npm ci && npx playwright install --with-deps chromium
COPY src ./src
RUN mkdir -p /app/artifacts && chown node:node /app/artifacts
USER node
ENV HEADLESS=true
ENTRYPOINT ["node", "src/index.ts"]
