// Pure exam-session logic (no DOM, no storage). Persisted state is UNTRUSTED (localStorage can be
// edited or stale), so every read goes through validateExam / validateResult.
import { EXAM, SPECIALTIES, score } from './logic.js';
import { KINDS, LIMITS } from './plan.js';
import { ESSAY } from './essay.js';

const SPEC_KEYS = new Set(['all', ...SPECIALTIES.map((s) => s.key)]);
const isInt = Number.isInteger;
const LEGACY_LABEL = 'اختبار مخصّص';

/** plan: { kind, spec, label, ids, limit } from plan.js. Returns a fresh state, or null when the plan is unusable. */
export function newExam(plan, now) {
  if (!plan || !KINDS.includes(plan.kind) || !SPEC_KEYS.has(plan.spec)) return null;
  if (!Array.isArray(plan.ids) || plan.ids.length === 0) return null;
  const state = {
    v: 2, kind: plan.kind, spec: plan.spec, label: plan.label, ids: plan.ids.slice(),
    answers: {}, flags: [], cur: 0, start: now, limit: plan.limit, phase: 'mcq',
  };
  // Optional essay section: it runs after the multiple-choice section, with its own clock that starts when that section ends.
  if (plan.essay) state.essay = { ids: plan.essay.ids.slice(), limit: plan.essay.limit, start: null, end: null, answers: {}, checks: {} };
  return state;
}

function cleanLabel(l) {
  return typeof l === 'string' && l.trim() && l.length <= LIMITS.labelChars ? l.trim() : null;
}

/**
 * Returns a clean v2 state or null when the stored value cannot be trusted.
 * v1 (the single 50-question/60-minute exam of the first release) is still accepted and upgraded in memory.
 */
export function validateExam(s, bank, essay = null) {
  if (!s || typeof s !== 'object' || (s.v !== 1 && s.v !== 2)) return null;
  const legacy = s.v === 1;
  if (!SPEC_KEYS.has(s.spec)) return null;
  const maxIds = legacy ? EXAM.count : LIMITS.maxQuestions;
  if (!Array.isArray(s.ids) || s.ids.length === 0 || s.ids.length > maxIds) return null;
  if (new Set(s.ids).size !== s.ids.length) return null;
  const byId = new Map(bank.map((q) => [q.id, q]));
  if (!s.ids.every((id) => typeof id === 'string' && byId.has(id) && byId.get(id).status === 'verified')) return null;
  const kind = legacy ? 'custom' : s.kind;
  if (!KINDS.includes(kind)) return null;
  const label = legacy ? LEGACY_LABEL : cleanLabel(s.label);
  if (!label) return null;
  if (!Number.isFinite(s.start)) return null;
  if (legacy ? s.limit !== EXAM.seconds : !(isInt(s.limit) && s.limit >= LIMITS.minSeconds && s.limit <= LIMITS.maxSeconds)) return null;
  if (!isInt(s.cur) || s.cur < 0 || s.cur >= s.ids.length) return null;
  if (!s.answers || typeof s.answers !== 'object' || Array.isArray(s.answers)) return null;
  const answers = {};
  for (const id of Object.keys(s.answers)) {
    const k = s.answers[id];
    const q = byId.get(id);
    if (!q || !s.ids.includes(id) || !isInt(k) || k < 0 || k >= q.options.length) return null;
    answers[id] = k;
  }
  const flags = Array.isArray(s.flags) ? s.flags.filter((id) => s.ids.includes(id)) : [];
  const sec = cleanEssaySection(s, essay, legacy);
  if (sec === null) return null;
  return { v: 2, kind, spec: s.spec, label, ids: s.ids.slice(), answers, flags, cur: s.cur, start: s.start, limit: s.limit, phase: sec.phase, mcqEnd: sec.mcqEnd, essay: sec.essay };
}

const PHASES = ['mcq', 'essay', 'grade'];
const isTime = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * The optional essay section of a saved exam. Returns { phase, mcqEnd, essay } (essay null when there is none)
 * or null when it cannot be trusted. Saved state is untrusted, like everything else read from storage.
 */
