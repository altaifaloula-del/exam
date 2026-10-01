import { h } from '../dom.js';
import { icon } from '../icons.js';
import { questionsPhrase, specialtyName } from '../logic.js';
import { answeredCount, goTo, setAnswer, startEssay, toggleFlag, validateExam } from '../exam-state.js';
import { optionsEl, questionText } from './parts.js';
import { page } from './layout.js';
import { createClock } from './clock.js';
import { submitExam } from './submit.js';
import { renderEssayGrade, renderEssayWrite } from './essay-exam.js';

/** The exam screen: section 1 (multiple choice) here; the essay sections live in essay-exam.js. */
export function renderExam(ctx) {
  const { bank, store } = ctx;
  let state = validateExam(store.get('exam'), bank, ctx.essay);
  if (!state) { ctx.go('home'); return; }
  if (state.phase === 'essay') { renderEssayWrite(ctx, state); return; }
  if (state.phase === 'grade') { renderEssayGrade(ctx, state); return; }

  const byId = new Map(bank.map((q) => [q.id, q]));
  const qs = state.ids.map((id) => byId.get(id));
  const essayMin = state.essay ? Math.round(state.essay.limit / 60) : 0;
  let reviewing = false;
  let finished = false;

  function save() { store.set('exam', state); }

  /** End of section 1. With essays it hands over to the essay section; the essay clock starts at the moment this section ended. */
  function finish(timeUp) {
    if (finished) return;
    finished = true;
    clock.stop();
    if (state.essay) {
      state = startEssay(state, timeUp ? state.start + state.limit * 1000 : Date.now());
      save();
      ctx.announce(timeUp ? 'انتهى وقت القسم الأول وبدأ القسم المقالي.' : 'بدأ القسم المقالي.');
      ctx.go('exam');
      return;
    }
    submitExam(ctx, state, { timeUp });
  }

  const clock = createClock(ctx, { start: state.start, limit: state.limit, onExpire: () => finish(true) });
  const notice = ctx.takeNotice();
  if (notice) clock.message(notice);
  if (clock.left() === 0) { finish(true); return; }
  clock.run();

  function jumpTo(k) { state = goTo(state, k); save(); reviewing = false; draw('question'); }

  function reviewSheet() {
    const answered = answeredCount(state);
    const unanswered = qs.length - answered;
    const open = qs.map((q, k) => k).filter((k) => state.answers[qs[k].id] == null || state.flags.includes(qs[k].id));
    return h('div', { class: 'card sheet', role: 'group', 'aria-labelledby': 'cf-t', tabindex: '-1', 'data-confirm': '' },
      h('h2', { id: 'cf-t', class: 'h3' }, state.essay ? 'مراجعة قبل إنهاء القسم الأول' : 'مراجعة قبل التسليم'),
      h('div', { class: 'stats3' },
        h('div', null, h('b', null, answered), 'مجاب'),
        h('div', null, h('b', null, unanswered), 'بلا إجابة'),
        h('div', null, h('b', null, state.flags.length), 'معلَّم')),
      h('p', null, unanswered
        ? `لم تُجب عن ${questionsPhrase(unanswered)} وستُحسب بلا إجابة.${state.flags.length ? ` لديك ${state.flags.length} معلّمة للمراجعة.` : ''}`
        : 'أجبت عن كل الأسئلة.'),
      state.essay ? h('p', { class: 'notice' }, `بعد الانتقال لا يمكنك العودة إلى أسئلة الاختيار من متعدد، ويبدأ مؤقّت القسم المقالي (${essayMin} دقيقة).`) : null,
      open.length ? h('div', null,
        h('div', { class: 'lab' }, 'اضغط رقمًا للانتقال إليه'),
        h('div', { class: 'omr gap-top' }, open.map((k) => h('button', {
          type: 'button', class: 'dot' + (state.flags.includes(qs[k].id) ? ' flag' : ''),
          'aria-label': `سؤال ${k + 1}${state.answers[qs[k].id] == null ? '، بلا إجابة' : ''}${state.flags.includes(qs[k].id) ? '، معلّم للمراجعة' : ''}`,
          onclick: () => jumpTo(k),
        }, String(k + 1))))) : null,
      h('div', { class: 'frow' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => finish(false) }, icon('check'), state.essay ? 'نعم، أنهِ القسم وابدأ المقالي' : 'نعم، أنهِ الاختبار'),
        h('button', { type: 'button', class: 'btn', onclick: () => { reviewing = false; draw('question'); } }, 'العودة إلى الأسئلة')));
  }

  function draw(focus) {
    const i = state.cur;
    const q = qs[i];
    const picked = state.answers[q.id];
    const flagged = state.flags.includes(q.id);
    const answered = answeredCount(state);

    const reviewLabel = state.essay ? 'مراجعة وإنهاء القسم' : 'مراجعة وتسليم';
    const timerCard = h('div', { class: 'timer-card' + (clock.isLow() ? ' low' : '') },
      h('div', { class: 'timer' }, h('small', null, state.essay ? 'وقت القسم الأول' : 'الوقت المتبقي'), clock.el),
      h('div', { class: 'tmeta' },
        h('span', null, 'أُجيب ', h('b', { class: 'mono cnt' }, answered), ' من ', h('span', { class: 'mono' }, qs.length)),
        h('button', { type: 'button', class: 'btn small', onclick: () => { reviewing = true; draw('confirm'); } }, icon('check'), reviewLabel)));
    clock.bind(timerCard);

    const dots = qs.map((x, k) => {
      const done = state.answers[x.id] != null;
      const fl = state.flags.includes(x.id);
      return h('button', {
        type: 'button',
        class: 'dot' + (done ? ' done' : '') + (fl ? ' flag' : '') + (k === i ? ' cur' : ''),
        'aria-label': `سؤال ${k + 1}${done ? '، مُجاب' : '، بلا إجابة'}${fl ? '، معلّم للمراجعة' : ''}`,
        'aria-current': k === i ? 'step' : null,
        onclick: () => jumpTo(k),
      }, String(k + 1));
    });
    const ocard = h('div', { class: 'card ocard' },
      h('h2', { class: 'h3' }, 'خريطة الأسئلة'),
      h('div', { class: 'omr' }, dots),
      h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'sw done', 'aria-hidden': 'true' }), 'مُجاب'),
        h('span', null, h('i', { class: 'sw flag', 'aria-hidden': 'true' }), 'معلّم'),
        h('span', null, h('i', { class: 'sw cur', 'aria-hidden': 'true' }), 'الحالي')));

    const last = i === qs.length - 1;
    const nav = h('div', { class: 'pager' },
      h('button', { type: 'button', class: 'btn', disabled: i === 0, onclick: () => { state = goTo(state, i - 1); save(); draw('question'); } }, icon('back'), 'السابق'),
      last
        ? h('button', { type: 'button', class: 'btn primary', onclick: () => { reviewing = true; draw('confirm'); } }, icon('check'), reviewLabel)
        : h('button', { type: 'button', class: 'btn primary', onclick: () => { state = goTo(state, i + 1); save(); draw('question'); } }, 'التالي', icon('fwd')));

    const main = h('div', { class: 'card qcard' },
      h('div', { class: 'qmeta' },
        h('span', { class: 'mono' }, `${i + 1} / ${qs.length}`),
        h('span', null, specialtyName(q.specialty)),
        h('button', { type: 'button', id: 'flagbtn', class: 'chip', 'aria-pressed': flagged ? 'true' : 'false',
          onclick: () => { state = toggleFlag(state, q.id); save(); draw('flag'); } }, icon('flag'), 'علّم للمراجعة')),
      questionText(q, { focusable: true }),
      optionsEl(q, { picked, reveal: false, onPick: (k) => { state = setAnswer(state, q, k); save(); draw('option'); } }),
      nav);

    page(ctx, {
      ctxText: state.essay ? `${state.label} · القسم الأول` : state.label,
      actions: [h('button', { type: 'button', class: 'btn small', onclick: () => ctx.go('home') }, 'خروج مؤقت (الوقت يستمر)')],
    },
    h('h1', { class: 'sr-only', tabindex: '-1', 'data-focus': '' }, `اختبار: ${state.label}${state.essay ? ' — القسم الأول: اختيار من متعدد' : ''}`),
    h('div', { class: 'exam' }, h('div', { class: 'mainwrap' }, clock.alertEl, reviewing ? reviewSheet() : null, main), h('div', { class: 'side' }, timerCard, ocard)));

    const sel = {
      option: '.opt[aria-checked="true"]', question: '[data-q]', confirm: '[data-confirm]', flag: '#flagbtn',
    }[focus];
    const target = sel ? ctx.root.querySelector(sel) : null;
    if (target) target.focus();
  }

  draw(null);
}
