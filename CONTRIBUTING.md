# Contributing and self-hosting

Hue Solver is plain HTML, CSS and JavaScript modules: no framework, no build step, no runtime dependencies and no network calls. UI strings live in `js/i18n.js` (en, de, nl); new strings need all three.

## Run it locally

Browsers block the background worker on `file://`, so serve the folder:

```bash
python3 -m http.server 8080      # or: npx serve -l 8080
```

Then open http://localhost:8080.

## Host it yourself

**Docker:**

```bash
git clone https://github.com/herr-el/hue-solver.git && cd hue-solver
docker compose up -d             # serves on port 8080
```

The bundled `nginx.conf` serves only the app files and sends strict security headers. Put an HTTPS reverse proxy in front if you want offline mode and app install to work from outside your network. Update with `git pull && docker compose restart`.

**Any static host:** upload `index.html`, `manifest.json`, `sw.js`, `apple-touch-icon.png`, `css/`, `js/` and `icons/`. Paths are relative, so a subfolder works. Use HTTPS.

**Public instance in Germany:** fill in `LEGAL` at the top of `js/app.js`; it then appears as an imprint under Settings → About & legal.

## Making changes

1. Edit, reload, check.
2. Run the tests (Node.js 20+): `npm install && npm test`. `pngjs` is the only dependency and is used only by the tests.
3. If you add or rename an app file, update `SHELL` and bump `CACHE` in `sw.js`, and add a mount in `docker-compose.yml`.
4. Don't add external URLs (CDNs, web fonts, analytics); the Content-Security-Policy blocks them by design.
5. Open a pull request. For detection changes, attach the screenshot that motivated it.

## Tests

`node --test` runs against real screenshots in `test-fixtures/boardN-{scrambled,solved}.png`; the solved image is the answer key. Expected:

- board1: 130 tiles, 14 fixed, 1 shape, 115 moves
- board2: 158 tiles, 28 fixed, 2 shapes, 128 moves
- board3: 182 tiles, 26 fixed, 2 shapes, 154 moves

All with 0 errors. Diagnostics: `node test/diag.mjs board1 board2 board3`. New fixtures are welcome, especially boards that fail; only add screenshots you took yourself.

## Architecture

- `js/segment.js`: tiles are flat colours, so a pixel whose neighbour differs by more than 3 per channel is an edge and connected components are tiles. For JPEG or scaled images (coverage < 90 %) it falls back to region growing. Dots are small dark blobs, assigned to their tile by ray casting. Tiles are grouped by rotation-invariant shape features; only tiles of the same shape can swap.
- `js/solve.js`: the target colour is a degree-2 polynomial per RGB channel over the tile centroids. The fit starts from the fixed tiles, then alternates an optimal assignment per shape group (`hungarian()`, successive shortest paths) with refitting until stable. Moves = Σ(cycle length − 1), which is minimal. `planSwaps()` orders cycles largest tiles first.
- Two-image mode: one or two screenshots in any order. `smoothness()` tells solved (≈ 0.5) from scrambled (> 60). With a solved image, `matchLayouts` + `targetFromSolved` give the exact target.
- `js/worker.js` runs detection in a Web Worker; solving runs on the main thread.
- `js/app.js` is the UI: rounds of N moves (1–10), hub tile with a ring, numbered partners, arrows for direction. Settings in `localStorage`, last board in IndexedDB.

## Known open issue

A board with squares, hexagons and rhombi gave a residual of 12.2 although all fixed tiles were found. Not yet captured as a fixture.
