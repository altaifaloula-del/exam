import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBank, examPool, countBy } from '../site/js/logic.js';

const EXPECTED_TOTAL = 781;
const EXPECTED_VERIFIED = 620;
const EXPECTED_TENTATIVE = 161;
const data = JSON.parse(readFileSync(new URL('../site/data/bank.json', import.meta.url), 'utf8'));

test('bank.json passes schema validation with zero errors', () => {
  const r = validateBank(data);
  assert.deepEqual(r.errors, [], r.errors.slice(0, 5).join('\n'));
  assert.equal(r.questions.length, data.count);
});

test('bank size and composition match the agreed numbers', () => {
  assert.equal(data.questions.length, EXPECTED_TOTAL);
  const v = data.questions.filter((q) => q.status === 'verified').length;
  assert.equal(v, EXPECTED_VERIFIED);
  assert.equal(data.questions.length - v, EXPECTED_TENTATIVE);
});

test('every verified question has an in-range answer and at least one https reference', () => {
  for (const q of data.questions.filter((x) => x.status === 'verified')) {
    assert.ok(Number.isInteger(q.answer) && q.answer < q.options.length, q.id);
    assert.ok(q.refs.some((r) => r.url.startsWith('https://')), q.id);
  }
});

test('no high confidence rests on general-only references', () => {
  for (const q of data.questions) {
    if (q.confidence === 'high') assert.equal(q.ref_tier, 'strong', q.id);
  }
});

test('ids are unique and families are unique inside the bank', () => {
  assert.equal(new Set(data.questions.map((q) => q.id)).size, data.questions.length);
  assert.equal(new Set(data.questions.map((q) => q.family)).size, data.questions.length);
});

test('exam pool excludes tentative questions and covers every specialty', () => {
  const counts = countBy(data.questions);
  for (const spec of ['assistant', 'nursing', 'midwifery', 'dental']) {
    const pool = examPool(data.questions, spec);
    assert.equal(pool.length, counts[spec].verified, spec);
    assert.ok(pool.every((q) => q.status === 'verified'));
  }
  assert.equal(counts.dental.verified, 15);
  assert.equal(counts.assistant.verified, 317);
  assert.equal(counts.nursing.verified, 204);
  assert.equal(counts.midwifery.verified, 84);
});

test('no unanswerable question leaked into the public bank', () => {
  for (const q of data.questions) assert.notEqual(q.verdict, 'unanswerable', q.id);
});

test('family fixes file only names ids that exist and every fix carries a reason', () => {
  const fx = JSON.parse(readFileSync(new URL('../data/family_fixes.json', import.meta.url), 'utf8'));
  for (const [id, why] of Object.entries(fx.alone)) assert.ok(typeof why === 'string' && why.length > 10, id);
  for (const [id, t] of Object.entries(fx.move)) assert.ok(t.to && t.reason, id);
});

test('an "except" stem never shares a family with its positive counterpart (manual fixes stay applied)', () => {
  const byId = new Map(data.questions.map((q) => [q.id, q]));
  for (const id of ['Q0306', 'Q0716', 'Q0848', 'Q0804', 'Q0654', 'Q0765', 'Q0405']) {
    const q = byId.get(id);
    if (q) assert.ok(String(q.family).startsWith('alone-'), id);
  }
});
