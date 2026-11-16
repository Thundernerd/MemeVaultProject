# Changelog

## [Unreleased]

### Features
- New brutalist visual design across the whole app: header, nav and mobile drawer, vault grid and cards, Add-to-vault and media detail modals, Queue, Tags, all seven Settings tabs, and the public share page
- Modals keep keyboard focus inside them, close on Escape, lock background scroll, and nested dialogs stack correctly
- The Tags page has loading, empty and error states
- Settings shows an error tag when a tab fails to load, or when a cookie, API key or binary download action fails
- Failed tag deletes, purges and queue actions now show up as errors instead of failing silently

### Fixes
- Deep links into the app (e.g. reloading `/queue`) are served with HTTP 200 instead of 404
- An unknown saved theme or accent falls back to dark/blue
- The mobile drawer closes on Escape, route change and resize
- Cancelling a download stops yt-dlp/gallery-dl and every process they started
- macOS: ffmpeg auto-download works again, ffprobe is downloaded alongside it, and a Linux gallery-dl build is no longer downloaded; a binary that can't run is reported as such
- Binary `--version` checks time out, no longer leave processes running (including on Windows), and still return the version when a child process keeps the output open
- A failed binary download removes its leftover `.partial` file

## [1.2.0] - 2026-10-05

### Features
- Optional Fluxer bot: configurable message command (prefix + name) posts downloads back to Fluxer, with per-instance endpoint discovery, optional post-as-sender webhooks, and optional deletion of the sender's command message

## [1.1.1] - 2026-09-05

## [1.1.0] - 2026-09-05

### Features
- Vault filters (type and tags) can be collapsed; they start hidden on small screens
- Copy button on media share links, including auto-copy after creating a share
- Optional `includeInRandom` on submit, web downloads, and upload so new items can join random selection at create time

## [1.0.1] - 2026-08-25

## [1.0.0] - 2026-08-25

## [0.2.0] - 2026-08-25

### Features
- Drag-and-drop file staging in the Add modal; upload body limit raised for large videos
