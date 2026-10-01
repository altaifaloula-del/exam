// Exam planning (pure: no DOM, no storage). Turns the bank into ready-made exam models and builds custom exams.
// The same rules are mirrored by tools/build_mockups_v2.py; tests/plan.test.mjs checks they agree.
import { SPECIALTIES, defaultRng, examPool, shuffle } from './logic.js';

/** 1.2 minutes per question (the agreed 50 questions in 60 minutes), rounded up to a multiple of 5. No cap. */
export const TIMING = { perQuestionTenths: 12, roundToMin: 5 };
export const MODEL_MIN_QUESTIONS = 15;
export const CUSTOM = { counts: [10, 25, 50, 75, 100], minutes: [30, 60, 90, 120], maxQuestions: 100 };
export const LIMITS = { minSeconds: 300, maxSeconds: 4 * 3600, maxQuestions: 120, labelChars: 120 };
export const GUIDE_LABEL = 'الدليل العربي الشامل';
export const KINDS = ['model', 'custom', 'topic'];
export const ALERT_MINUTES = [10, 5, 1];

/** The setup tab that builds exams of this kind (used by "back" and "new exam in the same section"). */
export const setupTabFor = (kind) => (kind === 'model' ? 'models' : kind === 'topic' ? 'topic' : 'custom');

const SPEC_ORDER = SPECIALTIES.map((s) => s.key);

/** Integer arithmetic on purpose: n * 1.2 / 5 in floating point can land a hair above an integer. */
export function minutesFor(n) {
  if (!Number.isInteger(n) || n < 1) return 0;
  return Math.ceil((n * TIMING.perQuestionTenths) / (10 * TIMING.roundToMin)) * TIMING.roundToMin;
}

const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * One ready-made exam per (specialty, source paper) with at least MODEL_MIN_QUESTIONS verified questions.
 * Papers whose verified question sets are identical (copies of one exam) become one model.
 * A question counts once per paper even when two files share the same paper label.
 */
export function examModels(bank) {
  const sets = new Map(); // `${spec}\u0000${paper}` -> { spec, paper, ids:Set, fam:Set }
  for (const q of bank) {
    if (q.status !== 'verified' || !Array.isArray(q.sources)) continue;
    for (const paper of new Set(q.sources)) {
      const k = `${q.specialty}\u0000${paper}`;
      if (!sets.has(k)) sets.set(k, { spec: q.specialty, paper, ids: new Set(), fam: new Set(), list: [] });
      const e = sets.get(k);
      const fam = q.family || q.id;
      if (e.fam.has(fam)) continue;
      e.fam.add(fam);
      e.ids.add(q.id);
      e.list.push(q.id);
    }
  }
  const groups = new Map(); // spec + sorted ids -> papers
  for (const e of sets.values()) {
    if (e.ids.size < MODEL_MIN_QUESTIONS) continue;
    const k = e.spec + '\u0000' + [...e.ids].sort().join(',');
    if (!groups.has(k)) groups.set(k, { spec: e.spec, ids: e.list.slice().sort(), papers: [] });
    groups.get(k).papers.push(e.paper);
  }
  const out = [];
  for (const g of groups.values()) {
    const papers = g.papers.slice().sort((a, b) => a.length - b.length || byCodepoint(a, b));
    out.push({
      key: `${g.spec}:${papers[0]}`,
      spec: g.spec,
      title: papers[0],
      copies: papers.slice(1),
      guide: papers[0] === GUIDE_LABEL,
      n: g.ids.length,
      minutes: minutesFor(g.ids.length),
      ids: g.ids,
    });
  }
  out.sort((a, b) => SPEC_ORDER.indexOf(a.spec) - SPEC_ORDER.indexOf(b.spec) || b.n - a.n || byCodepoint(a.title, b.title));
  return out;
}

/** What a saved/selected exam looks like before it starts. Returns null when it cannot be built. */
export function modelPlan(model, rng = defaultRng) {
  if (!model || !Array.isArray(model.ids) || model.ids.length === 0) return null;
  return { kind: 'model', spec: model.spec, label: model.title, ids: shuffle(model.ids, rng), limit: minutesFor(model.ids.length) * 60 };
}

/** spec: a specialty key or 'all'. count: 1..100 (capped by what exists). minutes: 'auto' or 5..240. */
export function customPlan(bank, { spec, count, minutes = 'auto' }, rng = defaultRng) {
  if (spec !== 'all' && !SPEC_ORDER.includes(spec)) return null;
  if (!Number.isInteger(count) || count < 1 || count > CUSTOM.maxQuestions) return null;
  const pool = examPool(bank, spec);
  const n = Math.min(count, pool.length);
  if (n === 0) return null;
  let mins;
  if (minutes === 'auto') mins = minutesFor(n);
  else if (Number.isInteger(minutes) && minutes >= 5 && minutes <= 240) mins = minutes;
  else return null;
  const ids = shuffle(pool, rng).slice(0, n).map((q) => q.id);
  return { kind: 'custom', spec, label: 'اختبار مخصّص', ids, limit: mins * 60 };
}

/** Alert thresholds that make sense for this exam length (never at or above the whole limit). */
export function alertSeconds(limitSec) {
  return ALERT_MINUTES.map((m) => m * 60).filter((s) => s < limitSec);
}

export function alertText(seconds) {
  const m = Math.round(seconds / 60);
  return m === 1 ? 'متبقٍ دقيقة واحدة' : `متبقٍ ${m} دقائق`;
}
