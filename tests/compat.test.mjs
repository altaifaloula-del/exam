// Older-browser guards that a linter cannot express. Syntax newer than ES2019 is rejected by ESLint (ecmaVersion 2019 in
// eslint.config.js); runtime APIs newer than the floor are removed in the e2e stress mode (tests/e2e/old-browser.mjs).
// This file covers `globalThis` (Chrome 71 / Safari 12.1), which the e2e harness itself needs and so cannot remove, and the
// ES2018 regular-expression features that ecmaVersion 2019 still lets through but older browsers reject (a bad regex literal
// breaks the whole module just like `??` does).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const JS = new URL('../site/js/', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const files = walk(JS).filter((f) => f.endsWith('.js'));

test('globalThis is only ever read where `window` does not exist (so older browsers never evaluate it)', () => {
  const GUARDED = "typeof window !== 'undefined' ? window : globalThis";
  const bad = [];
  for (const f of files) {
    // Comments are ignored: this only looks at code.
    const code = readFileSync(f, 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
    for (const m of code.matchAll(/\bglobalThis\b/g)) {
      if (code.slice(Math.max(0, m.index - GUARDED.length + 'globalThis'.length), m.index + 'globalThis'.length) !== GUARDED) bad.push(f.slice(JS.length));
    }
  }
  assert.deepEqual(bad, [], 'unguarded globalThis in: ' + bad.join(', '));
});

test('the start-up guard is a plain classic script (no import/export, no module syntax)', () => {
  const src = readFileSync(join(JS, 'guard.js'), 'utf8');
  assert.ok(!/^\s*(import|export)\b/m.test(src));
});

test('no regex features newer than the floor: lookbehind (Safari 16.4), named groups, \\p{…} property escapes', () => {
  const bad = [];
  for (const f of files) {
    const code = readFileSync(f, 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    if (/\(\?<[=!]|\(\?<[A-Za-z_$]|\\[pP]\{/.test(code)) bad.push(f.slice(JS.length));
  }
  assert.deepEqual(bad, [], 'regex feature newer than the floor in: ' + bad.join(', '));
});
