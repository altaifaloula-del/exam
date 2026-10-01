import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickExam, examPool, score, remaining, formatClock, filterReview, seededRng, shuffle,
  safeHttpsUrl, questionProblems, validateBank, isLatin, optionLabel, questionsPhrase, essaysPhrase,
} from '../site/js/logic.js';

const mk = (id, over = {}) => ({
  id, family: id, specialty: 'assistant', type: 'mcq', q: 'Q ' + id, options: ['a', 'b', 'c', 'd'], answer: 1,
  status: 'verified', confidence: 'medium', refs: [{ title: 't', url: 'https://example.org/x' }], ...over,
});

test('pickExam: verified only, one per family, capped at count, deterministic with seed', () => {
  const bank = [];
  for (let i = 0; i < 80; i++) bank.push(mk('V' + i));
  for (let i = 0; i < 20; i++) bank.push(mk('T' + i, { status: 'tentative', confidence: 'low', refs: [] }));
  bank.push(mk('DUP', { family: 'V1' }));
  const a = pickExam(bank, 'assistant', seededRng(7));
  const b = pickExam(bank, 'assistant', seededRng(7));
  assert.deepEqual(a, b);
  assert.equal(a.length, 50);
  assert.equal(new Set(a).size, 50);
  assert.ok(a.every((id) => id.startsWith('V') && id !== 'DUP'));
  assert.notDeepEqual(a, pickExam(bank, 'assistant', seededRng(8)));
});

test('pickExam returns what is available when the section is smaller than the count', () => {
  const bank = Array.from({ length: 16 }, (_, i) => mk('D' + i, { specialty: 'dental' }));
  assert.equal(pickExam(bank, 'dental', seededRng(1)).length, 16);
  assert.equal(pickExam(bank, 'nursing', seededRng(1)).length, 0);
});

test('examPool with all sections mixes specialties', () => {
  const bank = [mk('A1'), mk('N1', { specialty: 'nursing' }), mk('M1', { specialty: 'midwifery' })];
  assert.equal(examPool(bank, 'all').length, 3);
});

test('score counts only verified questions and separates wrong from unanswered', () => {
  const qs = [mk('a', { answer: 0 }), mk('b', { answer: 2 }), mk('c', { answer: 1 }), mk('t', { status: 'tentative', answer: 0 })];
  const s = score(qs, { a: 0, b: 1, t: 0 });
  assert.deepEqual(s, { correct: 1, wrong: 1, unanswered: 1, total: 3, percent: 33 });
  assert.deepEqual(score([], {}), { correct: 0, wrong: 0, unanswered: 0, total: 0, percent: 0 });
});

test('remaining never goes negative and follows wall clock', () => {
  assert.equal(remaining(0, 0), 3600);
  assert.equal(remaining(0, 59_999), 3541);
  assert.equal(remaining(0, 3_600_000), 0);
  assert.equal(remaining(0, 9_999_999), 0);
  assert.equal(formatClock(3600), '60:00');
  assert.equal(formatClock(65), '01:05');
  assert.equal(formatClock(-4), '00:00');
});

test('filterReview filters by section, status, type and text', () => {
  const bank = [mk('a', { q: 'Insulin is made in', specialty: 'nursing' }), mk('b', { status: 'tentative' }), mk('c', { type: 'tf', options: ['True', 'False'] })];
  assert.equal(filterReview(bank, { spec: 'nursing' }).length, 1);
  assert.equal(filterReview(bank, { status: 'tentative' }).length, 1);
  assert.equal(filterReview(bank, { type: 'tf' }).length, 1);
  assert.equal(filterReview(bank, { text: 'INSULIN' }).length, 1);
  assert.equal(filterReview(bank, {}).length, 3);
});

test('safeHttpsUrl rejects non-https and garbage', () => {
  assert.equal(safeHttpsUrl('https://who.int/a'), 'https://who.int/a');
  for (const bad of ['http://x.org', 'javascript:alert(1)', 'data:text/html,1', 'mailto:a@b.c', '', null, undefined, 'not a url']) {
    assert.equal(safeHttpsUrl(bad), null, String(bad));
  }
});

test('questionProblems flags broken questions and validateBank drops them without throwing', () => {
  assert.deepEqual(questionProblems(mk('ok')), []);
  assert.ok(questionProblems(mk('x', { answer: 9 })).includes('answer range'));
  assert.ok(questionProblems(mk('x', { answer: null })).includes('answer missing'));
  assert.ok(questionProblems(mk('x', { refs: [] })).includes('verified without refs'));
  assert.ok(questionProblems(mk('x', { refs: [{ url: 'http://a.b' }] })).includes('verified without https ref'));
  assert.ok(questionProblems(mk('x', { options: ['only'] })).includes('options'));
  assert.ok(questionProblems(null).length);
  const r = validateBank({ questions: [mk('ok'), mk('ok'), mk('bad', { specialty: 'x' })] });
  assert.equal(r.ok, false);
  assert.equal(r.questions.length, 1);
  assert.equal(validateBank(null).ok, false);
  assert.equal(validateBank({}).ok, false);
});

test('shuffle keeps elements and does not mutate the input', () => {
  const src = [1, 2, 3, 4, 5, 6];
  const out = shuffle(src, seededRng(3));
  assert.deepEqual([...out].sort(), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6]);
});

test('labels and direction helpers', () => {
  assert.equal(optionLabel({ type: 'tf' }, 0), 'صح');
  assert.equal(optionLabel({ type: 'tf' }, 1), 'خطأ');
  assert.equal(optionLabel({ type: 'mcq' }, 2), 'ج');
  assert.equal(isLatin('Insulin is'), true);
  assert.equal(isLatin('الأنسولين'), false);
});

test('Arabic counted nouns: 1, 2, 3-10 plural, 11+ singular accusative', () => {
  assert.equal(questionsPhrase(1), 'سؤال واحد');
  assert.equal(questionsPhrase(2), 'سؤالان');
  assert.equal(questionsPhrase(3), '3 أسئلة');
  assert.equal(questionsPhrase(10), '10 أسئلة');
  assert.equal(questionsPhrase(11), '11 سؤالًا');
  assert.equal(questionsPhrase(104), '104 سؤالًا');
  assert.equal(essaysPhrase(9), '9 أسئلة مقالية');
  assert.equal(essaysPhrase(40), '40 سؤالًا مقاليًا');
});
