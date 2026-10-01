import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newExam, validateExam, setAnswer, toggleFlag, goTo, answeredCount, buildResult, validateResult, cleanWrong, cleanLast,
  startEssay, toGrade, setEssayAnswer, toggleCheck, essayAnsweredCount, essayScore,
} from '../site/js/exam-state.js';
import { seededRng, EXAM, pickExam } from '../site/js/logic.js';

const mk = (id, over = {}) => ({
  id, family: id, specialty: 'assistant', type: 'mcq', q: 'Q ' + id, options: ['a', 'b', 'c', 'd'], answer: 1,
  status: 'verified', confidence: 'medium', refs: [{ title: 't', url: 'https://example.org/x' }], ...over,
});
const bank = [...Array.from({ length: 60 }, (_, i) => mk('V' + i)), mk('T1', { status: 'tentative', confidence: 'low', refs: [] })];

const mkPlan = (over = {}) => ({ kind: 'custom', spec: 'assistant', label: 'اختبار مخصّص', ids: pickExam(bank, 'assistant', seededRng(3)), limit: 3600, ...over });

test('newExam builds a v2 state from a plan and rejects unusable plans', () => {
  const s = newExam(mkPlan(), 1000);
  assert.equal(s.v, 2);
  assert.equal(s.ids.length, EXAM.count);
  assert.equal(s.limit, 3600);
  assert.equal(s.start, 1000);
  assert.equal(s.kind, 'custom');
  assert.ok(!s.ids.includes('T1'));
  assert.equal(newExam(mkPlan({ spec: 'hacker' }), 1000), null);
  assert.equal(newExam(mkPlan({ kind: 'nope' }), 1000), null);
  assert.equal(newExam(mkPlan({ ids: [] }), 1000), null);
  assert.equal(newExam(null, 1000), null);
});

test('validateExam accepts a clean state and rejects every kind of tampering', () => {
  const s = newExam(mkPlan(), 1000);
  assert.ok(validateExam(JSON.parse(JSON.stringify(s)), bank));
  const bad = [
    null, 'x', [], { ...s, v: 3 }, { ...s, v: 0 }, { ...s, spec: 'zzz' }, { ...s, kind: 'zzz' }, { ...s, label: '' }, { ...s, label: 5 },
    { ...s, label: 'x'.repeat(121) }, { ...s, ids: [] }, { ...s, ids: [...s.ids, 'V1'] }, { ...s, ids: ['T1'] }, { ...s, ids: ['nope'] },
    { ...s, start: 'now' }, { ...s, limit: 1 }, { ...s, limit: 4 * 3600 + 1 }, { ...s, limit: 600.5 }, { ...s, cur: 99 },
    { ...s, cur: 1.5 }, { ...s, answers: [] }, { ...s, answers: { [s.ids[0]]: 9 } }, { ...s, answers: { ghost: 0 } },
    { ...s, answers: { [s.ids[0]]: '1' } },
  ];
  for (const b of bad) assert.equal(validateExam(b, bank), null, JSON.stringify(b).slice(0, 60));
});

test('validateExam: bounds for ids and limit on v2, and upgrade of a saved v1 exam', () => {
  const big = Array.from({ length: 130 }, (_, i) => mk('B' + i));
  const bigBank = [...bank, ...big];
  const ok = newExam(mkPlan({ ids: big.slice(0, 120).map((q) => q.id) }), 0);
  assert.ok(validateExam(ok, bigBank));
  assert.equal(validateExam({ ...ok, ids: big.map((q) => q.id) }, bigBank), null, 'more than 120 questions');
  const v1 = { v: 1, spec: 'assistant', ids: pickExam(bank, 'assistant', seededRng(5)), answers: {}, flags: [], cur: 0, start: 5, limit: 3600 };
  const up = validateExam(v1, bank);
  assert.equal(up.v, 2);
  assert.equal(up.kind, 'custom');
  assert.ok(up.label);
  assert.equal(validateExam({ ...v1, limit: 1800 }, bank), null, 'v1 only ever had a 60-minute limit');
  assert.equal(validateExam({ ...v1, ids: [...v1.ids, ...big.slice(0, 5).map((q) => q.id)] }, bigBank), null, 'v1 never had more than 50');
});

