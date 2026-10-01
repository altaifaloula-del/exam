// Shared question UI pieces (review, exam, results).
import { h, safeLink } from '../dom.js';
import { isLatin, optionLabel } from '../logic.js';

export function statusBadge(q) {
  if (q.status !== 'verified') return h('span', { class: 'badge tent' }, 'غير مؤكد');
  return h('span', { class: 'badge' }, q.confidence === 'high' ? 'محقَّق · ثقة عالية' : 'محقَّق · ثقة متوسطة');
}

export function tierText(q) {
  if (q.ref_tier === 'strong') return 'مرجع موثوق';
  if (q.ref_tier === 'general') return 'مراجع عامة فقط';
  return 'بلا مرجع';
}

/** Question stem plus its Arabic rendering when the bank carries one. focusable: target for focus moves. */
export function questionText(q, { focusable = false } = {}) {
  const sub = q.q_ar && q.q_ar !== q.q ? h('p', { class: 'qtext sub', lang: 'ar' }, q.q_ar) : null;
  return h('div', { class: 'qblock', tabindex: focusable ? '-1' : null, 'data-q': focusable ? '' : null },
    h('p', { class: 'qtext' + (isLatin(q.q) ? ' ltr' : ''), lang: isLatin(q.q) ? 'en' : 'ar' }, q.q), sub);
}

/** reveal: show right/wrong marking. onPick may be null (read-only). */
export function optionsEl(q, { picked, reveal, onPick }) {
  return h('div', { class: 'opts', role: 'radiogroup', 'aria-label': 'الخيارات' },
    q.options.map((o, k) => {
      let cls = 'opt' + (isLatin(o) ? ' ltr' : '');
      let hint = null;
      if (reveal && k === q.answer) { cls += ' right'; hint = h('span', { class: 'sr-only' }, ' (الإجابة الصحيحة)'); }
      else if (reveal && k === picked) { cls += ' wrong'; hint = h('span', { class: 'sr-only' }, ' (إجابتك)'); }
      return h('button', {
        type: 'button', class: cls, role: 'radio', 'aria-checked': picked === k ? 'true' : 'false',
        disabled: !onPick ? true : false, onclick: onPick ? () => onPick(k) : null,
      }, h('span', { class: 'l', 'aria-hidden': 'true' }, optionLabel(q, k)), h('span', { class: 't' }, o, hint));
    }));
}

export function answerText(q, k) {
  if (k == null) return 'لم تُجب';
  return `${optionLabel(q, k)}. ${q.options[k]}`;
}

/** Explanation, references and provenance. */
export function revealPanel(q, picked, { verdictLine = true } = {}) {
  const tent = q.status !== 'verified';
  let verdict;
  if (tent) verdict = 'إجابة مرجّحة وغير مؤكدة. لا تعتمد عليها وحدها.';
  else if (picked == null) verdict = 'الإجابة الصحيحة: ' + answerText(q, q.answer);
  else verdict = picked === q.answer ? 'إجابتك صحيحة.' : 'الإجابة الصحيحة: ' + answerText(q, q.answer);
  const refs = (q.refs || []).map((r) => safeLink(r.url, r.title || r.url));
  return h('div', { class: 'reveal', role: 'status' },
    verdictLine ? h('p', { class: 'verdict' }, verdict) : null,
    q.note_ar ? h('p', { class: 'note' }, q.note_ar) : null,
    q.agrees_with_source === false ? h('p', { class: 'notice' }, 'المصدر الأصلي علّم إجابة مختلفة، والمراجع لا تؤيدها.') : null,
    h('div', { class: 'refs' }, refs, h('span', { class: 'tier' }, tierText(q))),
    q.sources && q.sources.length ? h('p', { class: 'muted' }, 'ورد في: ' + q.sources.join('، ')) : null);
}

/** Essay model answers are AI drafts built from the bank's verified questions; they must always be labelled as such. */
export const ESSAY_DRAFT_BADGE = 'مسوّدة آلية';
export const ESSAY_DRAFT_NOTE = 'الإجابات النموذجية مسوّدات كتبها الذكاء الاصطناعي من مواد البنك ولم يراجعها طبيب. اعتمد المراجع المذكورة معها.';
