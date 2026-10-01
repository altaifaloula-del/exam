// Page frame shared by every view: the navy "sign" bar on top, then a centred content column.
import { h, mount } from '../dom.js';
import { icon } from '../icons.js';
import { specialtyName } from '../logic.js';
import { validateExam } from '../exam-state.js';

/** bar: { ctxText?: string, actions?: Node[] } */
export function page(ctx, bar, ...content) {
  const top = h('header', { class: 'top' },
    h('div', { class: 'in' },
      h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, icon('shield')), 'بنك المزاولة'),
      h('div', { class: 'acts' }, bar && bar.ctxText ? h('span', { class: 'ctx', 'aria-hidden': 'true' }, bar.ctxText) : null, ...((bar && bar.actions) || []))));
  mount(ctx.root, top, h('div', { class: 'wrap' }, content));
}

export function homeButton(ctx) {
  return h('button', { type: 'button', class: 'btn small', onclick: () => ctx.go('home') }, icon('home'), 'الرئيسية');
}

/** Card offered whenever an unfinished exam exists: its clock keeps running, so it must be resumed or cancelled first. */
export function resumeCard(ctx) {
  const saved = validateExam(ctx.store.get('exam'), ctx.bank, ctx.essay);
  if (!saved) return null;
  const what = saved.phase === 'grade' ? 'وصل إلى التصحيح الذاتي للمقالي' : 'الوقت يُحسب من بدايته';
  return h('div', { class: 'card resume' },
    h('p', null, `لديك اختبار غير منتهٍ: ${saved.label} (${specialtyName(saved.spec)}). ${what}، وعليك إنهاؤه أو إلغاؤه قبل بدء اختبار جديد.`),
    h('div', { class: 'frow' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => ctx.go('exam') }, 'متابعة الاختبار'),
      h('button', { type: 'button', class: 'btn danger', onclick: () => { ctx.store.remove('exam'); ctx.go('home'); } }, 'إلغاؤه')));
}