test('answers, flags and navigation are immutable updates with range checks', () => {
  const s0 = newExam(mkPlan({ ids: pickExam(bank, 'assistant', seededRng(1)) }), 0);
  const q = bank.find((x) => x.id === s0.ids[0]);
  const s1 = setAnswer(s0, q, 2);
  assert.equal(s0.answers[q.id], undefined);
  assert.equal(s1.answers[q.id], 2);
  assert.equal(setAnswer(s1, q, 9), s1);
  assert.equal(setAnswer(s1, mk('other'), 0), s1);
  assert.equal(answeredCount(s1), 1);
  const f1 = toggleFlag(s1, q.id);
  assert.deepEqual(f1.flags, [q.id]);
  assert.deepEqual(toggleFlag(f1, q.id).flags, []);
  assert.equal(goTo(s1, 5).cur, 5);
  assert.equal(goTo(s1, 50), s1);
  assert.equal(goTo(s1, -1), s1);
});

test('buildResult counts correct/wrong/unanswered and caps elapsed at the limit', () => {
  let s = newExam(mkPlan({ ids: pickExam(bank, 'assistant', seededRng(2)) }), 0);
  const [a, b, c] = s.ids.map((id) => bank.find((x) => x.id === id));
  s = setAnswer(s, a, a.answer);
  s = setAnswer(s, b, (b.answer + 1) % 4);
  const r = buildResult(s, bank, 4000 * 1000);
  assert.equal(r.correct, 1);
  assert.equal(r.wrong, 1);
  assert.equal(r.unanswered, 48);
  assert.equal(r.total, 50);
  assert.equal(r.percent, 2);
  assert.equal(r.elapsed, 3600);
  assert.equal(r.kind, 'custom');
  assert.equal(r.label, 'اختبار مخصّص');
  assert.ok(r.missIds.includes(b.id) && r.missIds.includes(c.id) && !r.missIds.includes(a.id));
  assert.equal(r.missIds.length, 49);
  assert.ok(validateResult(JSON.parse(JSON.stringify(r)), bank));
});

test('validateResult / cleanWrong / cleanLast reject junk', () => {
  assert.equal(validateResult(null, bank), null);
  assert.equal(validateResult({ v: 1, spec: 'all', items: [], missIds: [] }, bank), null);
  const okR = { v: 1, spec: 'all', correct: 1, wrong: 0, unanswered: 0, total: 1, percent: 100, elapsed: 5, finishedAt: 9, items: [{ id: 'V1', picked: 1 }], missIds: [] };
  assert.equal(validateResult(okR, bank).label, null, 'a v1 result has no label');
  assert.equal(validateResult({ ...okR, label: '<img src=x>', kind: 'zzz' }, bank).kind, null);
  assert.equal(validateResult({ ...okR, label: 'x'.repeat(500) }, bank).label, null);
  assert.deepEqual(cleanWrong(['V1', 5, 'ghost', 'V2'], bank), ['V1', 'V2']);
  assert.deepEqual(cleanWrong('x', bank), []);
  assert.equal(cleanLast({ percent: 'a', correct: 1, total: 2 }), null);
  assert.deepEqual(cleanLast({ percent: 50, correct: 1, total: 2, extra: 1 }), { percent: 50, correct: 1, total: 2 });
});

// ---------- optional essay section ----------
const eItem = (id, spec = 'assistant', n = 4) => ({
  id, spec, topic: 1, q: 'سؤال ' + id, model: 'إجابة نموذجية ' + id, points: Array.from({ length: n }, (_, i) => `نقطة ${i + 1}`),
  refs: [{ title: 'ref', url: 'https://example.org/e' }], from: ['V1', 'V2'],
});
const essayItems = [eItem('E001'), eItem('E002', 'assistant', 3), eItem('E003', 'nursing')];
const essay = { items: essayItems, byId: new Map(essayItems.map((e) => [e.id, e])) };
const withEssay = (over = {}) => mkPlan({ essay: { ids: ['E001', 'E002'], limit: 840 }, ...over });
const clone = (x) => JSON.parse(JSON.stringify(x));

test('an exam without essays is unchanged: phase mcq, no essay part', () => {
  const s = newExam(mkPlan(), 1000);
  assert.equal(s.phase, 'mcq');
  assert.equal(s.essay, undefined);
  const v = validateExam(clone(s), bank);
  assert.equal(v.phase, 'mcq');
  assert.equal(v.essay, null);
  assert.equal(v.mcqEnd, null);
  assert.equal(validateExam({ ...clone(s), phase: 'essay' }, bank), null, 'a phase without an essay section');
  assert.equal(validateExam({ ...clone(s), phase: undefined }, bank).phase, 'mcq', 'saved before essays existed');
});

