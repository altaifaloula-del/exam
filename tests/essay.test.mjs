import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seededRng } from '../site/js/logic.js';
import { ESSAY, attachEssay, essayMinutes, essayPool, validateEssay } from '../site/js/essay.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const bank = load('../site/data/bank.json').questions;
const raw = load('../site/data/essay.json');
const essay = validateEssay(raw, bank);

test('the shipped essay.json validates and is flagged as a draft', () => {
  assert.ok(essay);
  assert.equal(raw.draft, true);
  assert.equal(essay.items.length, 114);
  const per = (s) => essay.items.filter((e) => e.spec === s).length;
  assert.deepEqual(['assistant', 'nursing', 'midwifery', 'dental'].map(per), [40, 40, 25, 9]);
});

test('every essay is grounded: >= 3 points, https refs, verified same-specialty sources', () => {
  const byId = new Map(bank.map((q) => [q.id, q]));
  for (const e of essay.items) {
    assert.ok(e.points.length >= 3 && e.refs.length >= 1, e.id);
    assert.ok(e.refs.every((r) => r.url.startsWith('https://')), e.id);
    for (const id of e.from) {
      assert.equal(byId.get(id).status, 'verified', `${e.id} <- ${id}`);
      assert.equal(byId.get(id).specialty, e.spec, `${e.id} <- ${id}`);
    }
  }
});

test('texts carry no markup or URLs (they are rendered as plain text, but keep them clean)', () => {
  for (const e of essay.items) for (const t of [e.q, e.model, ...e.points]) assert.ok(!/[<>]|https?:\/\//.test(t), e.id);
});

test('validateEssay rejects malformed data', () => {
  const ok = (d) => validateEssay(d, bank);
  const one = raw.items[0];
  const mut = (over) => ({ ...raw, items: [{ ...one, ...over }] });
  assert.equal(ok(null), null);
  assert.equal(ok({ ...raw, v: 2 }), null);
  assert.equal(ok({ ...raw, items: [] }), null);
  assert.equal(ok(mut({ id: 'X1' })), null);
  assert.equal(ok(mut({ spec: 'nope' })), null);
  assert.equal(ok(mut({ topic: 14 })), null);
  assert.equal(ok(mut({ points: one.points.slice(0, 2) })), null, 'needs 3 points');
  assert.equal(ok(mut({ refs: [{ title: 'x', url: 'http://insecure.example' }] })), null, 'https only');
  assert.equal(ok(mut({ refs: [] })), null);
  assert.equal(ok(mut({ from: ['Q0001'] })), null, 'two sources at least');
  assert.equal(ok(mut({ from: ['Q0001', 'NOPE'] })), null, 'source must exist');
  assert.equal(ok({ ...raw, items: [one, one] }), null, 'duplicate id');
  assert.ok(ok({ ...raw, items: [one] }));
});

test('essayPool filters by specialty and topics; attachEssay is capped by the pool and time is 7 min each', () => {
  assert.equal(essayPool(essay, 'all').length, 114);
  assert.equal(essayPool(essay, 'dental').length, 9);
  assert.ok(essayPool(essay, 'nursing', [11]).every((e) => e.topic === 11));
  assert.equal(essayPool(null, 'all').length, 0);
  assert.deepEqual([2, 3, 5].map(essayMinutes), [14, 21, 35]);
  assert.equal(essayMinutes(0), 0);
  assert.equal(essayMinutes(6), 0);
  const plan = { kind: 'custom', spec: 'nursing', label: 'x', ids: ['Q0001'], limit: 600 };
  const p = attachEssay(plan, essay, { count: 3 }, seededRng(5));
  assert.equal(p.essay.ids.length, 3);
  assert.equal(new Set(p.essay.ids).size, 3);
  assert.equal(p.essay.limit, 21 * 60);
  assert.ok(p.essay.ids.every((id) => essay.byId.get(id).spec === 'nursing'));
  assert.equal(plan.essay, undefined, 'input plan is not mutated');
  assert.equal(attachEssay(plan, essay, { count: 4 }), null, 'only 2, 3 or 5');
  assert.equal(attachEssay(plan, null, { count: 2 }), null);
  assert.equal(attachEssay({ ...plan, spec: 'nursing' }, essay, { count: 2, topics: [11] }), null, 'only 1 nursing essay in topic 11');
  assert.ok(ESSAY.counts.every((c) => c <= ESSAY.maxQuestions));
});
