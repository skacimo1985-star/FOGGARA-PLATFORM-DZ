FROM rust:1-slim-bookworm AS nexus
WORKDIR /engine
COPY engines/nexus-core/ ./
RUN cargo build --release --locked

FROM node:20-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY tailwind.config.js postcss.config.js components.json ./
COPY src ./src
COPY reference ./reference
COPY public ./public
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m app
WORKDIR /app
COPY backend/requirements.lock backend/requirements.lock
RUN pip install --no-cache-dir pip==26.2.1 && pip install --no-cache-dir -r backend/requirements.lock pgserver
COPY backend ./backend
COPY reference ./reference
COPY --from=nexus /engine/target/release/foggara-nexus-core /usr/local/bin/foggara-nexus-core
ENV NEXUS_MATRIX_ENGINE=rust
COPY --from=web /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown -R app:app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=4)"
CMD ["./docker-entrypoint.sh"]