test('essay section: built from the plan, clock not started, validated against the essay data', () => {
  const s = newExam(withEssay(), 1000);
  assert.deepEqual(s.essay, { ids: ['E001', 'E002'], limit: 840, start: null, end: null, answers: {}, checks: {} });
  const v = validateExam(clone(s), bank, essay);
  assert.equal(v.phase, 'mcq');
  assert.deepEqual(v.essay.ids, ['E001', 'E002']);
  assert.equal(validateExam(clone(s), bank), null, 'essay data missing: cannot be trusted');
  assert.equal(validateExam(clone(s), bank, { items: [], byId: new Map() }), null, 'unknown essay id');
});

test('essay section: phases, sequential order and frozen section 1', () => {
  let s = newExam(withEssay(), 1000);
  const q = bank.find((x) => x.id === s.ids[0]);
  assert.equal(setEssayAnswer(s, 'E001', 'x'), s, 'cannot write before the essay phase');
  assert.equal(toGrade(s, 5000), s, 'cannot grade before writing');
  s = setAnswer(s, q, 2);
  assert.equal(startEssay(s, NaN), s);
  s = startEssay(s, 9000);
  assert.equal(s.phase, 'essay');
  assert.equal(s.mcqEnd, 9000);
  assert.equal(s.essay.start, 9000);
  assert.equal(startEssay(s, 9500), s, 'cannot start twice');
  assert.equal(setAnswer(s, q, 1), s, 'no going back to section 1');
  assert.equal(toggleFlag(s, q.id), s);
  assert.equal(goTo(s, 3), s);
  s = setEssayAnswer(s, 'E001', 'جواب');
  assert.equal(s.essay.answers.E001, 'جواب');
  assert.equal(setEssayAnswer(s, 'E999', 'x'), s);
  assert.equal(setEssayAnswer(s, 'E001', 7), s);
  assert.equal(setEssayAnswer(s, 'E001', 'x'.repeat(5000)).essay.answers.E001.length, 4000, 'capped');
  assert.equal('E001' in setEssayAnswer(s, 'E001', '').essay.answers, false, 'empty text removes the entry');
  assert.equal(essayAnsweredCount(s), 1);
  assert.equal(essayAnsweredCount(setEssayAnswer(s, 'E002', '   ')), 1, 'blank does not count');
  assert.equal(toggleCheck(s, 'E001', 0, essayItems[0]), s, 'ticking only while grading');
  s = toGrade(s, 9500);
  assert.equal(s.phase, 'grade');
  assert.equal(s.essay.end, 9500);
  assert.equal(setEssayAnswer(s, 'E001', 'y'), s, 'answers are frozen while grading');
  assert.ok(validateExam(clone(s), bank, essay));
});

test('essay self-grading: ticks toggle, stay in range and count as points', () => {
  let s = toGrade(startEssay(newExam(withEssay(), 0), 10), 20);
  const [i1, i2] = essayItems;
  s = toggleCheck(s, 'E001', 0, i1);
  s = toggleCheck(s, 'E001', 2, i1);
  s = toggleCheck(s, 'E002', 1, i2);
  assert.deepEqual(s.essay.checks, { E001: [0, 2], E002: [1] });
  assert.equal(toggleCheck(s, 'E001', 4, i1), s, 'point 4 does not exist (4 points: 0..3)');
  assert.equal(toggleCheck(s, 'E001', -1, i1), s);
  assert.equal(toggleCheck(s, 'E001', 1.5, i1), s);
  assert.equal(toggleCheck(s, 'E003', 0, essayItems[2]), s, 'not part of this exam');
  const off = toggleCheck(s, 'E002', 1, i2);
  assert.equal('E002' in off.essay.checks, false, 'unticking the last point removes the entry');
  const sc = essayScore(s, essay.byId);
  assert.deepEqual(sc.items, [{ id: 'E001', got: 2, total: 4 }, { id: 'E002', got: 1, total: 3 }]);
  assert.equal(sc.got, 3);
  assert.equal(sc.total, 7);
  assert.equal(sc.percent, 43);
});

