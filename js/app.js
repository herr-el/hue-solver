import { solveBoard, planSwaps, groupSize, matchLayouts, targetFromSolved } from './solve.js';
import { t, setLang, getLang, detectLang, applyStatic, LANGS, D } from './i18n.js';

// Optional: Betreiberangaben fürs Impressum. Solange alles leer ist, bleibt der Abschnitt ausgeblendet.
const LEGAL = { name: '', address: '', email: '' };

const $ = id => document.getElementById(id);
const views = { start: $('view-start'), busy: $('view-busy'), result: $('view-result') };
const canvas = $('board'), ctx = canvas.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');

// ---------- Einstellungen (localStorage): Sprache, Darstellung, Züge pro Runde ----------
const cfg = (() => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('huesolver-settings') || '{}'); } catch {}
  const c = { theme: 'auto', batch: 5, dim: 'fade', dimAmt: 25, ...saved };
  if (!D[c.lang]) c.lang = detectLang(); // ohne gespeicherte Wahl: Browsersprache, sonst Englisch
  if (!['auto', 'light', 'dark'].includes(c.theme)) c.theme = 'auto';
  c.batch = Math.max(1, Math.min(10, Math.round(+c.batch) || 5));
  if (!['off', 'dark', 'fade'].includes(c.dim)) c.dim = 'fade';
  c.dimAmt = Math.max(5, Math.min(50, Math.round(+c.dimAmt) || 25));
  return c;
})();
const saveCfg = () => { try { localStorage.setItem('huesolver-settings', JSON.stringify(cfg)); } catch {} };

// ---------- Theme (Auto = Gerät, oder fest Hell/Dunkel) ----------
const mq = matchMedia('(prefers-color-scheme: dark)');
const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')];
const metaOrig = themeMetas.map(m => m.content);
const applyTheme = () => {
  const dark = cfg.theme === 'auto' ? mq.matches : cfg.theme === 'dark';
  document.body.classList.toggle('theme-dark', dark);
  document.body.classList.toggle('theme-light', !dark);
  themeMetas.forEach((m, i) => { m.content = cfg.theme === 'auto' ? metaOrig[i] : dark ? '#1c1c1e' : '#e8e8ed'; });
};
applyTheme(); mq.addEventListener('change', applyTheme);

// ---------- Mini-IndexedDB (letztes Bild + Fortschritt) ----------
const idb = (() => {
  let dbp;
  const open = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('huesolver', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => {
    try {
      const db = await open();
      return await new Promise((res, rej) => {
        const t = db.transaction('kv', mode); const q = fn(t.objectStore('kv'));
        t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
      });
    } catch { return undefined; }
  };
  return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)) };
})();

// ---------- Zustand ----------
const S = { img: null, seg: null, sol: null, crop: null, rl: null, bg: null, tileR: 40, step: 0, override: {}, blobs: [], imageDest: null, pending: null, fix: false, peek: false, error: null };

function show(name) {
  for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
  $('btn-new').hidden = $('btn-peek').hidden = name !== 'result';
  if (name === 'result') requestAnimationFrame(layout);
}

// ---------- Bild laden + analysieren ----------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let jobId = 0;
function analyse(img) {
  return new Promise((resolve, reject) => {
    const id = ++jobId;
    const onMsg = e => { if (e.data.id !== id) return; worker.removeEventListener('message', onMsg); e.data.seg ? resolve(e.data) : reject(new Error(e.data.error)); };
    worker.addEventListener('message', onMsg);
    worker.postMessage({ id, img });
  });
}

const MAX_PIXELS = 40e6; // reject huge images before allocating pixel buffers
async function decode(blob) {
  const bmp = await createImageBitmap(blob);
  if (bmp.width * bmp.height > MAX_PIXELS) { bmp.close(); throw new Error('tooLarge'); }
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0);
  const d = cx.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: d.data };
}

const SOLVED_MAX = 5; // Glätte-Schwelle: darunter ist das Bild bereits gelöst

async function analyseBlob(blob) {
  const img = await decode(blob);
  const res = await analyse({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) });
  if (res.seg.tiles.length < 4) throw new Error('noBoard');
  return { blob, img, seg: res.seg, solved: res.smooth < SOLVED_MAX };
}

