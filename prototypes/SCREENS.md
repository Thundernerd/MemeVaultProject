# Screens every style must cover

Every style prototype (`prototypes/<style>/`) covers each screen below, filled from
`shared/mock-data.js` (`window.MOCK`). Each entry names the real component it
mirrors, so the prototype keeps the same content and controls even when the look
changes completely. Paths are relative to `frontend/src/` unless they start with
`templates/`. Line numbers are as of v1.2.0.

Use a `[x]` checklist copy of this file in your style's folder, or link each item from
the style's `index.html`, so a reviewer can see that nothing is missing.

## 1. Header and navigation

Mirrors `layouts/MainLayout.vue:36-87`.

- **Desktop header:** logo with "MVP" wordmark and version (`MOCK.version`); nav links
  Vault, Queue, Tags, Settings with an active state; theme/accent switcher
  (`components/ThemeSwitcher.vue`: dark/light plus five accents); optional "Sign out" link.
- **Mobile drawer:** below the `md` breakpoint the nav collapses behind a ☰ button
  into a drawer under the header, with a backdrop.

## 2. Vault grid

Mirrors `views/VaultView.vue`, `components/MediaCard.vue`, `components/AlbumCard.vue`,
`components/DownloadProgress.vue`.

- Title "Vault", search input (placeholder "Search…"), "Show filters" / "Hide filters"
  toggle with an active-filter count badge, and an "Add" button.
- **Filter panel:** type select (All / Video / Image), tag chips (selected and
  unselected), and the "match: any" / "match: all" toggle.
- **Active downloads:** dashed placeholder cards for `MOCK.activeQueue()`, each with
  the URL and a progress bar: "Waiting" (pending), "Starting…" (indeterminate,
  progress < 1), a percentage, and "Processing…" (progress ≥ 99).
- **Media cards** (`MOCK.media`): square thumbnail (`MOCK.thumbnail(item)`, `null`
  means a video with no thumbnail), title or the type when untitled, a type badge.
  Cover long titles, untitled items and every aspect ratio.
- **Album cards** (`MOCK.albums`): first item's thumbnail, title or "Album",
  "N items", an "album" badge.

## 3. Add to vault modal

Mirrors `components/AddUrlModal.vue:161-328`.

- Heading "Add to vault", "Include in random" checkbox.
- URL form: input with placeholder "https://...", radio choice "yt-dlp (video)" /
  "gallery-dl", and "Queue download".
- Under it, "Or upload files": a drag-and-drop zone (idle and drag-over), the list of
  selected files with per-file state (pending, done, error with a message), and the
  upload button.

## 4. Media detail modal

Mirrors `components/MediaModal.vue:98-165`.

- Player area: video with poster, or the image.
- Title (or "Untitled") with the source URL under it, and a close button.
- Tag chips, the "Add tag" input with "Add", and "Save tags".
- "Include in random" checkbox.
- "Share links" with "Create", and for each link (`MOCK.shares`, built with
  `MOCK.shareUrl(token)`) the URL plus "Copy" / "Copied" and "Revoke".
- "Delete" in the footer.

## 5. Queue

Mirrors `views/QueueView.vue`.

- Title "Queue" and an "Add URL" button.
- One row per `MOCK.queue` item: URL, source label badge (Discord, Fluxer, or an API
  key name), `downloader · status`, progress bar while active, error text when
  failed.
- Actions: "Cancel" (pending/downloading), "Retry" (failed/cancelled, but not for
  Discord or Fluxer sources), "Remove".
- Cover every status: `pending`, `downloading` (0, mid, ≥ 99), `completed`,
  `failed`, `cancelled`.

## 6. Tags

Mirrors `views/TagsView.vue`.

- Title "Tags" and a "Purge unused" button.
- Tags grouped by namespace (the part before `:`, otherwise "other"), each tag with
  its usage count and a delete control. `MOCK.tags` includes an unused tag and a very
  long name.

## 7. Settings

Mirrors `views/settings/SettingsLayout.vue:5-13` and each tab view. Title
"Settings" with a tab bar; every tab has its form and a "Saved" / error message.

- **General** (`GeneralView.vue`): download path (env-locked: see
  `MOCK.settings._overridden_by_env`), yt-dlp and gallery-dl extra args.
- **Binaries** (`BinariesView.vue`): status per binary (`MOCK.binaries`: found with a
  version, or missing) with "Download / update", and the path overrides with "Save paths".
- **Cookies** (`CookiesView.vue`): per tool (`MOCK.cookies`) present or missing, size
  and date, upload and "Delete".
- **Sharing** (`SharingView.vue`): default expiry, allow download, share base URL,
  random mode.
- **API** (`ApiView.vue`): key list (`MOCK.apiKeys`) with permission, created and last
  used, "Revoke"; the "Create key" form; the one-time reveal of a new key
  (`MOCK.newApiKey`).
- **Discord** (`DiscordView.vue`): enabled, bot token, client ID, command name, post
  as user.
- **Fluxer** (`FluxerView.vue`): enabled, bot token, instance URL, command prefix and
  name, post as user, delete command message.

## 8. Public share page

Mirrors `templates/share.html` (served without the SPA, to people who are not
logged in).

- **Single item:** player (video or image), title, "Download" button when the link
  allows it, "Shared via MemeVault" footer.
- **Album:** a grid of the album's media (`MOCK.albums[n].media`).

## 9. Empty, loading and error states

Use the copy in `MOCK.states`.

- **Vault:** empty ("Vault is empty. Add a URL or upload a file."), loading
  ("Loading…") and error.
- **Queue:** empty ("Queue is empty"), loading and error. The app has no queue
  loading copy yet, so a style may propose one.

## Not covered

The auth redirect views (`views/auth/LoginView.vue`, `LogoutView.vue`) only redirect
and have no UI to style.
