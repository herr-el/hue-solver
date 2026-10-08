# Hue Solver

Solve **I Love Hue Too** puzzles from a screenshot. Hue Solver detects the tiles, works out the finished colour gradient and shows you the **fewest possible swaps**, a few at a time, as arrows on top of your board.

![Hue Solver solving a board](docs/demo.gif)

- Runs entirely in your browser. Screenshots never leave your device: no server, no account, no tracking.
- Installs like an app on iPhone, Android and desktop, and works offline.
- English, German and Dutch.

> Unofficial fan tool. Not affiliated with or endorsed by the makers of “I Love Hue Too”. Game names and artwork belong to their owners.

---

## Start here: just open it

**👉 [herr-el.github.io/hue-solver](https://herr-el.github.io/hue-solver/)**

That is all you need. Nothing to install, nothing to host.

To keep it on your phone like a normal app:

- **iPhone / iPad:** open the link in Safari → Share button → **Add to Home Screen**.
- **Android:** open the link in Chrome → menu ⋮ → **Install app**.
- **Computer:** Chrome or Edge show an install icon at the right end of the address bar.

Because everything runs on your device, using this link is just as private as hosting it yourself.

---

## How to use it

1. In the game, open a puzzle and take a screenshot **before you move anything**.
2. In Hue Solver, tap the big button and choose the screenshot. On a computer you can also drag it in or paste it.
3. Optional but recommended: also add a screenshot of the **solved** picture that the game shows at the start of the level. With both images the result is exact.
4. Follow the rounds: drag the tile with the ring onto 1, then 2, then 3 … and tap **›** for the next round. Hold the eye icon to peek at the finished picture.

If a warning appears, tap **Correct fixed tiles** and tap any fixed tile (the ones with a dot) that was missed.

---

## Your own copy (optional)

Only needed if you want to change the code or run it on your own address.

### The easy way: GitHub Pages, in your browser (about 3 minutes)

You need a free GitHub account. No software, no terminal.

1. Click **Fork** at the top of this page, then **Create fork**.
2. In your fork go to **Settings → Pages**.
3. Under *Build and deployment* choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and click **Save**.
4. After a minute your copy is live at `https://YOUR-NAME.github.io/hue-solver/`.

To get updates later: open your fork and click **Sync fork**.

<details>
<summary><b>Other ways to run it</b> (for people comfortable with a terminal)</summary>

Hue Solver is a folder of static files with no build step. Anything that can serve files over the web can run it. Opening `index.html` by double-click does not work, because browsers block the background worker on `file://` pages.

**On your computer** (from inside the downloaded folder):

```bash
python3 -m http.server 8080      # or: npx serve -l 8080
```

Then open <http://localhost:8080>.

**With Docker** (home server, NAS, VPS):

```bash
git clone https://github.com/herr-el/hue-solver.git
cd hue-solver
docker compose up -d
```

It runs on port 8080 with the included `nginx.conf` (strict security headers, only app files served). Put any HTTPS reverse proxy in front of it if you want to reach it from outside or install it as an app. Update with `git pull && docker compose restart`.

**Any static host** (Netlify, Cloudflare Pages, your own web space): upload `index.html`, `manifest.json`, `sw.js`, `apple-touch-icon.png` and the folders `css/`, `js/` and `icons/`. Paths are relative, so a subfolder works too. Use HTTPS so offline mode and app install work.

</details>

---

## How it works

1. **Detection** (`js/segment.js`, in a Web Worker): game tiles are flat colours, so pixels whose neighbour differs are edges and connected regions are tiles. Fixed tiles are found by their dot. Tiles are grouped by shape, because only tiles of the same shape can swap.
2. **Target picture** (`js/solve.js`): the game uses smooth gradients, so the solver fits a colour surface over the board, starting from the fixed tiles, then alternates between assigning tiles to places (optimal assignment per shape group) and refitting. With a screenshot of the solved board the target is read directly.
3. **Moves:** the assignment is a permutation; a cycle of *k* tiles needs *k − 1* swaps, which is provably the minimum. Big tiles come first because they are easier to place.

Settings stay in your browser's local storage and the last board in IndexedDB, so you can pick up where you left off; a new screenshot replaces it.

---

## Development

No build step: edit and reload. Tests need [Node.js](https://nodejs.org) 20+:

```bash
npm install   # installs pngjs, used only by the tests
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture and conventions, and [SECURITY.md](SECURITY.md) for reporting issues.

**Running a public instance in Germany?** Fill in `LEGAL` at the top of `js/app.js`; it appears under *Settings → About & legal* as an imprint. Leave it empty otherwise.

---

## Known limits

- Only the swap mechanic is supported; tiles of the same shape (also rotated) are assumed interchangeable.
- Use the original screenshot. Photos of the screen or images compressed by messengers can confuse detection.
- Boards with three or more tile shapes are less reliable.

Bug reports are welcome; please attach the screenshot(s) that went wrong.

---

## Licence

[MIT](LICENSE) © herr-el. Uses only the device's built-in fonts and no third-party code.
