FROM node:24-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HF_HOME=/home/node/.cache/huggingface \
    USE_TF=0 HEADLESS=true RUN_TIMEOUT_MS=300000
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv tini \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/laya \
    && /opt/laya/bin/pip install --no-cache-dir torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu \
    && /opt/laya/bin/pip install --no-cache-dir 'laya[serve]==0.3.26'
COPY package*.json ./
RUN npm ci && npx playwright install --with-deps chromium
COPY src ./src
COPY internal ./internal
RUN mkdir -p /home/node/.cache/huggingface && chown -R node:node /home/node/.cache
USER node
ENTRYPOINT ["tini", "--", "python3", "internal/entrypoint.py"]