function cleanEssaySection(s, essay, legacy) {
  const none = { phase: 'mcq', mcqEnd: null, essay: null };
  if (legacy || s.essay == null) return s.phase == null || s.phase === 'mcq' ? none : null;
  const e = s.essay;
  if (!essay || typeof e !== 'object' || Array.isArray(e)) return null;
  if (!PHASES.includes(s.phase)) return null;
  if (!Array.isArray(e.ids) || e.ids.length === 0 || e.ids.length > ESSAY.maxQuestions || new Set(e.ids).size !== e.ids.length) return null;
  const items = e.ids.map((id) => (typeof id === 'string' ? essay.byId.get(id) : undefined));
  if (items.some((it) => !it || (s.spec !== 'all' && it.spec !== s.spec))) return null;
  if (!isInt(e.limit) || e.limit < ESSAY.minSeconds || e.limit > ESSAY.maxSeconds) return null;
  const started = s.phase !== 'mcq';
  if (started !== isTime(e.start) || (!started && e.start != null) || started !== isTime(s.mcqEnd)) return null;
  if ((s.phase === 'grade') !== isTime(e.end)) return null;
  if (!e.answers || typeof e.answers !== 'object' || Array.isArray(e.answers)) return null;
  const answers = {};
  for (const id of Object.keys(e.answers)) {
    const t = e.answers[id];
    if (!e.ids.includes(id) || typeof t !== 'string' || t.length > ESSAY.maxAnswerChars) return null;
    if (t !== '') answers[id] = t;
  }
  if (!e.checks || typeof e.checks !== 'object' || Array.isArray(e.checks)) return null;
  const checks = {};
  for (const id of Object.keys(e.checks)) {
    const c = e.checks[id];
    const item = essay.byId.get(id);
    if (!e.ids.includes(id) || !Array.isArray(c) || !c.every((k) => isInt(k) && k >= 0 && k < item.points.length) || new Set(c).size !== c.length) return null;
    if (c.length) checks[id] = c.slice().sort((a, b) => a - b);
  }
  return {
    phase: s.phase,
    mcqEnd: started ? s.mcqEnd : null,
    essay: { ids: e.ids.slice(), limit: e.limit, start: started ? e.start : null, end: s.phase === 'grade' ? e.end : null, answers, checks },
  };
}

const frozen = (state) => state.phase != null && state.phase !== 'mcq';

export function setAnswer(state, q, k) {
  if (frozen(state) || !state.ids.includes(q.id) || !isInt(k) || k < 0 || k >= q.options.length) return state;
  return { ...state, answers: { ...state.answers, [q.id]: k } };
}

export function toggleFlag(state, id) {
  if (frozen(state) || !state.ids.includes(id)) return state;
  const flags = state.flags.includes(id) ? state.flags.filter((x) => x !== id) : [...state.flags, id];
  return { ...state, flags };
}

export function goTo(state, i) {
  if (frozen(state) || !isInt(i) || i < 0 || i >= state.ids.length) return state;
  return { ...state, cur: i };
}

export function answeredCount(state) {
  return state.ids.filter((id) => state.answers[id] != null).length;
}

/**
 * End of the multiple-choice section: the essay clock starts at `at` and section 1 can no longer be changed.
 * `at` is "now" when the learner ends the section, or the section's deadline when its time ran out while they were away.
 */
export function startEssay(state, at) {
  if (!state.essay || state.phase !== 'mcq' || !isTime(at)) return state;
  return { ...state, phase: 'essay', mcqEnd: at, essay: { ...state.essay, start: at } };
}

/** End of the writing part: the learner now compares with the model answers and grades themselves. */
export function toGrade(state, at) {
  if (!state.essay || state.phase !== 'essay' || !isTime(at)) return state;
  return { ...state, phase: 'grade', essay: { ...state.essay, end: at } };
}

export function setEssayAnswer(state, id, text) {
  if (state.phase !== 'essay' || !state.essay.ids.includes(id) || typeof text !== 'string') return state;
  const answers = { ...state.essay.answers };
  const t = text.slice(0, ESSAY.maxAnswerChars);
  if (t === '') delete answers[id]; else answers[id] = t;
  return { ...state, essay: { ...state.essay, answers } };
}

/** item: the essay item (its points decide the valid range). Only while grading. */
export function toggleCheck(state, id, k, item) {
  if (state.phase !== 'grade' || !state.essay.ids.includes(id) || !item || !isInt(k) || k < 0 || k >= item.points.length) return state;
  const cur = state.essay.checks[id] || [];
  const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].sort((a, b) => a - b);
  const checks = { ...state.essay.checks };
  if (next.length) checks[id] = next; else delete checks[id];
  return { ...state, essay: { ...state.essay, checks } };
}

