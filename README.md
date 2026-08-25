# MemeVaultProject (V2)

Self-hosted media downloader and library — **Rust (Axum) backend** + **Vue 3 SPA**, with the same SQLite schema and data directory layout as V1 so existing installs can switch without migrating data.

## Features

- Download queue (yt-dlp / gallery-dl), manual uploads, albums, tags, sharing with OG embeds
- External `/api/v1/*` API with multi-key auth
- Optional OIDC UI gate and Discord slash-command bot
- Single production process: Rust serves API, share HTML, and the compiled SPA

## Quick start (development)

Requires Rust (stable) and Node 22+.

```bash
# Terminal 1 — API
cargo run

# Terminal 2 — Vue (proxies /api and /share to :3000)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173

## Production build

```bash
cd frontend && npm ci && npm run build && cd ..
cargo build --release
MEMEVAULTPROJECT_STATIC_DIR=frontend/dist ./target/release/memevaultproject
```

Open http://localhost:3000

## Drop-in replacement for V1

Point V2 at the same data directory:

```bash
export MEMEVAULTPROJECT_DATA_DIR=~/.memevaultproject
./target/release/memevaultproject
```

V2 opens `memevaultproject.db` with the identical schema and serves media from the absolute paths already stored in the database.

## Docker

```bash
docker build -t memevaultproject .
docker run -p 3000:3000 -v memevault-data:/data memevaultproject
```

## Environment variables

See [`.env.example`](.env.example). Names match V1 (`MEMEVAULTPROJECT_*`, `AUTH_*`).

## License

MIT — see [LICENSE](LICENSE).
