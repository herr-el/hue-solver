// Kachel-Erkennung aus einem Screenshot.
// Kernidee: Kacheln sind flächig einfarbig (PNG, verlustfrei). Pixel, deren Nachbarn
// abweichen, sind Kanten (Anti-Aliasing) und trennen die Kacheln zuverlässig –
// auch wenn Kacheln lückenlos aneinanderstoßen.

const DARK_BG = 60;    // Kanalsumme darunter = Hintergrund / Punkt
const DARK_DOT = 120;  // Kanalsumme für Punkt-Erkennung (inkl. Kantenglättung)

function labelComponents(w, h, mask) {
  // 4er-Nachbarschaft, iterativ. mask: Uint8Array (1 = zugehörig)
  const labels = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  const comps = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const id = comps.length;
    const c = { id, n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, x0: w, y0: h, x1: 0, y1: 0, border: false, first: start };
    let sp = 0;
    stack[sp++] = start; labels[start] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      c.n++; c.sx += x; c.sy += y; c.sxx += x * x; c.syy += y * y; c.sxy += x * y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.border = true;
      if (x > 0 && mask[p - 1] && labels[p - 1] === -1) { labels[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && labels[p + 1] === -1) { labels[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && labels[p - w] === -1) { labels[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && labels[p + w] === -1) { labels[p + w] = id; stack[sp++] = p + w; }
    }
    comps.push(c);
  }
  return { labels, comps };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
}

function segmentWithTol(img, tol) {
  const { width: w, height: h, data } = img;
  const N = w * h;
  const sum = new Uint16Array(N);
  for (let p = 0, q = 0; p < N; p++, q += 4) sum[p] = data[q] + data[q + 1] + data[q + 2];

  // Kantenpixel markieren
  const edge = new Uint8Array(N);
  const diff = (a, b) => {
    const qa = a * 4, qb = b * 4;
    return Math.max(Math.abs(data[qa] - data[qb]), Math.abs(data[qa + 1] - data[qb + 1]), Math.abs(data[qa + 2] - data[qb + 2]));
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (x < w - 1 && diff(p, p + 1) > tol) { edge[p] = 1; edge[p + 1] = 1; }
      if (y < h - 1 && diff(p, p + w) > tol) { edge[p] = 1; edge[p + w] = 1; }
    }
  }
  const mask = new Uint8Array(N);
  for (let p = 0; p < N; p++) mask[p] = !edge[p] && sum[p] >= DARK_BG ? 1 : 0;
  const { labels: raw, comps } = labelComponents(w, h, mask);

  // Kacheln = große Komponenten, die den Bildrand nicht berühren
  const cand = comps.filter(c => c.n >= 150 && !c.border);
  const med = median(cand.map(c => c.n));
  const tileComps = cand.filter(c => c.n >= 0.15 * med);
  return { w, h, sum, raw, tileComps, med };
}

// Fallback für verrauschte Bilder (JPEG, skaliert): Regionenwachstum gegen die Startfarbe
// der Region. Starten nur auf glatten Pixeln, damit Kantenrampen nicht zu Brücken werden.
function segmentGrow(img, tol) {
  const { width: w, height: h, data } = img;
  const N = w * h;
  const sum = new Uint16Array(N);
  for (let p = 0, q = 0; p < N; p++, q += 4) sum[p] = data[q] + data[q + 1] + data[q + 2];
  const smooth = new Uint8Array(N);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x, q = p * 4;
    let m = 0;
    for (const o of [-1, 1, -w, w]) {
      const r = (p + o) * 4;
      m = Math.max(m, Math.abs(data[q] - data[r]), Math.abs(data[q + 1] - data[r + 1]), Math.abs(data[q + 2] - data[r + 2]));
    }
    smooth[p] = m <= tol / 2 && sum[p] >= DARK_BG ? 1 : 0;
  }
  const raw = new Int32Array(N).fill(-1);
  const stack = new Int32Array(N);
  const comps = [];
  for (let s = 0; s < N; s++) {
    if (!smooth[s] || raw[s] !== -1) continue;
    const id = comps.length, q0 = s * 4;
    const R = data[q0], G = data[q0 + 1], B = data[q0 + 2];
    const c = { id, n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, x0: w, y0: h, x1: 0, y1: 0, border: false, first: s };
    let sp = 0; stack[sp++] = s; raw[s] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      c.n++; c.sx += x; c.sy += y; c.sxx += x * x; c.syy += y * y; c.sxy += x * y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.border = true;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const r of nb) {
        if (r < 0 || raw[r] !== -1 || sum[r] < DARK_BG) continue;
        const qr = r * 4;
        if (Math.abs(data[qr] - R) <= tol && Math.abs(data[qr + 1] - G) <= tol && Math.abs(data[qr + 2] - B) <= tol) {
          raw[r] = id; stack[sp++] = r;
        }
      }
    }
    comps.push(c);
  }
  const cand = comps.filter(c => c.n >= 150 && !c.border);
  const med = median(cand.map(c => c.n));
  const tileComps = cand.filter(c => c.n >= 0.15 * med);
  return { w, h, sum, raw, tileComps, med };
}

