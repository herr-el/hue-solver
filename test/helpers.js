import fs from 'node:fs';
import { PNG } from 'pngjs';
import { segment } from '../js/segment.js';
import { hungarian } from '../js/solve.js';
export function load(name) {
  const png = PNG.sync.read(fs.readFileSync(new URL(`../test-fixtures/${name}.png`, import.meta.url)));
  return { width: png.width, height: png.height, data: png.data };
}
// Antwortschlüssel: Kachel auf Platz i gehört auf Platz truth[i] (Farbabgleich mit gelöstem Board)
export function answerKey(board) {
  const S = segment(load(`${board}-scrambled`)), G = segment(load(`${board}-solved`));
  const slotG = S.tiles.map(t => {
    let b = -1, bd = Infinity;
    G.tiles.forEach((g, j) => { const d = Math.hypot(g.cx - t.cx, g.cy - t.cy); if (d < bd) { bd = d; b = j; } });
    return { j: b, d: bd };
  });
  const C = S.tiles.map(t => slotG.map(({ j }) => { const g = G.tiles[j].rgb; return Math.abs(g[0]-t.rgb[0])+Math.abs(g[1]-t.rgb[1])+Math.abs(g[2]-t.rgb[2]); }));
  const truth = hungarian(C);
  const err = Math.max(...truth.map((j, i) => C[i][j]));
  return { S, G, truth, keyErr: err, slotDist: Math.max(...slotG.map(s => s.d)) };
}
