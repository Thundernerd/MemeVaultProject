# Changelog

## [Unreleased]

## [0.20.2] - 2026-04-03

## [0.20.1] - 2026-04-03

## [0.20.0] - 2026-04-03

## [0.19.0] - 2026-03-21

### Features
- Structured logging with configurable verbosity via `MEMEVAULTPROJECT_LOG_LEVEL` (`error`, `warn`, `info`, `debug`)

## [0.18.0] - 2026-03-21

### Fixes
- Manual uploads now tagged as `platform:upload` instead of `source:upload`

## [0.17.2] - 2026-03-21

### Fixes
- Unified all icons (favicon, apple-touch-icon) to use safe.png
- Excluded safe.png from OIDC middleware so it loads on public pages

## [0.17.1] - 2026-03-21

### Fixes
- Fixed OIDC login redirect loop in production Docker deployments

## [0.17.0] - 2026-03-20

## [0.16.0] - 2026-03-20

### Fixes
- Fixed white bar appearing in mobile safe area at the bottom of the screen
- Fixed last card being obscured by the floating action button when scrolled to the bottom
- Fixed media modal being clipped by mobile browser chrome and safe area insets

## [0.15.0] - 2026-03-20

### Improvements
- Share page header now matches the app's design system (logo, colors, titlebar style)

## [0.14.0] - 2026-03-20

### Features
- Vitest test suite with 176 tests covering lib utilities, DB layer, and all `/api/v1/*` routes
- CI workflow to run tests on every push to main and on every pull request

## [0.13.2] - 2026-03-20

### Fixes
- Fixed v1 download endpoint returning 404 when called with a vault item ID

## [0.13.1] - 2026-03-20

### Improvements
- Nav bar version number is now read directly from package.json
- Sign out button is hidden when OIDC is not configured

## [0.13.0] - 2026-03-20

### Features
- Visual redesign with light/dark theme toggle and accent colour picker
- Switched from sidebar to top navigation with constrained page width
- Smooth page transitions and card entrance animations
- Custom thin scrollbar styled to match the theme

## [0.12.0] - 2026-03-20

### Features
- Manually upload video and image files directly to the vault
- Batch upload support with drag-and-drop or file browser
- Auto-tag uploaded items with `platform:upload`

## [0.11.0] - 2026-03-20

### Features
- Added random API endpoint for getting random vault items
- Vault items have a flag that allows them to be included/excluded from the random endpoint
- Settings has a mode switch for the random endpoint if you want to include only those with the flag or all public (previously shared) ones

## [0.10.0] - 2026-03-18

### Features
- Replaced single API key with multi-key system with read/read+write permissions

## [0.9.1] - 2026-03-18

### Fixes
- Made OIDC optional

## [0.9.0] - 2026-03-18

### Features
- Added OIDC support

## [0.8.0] - 2026-03-17

### Features
- Split settings page into multiple tabs

## [0.7.0] - 2026-03-17

### Features
- Added retry button to queue items

## [0.6.0] - 2026-03-17

### Features
- Added sharing functionality
- Sharing links support embeds on social media

## [0.5.0] - 2026-03-17

### Features
- Add namespaced auto-tags
- Add tags management page
- Tags filter is collapsible

## [0.4.0] - 2026-03-16

### Features
- Show skeleton cards on vault page for in-progress items

### Bug Fixes
- Detect and rename ytdlp thumbnails with `.image` extension

## [0.3.0] - 2026-03-16

### Features
- Add clipboard paste button to URL input field

### Bug Fixes
- Input fields on popup are placed the same regardless of screen size

## [0.2.0] - 2026-03-14

### Security
- Return opaque 404 responses for all `/api/v1/*` routes and the application root 404 page, preventing information leakage to unauthenticated probers

### Features
- Add floating action button on vault page to submit a URL without navigating to the queue page

### Bug Fixes
- Move mobile hamburger menu button to the left side, matching the direction the drawer opens from
- Add bottom padding to all pages so content is not flush against the screen edge

## [0.1.0] - 2026-03-14

- Initial release
