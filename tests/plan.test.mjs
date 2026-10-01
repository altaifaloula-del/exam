import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALERT_MINUTES, CUSTOM, MODEL_MIN_QUESTIONS, alertSeconds, alertText, customPlan, examModels, minutesFor, modelPlan, setupTabFor,
} from '../site/js/plan.js';
import { seededRng } from '../site/js/logic.js';

const mk = (id, over = {}) => ({
  id, family: id, specialty: 'assistant', type: 'mcq', q: 'Q ' + id, options: ['a', 'b', 'c', 'd'], answer: 1,
  status: 'verified', confidence: 'medium', refs: [{ title: 't', url: 'https://example.org/x' }], sources: ['P1'], ...over,
});
const many = (n, prefix, over) => Array.from({ length: n }, (_, i) => mk(`${prefix}${i}`, over));

test('minutesFor: 1.2 min per question rounded up to 5, integer-exact', () => {
  assert.deepEqual([1, 4, 5, 10, 25, 50, 51, 97, 100].map(minutesFor), [5, 5, 10, 15, 30, 60, 65, 120, 120]);
  assert.equal(minutesFor(0), 0);
  assert.equal(minutesFor(-3), 0);
  assert.equal(minutesFor(2.5), 0);
  // same answer as the naive floating-point formula for every size we can meet
  for (let n = 1; n <= 200; n++) assert.equal(minutesFor(n), Math.ceil((n * 1.2) / 5 - 1e-9) * 5, String(n));
});

test('examModels: >= 15 verified, verified only, one count per question, sorted', () => {
  const bank = [
    ...many(20, 'A', { sources: ['Paper A'] }),
    ...many(14, 'B', { sources: ['Paper B'] }),                       // too small
    ...many(16, 'N', { specialty: 'nursing', sources: ['Paper N'] }),
    ...many(5, 'T', { status: 'tentative', sources: ['Paper A'] }),   // tentative never counts
    ...many(3, 'X', { sources: ['Paper A', 'Paper A'] }),             // repeated label counts once
  ];
  const ms = examModels(bank);
  assert.deepEqual(ms.map((m) => [m.spec, m.title, m.n]), [['assistant', 'Paper A', 23], ['nursing', 'Paper N', 16]]);
  assert.equal(ms[0].minutes, minutesFor(23));
  assert.ok(ms.every((m) => m.n >= MODEL_MIN_QUESTIONS));
  assert.ok(!ms[0].ids.some((id) => id.startsWith('T')));
  assert.equal(new Set(ms[0].ids).size, ms[0].ids.length);
});

test('examModels merges papers whose verified question sets are identical', () => {
  const bank = many(18, 'C', { sources: ['Paper (long name)', 'Paper', 'Paper copy'] });
  const ms = examModels(bank);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].title, 'Paper');
  assert.deepEqual(ms[0].copies.slice().sort(), ['Paper (long name)', 'Paper copy']);
});

test('examModels keeps one question per family and flags the study guide', () => {
  const bank = [...many(15, 'G', { sources: ['الدليل العربي الشامل'], specialty: 'dental' }), mk('G0dup', { family: 'G0', specialty: 'dental', sources: ['الدليل العربي الشامل'] })];
  const ms = examModels(bank);
  assert.equal(ms[0].n, 15);
  assert.equal(ms[0].guide, true);
});

test('modelPlan shuffles the model questions, never adds or drops one, and sets the limit', () => {
  const m = examModels(many(20, 'A', { sources: ['P'] }))[0];
  const a = modelPlan(m, seededRng(1));
  const b = modelPlan(m, seededRng(2));
  assert.equal(a.kind, 'model');
  assert.equal(a.limit, 25 * 60);
  assert.deepEqual(a.ids.slice().sort(), m.ids.slice().sort());
  assert.notDeepEqual(a.ids, b.ids);
  assert.equal(modelPlan(null), null);
  assert.equal(modelPlan({ ...m, ids: [] }), null);
});

test('customPlan: verified only, capped by the pool, auto or explicit minutes, hostile input refused', () => {
  const bank = [...many(60, 'A'), ...many(10, 'T', { status: 'tentative' }), ...many(12, 'D', { specialty: 'dental' })];
  const p = customPlan(bank, { spec: 'assistant', count: 50 }, seededRng(3));
  assert.equal(p.ids.length, 50);
  assert.equal(p.limit, 3600);
  assert.ok(p.ids.every((id) => id.startsWith('A')));
  assert.equal(customPlan(bank, { spec: 'assistant', count: 100 }, seededRng(3)).ids.length, 60, 'capped by what exists');
  assert.equal(customPlan(bank, { spec: 'dental', count: 25 }).ids.length, 12);
  assert.equal(customPlan(bank, { spec: 'dental', count: 25, minutes: 30 }).limit, 1800);
  assert.equal(customPlan(bank, { spec: 'all', count: 10 }).ids.length, 10);
  for (const bad of [
    { spec: 'zzz', count: 10 }, { spec: 'assistant', count: 0 }, { spec: 'assistant', count: 101 }, { spec: 'assistant', count: 10.5 },
    { spec: 'assistant', count: '10' }, { spec: 'assistant', count: 10, minutes: 1 }, { spec: 'assistant', count: 10, minutes: 999 },
    { spec: 'assistant', count: 10, minutes: 'soon' }, { spec: 'nursing', count: 10 },
  ]) assert.equal(customPlan(bank, bad), null, JSON.stringify(bad));
  assert.ok(CUSTOM.counts.every((c) => c <= CUSTOM.maxQuestions));
});

test('alerts: 10/5/1 minutes, only those below the exam length, spoken in Arabic', () => {
  assert.deepEqual(ALERT_MINUTES, [10, 5, 1]);
  assert.deepEqual(alertSeconds(3600), [600, 300, 60]);
  assert.deepEqual(alertSeconds(600), [300, 60]);
  assert.deepEqual(alertSeconds(240), [60]);
  assert.equal(alertText(600), 'متبقٍ 10 دقائق');
  assert.equal(alertText(60), 'متبقٍ دقيقة واحدة');
});

test('the real bank: every model is >= 15 verified questions with the agreed duration', () => {
  const bank = JSON.parse(readFileSync(new URL('../site/data/bank.json', import.meta.url), 'utf8')).questions;
  const ms = examModels(bank);
  assert.ok(ms.length >= 20);
  const byId = new Map(bank.map((q) => [q.id, q]));
  const keys = new Set();
  for (const m of ms) {
    assert.ok(m.n >= 15, m.title);
    assert.equal(m.minutes, Math.ceil((m.n * 6) / 25) * 5, m.title);
    assert.ok(m.ids.every((id) => byId.get(id).status === 'verified' && byId.get(id).specialty === m.spec), m.title);
    assert.ok(!keys.has(m.key), 'duplicate model key ' + m.key);
    keys.add(m.key);
  }
});

test('setupTabFor sends each exam kind back to the tab that builds it', () => {
  assert.equal(setupTabFor('model'), 'models');
  assert.equal(setupTabFor('topic'), 'topic');
  assert.equal(setupTabFor('custom'), 'custom');
  assert.equal(setupTabFor('anything-else'), 'custom');
});
