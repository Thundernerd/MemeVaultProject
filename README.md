# MVP — Meme Vault Project

A self-hosted media downloader and library. Paste a URL, pick a downloader, and MVP saves the file to your vault with metadata, thumbnails, and tags.

## Features

- **Download queue** — Submit URLs for yt-dlp (video) or gallery-dl (images/albums); progress updates every 2 s with retry support for failed items
- **Manual uploads** — Drag-and-drop or file-browse to upload video and image files directly to the vault; metadata extracted automatically via ffprobe
- **Albums** — Multi-image gallery-dl downloads are automatically grouped into a single album card
- **Media library** — Browse your collection with search, type filter (video / image / album), and tag filters (any / all); skeleton cards shown for in-progress downloads
- **Tags** — Attach and manage tags on any media item; auto-tags applied on download/upload (e.g. `source:upload`, `downloader:ytdlp`); tag management page for bulk editing
- **Sharing** — Generate public share links per item with optional download permission and expiry; OG embed support for social media previews
- **External API** — Submit downloads, poll status, download files, and get random items from scripts or other tools (`/api/v1/*`)
- **Multi-key API auth** — Create named API keys with `read` or `read_write` permissions; manage from the Settings page
- **OIDC authentication** — Optional single sign-on via any OIDC provider (Google, Authentik, etc.); app is fully usable without auth
- **Theming** — Light/dark mode toggle and five accent colour options; preference persisted in localStorage
- **Auto-managed binaries** — yt-dlp, gallery-dl, and ffmpeg are downloaded automatically on first run and updated from the Settings page
- **Docker-ready** — Single-container setup with a named volume for all app data

## Quick start

```bash
npm install
npm run dev
```

Requires Node 22+. Binaries (yt-dlp, gallery-dl, ffmpeg) are downloaded automatically to `~/.memevaultproject/bin/` on first run.

Open [http://localhost:3000](http://localhost:3000).

## Docker

```bash
docker run -p 3000:3000 -v memevault-data:/data ghcr.io/christiaan/memevaultproject:latest
```

## Environment variables

All settings have sensible defaults and can be overridden at runtime. Settings not set via environment variable are stored in the SQLite database and editable from the Settings page.

| Variable | Default | Description |
|---|---|---|
| `MEMEVAULTPROJECT_DATA_DIR` | `~/.memevaultproject` | Root directory for the database, binaries, and media |
| `MEMEVAULTPROJECT_DOWNLOAD_PATH` | `$DATA_DIR/media` | Where downloaded and uploaded files are saved |
| `MEMEVAULTPROJECT_MAX_CONCURRENT_DOWNLOADS` | `2` | Number of simultaneous downloads |
| `MEMEVAULTPROJECT_YTDLP_BIN` | *(auto-managed)* | Path to a custom yt-dlp binary |
| `MEMEVAULTPROJECT_GALLERYDL_BIN` | *(auto-managed)* | Path to a custom gallery-dl binary |
| `MEMEVAULTPROJECT_FFMPEG_BIN` | *(auto-managed)* | Path to a custom ffmpeg binary |
| `MEMEVAULTPROJECT_YTDLP_EXTRA_ARGS` | *(empty)* | Extra flags appended to every yt-dlp call |
| `MEMEVAULTPROJECT_GALLERYDL_EXTRA_ARGS` | *(empty)* | Extra flags appended to every gallery-dl call |
| `MEMEVAULTPROJECT_LOG_LEVEL` | `info` | Log verbosity: `error`, `warn`, `info`, or `debug` |
| `MEMEVAULTPROJECT_SHARE_BASE_URL` | *(empty)* | Base URL used in share link OG embeds |
| `MEMEVAULTPROJECT_OIDC_ISSUER` | *(empty)* | OIDC provider URL — enables authentication when set |
| `MEMEVAULTPROJECT_OIDC_CLIENT_ID` | *(empty)* | OIDC client ID |
| `MEMEVAULTPROJECT_OIDC_CLIENT_SECRET` | *(empty)* | OIDC client secret |
| `AUTH_SECRET` | *(empty)* | next-auth session signing key (required when OIDC is enabled) |
| `AUTH_URL` | *(empty)* | Canonical app URL (required when OIDC is enabled) |

## External API

All `/api/v1/*` routes require an `X-API-Key` header. Keys are created and managed on the Settings → API page. Each key has either `read` or `read_write` permission.

### Submit a download

```http
POST /api/v1/submit
Content-Type: application/json
X-API-Key: <key>

{ "url": "https://example.com/video", "type": "video" }
```

`type` is `"video"` (yt-dlp) or `"image"` (gallery-dl).

**Response** `201 Created`
```json
{ "id": "<queue-item-id>" }
```

### Poll status

```http
GET /api/v1/status/<queue-item-id>
X-API-Key: <key>
```

**Response**
```json
{
  "id": "...",
  "status": "completed",
  "progress": 1.0,
  "error": null
}
```

`status` is one of `pending` · `downloading` · `completed` · `failed`.

### Download a file

```http
GET /api/v1/download/<media-item-id>
X-API-Key: <key>
```

Streams the file directly. The media item ID is returned by `/api/v1/random` or can be found via the UI.

### Get a random item

```http
GET /api/v1/random
X-API-Key: <key>
```

**Response**
```json
{
  "id": "...",
  "type": "video",
  "title": "...",
  "tags": ["source:ytdlp"],
  "download_url": "/api/v1/download/<id>",
  ...
}
```

The random pool is controlled by the **Random mode** setting: `flag` (only items with the _include in random_ flag) or `shared` (only items with an active public share link).

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router, React 19)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [next-auth v5](https://authjs.dev/) (OIDC)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) · [gallery-dl](https://github.com/mikf/gallery-dl) · [ffmpeg](https://ffmpeg.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)

## Data layout

```
~/.memevaultproject/          # or MEMEVAULTPROJECT_DATA_DIR
├── memevaultproject.db       # SQLite database
├── bin/                      # Auto-managed binaries
│   ├── yt-dlp
│   ├── gallery-dl.bin
│   └── ffmpeg
└── media/                    # Downloaded/uploaded files (or MEMEVAULTPROJECT_DOWNLOAD_PATH)
```

## AI assistance

This project was built with the assistance of [Claude Code](https://claude.ai/claude-code) (Anthropic). AI was used throughout development for feature implementation, code review, and refactoring.

(Un)fortunately I am not a web developer nor am I striving to be. I am but a simple game developer that had an idea that I wanted to get worked out but I simply don't have the time to learn proper webdevelopment.

I fully understand the distaste for the use of AI and you are free to ignore the project if you do not wish to interact with it solely because of the use of AI.
