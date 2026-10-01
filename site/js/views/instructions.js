// The "exam hall" briefing: rules, optional full screen, then start. The clock starts only when the user presses start.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { formatClock, questionsPhrase, specialtyName } from '../logic.js';
import { alertSeconds, setupTabFor } from '../plan.js';
import { page } from './layout.js';

export function renderInstructions(ctx) {
  const plan = ctx.pending;
  if (!plan) { ctx.go('home'); return; }
  let fullscreen = false;
  const canFs = typeof document.fullscreenEnabled === 'boolean' && document.fullscreenEnabled;
  const alerts = alertSeconds(plan.limit).map((s) => s / 60);
  const alertLine = alerts.length ? `تنبيه مرئي عند بقاء ${alerts.join(' و')} دقيقة${plan.essay ? ' (وبالمثل في القسم المقالي بحسب طوله)' : ''}.` : 'المدة قصيرة فلا تنبيهات وسطية.';
  const e = plan.essay;
  const essayMin = e ? Math.round(e.limit / 60) : 0;
  const essayN = e ? (e.ids.length === 2 ? 'سؤالان' : `${e.ids.length} أسئلة`) : '';

  page(ctx, { actions: [h('button', { type: 'button', class: 'btn small', onclick: () => ctx.go('setup', { tab: setupTabFor(plan.kind), spec: plan.spec }) }, 'رجوع')] },
    h('h1', { class: 'page-title', tabindex: '-1', 'data-focus': '' }, 'تعليمات قبل البدء'),
    h('div', { class: 'card panel-set' },
      h('div', null,
        h('b', null, plan.label),
        h('p', { class: 'muted' }, `${specialtyName(plan.spec)} · ${questionsPhrase(plan.ids.length)} · ${Math.round(plan.limit / 60)} دقيقة (${formatClock(plan.limit)})`),
        e ? h('p', { class: 'muted' }, `ثم قسم مقالي: ${essayN} · ${essayMin} دقيقة (${formatClock(e.limit)})`) : null),
      h('ul', { class: 'rules' },
        h('li', null, 'المؤقّت يعمل بالساعة الفعلية، ويستمر لو خرجت من الصفحة أو أعدت تحميلها.'),
        h('li', null, alertLine),
        h('li', null, 'لا تظهر الإجابات الصحيحة ولا الشرح إلا بعد التسليم.'),
        h('li', null, 'يمكنك الرجوع إلى أي سؤال وتعليمه للمراجعة، وقبل التسليم تظهر لك شاشة مراجعة.'),
        e ? h('li', null, 'القسم الأول: أسئلة الاختيار من متعدد بمؤقّته. عند إنهائه أو انتهاء وقته يبدأ القسم المقالي تلقائيًا بمؤقّته الخاص، ولا رجوع إلى القسم الأول.')
          : h('li', null, 'عند انتهاء الوقت يُسلَّم الاختبار تلقائيًا بما أجبت عنه.'),
        e ? h('li', null, 'القسم المقالي: تكتب إجاباتك، ثم تقارنها بالإجابة النموذجية وتصحّح نفسك بتعليم النقاط الأساسية التي غطّيتها. درجته ذاتية ومنفصلة ولا تُجمع مع درجة الاختيار من متعدد. نصوص إجاباتك لا تبقى في المتصفح بعد عرض النتيجة.') : null,
        e ? h('li', null, 'الإجابات النموذجية مسوّدات كتبها الذكاء الاصطناعي من مواد البنك ولم يراجعها طبيب.') : null,
        h('li', null, 'أسئلة الاختبار من المحقَّق منها فقط، ولا توجد درجة نجاح رسمية: النسبة لمقارنة مستواك بين محاولاتك.')),
      canFs ? h('label', { class: 'check' },
        h('input', { type: 'checkbox', id: 'fs', onchange: (e) => { fullscreen = e.target.checked; } }),
        h('span', { class: 'frow' }, icon('expand'), 'ملء الشاشة أثناء الاختبار (اختياري)')) : null),
    h('div', { class: 'summary' },
      h('span'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => ctx.beginExam({ fullscreen }) }, icon('exam'), 'ابدأ الاختبار')));
}
