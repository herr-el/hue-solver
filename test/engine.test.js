import test from 'node:test';
import assert from 'node:assert/strict';
import { answerKey } from './helpers.js';
import { solveBoard, planSwaps, hungarian } from '../js/solve.js';

const EXPECT = { board1: [130, 14, 1, 115], board2: [158, 28, 2, 128], board3: [182, 26, 2, 154] };

for (const [b, [tiles, fixed, groups, moves]] of Object.entries(EXPECT)) {
  test(`${b}: Erkennung + Lösung exakt`, () => {
    const { S, truth, keyErr } = answerKey(b);
    assert.equal(S.tiles.length, tiles);
    assert.equal(S.tiles.filter(t => t.fixed).length, fixed);
    assert.equal(S.groups, groups);
    assert.equal(keyErr, 0);
    const r = solveBoard(S.tiles);
    assert.deepEqual([...r.dest], [...truth]);
    assert.equal(r.moves, moves);
  });
}

test('planSwaps: Minimum = n − Zyklen, Anwendung ergibt Ziel', () => {
  const dest = [2, 0, 1, 3, 5, 4];
  const sw = planSwaps(dest);
  assert.equal(sw.length, 3);
  const board = [0, 1, 2, 3, 4, 5]; // board[slot] = Kachel
  for (const [a, b] of sw) [board[a], board[b]] = [board[b], board[a]];
  board.forEach((tile, slot) => assert.equal(dest[tile], slot));
});

test('hungarian: optimal', () => {
  assert.deepEqual([...hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]])], [1, 0, 2]);
});

import { smoothness, matchLayouts, targetFromSolved } from '../js/solve.js';
for (const b of ['board1', 'board2', 'board3']) {
  test(`${b}: gelöstes Bild erkannt und liefert exaktes Ziel`, () => {
    const { S, G, truth } = answerKey(b);
    const sS = smoothness(S.tiles), sG = smoothness(G.tiles);
    assert.ok(sG < 2 && sS > 10, `glatt ${sG.toFixed(2)} / gemischt ${sS.toFixed(2)}`);
    const map = matchLayouts(S.tiles, G.tiles);
    assert.ok(map);
    const { dest, maxErr } = targetFromSolved(S.tiles, G.tiles, map);
    assert.ok(maxErr < 3);
    assert.deepEqual([...dest], [...truth]);
  });
}
