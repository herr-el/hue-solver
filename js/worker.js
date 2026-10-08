import { segment } from './segment.js';
import { smoothness } from './solve.js';

// Erkennung im Hintergrund-Thread; das Lösen läuft im Haupt-Thread (schnell)
self.onmessage = e => {
  const { id, img } = e.data;
  try {
    const seg = segment(img);
    const smooth = seg.tiles.length >= 6 ? smoothness(seg.tiles) : Infinity;
    self.postMessage({
      id, smooth,
      seg: { width: seg.width, height: seg.height, labels: seg.labels, tiles: seg.tiles, groups: seg.groups, mode: seg.mode || 'flat', oddShapes: seg.tiles.oddShapes || 0 },
    });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
