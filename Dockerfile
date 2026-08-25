# syntax=docker/dockerfile:1

# ── Frontend ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Backend ───────────────────────────────────────────────────────────────────
FROM rust:1-bookworm AS backend
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml ./
# Dummy main to cache deps
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
COPY templates ./templates
COPY --from=frontend /frontend/dist ./frontend/dist
RUN touch src/main.rs && cargo build --release

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend /app/target/release/memevaultproject /usr/local/bin/memevaultproject
COPY --from=frontend /frontend/dist /app/frontend/dist
ENV MEMEVAULTPROJECT_DATA_DIR=/data/.memevaultproject
ENV MEMEVAULTPROJECT_STATIC_DIR=/app/frontend/dist
EXPOSE 3000
VOLUME ["/data"]
CMD ["memevaultproject"]