export function essayAnsweredCount(state) {
  return state.essay ? state.essay.ids.filter((id) => (state.essay.answers[id] || '').trim() !== '').length : 0;
}

/** Self-graded essay score: ticked key points / all key points. Separate from the multiple-choice score. */
export function essayScore(state, essayById) {
  const items = state.essay.ids.map((id) => {
    const total = essayById.get(id).points.length;
    return { id, got: Math.min(total, (state.essay.checks[id] || []).length), total };
  });
  const got = items.reduce((a, it) => a + it.got, 0);
  const total = items.reduce((a, it) => a + it.total, 0);
  return { items, got, total, percent: total ? Math.round((got / total) * 100) : 0 };
}

/** Final result. Only verified questions are in an exam, so every item counts. essayById is needed when the exam has essays. */
export function buildResult(state, bank, now, essayById = null) {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const qs = state.ids.map((id) => byId.get(id)).filter(Boolean);
  const s = score(qs, state.answers);
  const mcqEnd = state.mcqEnd ?? now;
  const elapsed = Math.min(state.limit, Math.max(0, Math.floor((mcqEnd - state.start) / 1000)));
  let essay = null;
  if (state.essay && essayById) {
    const e = essayScore(state, essayById);
    const end = state.essay.end ?? now;
    essay = { ...e, elapsed: Math.min(state.essay.limit, Math.max(0, Math.floor((end - state.essay.start) / 1000))), limit: state.essay.limit };
  }
  return {
    v: 1,
    essay,
    kind: state.kind,
    label: state.label,
    spec: state.spec,
    finishedAt: now,
    elapsed,
    limit: state.limit,
    ...s,
    items: qs.map((q) => ({ id: q.id, picked: state.answers[q.id] ?? null })),
    missIds: qs.filter((q) => state.answers[q.id] !== q.answer).map((q) => q.id),
  };
}

export function validateResult(r, bank) {
  if (!r || typeof r !== 'object' || r.v !== 1 || !SPEC_KEYS.has(r.spec)) return null;
  if (!Array.isArray(r.items) || !Array.isArray(r.missIds)) return null;
  const ids = new Set(bank.map((q) => q.id));
  const items = r.items.filter((it) => it && typeof it.id === 'string' && ids.has(it.id) && (it.picked === null || isInt(it.picked)));
  if (items.length === 0) return null;
  const nums = [r.correct, r.wrong, r.unanswered, r.total, r.percent, r.elapsed, r.finishedAt];
  if (!nums.every(Number.isFinite)) return null;
  const label = cleanLabel(r.label);
  const kind = KINDS.includes(r.kind) ? r.kind : null;
  return { ...r, kind, label, items, essay: cleanResultEssay(r.essay), missIds: r.missIds.filter((id) => typeof id === 'string' && ids.has(id)) };
}

/** The essay part of a saved result; a damaged one is dropped (the multiple-choice result stays usable). */
function cleanResultEssay(e) {
  if (!e || typeof e !== 'object' || !Array.isArray(e.items) || e.items.length === 0 || e.items.length > ESSAY.maxQuestions) return null;
  const items = [];
  for (const it of e.items) {
    if (!it || typeof it.id !== 'string' || !/^E\d{3}$/.test(it.id) || !isInt(it.got) || !isInt(it.total) || it.total < 1 || it.got < 0 || it.got > it.total) return null;
    items.push({ id: it.id, got: it.got, total: it.total });
  }
  if (!isTime(e.elapsed) || !isTime(e.limit) || e.elapsed < 0 || e.limit < 0) return null;
  const got = items.reduce((a, it) => a + it.got, 0);
  const total = items.reduce((a, it) => a + it.total, 0);
  return { items, got, total, percent: Math.round((got / total) * 100), elapsed: e.elapsed, limit: e.limit };
}

/** Saved "questions to revisit": strings that still exist in the bank. */
export function cleanWrong(list, bank) {
  if (!Array.isArray(list)) return [];
  const ids = new Set(bank.map((q) => q.id));
  return list.filter((id) => typeof id === 'string' && ids.has(id));
}

export function cleanLast(l) {
  if (!l || typeof l !== 'object') return null;
  const ok = [l.percent, l.correct, l.total].every(Number.isFinite);
  return ok ? { percent: l.percent, correct: l.correct, total: l.total } : null;
}
