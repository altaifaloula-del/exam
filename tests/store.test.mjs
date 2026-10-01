import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../site/js/store.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

test('round-trips JSON values', () => {
  const s = createStore(() => fakeStorage());
  const st = fakeStorage();
  const store = createStore(() => st);
  store.set('a', { x: [1, 2] });
  assert.deepEqual(store.get('a'), { x: [1, 2] });
  store.remove('a');
  assert.equal(store.get('a', 'fb'), 'fb');
  assert.ok(s.persistent);
});

test('throwing accessor falls back to memory and reports the error once', () => {
  const errors = [];
  const store = createStore(() => { throw new Error('blocked'); }, (e) => errors.push(e.message));
  store.set('k', 5);
  assert.equal(store.get('k'), 5);
  store.set('k', 6);
  assert.equal(errors.length, 1);
  assert.equal(store.persistent, false);
});

test('quota error on write keeps value in memory and is reported', () => {
  const errors = [];
  const bad = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem() {} };
  const store = createStore(() => bad, (e) => errors.push(e.message));
  store.set('k', 'v');
  assert.equal(store.get('k'), 'v');
  assert.deepEqual(errors, ['quota']);
});

test('corrupt JSON returns the fallback instead of throwing', () => {
  const st = fakeStorage();
  st.setItem('bank:v1:k', '{not json');
  const store = createStore(() => st, () => {});
  assert.equal(store.get('k', 'fallback'), 'fallback');
});