// Hinweis auf dem Startbildschirm; als Schlüssel gespeichert, damit ein Sprachwechsel ihn mit übersetzt
let noteState = null;
function renderNote() {
  const el = $('start-note');
  if (!noteState) { el.textContent = ''; el.hidden = true; return; }
  const v = { ...noteState.vars };
  if (v.msgKey) v.msg = t(v.msgKey);
  el.textContent = t(noteState.k, v); el.hidden = false;
}
function note(k, vars) { noteState = k ? { k, vars } : null; renderNote(); }

// 1–2 Bilder, Reihenfolge egal: gemischtes Board + optional gelöstes Vorschaubild
async function handleBlobs(blobs, restored) {
  blobs = blobs.slice(0, 2);
  if (!blobs.length) return;
  const prevView = Object.entries(views).find(([, v]) => !v.hidden)?.[0] || 'start';
  show('busy');
  try {
    const items = [];
    for (const b of blobs) items.push(await analyseBlob(b));
    const scr = items.find(i => !i.solved);
    const sol = items.find(i => i.solved) || (!scr ? null : S.pending);
    if (!scr) {
      // Nur das gelöste Bild: an aktuelles Rätsel anhängen oder merken
      if (S.seg && !S.imageDest && matchLayouts(S.seg.tiles, sol.seg.tiles)) {
        attachSolved(sol); S.step = 0; solve(); saveProgress(); show('result'); return;
      }
      S.pending = sol;
      note('noteSolvedOnly');
      show(prevView === 'result' ? 'result' : 'start'); if (prevView === 'result') note(''); return;
    }
    Object.assign(S, { img: scr.img, seg: scr.seg, blobs: [scr.blob], imageDest: null, pending: null, fix: false, peek: false, warnOff: false,
      override: restored?.override || {}, step: restored?.step || 0, imageWarn: null });
    for (const [i, f] of Object.entries(S.override)) if (S.seg.tiles[i]) S.seg.tiles[i].fixed = f;
    if (sol) attachSolved(sol);
    prepareRender();
    solve();
    if (!restored) saveProgress();
    note(''); show('result');
  } catch (err) {
    show('start');
    note('errorFail', ['noBoard', 'tooLarge'].includes(err.message) ? { msgKey: err.message } : { msg: err.message });
  }
}

function attachSolved(sol) {
  const map = matchLayouts(S.seg.tiles, sol.seg.tiles);
  const r = map && targetFromSolved(S.seg.tiles, sol.seg.tiles, map);
  if (r && r.maxErr < 8) { S.imageDest = r.dest; S.blobs = [S.blobs[0], sol.blob]; S.imageWarn = null; }
  else S.imageWarn = 'imageMismatch';
}

function solve() {
  S.error = null;
  if (S.imageDest) { const swaps = planSwaps(S.imageDest, groupSize(S.seg.tiles)); S.sol = { dest: S.imageDest, swaps, moves: swaps.length, rms: 0 }; }
  else { try { S.sol = solveBoard(S.seg.tiles); } catch (e) { S.sol = null; S.error = e.message; } }
  const B = cfg.batch, M = S.sol ? S.sol.moves : 0;
  S.step = S.sol ? (S.step >= M ? M : S.step - (S.step % B)) : 0; // Schritt = Rundenanfang; M = gelöst
  const w = []; // [Schlüssel, Variablen] – wird beim Anzeigen übersetzt
  if (S.error === 'ZU_WENIG_FIX') w.push(['warnFewFix']);
  else if (S.error) w.push(['warnCalc', { msg: esc(S.error) }]);
  if (!S.imageDest && S.sol && S.sol.rms > 3) w.push(['warnFit', { rms: S.sol.rms.toFixed(1) }]);
  if (S.seg.mode === 'grow') w.push(['warnCompressed']);
  if (S.imageWarn) w.push([S.imageWarn]);
  if (S.seg.oddShapes && !S.imageDest) w.push(['warnOdd', { n: S.seg.oddShapes }]);
  S.warnings = w;
  renderMini();
  update();
}

