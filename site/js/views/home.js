import { h } from '../dom.js';
import { icon } from '../icons.js';
import { SPECIALTIES, countBy } from '../logic.js';
import { resumeCard, page } from './layout.js';

export function renderHome(ctx) {
  const { bank, store } = ctx;
  const counts = countBy(bank);
  const verified = bank.filter((q) => q.status === 'verified').length;
  const wrong = store.get('wrong', []);
  const hasResult = store.get('result') != null;

  const signs = [...SPECIALTIES.map((s) => ({ ...s, c: counts[s.key] })), { key: 'all', name: 'كل الأقسام', c: { verified, tentative: bank.length - verified } }]
    .map((s) => h('a', { class: `sign s-${s.key}`, href: `#/setup/models/${s.key}` },
      h('span', { class: 'pg' }, icon(s.key)),
      h('span', { class: 'tx' }, h('b', null, s.name), h('span', null, `${s.c.verified} سؤالًا محقَّقًا · ${s.c.tentative} غير مؤكد`)),
      h('span', { class: 'ar' }, icon('fwd'))));

  const tool = (name, ic, href, off) => (href
    ? h('a', { class: 'tool', href }, icon(ic), h('span', null, name))
    : h('button', { type: 'button', class: 'tool', disabled: true }, icon(ic), h('span', null, name), h('span', { class: 'sr-only' }, ` (${off})`)));
  const tools = [
    tool('نماذج امتحانات', 'models', '#/setup/models/all'),
    tool('اختبار مخصّص', 'custom', '#/setup/custom/all'),
    ctx.features.topics ? tool('حسب الموضوع', 'topic', '#/setup/topic/all') : null,
    tool('مراجعة', 'review', '#/review/all'),
    tool('أخطائي', 'mistakes', wrong.length ? '#/review/all/wrong' : null, 'لا توجد أخطاء محفوظة'),
    tool('نتيجتي الأخيرة', 'stats', hasResult ? '#/results' : null, 'لا توجد نتيجة بعد'),
  ];

  page(ctx, null,
    h('div', { class: 'hero' },
      h('h1', { class: 'page-title', tabindex: '-1', 'data-focus': '' }, 'إلى أين تتجه اليوم؟'),
      h('p', { class: 'lead' }, ctx.features.essay
        ? 'اختر قسمك ثم نوع الاختبار: نموذج جاهز من ورقة سابقة، أو اختبار تحدّد أنت عدده ومدته. ويمكنك إضافة قسم مقالي إلى أي اختبار.'
        : 'اختر قسمك ثم نوع الاختبار: نموذج جاهز من ورقة سابقة، أو اختبار تحدّد أنت عدده ومدته.')),
    ctx.warning ? h('div', { class: 'notice warn', role: 'alert' }, ctx.warning) : null,
    resumeCard(ctx),
    h('div', { class: 'signs' }, signs),
    h('section', { 'aria-labelledby': 'tools-h' },
      h('div', { class: 'sec-h', id: 'tools-h' }, h('i', { 'aria-hidden': 'true' }), 'الأدوات'),
      h('div', { class: 'tools gap-top' }, tools)),
    h('div', { class: 'foot' },
      h('p', { class: 'notice' }, 'جُمعت الأسئلة من ملفات متداولة بين الطلاب، وراجعت المراجع الإجابات آليًا دون مراجعة طبيب. الأسئلة «غير المؤكدة» تظهر بعلامة في المراجعة ولا تدخل أي اختبار. لا تعتمد هذا البنك وحده للتحضير، وارجع إلى المراجع الدراسية المعتمدة.'),
      h('p', { class: store.persistent ? 'muted' : 'notice warn' }, store.persistent ? 'تُحفظ نتائجك في هذا المتصفح فقط ولا تُرسل إلى أي جهة.' : 'التخزين في المتصفح غير متاح: لن تُحفظ نتائجك بعد إغلاق الصفحة.')));
}
