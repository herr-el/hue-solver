# Notes for AI coding assistants

Read README.md and CONTRIBUTING.md first; they hold the architecture, tests and conventions.

- Static PWA, plain ES modules, no build step, no runtime dependencies, no network calls.
- Keep paths relative (the app must work in a subfolder, e.g. GitHub Pages).
- Run `npm test` before committing. Bump `CACHE` in `sw.js` when the app file list changes.
- UI strings live in `js/i18n.js` (en, de, nl).
