// Pure logic: no DOM, no storage. Everything here is unit-tested (tests/logic.test.mjs).

export const SPECIALTIES = [
  { key: 'assistant', name: 'مساعد طبيب' },
  { key: 'nursing', name: 'تمريض' },
  { key: 'midwifery', name: 'قبالة' },
  { key: 'dental', name: 'أسنان' },
];
export const EXAM = { count: 50, seconds: 3600 };

const PLACEHOLDER = /^[\s.\u2026?\u061f\u2022\-_]*$/;
const STATUSES = ['verified', 'tentative'];
const SPEC_KEYS = SPECIALTIES.map((s) => s.key);

export function specialtyName(key) {
  if (key === 'all') return 'كل الأقسام';
  const s = SPECIALTIES.find((x) => x.key === key);
  return s ? s.name : key;
}

/** https-only URL or null. Used for every outbound link. */
export function safeHttpsUrl(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Returns a list of human-readable problems for one question (empty list = valid). */
export function questionProblems(q) {
  const p = [];
  if (!q || typeof q !== 'object') return ['not an object'];
  if (typeof q.id !== 'string' || !q.id) p.push('id');
  if (!SPEC_KEYS.includes(q.specialty)) p.push('specialty');
  if (q.type !== 'mcq' && q.type !== 'tf') p.push('type');
  if (typeof q.q !== 'string' || !q.q.trim()) p.push('q');
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.some((o) => typeof o !== 'string' || PLACEHOLDER.test(o))) p.push('options');
  if (!STATUSES.includes(q.status)) p.push('status');
  if (q.answer != null && !(Number.isInteger(q.answer) && Array.isArray(q.options) && q.answer >= 0 && q.answer < q.options.length)) p.push('answer range');
  if (q.answer == null) p.push('answer missing');
  if (q.status === 'verified') {
    if (!Array.isArray(q.refs) || q.refs.length === 0) p.push('verified without refs');
    else if (!q.refs.some((r) => safeHttpsUrl(r && r.url))) p.push('verified without https ref');
    if (q.confidence !== 'high' && q.confidence !== 'medium') p.push('verified confidence');
  }
  return p;
}

/** Validates the whole bank payload; never throws. */
export function validateBank(data) {
  const errors = [];
  if (!data || !Array.isArray(data.questions)) return { ok: false, errors: ['questions missing'], questions: [] };
  const seen = new Set();
  const good = [];
  for (const q of data.questions) {
    const problems = questionProblems(q);
    if (seen.has(q && q.id)) problems.push('duplicate id');
    if (problems.length) errors.push(`${q && q.id}: ${problems.join(', ')}`);
    else { seen.add(q.id); good.push(q); }
  }
  return { ok: errors.length === 0, errors, questions: good };
}

/** Crypto-backed random in [0,1). Injectable in tests. */
export function defaultRng() {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

/** Seeded RNG (mulberry32) for deterministic tests. */
export function seededRng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = defaultRng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Exam pool: verified only, one question per family, optionally one specialty. */
export function examPool(bank, spec) {
  const seen = new Set();
  const out = [];
  for (const q of bank) {
    if (q.status !== 'verified') continue;
    if (spec !== 'all' && q.specialty !== spec) continue;
    const fam = q.family || q.id;
    if (seen.has(fam)) continue;
    seen.add(fam);
    out.push(q);
  }
  return out;
}

export function pickExam(bank, spec, rng = defaultRng, count = EXAM.count) {
  return shuffle(examPool(bank, spec), rng).slice(0, count).map((q) => q.id);
}

/** answers: { [id]: optionIndex }. Only verified questions count toward the score. */
export function score(questions, answers) {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  for (const q of questions) {
    if (q.status !== 'verified') continue;
    const a = answers[q.id];
    if (a == null) unanswered++;
    else if (a === q.answer) correct++;
    else wrong++;
  }
  const total = correct + wrong + unanswered;
  return { correct, wrong, unanswered, total, percent: total ? Math.round((correct / total) * 100) : 0 };
}

/** Seconds left, never negative; based on wall-clock so background tabs stay accurate. */
export function remaining(startMs, nowMs, limitSec = EXAM.seconds) {
  return Math.max(0, limitSec - Math.floor((nowMs - startMs) / 1000));
}

/** Arabic counted noun: 1 → one, 2 → two, 3–10 → plural, 11+ → singular accusative ("10 أسئلة" but "11 سؤالًا"). */
export function countPhrase(n, [one, two, few, many]) {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${n >= 3 && n <= 10 ? few : many}`;
}
export const questionsPhrase = (n) => countPhrase(n, ['سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالًا']);
export const essaysPhrase = (n) => countPhrase(n, ['سؤال مقالي واحد', 'سؤالان مقاليان', 'أسئلة مقالية', 'سؤالًا مقاليًا']);

export function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

/** Review filter. text matches question or options (case-insensitive). */
export function filterReview(bank, { spec = 'all', status = 'all', type = 'all', text = '' } = {}) {
  const t = text.trim().toLowerCase();
  return bank.filter((q) => {
    if (spec !== 'all' && q.specialty !== spec) return false;
    if (status !== 'all' && q.status !== status) return false;
    if (type !== 'all' && q.type !== type) return false;
    if (t && !(q.q.toLowerCase().includes(t) || q.options.some((o) => o.toLowerCase().includes(t)))) return false;
    return true;
  });
}

export function countBy(bank) {
  const out = {};
  for (const s of SPEC_KEYS) out[s] = { verified: 0, tentative: 0 };
  for (const q of bank) if (out[q.specialty]) out[q.specialty][q.status]++;
  return out;
}

export function optionLabel(q, k) {
  if (q.type === 'tf') return k === 0 ? 'صح' : 'خطأ';
  return ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز'][k] || String(k + 1);
}

/** Text direction for content: Latin-heavy strings render left-to-right. */
export function isLatin(s) {
  return /[A-Za-z]/.test(s) && !/[؀-ۿ]/.test(s);
}