export function segment(img, { tol } = {}) {
  if (tol != null) return finish(img, { ...segmentWithTol(img, tol), tol });
  // 1) Flache PNG-Screenshots: exakte Kanten (Normalfall)
  const nonDark = (() => { let n = 0; for (let i = 0; i < img.data.length; i += 4) if (img.data[i] + img.data[i + 1] + img.data[i + 2] >= DARK_BG) n++; return n; })();
  const cov = r => r.tileComps.reduce((a, c) => a + c.n, 0) / (nonDark || 1);
  const flat = segmentWithTol(img, 3);
  if (cov(flat) >= 0.9) return finish(img, { ...flat, tol: 3 });
  // 2) Verrauscht: Regionenwachstum, Toleranz mit den wenigsten Formgruppen (= sauberste Kacheln)
  let best = null;
  for (const t of [8, 12, 16, 20]) {
    const r = Object.assign(finish(img, { ...segmentGrow(img, t), tol: t }), { mode: 'grow' });
    const score = r.groups * 1000 - r.tiles.length; // wenige Gruppen, dann viele Kacheln
    if (r.tiles.length >= 4 && (!best || score < best.score)) best = Object.assign(r, { score });
  }
  return best || finish(img, { ...flat, tol: 3 });
}

// Nur das Spielfeld behalten: Kacheln, die über kleine Lücken zusammenhängen.
// Isolierte UI-Elemente (Home-Indikator, Menü-Chevron) fallen weg.
function keepBoard(cs, med) {
  if (cs.length < 2) return cs;
  const g = 0.5 * Math.sqrt(med), par = cs.map((_, i) => i);
  const f = i => (par[i] === i ? i : (par[i] = f(par[i])));
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (Math.max(a.x0 - b.x1, b.x0 - a.x1) <= g && Math.max(a.y0 - b.y1, b.y0 - a.y1) <= g) par[f(i)] = f(j);
  }
  const sz = new Map();
  cs.forEach((c, i) => sz.set(f(i), (sz.get(f(i)) || 0) + c.n));
  const best = [...sz].sort((x, y) => y[1] - x[1])[0][0];
  return cs.filter((_, i) => f(i) === best);
}

