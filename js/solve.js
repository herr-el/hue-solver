// Zielzustand + minimale Tauschfolge.
// 1) Farbverlauf als 2D-Polynom (Grad 2 = bilinear+) über die Kachelpositionen, je RGB-Kanal.
//    Start-Fit nur aus den Fixkacheln, dann abwechselnd zuordnen (Hungarian je Formgruppe)
//    und mit allen Kacheln neu fitten, bis die Zuordnung stabil ist. Mehrere Startgrade,
//    gewählt wird der Lauf mit dem kleinsten Restfehler.
// 2) Minimum an Tauschzügen = Σ (Zykluslänge − 1). Kleiner Bonus fürs Liegenbleiben
//    entscheidet Gleichstände zugunsten "nicht bewegen".

export function terms(x, y, deg) {
  const t = [];
  for (let i = 0; i <= deg; i++) for (let j = 0; j <= deg - i; j++) t.push(x ** i * y ** j);
  return t;
}

// Kleinste Quadrate über Normalgleichungen (kleine Systeme, Koordinaten normiert)
export function lstsq(rows, rhs) {
  const m = rows[0].length, k = rhs[0].length;
  const A = Array.from({ length: m }, () => new Float64Array(m + k));
  rows.forEach((r, n) => {
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) A[i][j] += r[i] * r[j];
      for (let c = 0; c < k; c++) A[i][m + c] += r[i] * rhs[n][c];
    }
  });
  for (let i = 0; i < m; i++) A[i][i] += 1e-9;
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col] || 1e-12;
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      if (f) for (let c = col; c < m + k; c++) A[r][c] -= f * A[col][c];
    }
  }
  return Array.from({ length: m }, (_, i) => Array.from({ length: k }, (_, c) => A[i][m + c] / (A[i][i] || 1e-12)));
}

// Minimum-cost assignment on a square cost matrix: successive shortest augmenting
// paths (Dijkstra on reduced costs) with dual potentials, O(n^3).
// Returns assign[row] = column.
export function hungarian(C) {
  const n = C.length;
  const rowPot = new Float64Array(n), colPot = new Float64Array(n);
  const rowOf = new Int32Array(n).fill(-1); // column -> assigned row
  const dist = new Float64Array(n), pred = new Int32Array(n), done = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    done.fill(0);
    for (let c = 0; c < n; c++) { dist[c] = C[start][c] - rowPot[start] - colPot[c]; pred[c] = -1; }
    let end = -1, last = 0;
    while (end < 0) {
      let best = -1;
      for (let c = 0; c < n; c++) if (!done[c] && (best < 0 || dist[c] < dist[best])) best = c;
      done[best] = 1; last = dist[best];
      const r = rowOf[best];
      if (r < 0) { end = best; break; }
      for (let c = 0; c < n; c++) {
        if (done[c]) continue;
        const d = last + C[r][c] - rowPot[r] - colPot[c];
        if (d < dist[c]) { dist[c] = d; pred[c] = best; }
      }
    }
    // Shift potentials so reduced costs stay >= 0 and the new path is tight.
    for (let c = 0; c < n; c++) {
      if (!done[c] || rowOf[c] < 0) continue;
      const shift = last - dist[c];
      colPot[c] -= shift; rowPot[rowOf[c]] += shift;
    }
    rowPot[start] += last;
    // Flip the augmenting path back to the start row.
    for (let c = end; c >= 0; ) { const p = pred[c]; rowOf[c] = p < 0 ? start : rowOf[p]; c = p; }
  }
  const assign = new Int32Array(n);
  for (let c = 0; c < n; c++) assign[rowOf[c]] = c;
  return assign;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function solveBoard(tiles, { deg = 2, stay = 0.5, maxIter = 60 } = {}) {
  const n = tiles.length;
  const xs = tiles.map(t => t.cx), ys = tiles.map(t => t.cy);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const s = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) || 1;
  const P = tiles.map(t => [(t.cx - x0) / s, (t.cy - y0) / s]);
  const col = tiles.map(t => t.rgb);
  const fixedIdx = tiles.filter(t => t.fixed).map(t => t.i);
  const groups = new Map();
  tiles.forEach(t => { if (!t.fixed) (groups.get(t.group) || groups.set(t.group, []).get(t.group)).push(t.i); });

  const predictAll = (coef, d) => P.map(([x, y]) => {
    const tt = terms(x, y, d);
    return [0, 1, 2].map(c => tt.reduce((a, v, k) => a + v * coef[k][c], 0));
  });

  let best = null;
  for (const d0 of [1, 2]) {
    const nTerms = terms(0, 0, d0).length;
    if (fixedIdx.length < nTerms) continue;
    let coef = lstsq(fixedIdx.map(i => terms(...P[i], d0)), fixedIdx.map(i => col[i]));
    let pred = predictAll(coef, d0);
    let dest = null, iter = 0;
    for (; iter < maxIter; iter++) {
      const next = Int32Array.from({ length: n }, (_, i) => i); // fix: bleibt
      for (const idx of groups.values()) {
        const C = idx.map(a => idx.map(b => dist(col[a], pred[b]) - (a === b ? stay : 0)));
        const as = hungarian(C);
        idx.forEach((a, r) => { next[a] = idx[as[r]]; });
      }
      const same = dest && next.every((v, i) => v === dest[i]);
      dest = next;
      if (same) break;
      const rows = [], rhs = [];
      for (let i = 0; i < n; i++) { rows.push(terms(...P[dest[i]], deg)); rhs.push(col[i]); }
      coef = lstsq(rows, rhs);
      pred = predictAll(coef, deg);
    }
    let se = 0;
    for (let i = 0; i < n; i++) se += dist(col[i], pred[dest[i]]) ** 2;
    const rms = Math.sqrt(se / n);
    if (!best || rms < best.rms) best = { dest, rms, pred, iter, startDeg: d0 };
  }
  if (!best) throw new Error('ZU_WENIG_FIX');
  const swaps = planSwaps(best.dest, groupSize(tiles));
  return { ...best, swaps, moves: swaps.length };
}