test('essay section: saved state that is inconsistent or hostile is rejected', () => {
  const base = clone(toGrade(startEssay(newExam(withEssay(), 0), 100), 200));
  assert.ok(validateExam(clone(base), bank, essay));
  const w = clone(setEssayAnswer(startEssay(newExam(withEssay(), 0), 100), 'E001', 'نص'));
  assert.ok(validateExam(w, bank, essay), 'mid-writing state is fine');
  const mcq = clone(newExam(withEssay(), 0));
  const bad = [
    { ...w, phase: 'zzz' }, { ...w, phase: 'mcq' }, { ...w, mcqEnd: null }, { ...w, mcqEnd: 'now' },
    { ...w, essay: { ...w.essay, start: null } }, { ...w, essay: { ...w.essay, end: 300 } }, { ...w, essay: { ...w.essay, limit: 1 } },
    { ...w, essay: { ...w.essay, limit: 99999 } }, { ...w, essay: { ...w.essay, ids: [] } }, { ...w, essay: { ...w.essay, ids: ['E001', 'E001'] } },
    { ...w, essay: { ...w.essay, ids: ['E003'] } }, { ...w, essay: { ...w.essay, ids: ['nope'] } },
    { ...w, essay: { ...w.essay, ids: ['E001', 'E002', 'E001', 'E002', 'E001', 'E002'] } },
    { ...w, essay: { ...w.essay, answers: { E001: 5 } } }, { ...w, essay: { ...w.essay, answers: { E002: 'x'.repeat(4001) } } },
    { ...w, essay: { ...w.essay, answers: { E003: 'x' } } }, { ...w, essay: { ...w.essay, answers: [] } },
    { ...w, essay: { ...w.essay, checks: { E001: [9] } } }, { ...w, essay: { ...w.essay, checks: { E001: [0, 0] } } },
    { ...w, essay: { ...w.essay, checks: { E001: 'a' } } }, { ...w, essay: { ...w.essay, checks: [] } }, { ...w, essay: 'x' }, { ...w, essay: [] },
    { ...mcq, mcqEnd: 5 }, { ...mcq, essay: { ...mcq.essay, start: 5 } }, { ...mcq, phase: 'grade' },
    { ...base, essay: { ...base.essay, end: null } },
  ];
  for (const b of bad) assert.equal(validateExam(b, bank, essay), null, JSON.stringify(b.essay).slice(0, 70) + b.phase);
  // a nursing paper may not carry an assistant essay
  assert.equal(validateExam({ ...w, spec: 'nursing' }, bank, essay), null, 'essay specialty must match the exam specialty');
  const all = validateExam({ ...w, spec: 'all' }, bank, essay);
  assert.ok(all, "'all' accepts any specialty");
});

test('buildResult: MCQ time stops at the end of section 1; essay part has its own score and time', () => {
  let s = newExam(withEssay({ ids: pickExam(bank, 'assistant', seededRng(2)) }), 0);
  const a = bank.find((x) => x.id === s.ids[0]);
  s = setAnswer(s, a, a.answer);
  s = startEssay(s, 1500 * 1000);
  s = setEssayAnswer(s, 'E001', 'جواب');
  s = toGrade(s, (1500 + 600) * 1000);
  s = toggleCheck(s, 'E001', 0, essayItems[0]);
  s = toggleCheck(s, 'E001', 1, essayItems[0]);
  const r = buildResult(s, bank, 9999 * 1000, essay.byId);
  assert.equal(r.elapsed, 1500, 'MCQ elapsed ends where section 1 ended, not at the final click');
  assert.equal(r.correct, 1);
  assert.equal(r.essay.got, 2);
  assert.equal(r.essay.total, 7);
  assert.equal(r.essay.percent, 29);
  assert.equal(r.essay.elapsed, 600);
  assert.equal(r.essay.limit, 840);
  assert.equal(r.essay.items.length, 2);
  const back = validateResult(clone(r), bank);
  assert.deepEqual(back.essay, r.essay);
  assert.equal(buildResult(newExam(mkPlan(), 0), bank, 10).essay, null, 'no essay section, no essay result');
  assert.equal(validateResult({ ...clone(r), essay: { ...r.essay, items: [{ id: 'E001', got: 9, total: 4 }] } }, bank).essay, null, 'damaged essay part is dropped');
  assert.equal(validateResult({ ...clone(r), essay: { ...r.essay, items: [] } }, bank).essay, null);
  assert.equal(validateResult({ ...clone(r), essay: 'x' }, bank).essay, null);
  assert.ok(validateResult({ ...clone(r), essay: 'x' }, bank).correct === 1, 'the multiple-choice result survives');
});
