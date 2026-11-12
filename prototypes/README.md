# Visual style prototypes

Throwaway exploration for comparing very different visual styles for MemeVault,
side by side, before committing to a redesign. **The app never imports anything
from this folder.** Nothing here is built, tested or shipped, and it can be
deleted once a direction is chosen.

## Opening them

No build step and no npm dependencies. Either:

- open `prototypes/index.html` directly from disk in a browser, or
- serve the folder: `npx serve prototypes`, then open the URL it prints.

Everything works offline: the mock data and the placeholder thumbnails are generated
locally, with no network images, fonts or CDNs.

## Layout

```
prototypes/
  index.html          gallery linking every style
  SCREENS.md          the screens every style must cover
  shared/
    mock-data.js      window.MOCK fixtures shared by every style
  <style>/            one folder per style, e.g. brutalist/
    index.html        entry point: a screen list or a screen switcher
    ...               one page per screen, or everything in index.html
```

## Adding a style

1. Create `prototypes/<style>/index.html`. Either give each screen its own page
   (`vault.html`, `queue.html`, …) linked from `index.html`, or build one page with
   a screen switcher. Either way every screen in [`SCREENS.md`](SCREENS.md) must be
   reachable from `<style>/index.html`.
2. Load the mock data with a classic script tag and read `window.MOCK`:

   ```html
   <script src="../shared/mock-data.js"></script>
   ```

   Don't use `type="module"` or `fetch()` for local files. Browsers block both for
   pages opened from disk, so the prototype would only work when served.
3. Keep the style self-contained: its own CSS and JS inside its folder, nothing
   from `frontend/`, and no external resources, so it stays offline. Don't edit
   `shared/` for one style. Change it only when every style benefits.
4. In `index.html`, find your entry in the `STYLES` list and set `ready: true` (or
   add an entry). Rows with `ready: false` show as "Not built yet".

## The mock data

`shared/mock-data.js` defines `window.MOCK`. The collections match the shapes in
`frontend/src/api.ts`:

| Key | Shape | Notes |
| --- | --- | --- |
| `media` | `MediaItem[]` | 24 items, video and image, untitled and very long titles, 0–5 tags, aspect ratios from 1:4 to 10:3 |
| `albums` | `Album[]` | 3 albums (5, 2 and 8 items), one untitled |
| `queue` | `QueueItem[]` | every status (`pending`, `downloading` at 0, 12, 47 and 99%, `completed`, `failed` with `error`, `cancelled`) and every source (`web`, `api`, `discord`, `fluxer`) |
| `tags` | `TagWithCount[]` | 15 namespaced tags, counts derived from the media, one unused |
| `shares` | `ShareLink[]` | item links (with and without expiry and download) and an album link |
| `settings`, `binaries`, `cookies`, `apiKeys`, `newApiKey` | Settings tab data | `settings._overridden_by_env` lists env-locked keys |
| `states` | strings | copy for the empty, loading and error states |

Helpers:

- `MOCK.thumbnail(item)` returns an inline SVG data URI at the item's aspect ratio,
  or `null` for a video without a thumbnail (the app shows no image then).
- `MOCK.activeQueue()` returns the pending and downloading items that the vault
  shows as progress cards.
- `MOCK.shareUrl(token)` returns the public share URL for a token.

To check the data loads, open the browser console on any page that includes it and
run `console.log(window.MOCK)`.