// Wie glatt ist die aktuelle Anordnung? Gelöstes Board ≈ 0,5, gemischtes ≫ 10
export function smoothness(tiles) {
  const xs = tiles.map(t => t.cx), ys = tiles.map(t => t.cy);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const s = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) || 1;
  const rows = tiles.map(t => terms((t.cx - x0) / s, (t.cy - y0) / s, 2));
  const coef = lstsq(rows, tiles.map(t => t.rgb));
  let se = 0;
  rows.forEach((r, i) => { for (let c = 0; c < 3; c++) se += (r.reduce((a, v, k) => a + v * coef[k][c], 0) - tiles[i].rgb[c]) ** 2; });
  return Math.sqrt(se / tiles.length);
}

// Gleiches Spielfeld? → map[i] = Index der Kachel im anderen Bild am selben Platz
export function matchLayouts(A, B) {
  if (A.length !== B.length) return null;
  const areas = A.map(t => t.area).sort((a, b) => a - b);
  const tol = 0.3 * Math.sqrt(areas[areas.length >> 1]);
  const used = new Set(), map = [];
  for (const t of A) {
    let bj = -1, bd = Infinity;
    B.forEach((u, j) => { const d = Math.hypot(u.cx - t.cx, u.cy - t.cy); if (d < bd) { bd = d; bj = j; } });
    if (bd > tol || used.has(bj)) return null;
    used.add(bj); map.push(bj);
  }
  return map;
}

// Ziel direkt aus dem gelösten Bild: jede Kachel dorthin, wo ihre Farbe im gelösten Bild liegt
export function targetFromSolved(S, G, map) {
  const n = S.length, dest = Int32Array.from({ length: n }, (_, i) => i);
  const groups = new Map();
  S.forEach(t => { if (!t.fixed) (groups.get(t.group) || groups.set(t.group, []).get(t.group)).push(t.i); });
  let maxErr = 0;
  for (const idx of groups.values()) {
    const C = idx.map(a => idx.map(b => dist(S[a].rgb, G[map[b]].rgb)));
    const as = hungarian(C);
    idx.forEach((a, r) => { dest[a] = idx[as[r]]; maxErr = Math.max(maxErr, C[r][as[r]]); });
  }
  return { dest, maxErr };
}

// Größe je Kachel = Median-Fläche ihrer Formgruppe (gleiche Form → gleicher Wert, kein Rauschen)
export function groupSize(tiles) {
  const by = new Map();
  tiles.forEach(t => (by.get(t.group) || by.set(t.group, []).get(t.group)).push(t.area));
  const med = new Map([...by].map(([g, a]) => { a.sort((x, y) => x - y); return [g, a[a.length >> 1]]; }));
  return tiles.map(t => med.get(t.group) || 0);
}

// dest[i] = Zielplatz der Kachel, die jetzt auf Platz i liegt → Liste von Platz-Tauschen.
// size[i] (optional): Zyklen mit größeren Teilen zuerst, bei Gleichstand ursprüngliche Reihenfolge.
export function planSwaps(destIn, size) {
  const dest = Int32Array.from(destIn);
  const cycles = [];
  for (let i = 0; i < dest.length; i++) {
    const cyc = [];
    while (dest[i] !== i) {
      const j = dest[i];
      cyc.push([i, j]);            // Kachel von i landet korrekt auf j
      dest[i] = dest[j];
      dest[j] = j;
    }
    if (cyc.length) cycles.push({ cyc, w: size ? size[i] : 0, k: cycles.length });
  }
  cycles.sort((a, b) => b.w - a.w || a.k - b.k);
  return cycles.flatMap(c => c.cyc);
}
