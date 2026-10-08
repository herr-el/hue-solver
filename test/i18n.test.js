import test from 'node:test';
import assert from 'node:assert/strict';
import { D, LANGS, t, setLang } from '../js/i18n.js';

const keys = l => Object.keys(D[l]).sort();
const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();

test('alle Sprachen haben dieselben Schlüssel wie Englisch', () => {
  for (const [l] of LANGS) assert.deepEqual(keys(l), keys('en'), `Schlüssel weichen ab in ${l}`);
});

test('Platzhalter stimmen in allen Sprachen überein, keine leeren Texte', () => {
  for (const [l] of LANGS) for (const k of keys('en')) {
    assert.ok(D[l][k].trim(), `${l}.${k} leer`);
    assert.equal(ph(D[l][k]), ph(D.en[k]), `Platzhalter ${l}.${k}`);
  }
});

test('t(): Platzhalter werden ersetzt, unbekannter Schlüssel fällt auf den Schlüssel zurück', () => {
  globalThis.document = { documentElement: {}, querySelectorAll: () => [] };
  setLang('de');
  assert.equal(t('moveRange', { a: 1, b: 5 }), 'Zug 1–5');
  setLang('nl');
  assert.equal(t('moveSub', { moves: 12, left: 7 }), 'van 12 · nog 7');
  setLang('en');
  assert.equal(t('moveOne', { a: 3 }), 'Move 3');
  assert.equal(t('gibtsNicht'), 'gibtsNicht');
});
