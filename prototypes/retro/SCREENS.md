# Retro / Y2K: screen checklist

Early-web window chrome, bevels, a 5×7 bitmap display font (`pixel-font.js`, drawn as
SVG so nothing loads from the network), pixel icons (`icons.js`), a candy-sky (light)
or vaporwave (dark) desktop, and modals as OS dialogs. Body text is Verdana/Tahoma.

Open `index.html`. Every screen below is also in the **Start** menu (bottom left),
which is the screen index for reviewers. Links are relative to this folder. The theme
(☀/☾) and the five accents sit in the header; the choice is remembered per browser.

The palette is the app's role tokens (`--surface-base`, `--surface-1..3`, `--border`,
`--border-strong`, `--text-primary/secondary/muted`, `--accent`, `--accent-hover`,
`--accent-subtle`) at the top of `retro.css`, under `[data-theme]` and `[data-accent]`
like `frontend/src/style.css`. The few extra tokens (`--bevel-*`, `--desktop`, …) are
derived chrome.

## 1. Header and navigation
- [x] Desktop header: safe logo, "MVP" wordmark, `v1.2.0`, Vault / Queue / Tags / Settings
  with the active one pressed in, theme + accent switcher, "Sign out"
- [x] Mobile drawer: below 768px, ☰ opens a "Go to…" window under the header with a
  backdrop (click the backdrop, the × or press Esc to close)

## 2. Vault grid — [`index.html#/vault`](index.html#/vault)
- [x] Title, "Search…", "Show filters" / "Hide filters" with the count badge when
  closed, "Add"
- [x] Filter panel: type select, tag chips (selected / not), "match: any" / "match: all"
  (all of these really filter)
- [x] Active downloads: dashed cards with "Waiting", "Starting…", percentage, "Processing…"
- [x] Media cards (long titles clamp to two lines, untitled shows the type, no-thumbnail
  videos show a scanline "No thumbnail" tile), album cards with "N items" and "album"

## 3. Add to vault modal
- [x] [Idle](index.html#/vault?modal=add): "Add to vault", "Include in random", URL
  form with the two downloaders and "Queue download" (adds a pending row to the queue)
- [x] [Drag-over](index.html#/vault?modal=add&demo=drag) (or drag a real file over the zone)
- [x] [Files selected](index.html#/vault?modal=add&demo=files): pending, done and error
  rows, "Upload 2 files" → "Uploading…" → "Done". Clicking the zone adds two files.

## 4. Media detail modal
- [x] [Video with poster](index.html#/vault?modal=media&id=media-9e3779b1-4000-8000-000000000001),
  [image](index.html#/vault?modal=media&id=media-3c6ef362-4000-8000-000000000002),
  [video without thumbnail](index.html#/vault?modal=media&id=media-538453d7-4000-8000-000000000007)
- [x] Title / "Untitled", source URL, ✕; tags with "Add tag", "Add", "Save tags";
  "Include in random"; "Share links" with "Create", "Copy" → "Copied", "Revoke";
  "Delete" (asks first, in a system message box)

## 5. Queue — [`index.html#/queue`](index.html#/queue)
- [x] "Queue", "Add URL"; every status and source badge; progress while active; error text
- [x] "Cancel" / "Retry" (not for Discord or Fluxer) / "Remove" all work in memory

## 6. Tags — [`index.html#/tags`](index.html#/tags)
- [x] Namespaces as folders with counts and ✕; the long name truncates; "orphaned" is
  shown greyed; "Purge unused" removes it (after confirming)

## 7. Settings
- [x] [General](index.html#/settings/general) (download path locked by env),
  [Binaries](index.html#/settings/binaries), [Cookies](index.html#/settings/cookies),
  [Sharing](index.html#/settings/sharing), [API](index.html#/settings/api)
  ([new key revealed](index.html#/settings/api?demo=newkey)),
  [Discord](index.html#/settings/discord), [Fluxer](index.html#/settings/fluxer)
- [x] "Saved" after Save; [save error](index.html#/settings/general?msg=error)

## 8. Public share page
- [x] Single item: [video, download](share.html?token=k3Jd9xQ2mPz7),
  [image, download](share.html?token=Hx2cVn6pEa0S), [no download](share.html?token=Wq8LrT1vYb4N)
- [x] [Album](share.html?token=Al5bum7Tk9Zr); "Shared via MemeVault" footer

## 9. Empty, loading and error states
- [x] Vault: [empty](index.html#/vault?state=empty), [loading](index.html#/vault?state=loading),
  [error](index.html#/vault?state=error)
- [x] Queue: [empty](index.html#/queue?state=empty), [loading](index.html#/queue?state=loading)
  (proposed: an hourglass with an indeterminate bar), [error](index.html#/queue?state=error)

Everything you change (tags, queue actions, keys, …) lives in memory and resets on reload.
