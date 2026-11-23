# GHAS Panorama

GitHub Advanced Security at a glance. This is a tile-first page for colleagues and customers. It shows **the security foundations included without an add-on** (with plan and visibility limits called out), and what the two standalone products, **Secret Protection** and **Code Security**, add. Click any tile for a short summary and links to the docs.

**Live:** https://sebthiertant.github.io/ghas-panorama/

## Presenting

| Action | How |
|---|---|
| Start presentation (full screen) | **Present** button, or <kbd>P</kbd> (starts at the section on screen) |
| Present one section | the screen icon at the right of a section title |
| Next / previous slide | <kbd>→</kbd> <kbd>←</kbd>, <kbd>Space</kbd>, <kbd>PageDown</kbd> <kbd>PageUp</kbd>, or swipe |
| First / last slide | <kbd>Home</kbd> <kbd>End</kbd> |
| Open a feature | click its tile; <kbd>→</kbd> <kbd>←</kbd> move between features |
| QR code for the audience | shown in the page header; **QR code** button or <kbd>Q</kbd> enlarges it |
| Light / dark theme | sun/moon button or <kbd>T</kbd> (dark is the default; your choice is remembered) |
| Close / exit | <kbd>Esc</kbd> |

Deep links open a feature directly, for example `#dependabot`, `#push-protection` or `#copilot-autofix`.

## Read this fairly

- Status as of 20 Nov 2026. Preview features can change before general availability.
- Availability differs by plan and deployment (github.com, GitHub Enterprise Cloud, GHES). Each tile links to the relevant docs and changelog entries.
- "Paid add-on" means private and internal repositories. Pricing is intentionally out of scope.
- Built from public sources only.

## Tech

Plain HTML, CSS and JavaScript with no build step and no third-party requests. It is served by GitHub Pages from `main` (`.nojekyll`).

## Credits and licences

- [Primer](https://primer.style) color tokens: MIT
- [Octicons](https://primer.style/octicons): MIT (`assets/icons.svg`)
- [Mona Sans](https://github.com/github/mona-sans): SIL Open Font License 1.1 (`assets/fonts/OFL.txt`)
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase: MIT (`assets/qrcode.js`)
- Format inspired by [Copilot Panorama](https://guigui42.github.io/copilot-panorama/)
