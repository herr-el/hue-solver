# Contributing

Thanks for helping. Keep it simple: plain ES modules, no framework, no build step, no runtime dependencies, no network calls. The UI is translated in `js/i18n.js` (en, de, nl); new strings need all three.

## Workflow

1. Run a local server (`python3 -m http.server 8080`) and open http://localhost:8080.
2. Make your change.
3. `npm install && npm test` must pass.
4. If you added or renamed an app file, update `SHELL` and bump `CACHE` in `sw.js`, and add a mount to `docker-compose.yml`. Never add external URLs (CDNs, fonts, analytics): the CSP blocks them by design.
5. Open a pull request with a short description and, for detection changes, the screenshot that motivated it.

## Tests

`node --test` with real screenshots in `test-fixtures/boardN-{scrambled,solved}.png`; the solved image is the answer key. Expected results:

- board1: 130 tiles, 14 fixed, 1 shape, 115 moves
- board2: 158 tiles, 28 fixed, 2 shapes, 128 moves
- board3: 182 tiles, 26 fixed, 2 shapes, 154 moves

All with 0 errors. Diagnostics: `node test/diag.mjs board1 board2 board3`.

New fixtures are welcome, especially boards that currently fail. Only add screenshots you took yourself.

## Architecture

- `js/segment.js`: tiles are flat colours, so a pixel whose neighbour differs by more than 3 per channel is an edge; connected components are tiles. Fallback for JPEG/scaled images (coverage < 90 %): region growing against the seed colour, choosing the tolerance that yields the fewest shape groups. Dots are small dark blobs, assigned to the surrounding tile by ray casting. Shape groups are rotation-invariant (log area, max radius / √area, eigenvalue ratio) and split at gaps; singletons join the nearest group and raise a warning. UI elements (home indicator, menu chevron) are ignored.
- `js/solve.js`: target colour is a degree-2 2D polynomial per RGB channel over tile centroids (the game uses bilinear RGB gradients; residual ≈ 0.3). Initial fit from fixed tiles only (degree 1 and 2, multi-start), then alternate Hungarian assignment per shape group and refit until stable; the run with the lowest residual wins, with a 0.5 bonus for staying in place. Moves = Σ(cycle length − 1), provably minimal. `planSwaps()` orders cycles by the shape group's median area, largest first.
- Two-image mode: one or two screenshots in any order. `smoothness()` separates solved (≈ 0.5) from scrambled (> 60), threshold 5. With a solved image, `matchLayouts` + `targetFromSolved` (Hungarian on colour) give the exact target.
- `js/worker.js`: detection runs in a Web Worker; solving runs on the main thread.
- `js/app.js`: UI. Rounds of N moves (setting 1–10): a place appearing several times is the hub (ring), partners are numbered; arrows show the direction. Settings in `localStorage`, last board and step in IndexedDB.

## Known open issue

A board with three shapes (squares, hexagons, rhombi) gave a residual of 12.2 although all fixed tiles were detected. Not yet reproduced as a fixture.