// ---------- Vorbereitung Darstellung ----------
function prepareRender() {
  const { width: w, height: h, labels, tiles } = S.seg;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (const t of tiles) { x0 = Math.min(x0, t.bbox[0]); y0 = Math.min(y0, t.bbox[1]); x1 = Math.max(x1, t.bbox[2]); y1 = Math.max(y1, t.bbox[3]); }
  const m = 6;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  S.crop = { x0, y0, w: cw, h: ch };
  const d = S.img.data;
  // Kantenpixel der nächsten Kachel zuschlagen (sonst bleiben alte Farbsäume sichtbar)
  let rl = Int32Array.from(labels);
  for (let pass = 0; pass < 3; pass++) {
    const nx = Int32Array.from(rl);
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
      const p = y * w + x;
      if (rl[p] >= 0 || d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2] < 60) continue;
      const v = rl[p - 1] >= 0 ? rl[p - 1] : rl[p + 1] >= 0 ? rl[p + 1] : rl[p - w] >= 0 ? rl[p - w] : rl[p + w];
      if (v >= 0) nx[p] = v;
    }
    rl = nx;
  }
  S.rl = rl;
  // Hintergrund = alles ohne Kachel, das vom Rand erreichbar ist → transparent. Punkte bleiben schwarz.
  const bg = new Uint8Array(cw * ch), st = [];
  const push = (x, y) => { const i = y * cw + x; if (!bg[i] && rl[(y + y0) * w + x + x0] < 0) { bg[i] = 1; st.push(i); } };
  for (let x = 0; x < cw; x++) { push(x, 0); push(x, ch - 1); }
  for (let y = 0; y < ch; y++) { push(0, y); push(cw - 1, y); }
  while (st.length) {
    const i = st.pop(), x = i % cw, y = (i - x) / cw;
    if (x > 0) push(x - 1, y); if (x < cw - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < ch - 1) push(x, y + 1);
  }
  S.bg = bg;
  const areas = tiles.map(t => t.area).sort((a, b) => a - b);
  S.tileR = Math.sqrt(areas[areas.length >> 1]);
  canvas.width = cw; canvas.height = ch;
  mini.width = cw; mini.height = ch;
}

function arrangementAt(k) {
  const board = Int32Array.from({ length: S.seg.tiles.length }, (_, i) => i); // board[platz] = kachel
  if (S.sol) for (let s = 0; s < k; s++) { const [a, b] = S.sol.swaps[s]; [board[a], board[b]] = [board[b], board[a]]; }
  return board;
}

// Pixel-Zeichnung: Farben je Platz, optional Hervorhebung einer Platzmenge
function paint(target, board, hl) {
  // Nicht beteiligte Kacheln: 'dark' = zu Schwarz, 'fade' = zu Weiß mischen, 'off' = unverändert
  const a = cfg.dim === 'off' ? 0 : cfg.dimAmt / 100, base = cfg.dim === 'fade' ? 255 : 0;
  const dim = v => v + (base - v) * a;
  const { width: w, tiles } = S.seg;
  const { x0, y0, w: cw, h: ch } = S.crop;
  const src = S.img.data, rl = S.rl, bg = S.bg;
  const out = new ImageData(cw, ch), o = out.data;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = y * cw + x, q = i * 4;
    if (bg[i]) { o[q + 3] = 0; continue; }
    const p = (y + y0) * w + (x + x0), slot = rl[p];
    let r = src[p * 4], g = src[p * 4 + 1], b = src[p * 4 + 2];
    if (slot >= 0) {
      const c = tiles[board[slot]].rgb; r = c[0]; g = c[1]; b = c[2];
      if (hl) {
        if (hl.has(slot)) {
          let edge = false;
          for (let s = 1; s <= 4 && !edge; s++) if (rl[p - s] !== slot || rl[p + s] !== slot || rl[p - s * w] !== slot || rl[p + s * w] !== slot) edge = true;
          if (edge) { r = g = b = 255; }
        } else { r = dim(r); g = dim(g); b = dim(b); }
      }
    } else if (hl) { r = dim(r); g = dim(g); b = dim(b); }
    o[q] = r; o[q + 1] = g; o[q + 2] = b; o[q + 3] = 255;
  }
  target.putImageData(out, 0, 0);
}

function currentBatch() {
  if (!S.sol || S.fix || S.peek) return [];
  return S.sol.swaps.slice(S.step, S.step + cfg.batch);
}

