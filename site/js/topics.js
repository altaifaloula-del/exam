// Exam by topic (pure: no DOM, no storage). The topic of every question comes from data/topics.json
// (AI classification into the 13 user-approved topics; no physician reviewed it).
import { SPECIALTIES, defaultRng, examPool, shuffle } from './logic.js';
import { CUSTOM, minutesFor } from './plan.js';

export const TOPIC_COUNT = 13;
const SPEC_KEYS = new Set(SPECIALTIES.map((s) => s.key));
const isText = (v) => typeof v === 'string' && v.trim() !== '' && v.length <= 120;

/**
 * Untrusted input (a fetched file): returns { list, map } or null.
 * Requires the 13 topics numbered 1..13 and a topic for EVERY verified question, because a verified question
 * without a topic would silently never appear in a topic exam.
 */
export function validateTopics(data, bank) {
  if (!data || typeof data !== 'object' || data.v !== 1) return null;
  if (!Array.isArray(data.topics) || data.topics.length !== TOPIC_COUNT) return null;
  const list = [];
  for (let i = 0; i < TOPIC_COUNT; i++) {
    const t = data.topics[i];
    if (!t || t.n !== i + 1 || !isText(t.ar) || !isText(t.en)) return null;
    list.push({ n: t.n, ar: t.ar.trim(), en: t.en.trim() });
  }
  if (!data.map || typeof data.map !== 'object' || Array.isArray(data.map)) return null;
  const map = new Map();
  for (const [id, n] of Object.entries(data.map)) {
    if (!Number.isInteger(n) || n < 1 || n > TOPIC_COUNT) return null;
    map.set(id, n);
  }
  for (const q of bank) if (q.status === 'verified' && !map.has(q.id)) return null;
  return { list, map };
}

/** Available (verified, one per family) questions per topic number for a specialty: Map n -> count. */
export function topicCounts(bank, topics, spec) {
  const counts = new Map();
  for (const q of examPool(bank, spec)) {
    const n = topics.map.get(q.id);
    if (n) counts.set(n, (counts.get(n) || 0) + 1);
  }
  return counts;
}

export function topicPool(bank, topics, spec, selected) {
  const want = new Set(selected);
  return examPool(bank, spec).filter((q) => want.has(topics.map.get(q.id)));
}

/** Short label shown on the exam and the result. */
export function topicLabel(topics, selected) {
  const names = topics.list.filter((t) => selected.includes(t.n)).map((t) => t.ar);
  return names.length === 1 ? names[0] : `${names.length} مواضيع مختارة`;
}

/** selected: array of topic numbers. count: 1..100 (capped by the pool). minutes: 'auto' or 5..240. */
export function topicPlan(bank, topics, { spec, selected, count, minutes = 'auto' }, rng = defaultRng) {
  if (!topics || !(spec === 'all' || SPEC_KEYS.has(spec))) return null;
  if (!Array.isArray(selected) || selected.length === 0) return null;
  const sel = [...new Set(selected)];
  if (!sel.every((n) => Number.isInteger(n) && n >= 1 && n <= TOPIC_COUNT)) return null;
  if (!Number.isInteger(count) || count < 1 || count > CUSTOM.maxQuestions) return null;
  const pool = topicPool(bank, topics, spec, sel);
  const n = Math.min(count, pool.length);
  if (n === 0) return null;
  let mins;
  if (minutes === 'auto') mins = minutesFor(n);
  else if (Number.isInteger(minutes) && minutes >= 5 && minutes <= 240) mins = minutes;
  else return null;
  return { kind: 'topic', spec, label: topicLabel(topics, sel), ids: shuffle(pool, rng).slice(0, n).map((q) => q.id), limit: mins * 60 };
}
