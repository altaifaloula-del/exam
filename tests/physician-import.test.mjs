import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// The importer runs in a sandbox copy so the real data/physician_review.json is never touched.
const root = new URL('..', import.meta.url).pathname;
const sandbox = mkdtempSync(join(tmpdir(), 'phys-'));
mkdirSync(join(sandbox, 'site/data'), { recursive: true });
mkdirSync(join(sandbox, 'data'), { recursive: true });
copyFileSync(join(root, 'site/data/bank.json'), join(sandbox, 'site/data/bank.json'));
const bankRaw = readFileSync(join(sandbox, 'site/data/bank.json'));
const bank = JSON.parse(bankRaw).questions;
const version = createHash('sha256').update(bankRaw).digest('hex').slice(0, 12);
const qhash = (q) => createHash('sha1').update([q.q, ...q.options].join('|'), 'utf8').digest('hex').slice(0, 8);
const run = (file, ...flags) => spawnSync('python3', [join(root, 'tools/apply_physician.py'), file, ...flags], { cwd: sandbox, encoding: 'utf8' });
const write = (name, obj) => { const p = join(sandbox, name); writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj)); return p; };

const withAnswer = bank.filter((q) => q.answer != null);
const [a, b, c] = withAnswer;
const doc = (decisions, over = {}) => ({ schema: 'physician-review/1', bankVersion: version, reviewer: { name: 'د. اختبار' }, exportedAt: '2026-09-30T20:00:00Z', decisions, ...over });
const good = () => ({
  [a.id]: { d: 'ok', h: qhash(a) },
  [b.id]: { d: 'fix', a: (b.answer + 1) % b.options.length, h: qhash(b), c: 'ملاحظة' },
  [c.id]: { d: 'invalid', h: qhash(c) },
});

test('a valid export is recorded append-only with its file hash', () => {
  const r = run(write('ok.json', doc(good())));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const log = JSON.parse(readFileSync(join(sandbox, 'data/physician_review.json'), 'utf8'));
  assert.equal(log.batches.length, 1);
  assert.equal(log.batches[0].reviewer, 'د. اختبار');
  assert.deepEqual(Object.keys(log.batches[0].decisions).sort(), [a.id, b.id, c.id].sort());
  assert.match(log.batches[0].file_sha256, /^[0-9a-f]{64}$/);
});

test('importing the same file twice is refused', () => {
  const r = run(join(sandbox, 'ok.json'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /already imported/);
});

test('every kind of bad row aborts the import and writes nothing', () => {
  const before = readFileSync(join(sandbox, 'data/physician_review.json'), 'utf8');
  const bad = [
    ['unknown id', { Q9999: { d: 'ok', h: '00000000' } }],
    ['hash mismatch (question changed)', { [a.id]: { d: 'ok', h: 'deadbeef' } }],
    ['answer out of range', { [a.id]: { d: 'fix', a: 99, h: qhash(a) } }],
    ['a on a non-fix', { [a.id]: { d: 'ok', a: 1, h: qhash(a) } }],
    ['unknown kind', { [a.id]: { d: 'delete', h: qhash(a) } }],
    ['extra key', { [a.id]: { d: 'ok', h: qhash(a), x: 1 } }],
    ['comment too long', { [a.id]: { d: 'ok', h: qhash(a), c: 'x'.repeat(601) } }],
    ['bad id shape', { 'Q1; drop': { d: 'ok', h: qhash(a) } }],
  ];
  for (const [name, decisions] of bad) {
    const r = run(write('bad.json', doc(decisions)));
    assert.notEqual(r.status, 0, name);
    assert.match(r.stdout + r.stderr, /INVALID|FAIL/, name);
  }
  for (const [name, d] of [['wrong schema', doc(good(), { schema: 'x' })], ['no reviewer', doc(good(), { reviewer: { name: ' ' } })], ['bad date', doc(good(), { exportedAt: 'yesterday' })], ['extra top key', { ...doc(good()), admin: true }]]) {
    assert.notEqual(run(write('bad.json', d)).status, 0, name);
  }
  assert.notEqual(run(write('bad.json', 'not json')).status, 0);
  assert.equal(readFileSync(join(sandbox, 'data/physician_review.json'), 'utf8'), before, 'log untouched');
});

test('--skip-invalid imports only the valid rows; --dry-run writes nothing', () => {
  const mixed = doc({ ...good(), Q9999: { d: 'ok', h: '00000000' } }, { exportedAt: '2026-10-01T08:00:00Z' });
  const dry = run(write('mixed.json', mixed), '--skip-invalid', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(JSON.parse(readFileSync(join(sandbox, 'data/physician_review.json'), 'utf8')).batches.length, 1);
  assert.equal(run(join(sandbox, 'mixed.json')).status !== 0, true, 'strict mode refuses the same file');
  const r = run(join(sandbox, 'mixed.json'), '--skip-invalid');
  assert.equal(r.status, 0, r.stderr);
  const log = JSON.parse(readFileSync(join(sandbox, 'data/physician_review.json'), 'utf8'));
  assert.equal(log.batches.length, 2);
  assert.equal(Object.keys(log.batches[1].decisions).length, 3);
});

test('the real log file was not touched by the tests', () => {
  assert.ok(!existsSync(join(root, 'data/physician_review.json')) || !readFileSync(join(root, 'data/physician_review.json'), 'utf8').includes('د. اختبار'));
});
