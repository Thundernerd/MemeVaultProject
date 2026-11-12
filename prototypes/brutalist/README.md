# Brutalist / bold

Style prototype for issue #11. Throwaway: the app never imports anything here.

Thick black outlines, hard offset shadows with no blur, flat saturated blocks,
heavy grotesk display type with mono uppercase labels, and no rounded corners.
Media cards are tilted stickers that snap straight on hover, and every button
visibly presses into its own shadow.

## Opening it

Open `index.html` (the app) from disk or via `npx serve prototypes`. The yellow
**Screens** button (bottom right) links every screen and state in
[`../SCREENS.md`](../SCREENS.md), and also toggles the theme. `share.html` is the
public share page, which is served without the app shell, so it has no nav.

| File | What |
| --- | --- |
| `index.html` | App shell. Hash routes: `#/vault`, `#/queue`, `#/tags`, `#/settings/<tab>` |
| `share.html` | Public share page, `share.html#<token>` from `MOCK.shares` |
| `styles.css` | The whole style. Palette at the top |
| `theme.js` | Theme + accent on `<html>`, same keys as `frontend/src/theme.ts` |
| `app.js` | Router, header, drawer, shared helpers |
| `vault.js`, `modals.js`, `lists.js`, `settings.js` | One file per screen group |
| `screens.js` | The Screens index (prototype chrome, not part of the design) |

Route params that open states: `?state=empty|loading|error` (vault, queue),
`?modal=add[&files=1&drag=1]`, `?modal=media&id=<index into MOCK.media>`,
`?drawer=1`, `?msg=saved|error` (settings), `?reveal=1` (API key).

## Mapping back to the app

The palette uses the app's role tokens with the same names as
`frontend/src/style.css` (`--surface-base`, `--surface-1..3`, `--border`,
`--border-strong`, `--text-primary/secondary/muted`, `--accent`, `--accent-hover`,
`--accent-subtle`) under `[data-theme]` and `[data-accent]`, so a port is
mostly a token swap plus the shape rules (border width, `--lift` shadows, no radius).
The extra tokens this style needs are listed after them: `--shadow`,
`--on-accent`, `--danger`/`--on-danger`, `--ok`/`--on-ok`, the sticker colours
`--pop-1..3` and `--overlay`.

Fonts are system fonts only (Arial Black for display, the platform mono for
labels), so it stays offline.
