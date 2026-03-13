# ── Stage 1: dependencies + build ────────────────────────────────────────────
# Must match the runner base image (both Debian/glibc) so better-sqlite3's
# native addon is compiled against the same libc it will run on.
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: production runtime ───────────────────────────────────────────────
# Use Debian slim (glibc) so that yt-dlp and gallery-dl standalone binaries
# (PyInstaller bundles) can execute. Alpine (musl) is incompatible with them.
FROM node:22-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    # better-sqlite3 native addon runtime dependency
    libstdc++6 \
    # yt-dlp and gallery-dl standalone binaries require Python 3 (glibc already present)
    python3 \
    # ffmpeg .tar.xz extraction
    xz-utils \
    tar \
    unzip \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# All app data (database, binaries, media) lives under MEMEVAULTPROJECT_DATA_DIR:
#   database  → /data/.memevaultproject/memevaultproject.db
#   binaries  → /data/.memevaultproject/bin/
#   downloads → /data/.memevaultproject/media/  (override with MEMEVAULTPROJECT_DOWNLOAD_PATH)
# ENV MEMEVAULTPROJECT_DATA_DIR=/data/.memevaultproject

COPY --from=builder /app/public             ./public
COPY --from=builder /app/.next              ./.next
COPY --from=builder /app/node_modules       ./node_modules
COPY --from=builder /app/package.json       ./package.json
COPY --from=builder /app/instrumentation.ts ./instrumentation.ts

EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "-p", "3000"]
