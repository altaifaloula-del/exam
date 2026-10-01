import { h, safeLink } from '../dom.js';
import { formatClock, specialtyName } from '../logic.js';
import { validateResult } from '../exam-state.js';
import { setupTabFor } from '../plan.js';
import { ESSAY_DRAFT_NOTE, answerText, questionText, revealPanel } from './parts.js';
import { homeButton, page } from './layout.js';

function when(ms) {
  try {
    return new Date(ms).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

/** Essay part of a result: its own score (self-graded) and, per question, the model answer to re-read. */
function essayCard(ctx, e) {
  const byId = ctx.essay ? ctx.essay.byId : null;
  return h('div', { class: 'card resultcard' },
    h('h2', { class: 'h3' }, 'القسم المقالي (تصحيح ذاتي)'),
    h('div', { class: 'score', 'aria-label': `${e.got} من ${e.total} نقطة، ${e.percent} بالمئة` }, `${e.got}/${e.total}`),
    h('p', null, h('b', { class: 'mono' }, e.percent + '%'), ` من النقاط الأساسية — الزمن المستغرق ${formatClock(e.elapsed)} من ${formatClock(e.limit)}`),
    h('p', { class: 'notice' }, 'درجة المقالي ذاتية ومنفصلة، ولا تُجمع مع درجة الاختيار من متعدد. ' + ESSAY_DRAFT_NOTE),
    h('div', { class: 'list' }, e.items.map((it, k) => {
      const item = byId ? byId.get(it.id) : null;
      return h('article', { class: 'ritem ' + (it.got === it.total ? 'ok' : it.got === 0 ? 'no' : 'unans') },
        h('div', { class: 'qmeta' }, h('span', { class: 'mono' }, `#${k + 1}`), h('span', null, 'نقاطك: ', h('b', { class: 'mono' }, it.got), ' من ', h('span', { class: 'mono' }, it.total))),
        h('p', { class: 'qtext', lang: 'ar' }, item ? item.q : 'تعذّر تحميل نص هذا السؤال المقالي.'),
        item ? h('details', null, h('summary', null, 'الإجابة النموذجية والنقاط والمراجع'),
          h('div', { class: 'reveal' },
            h('p', { class: 'model-ans', lang: 'ar' }, item.model),
            h('ul', { class: 'rules' }, item.points.map((p) => h('li', null, p))),
            h('div', { class: 'refs' }, item.refs.map((r) => safeLink(r.url, r.title))))) : null);
    })));
}

export function renderResults(ctx) {
  const { bank, store } = ctx;
  const r = validateResult(store.get('result'), bank);
  if (!r) { ctx.go('home'); return; }
  const byId = new Map(bank.map((q) => [q.id, q]));
  let onlyMiss = r.missIds.length > 0;
  // A paper title that already names the specialty ("مساعد طبيب (104 أسئلة)") is not followed by the same name again.
  const specName = specialtyName(r.spec);
  const meta = [r.label, r.label && r.label.includes(specName) ? null : specName, when(r.finishedAt)].filter(Boolean).join(' — ');

  function draw() {
    const rows = r.items.filter((it) => !onlyMiss || r.missIds.includes(it.id));
    const chip = (label, pressed, on) => h('button', { type: 'button', class: 'chip', 'aria-pressed': pressed ? 'true' : 'false', onclick: on }, label);

    const list = rows.map((it) => {
      const q = byId.get(it.id);
      const picked = it.picked;
      const cls = picked == null ? 'unans' : picked === q.answer ? 'ok' : 'no';
      const tag = picked == null ? 'بلا إجابة' : picked === q.answer ? 'صحيحة' : 'خاطئة';
      const pos = r.items.indexOf(it) + 1;
      return h('article', { class: 'ritem ' + cls },
        h('div', { class: 'qmeta' }, h('span', { class: 'mono' }, `#${pos}`), h('span', null, tag)),
        questionText(q),
        h('p', null, h('span', { class: 'muted' }, 'إجابتك: '), answerText(q, picked)),
        picked === q.answer ? null : h('p', null, h('span', { class: 'muted' }, 'الصحيحة: '), answerText(q, q.answer)),
        h('details', null, h('summary', null, 'الشرح والمراجع'), revealPanel(q, picked, { verdictLine: false })));
    });

    page(ctx, { actions: [homeButton(ctx)] },
      h('h1', { class: 'page-title', tabindex: '-1', 'data-focus': '' }, 'نتيجة الاختبار'),
      h('div', { class: 'card resultcard' },
        r.essay ? h('h2', { class: 'h3' }, 'الاختيار من متعدد') : null,
        h('p', { class: 'muted' }, meta),
        h('div', { class: 'score', 'aria-label': `${r.correct} من ${r.total}، ${r.percent} بالمئة` }, `${r.correct}/${r.total}`),
        h('p', null, h('b', { class: 'mono' }, r.percent + '%'), ` — الزمن المستغرق ${formatClock(r.elapsed)} من ${formatClock(r.limit)}`),
        h('div', { class: 'rgrid' },
          h('div', { class: 'rbox good' }, h('b', null, r.correct), 'صحيحة'),
          h('div', { class: 'rbox bad' }, h('b', null, r.wrong), 'خاطئة'),
          h('div', { class: 'rbox' }, h('b', null, r.unanswered), 'بلا إجابة')),
        h('p', { class: 'notice' }, 'لا توجد درجة نجاح رسمية هنا؛ النسبة لمقارنة مستواك بين محاولاتك فقط. الاختبار يضم أسئلة المحقَّق منها فقط.'),
        h('div', { class: 'frow' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => ctx.go('setup', { tab: setupTabFor(r.kind), spec: r.spec }) }, 'اختبار جديد في القسم نفسه'),
          r.missIds.length ? h('button', { type: 'button', class: 'btn', onclick: () => ctx.go('review', { spec: 'all', onlyWrong: true }) }, 'راجع أخطائي في وضع المراجعة') : null)),
      r.essay ? essayCard(ctx, r.essay) : null,
      h('div', { class: 'frow', role: 'group', 'aria-label': 'عرض الأسئلة' },
        chip(`الأخطاء وما لم يُجب (${r.missIds.length})`, onlyMiss, () => { onlyMiss = true; draw(); }),
        chip(`كل الأسئلة (${r.items.length})`, !onlyMiss, () => { onlyMiss = false; draw(); })),
      rows.length ? h('div', { class: 'list' }, list) : h('div', { class: 'card' }, h('p', null, 'أجبت عن كل الأسئلة إجابة صحيحة.')));
  }
  draw();
}