function render() {
  if (!S.seg) return;
  const moves = S.sol ? S.sol.moves : 0;
  const batch = currentBatch();
  const board = arrangementAt(S.peek ? moves : S.fix ? 0 : S.step);
  const hl = batch.length ? new Set(batch.flat()) : null;
  paint(ctx, board, hl);

  const { x0, y0 } = S.crop, T = S.seg.tiles;
  const pos = s => [T[s].cx - x0, T[s].cy - y0];
  const r = Math.max(18, Math.min(48, S.tileR * 0.3));
  if (batch.length) {
    // Nabe = Platz, der mehrfach vorkommt: mit Ring markieren, Partner nummerieren
    const cnt = new Map(); batch.flat().forEach(s => cnt.set(s, (cnt.get(s) || 0) + 1));
    ctx.save(); ctx.lineCap = 'round';
    for (const [a, b] of batch) {
      const [ax, ay] = pos(a), [bx, by] = pos(b);
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = r * 0.45;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = r * 0.2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    const badge = (x, y, n) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = r * 0.15; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
      ctx.fillStyle = '#1c1c1e'; ctx.font = `700 ${Math.round(r * 1.25)}px "DM Sans", -apple-system, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), x, y + r * 0.06);
    };
    const ring = (x, y) => {
      ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, Math.PI * 2);
      ctx.lineWidth = r * 0.7; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
      ctx.lineWidth = r * 0.42; ctx.strokeStyle = '#fff'; ctx.stroke();
    };
    const hubs = new Set();
    batch.forEach(([a, b], n) => {
      if (cnt.get(a) > 1) { hubs.add(a); badge(...pos(b), n + 1); }
      else if (cnt.get(b) > 1) { hubs.add(b); badge(...pos(a), n + 1); }
      else { badge(...pos(a), n + 1); badge(...pos(b), n + 1); }
    });
    hubs.forEach(h => ring(...pos(h)));
    // Pfeilspitze vor dem Ziel: Kachel von hier nach dort ziehen (landet dort richtig)
    const arrow = (from, to) => {
      const [fx, fy] = pos(from), [tx, ty] = pos(to);
      const len = Math.hypot(tx - fx, ty - fy); if (len < r * 3) return;
      const ux = (tx - fx) / len, uy = (ty - fy) / len;
      const px = tx - ux * r * 1.25, py = ty - uy * r * 1.25; // Spitze kurz vor dem Badge
      const L = r * 1.15, W = r * 0.7;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - ux * L - uy * W, py - uy * L + ux * W);
      ctx.lineTo(px - ux * L + uy * W, py - uy * L - ux * W);
      ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = r * 0.18; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fill();
    };
    for (const [a, b] of batch) {
      if (cnt.get(b) > 1 && cnt.get(a) === 1) arrow(b, a); else arrow(a, b);
    }
    ctx.restore();
    S.hasHub = hubs.size > 0; S.hasPairs = batch.some(([a, b]) => cnt.get(a) === 1 && cnt.get(b) === 1);
  }
  if (S.fix) {
    ctx.save();
    for (const t of T) {
      if (!t.fixed) continue;
      ctx.beginPath(); ctx.arc(t.cx - x0, t.cy - y0, r * 1.1, 0, Math.PI * 2);
      ctx.lineWidth = r * 0.35; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.lineWidth = r * 0.15; ctx.strokeStyle = '#0a84ff'; ctx.stroke();
    }
    ctx.setLineDash([r * 0.3, r * 0.2]); // ungewöhnliche Form: orange gestrichelt
    for (const t of T) {
      if (!t.odd) continue;
      ctx.beginPath(); ctx.arc(t.cx - x0, t.cy - y0, r * 1.2, 0, Math.PI * 2);
      ctx.lineWidth = r * 0.3; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.lineWidth = r * 0.18; ctx.strokeStyle = '#ff9500'; ctx.stroke();
    }
    ctx.restore();
  }
}

function renderMini() {
  if (!S.sol) { mctx.clearRect(0, 0, mini.width, mini.height); return; }
  paint(mctx, arrangementAt(S.sol.moves), null);
}

function renderDetails() {
  if (!S.seg) return;
  const tl = S.seg.tiles, g = S.seg.groups;
  $('details').textContent = t('details', {
    tiles: tl.length, fixed: tl.filter(x => x.fixed).length, groups: g,
    shape: t(g === 1 ? 'shapeOne' : 'shapeMany'), source: t(S.imageDest ? 'targetFromSolved' : 'targetCalculated'),
  });
}

function update() {
  render();
  const moves = S.sol ? S.sol.moves : 0;
  const B = cfg.batch, k = S.step, end = Math.min(k + B, moves);
  $('prev').disabled = !S.sol || k <= 0 || S.fix;
  $('next').disabled = !S.sol || k >= moves || S.fix;
  $('progress-bar').style.width = moves ? `${(k / moves) * 100}%` : '100%';
  const sc = $('scrub'); sc.max = Math.ceil(moves / B); sc.value = Math.ceil(k / B);
  let no, sub;
  if (!S.sol) { no = '–'; sub = t('noSolution'); }
  else if (moves === 0) { no = t('alreadySolved'); sub = t('nothingToSwap'); }
  else if (k >= moves) { no = t('solvedLabel'); sub = t('solvedSub', { moves }); }
  else {
    no = end - k > 1 ? t('moveRange', { a: k + 1, b: end }) : t('moveOne', { a: k + 1 });
    sub = t('moveSub', { moves, left: moves - k });
  }
  $('step-no').textContent = no; $('step-sub').textContent = sub;
  const w = S.warnings || [];
  $('warn').hidden = !w.length || S.fix || (S.warnOff && S.sol); $('warn-text').innerHTML = w.map(([k2, v]) => `<div>${t(k2, v)}</div>`).join('');
  renderDetails();
  $('fix-bar').hidden = !S.fix;
  $('btn-peek').classList.toggle('active', S.peek);
  layout();
}

// Board passend in die freie Fläche einpassen (Handy: zwischen den schwebenden Leisten)
function layout() {
  if (views.result.hidden || !S.crop) return;
  const panel = $('panel');
  if (getComputedStyle(panel).position === 'fixed') {
    document.body.style.setProperty('--panel-h', `${innerHeight - panel.getBoundingClientRect().top}px`);
  }
  const st = $('stage'), cs = getComputedStyle(st);
  const aw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const s = Math.min(aw / S.crop.w, ah / S.crop.h);
  canvas.style.width = `${Math.floor(S.crop.w * s)}px`; canvas.style.height = `${Math.floor(S.crop.h * s)}px`;
}
addEventListener('resize', layout);
new ResizeObserver(layout).observe($('panel'));

function saveProgress() { if (S.blobs.length) idb.set('last', { blobs: S.blobs, step: S.step, override: S.override }); }
function go(d) {
  if (!S.sol || S.fix) return;
  const B = cfg.batch, M = S.sol.moves;
  // S.step ist immer ein Rundenanfang (Vielfaches von B) oder M (= gelöst).
  // Vorwärts darf auf M landen, auch wenn M kein Vielfaches von B ist; zurück aus „gelöst“ = letzte Runde.
  const n = d > 0 ? Math.min(M, S.step + B) : S.step >= M ? Math.floor((M - 1) / B) * B : S.step - B;
  S.step = Math.max(0, n);
  update(); saveProgress();
}

// ---------- Ereignisse ----------
$('file').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; handleBlobs(f); });
$('btn-new').addEventListener('click', () => $('file').click());
$('prev').addEventListener('click', () => go(-1));
$('next').addEventListener('click', () => go(1));
$('scrub').addEventListener('input', e => { if (!S.sol) return; S.step = Math.min(S.sol.moves, +e.target.value * cfg.batch); update(); saveProgress(); });
$('btn-fix').addEventListener('click', () => { S.fix = true; update(); });
$('btn-fix-done').addEventListener('click', () => { S.fix = false; S.warnOff = true; update(); });
$('warn-close').addEventListener('click', () => { S.warnOff = true; update(); });

// Ziel ansehen, solange gedrückt
const peek = on => { if (S.peek !== on) { S.peek = on; update(); } };
const pk = $('btn-peek');
pk.addEventListener('pointerdown', e => { e.preventDefault(); pk.setPointerCapture(e.pointerId); peek(true); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pk.addEventListener(ev, () => peek(false));
pk.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('click', e => {
  if (!S.seg) return;
  if (!S.fix) { go(1); return; }
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * S.crop.w) + S.crop.x0;
  const y = Math.floor((e.clientY - r.top) / r.height * S.crop.h) + S.crop.y0;
  const slot = S.rl[y * S.seg.width + x];
  if (slot == null || slot < 0) return;
  const t = S.seg.tiles[slot];
  t.fixed = !t.fixed; S.override[slot] = t.fixed; S.step = 0;
  solve(); saveProgress();
});

document.addEventListener('keydown', e => {
  if (views.result.hidden || e.metaKey || e.ctrlKey || Object.values(sheets).some(s => !s.hidden)) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
});

// Einfügen (⌘V, auch per iPhone-Zwischenablage) und Drag & Drop
document.addEventListener('paste', e => {
  const f = [...(e.clipboardData?.items || [])].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
  if (f.length) { e.preventDefault(); handleBlobs(f); }
});
let dragDepth = 0;
const hasFile = e => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragenter', e => { if (hasFile(e)) { dragDepth++; $('drop').hidden = false; } });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
document.addEventListener('dragover', e => { if (hasFile(e)) e.preventDefault(); });
document.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; $('drop').hidden = true;
  handleBlobs([...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/')));
});

// ---------- Sheets: Einstellungen + Intro ----------
const sheets = { intro: $('sheet-intro'), settings: $('sheet-settings') };
const introSeen = () => { try { return !!localStorage.getItem('huesolver-intro'); } catch { return true; } };
function openSheet(name) { sheets[name].hidden = false; }
function closeSheet(name) {
  sheets[name].hidden = true;
  if (name === 'intro') { try { localStorage.setItem('huesolver-intro', '1'); } catch {} }
}
for (const [name, el] of Object.entries(sheets)) el.addEventListener('click', e => { if (e.target === el) closeSheet(name); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') for (const n of Object.keys(sheets)) if (!sheets[n].hidden) closeSheet(n);
});

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderSettings() {
  const sl = $('seg-lang');
  sl.replaceChildren(...LANGS.map(([code, name]) => {
    const b = document.createElement('button');
    b.textContent = name; b.dataset.lang = code; b.setAttribute('aria-pressed', String(getLang() === code));
    return b;
  }));
  for (const b of $('seg-theme').children) b.setAttribute('aria-pressed', String(b.dataset.theme === cfg.theme));
  for (const b of $('seg-dim').children) b.setAttribute('aria-pressed', String(b.dataset.dim === cfg.dim));
  $('set-dim-amt').value = cfg.dimAmt; $('set-dim-val').textContent = cfg.dimAmt + ' %';
  $('dim-amt-row').hidden = cfg.dim === 'off';
  $('set-batch').value = cfg.batch; $('set-batch-val').textContent = cfg.batch;
  const lines = [LEGAL.name, LEGAL.address, LEGAL.email].filter(Boolean);
  $('legal').hidden = !lines.length;
  $('legal-body').innerHTML = lines.map(l => `<span class="legal-line">${esc(l).replace(/\n/g, '<br>')}</span>`).join('');
}

function changeLang(code) {
  cfg.lang = code; saveCfg(); setLang(code);
  renderNote(); if (S.seg) update();
  renderSettings();
}

$('btn-settings').addEventListener('click', () => { renderSettings(); openSheet('settings'); });
$('set-done').addEventListener('click', () => closeSheet('settings'));
$('btn-how').addEventListener('click', () => openSheet('intro'));
$('set-how').addEventListener('click', () => { closeSheet('settings'); openSheet('intro'); });
$('intro-ok').addEventListener('click', () => closeSheet('intro'));
$('seg-lang').addEventListener('click', e => { const c = e.target.dataset && e.target.dataset.lang; if (c) changeLang(c); });
$('seg-theme').addEventListener('click', e => {
  const th = e.target.dataset && e.target.dataset.theme;
  if (th) { cfg.theme = th; saveCfg(); applyTheme(); renderSettings(); }
});
$('seg-dim').addEventListener('click', e => {
  const d = e.target.dataset && e.target.dataset.dim;
  if (d) { cfg.dim = d; saveCfg(); renderSettings(); if (S.seg) render(); }
});
$('set-dim-amt').addEventListener('input', e => {
  cfg.dimAmt = +e.target.value; saveCfg(); $('set-dim-val').textContent = cfg.dimAmt + ' %';
  if (S.seg) render();
});
$('set-batch').addEventListener('input', e => {
  cfg.batch = +e.target.value; saveCfg(); $('set-batch-val').textContent = cfg.batch;
  if (S.sol && S.step < S.sol.moves) S.step -= S.step % cfg.batch; // auf Rundenanfang der neuen Größe
  if (S.seg) { update(); saveProgress(); }
});

// ---------- Start: Sprache setzen, letzten Stand wiederherstellen ----------
setLang(cfg.lang); // übersetzt alle statischen Texte
renderSettings();
(async () => {
  const last = await idb.get('last');
  const blobs = last && (last.blobs || (last.blob ? [last.blob] : []));
  if (blobs && blobs.length) handleBlobs(blobs, last);
  else { show('start'); if (!introSeen()) openSheet('intro'); }
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
