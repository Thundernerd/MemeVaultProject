# MVP — Meme Vault Project

A self-hosted media downloader and library. Paste a URL, pick a downloader, and MVP saves the file to your library with metadata, thumbnails, and tags.

## Features

- **Download queue** — Add URLs for yt-dlp (video) or gallery-dl (images); progress updates every 2 s
- **Media library** — Browse your collection with search, type filter (video / image), and tag filters (any / all)
- **Tags** — Attach and manage tags on any media item
- **Auto-managed binaries** — yt-dlp, gallery-dl, and ffmpeg are downloaded automatically on first run
- **External API** — Submit downloads and poll status from scripts or other tools (`/api/v1/*`)
- **Configurable** — Every setting can be overridden via environment variable
- **Docker-ready** — Single-container setup with a named volume for all app data

## Quick start

```bash
npm install
npm run dev
```

Requires Node 22+. Binaries (yt-dlp, gallery-dl, ffmpeg) are downloaded automatically to `~/.memevaultproject/bin/` on first run.

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

All settings have sensible defaults and can be overridden at runtime.

| Variable | Default | Description |
|---|---|---|
| `MEMEVAULTPROJECT_DATA_DIR` | `~/.memevaultproject` | Root directory for the database, binaries, and media |
| `MEMEVAULTPROJECT_DOWNLOAD_PATH` | `$DATA_DIR/media` | Where downloaded files are saved |
| `MEMEVAULTPROJECT_API_KEY` | *(auto-generated)* | Key for the external `/api/v1/*` endpoints |
| `MEMEVAULTPROJECT_YTDLP_BIN` | *(auto-managed)* | Path to a custom yt-dlp binary |
| `MEMEVAULTPROJECT_GALLERYDL_BIN` | *(auto-managed)* | Path to a custom gallery-dl binary |
| `MEMEVAULTPROJECT_FFMPEG_BIN` | *(auto-managed)* | Path to a custom ffmpeg binary |
| `MEMEVAULTPROJECT_YTDLP_EXTRA_ARGS` | *(empty)* | Extra flags appended to every yt-dlp call |
| `MEMEVAULTPROJECT_GALLERYDL_EXTRA_ARGS` | *(empty)* | Extra flags appended to every gallery-dl call |
| `MEMEVAULTPROJECT_MAX_CONCURRENT_DOWNLOADS` | `2` | Maximum simultaneous downloads |

Settings marked *(auto-generated)* or *(auto-managed)* are stored in the SQLite database and editable from the Settings page. An environment variable always takes precedence over the database value.

## External API

Authenticate with `X-API-Key: <your-key>` (find or regenerate the key on the Settings page).

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
GET /api/v1/status/<id>
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

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
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
└── media/                    # Downloaded files (or MEMEVAULTPROJECT_DOWNLOAD_PATH)
```

## License

MIT