function finish(img, r) {
  const { w, h, sum, raw, med } = r;
  const tileComps = keepBoard(r.tileComps, med);
  const { data } = img;
  const N = w * h;
  const map = new Int32Array(Math.max(...tileComps.map(c => c.id), 0) + 1).fill(-1);
  tileComps.forEach((c, i) => { map[c.id] = i; });
  const labels = new Int32Array(N).fill(-1);
  for (let p = 0; p < N; p++) if (raw[p] >= 0 && raw[p] < map.length) labels[p] = map[raw[p]];

  const tiles = tileComps.map((c, i) => {
    const q = c.first * 4;
    return {
      i, area: c.n, cx: c.sx / c.n, cy: c.sy / c.n,
      mom: [c.sxx, c.syy, c.sxy, c.sx, c.sy, c.n],
      rgb: [data[q], data[q + 1], data[q + 2]],
      bbox: [c.x0, c.y0, c.x1, c.y1], fixed: false, group: 0, maxR: 0,
    };
  });

  // Durchschnittsfarbe (robust gegen Rauschen bei JPEG)
  const acc = tiles.map(() => [0, 0, 0]);
  for (let p = 0; p < N; p++) {
    const t = labels[p]; if (t < 0) continue;
    acc[t][0] += data[p * 4]; acc[t][1] += data[p * 4 + 1]; acc[t][2] += data[p * 4 + 2];
  }
  tiles.forEach((t, i) => { t.rgb = acc[i].map(v => v / t.area); });

  // Fixpunkte: kleine dunkle Flecken, rundum von einer Kachel umgeben
  const dmask = new Uint8Array(N);
  for (let p = 0; p < N; p++) dmask[p] = sum[p] < DARK_DOT ? 1 : 0;
  const { comps: dcomps } = labelComponents(w, h, dmask);
  const dots = [];
  for (const d of dcomps) {
    if (d.border || d.n < 6 || d.n > 0.08 * med) continue;
    const bw = d.x1 - d.x0 + 1, bh = d.y1 - d.y0 + 1;
    if (bw > 3 * bh || bh > 3 * bw) continue;
    const cx = d.sx / d.n, cy = d.sy / d.n;
    // Strahlen nach außen bis zur ersten Kachel (robust gegen Kantensäume um den Punkt)
    const r0 = Math.max(bw, bh) * 0.5, rMax = r0 + 0.35 * Math.sqrt(med);
    const votes = new Map();
    let total = 0;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      total++;
      for (let rad = r0; rad <= rMax; rad += 1) {
        const x = Math.round(cx + Math.cos(a) * rad), y = Math.round(cy + Math.sin(a) * rad);
        if (x < 0 || y < 0 || x >= w || y >= h) break;
        const t = labels[y * w + x];
        if (t >= 0) { votes.set(t, (votes.get(t) || 0) + 1); break; }
      }
    }
    let bestT = -1, bestV = 0;
    for (const [t, v] of votes) if (v > bestV) { bestT = t; bestV = v; }
    if (bestT >= 0 && bestV >= 0.6 * total) {
      tiles[bestT].fixed = true;
      tiles[bestT].area += d.n;
      dots.push({ x: cx, y: cy, tile: bestT });
    }
  }

  // Formmerkmale (rotationsinvariant): Fläche, Eigenwerte der Kovarianz, max. Radius
  for (let p = 0; p < N; p++) {
    const t = labels[p]; if (t < 0) continue;
    const x = p % w, y = (p - x) / w;
    const T = tiles[t];
    const d2 = (x - T.cx) ** 2 + (y - T.cy) ** 2;
    if (d2 > T.maxR) T.maxR = d2;
  }
  for (const T of tiles) {
    const [sxx, syy, sxy, sx, sy, n] = T.mom;
    const vxx = sxx / n - (sx / n) ** 2, vyy = syy / n - (sy / n) ** 2, vxy = sxy / n - (sx / n) * (sy / n);
    const tr = vxx + vyy, det = vxx * vyy - vxy * vxy;
    const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    T.shape = [Math.log(T.area), l1 / T.area, l2 / T.area, Math.sqrt(T.maxR / T.area)];
    delete T.mom; delete T.maxR;
  }
  const groups = clusterShapes(tiles);

  return { width: w, height: h, labels, tiles, dots, groups, tol: r.tol };
}

export function clusterShapes(tiles) {
  // Gleiche Form (auch gedreht) = tauschbar. Nacheinander je Merkmal sortieren und an
  // deutlichen Lücken trennen – tolerant gegen Streuung durch unscharfe Kanten.
  const feats = [
    [t => t.shape[0], 0.18],                                   // log Fläche
    [t => t.shape[3], 0.04],                                   // max. Radius / √Fläche
    [t => Math.log(t.shape[1] / Math.max(t.shape[2], 1e-6)), 0.25], // Streckung
  ];
  let groups = [tiles];
  for (const [f, gap] of feats) {
    const next = [];
    for (const g of groups) {
      const s = [...g].sort((a, b) => f(a) - f(b));
      let cur = [s[0]];
      for (let k = 1; k < s.length; k++) {
        if (f(s[k]) - f(s[k - 1]) > gap) { next.push(cur); cur = []; }
        cur.push(s[k]);
      }
      next.push(cur);
    }
    groups = next;
  }
  // Einzelgänger (meist Erkennungsfehler) der Gruppe mit ähnlichster Fläche zuschlagen
  const big = groups.filter(g => g.length >= 3), small = groups.filter(g => g.length < 3);
  const medA = g => g.map(t => t.shape[0]).sort((a, b) => a - b)[g.length >> 1];
  let odd = 0;
  if (big.length) for (const g of small) for (const t of g) {
    const tgt = big.reduce((a, b) => Math.abs(medA(a) - t.shape[0]) <= Math.abs(medA(b) - t.shape[0]) ? a : b);
    tgt.push(t); t.odd = true; odd++;
  }
  const final = big.length ? big : groups;
  final.sort((a, b) => b.length - a.length).forEach((g, i) => g.forEach(t => { t.group = i; }));
  tiles.oddShapes = odd;
  return final.length;
}
