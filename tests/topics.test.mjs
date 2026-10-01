import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { examPool, seededRng } from '../site/js/logic.js';
import { TOPIC_COUNT, topicCounts, topicLabel, topicPlan, topicPool, validateTopics } from '../site/js/topics.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const bank = load('../site/data/bank.json').questions;
const raw = load('../site/data/topics.json');

test('the shipped topics.json validates against the shipped bank', () => {
  const t = validateTopics(raw, bank);
  assert.ok(t, 'valid');
  assert.equal(t.list.length, TOPIC_COUNT);
  assert.equal(t.map.size, bank.length, 'every bank question has a topic');
});

test('topic names are exactly the 13 the user approved (in order)', () => {
  assert.deepEqual(raw.topics.map((t) => t.ar), [
    'التشريح والفسيولوجيا', 'الفحص السريري والعلامات الحيوية', 'القلب والدورة الدموية والدم والجهاز التنفسي',
    'الجهاز الهضمي والكبد والكلى والمسالك البولية', 'الغدد والسكري والتغذية', 'الأعصاب والصحة النفسية',
    'الأمراض المعدية ومكافحة العدوى والتطعيم', 'الأدوية والحقن وحساب الجرعات', 'الإسعاف والطوارئ والإصابات والحروق',
    'الجراحة والجروح والعناية قبل العملية وبعدها', 'الحمل والولادة وصحة المرأة والمولود والطفل',
    'أساسيات التمريض والإجراءات والصحة العامة والأخلاقيات', 'الأسنان وطب الفم']);
});

test('validateTopics rejects malformed or incomplete data', () => {
  const ok = (d) => validateTopics(d, bank);
  assert.equal(ok(null), null);
  assert.equal(ok({ ...raw, v: 2 }), null);
  assert.equal(ok({ ...raw, topics: raw.topics.slice(1) }), null, 'needs 13 topics');
  assert.equal(ok({ ...raw, topics: raw.topics.map((t, i) => (i === 3 ? { ...t, n: 9 } : t)) }), null, 'numbered in order');
  assert.equal(ok({ ...raw, topics: raw.topics.map((t, i) => (i === 0 ? { ...t, ar: 'x'.repeat(200) } : t)) }), null);
  assert.equal(ok({ ...raw, map: [] }), null);
  assert.equal(ok({ ...raw, map: { ...raw.map, Q0001: 14 } }), null, 'topic number out of range');
  assert.equal(ok({ ...raw, map: { ...raw.map, Q0001: '3' } }), null, 'topic must be an integer');
  const missing = { ...raw.map };
  const firstVerified = bank.find((q) => q.status === 'verified').id;
  delete missing[firstVerified];
  assert.equal(ok({ ...raw, map: missing }), null, 'a verified question without a topic is refused');
});

test('counts add up to the exam pool and the pool filter agrees with them', () => {
  const t = validateTopics(raw, bank);
  for (const spec of ['all', 'assistant', 'nursing', 'midwifery', 'dental']) {
    const counts = topicCounts(bank, t, spec);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    assert.equal(total, examPool(bank, spec).length, spec);
    for (const [n, c] of counts) assert.equal(topicPool(bank, t, spec, [n]).length, c);
  }
});

test('topicPlan: verified only, inside the chosen topics/specialty, capped by the pool, label by count', () => {
  const t = validateTopics(raw, bank);
  const byId = new Map(bank.map((q) => [q.id, q]));
  const p = topicPlan(bank, t, { spec: 'assistant', selected: [9, 10], count: 25 }, seededRng(7));
  assert.equal(p.kind, 'topic');
  assert.equal(p.ids.length, 25);
  assert.equal(new Set(p.ids).size, 25);
  assert.equal(p.limit, 30 * 60, '25 questions -> 30 minutes by the 1.2 rule');
  assert.equal(p.label, '2 مواضيع مختارة');
  for (const id of p.ids) {
    const q = byId.get(id);
    assert.equal(q.status, 'verified');
    assert.equal(q.specialty, 'assistant');
    assert.ok([9, 10].includes(t.map.get(id)));
  }
  const small = topicPlan(bank, t, { spec: 'nursing', selected: [11], count: 50 }, seededRng(1));
  assert.equal(small.ids.length, topicPool(bank, t, 'nursing', [11]).length, 'capped by what exists');
  assert.equal(topicPlan(bank, t, { spec: 'dental', selected: [13], count: 10, minutes: 45 }, seededRng(1)).limit, 2700);
  assert.equal(topicLabel(t, [13]), 'الأسنان وطب الفم');
});

test('topicPlan refuses invalid input instead of guessing', () => {
  const t = validateTopics(raw, bank);
  const bad = [
    { spec: 'assistant', selected: [], count: 10 }, { spec: 'assistant', selected: [0], count: 10 }, { spec: 'assistant', selected: [14], count: 10 },
    { spec: 'assistant', selected: ['3'], count: 10 }, { spec: 'nope', selected: [3], count: 10 }, { spec: 'assistant', selected: [3], count: 0 },
    { spec: 'assistant', selected: [3], count: 101 }, { spec: 'assistant', selected: [3], count: 10, minutes: 3 },
    { spec: 'assistant', selected: [3], count: 10, minutes: 'x' }, { spec: 'dental', selected: [9], count: 10 } /* empty pool */,
  ];
  for (const b of bad) assert.equal(topicPlan(bank, t, b), null, JSON.stringify(b));
  assert.equal(topicPlan(bank, null, { spec: 'assistant', selected: [3], count: 10 }), null);
});
