// Essay section (pure: no DOM, no storage). Essays are AI-written drafts built from the bank's verified questions;
// the learner answers in writing, then grades themselves by ticking the key points they covered.
import { SPECIALTIES, defaultRng, safeHttpsUrl, shuffle } from './logic.js';

export const ESSAY = { counts: [2, 3, 5], minutesPer: 7, maxAnswerChars: 4000, minSeconds: 120, maxSeconds: 7200, maxQuestions: 5 };
const SPEC_KEYS = new Set(SPECIALTIES.map((s) => s.key));
const ID = /^E\d{3}$/;
const text = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;

/** Essay time is proportional to the number of questions (7 minutes each), never a guess per exam. */
export function essayMinutes(n) {
  return Number.isInteger(n) && n >= 1 && n <= ESSAY.maxQuestions ? n * ESSAY.minutesPer : 0;
}

/**
 * Untrusted input (a fetched file): returns { items, byId } or null when anything is wrong.
 * Every source id must be a real bank question and every reference an https URL.
 */
export function validateEssay(data, bank) {
  if (!data || typeof data !== 'object' || data.v !== 1 || !Array.isArray(data.items) || data.items.length === 0) return null;
  const bankIds = new Set(bank.map((q) => q.id));
  const items = [];
  const seen = new Set();
  for (const it of data.items) {
    if (!it || typeof it !== 'object' || !ID.test(it.id) || seen.has(it.id)) return null;
    if (!SPEC_KEYS.has(it.spec) || !Number.isInteger(it.topic) || it.topic < 1 || it.topic > 13) return null;
    if (!text(it.q, 400) || !text(it.model, 1600)) return null;
    if (!Array.isArray(it.points) || it.points.length < 3 || it.points.length > 7 || !it.points.every((p) => text(p, 320))) return null;
    if (!Array.isArray(it.refs) || it.refs.length === 0) return null;
    const refs = it.refs.map((r) => (r && text(r.title, 200) && safeHttpsUrl(r.url) ? { title: r.title.trim(), url: safeHttpsUrl(r.url) } : null));
    if (refs.includes(null)) return null;
    if (!Array.isArray(it.from) || it.from.length < 2 || !it.from.every((id) => bankIds.has(id))) return null;
    seen.add(it.id);
    items.push({ id: it.id, spec: it.spec, topic: it.topic, q: it.q.trim(), model: it.model.trim(), points: it.points.map((p) => p.trim()), refs, from: it.from.slice() });
  }
  return { items, byId: new Map(items.map((i) => [i.id, i])) };
}

/** Essays available for a specialty ('all' = every one), optionally limited to some topic numbers. */
export function essayPool(essay, spec, topics = null) {
  if (!essay) return [];
  const want = topics ? new Set(topics) : null;
  return essay.items.filter((e) => (spec === 'all' || e.spec === spec) && (!want || want.has(e.topic)));
}

/** Returns a copy of the exam plan with its essay section, or null when that many essays are not available. */
export function attachEssay(plan, essay, { count, topics = null }, rng = defaultRng) {
  if (!plan || !essay || !ESSAY.counts.includes(count)) return null;
  const pool = essayPool(essay, plan.spec, topics);
  if (pool.length < count) return null;
  const ids = shuffle(pool, rng).slice(0, count).map((e) => e.id);
  return { ...plan, essay: { ids, limit: essayMinutes(count) * 60 } };
}
