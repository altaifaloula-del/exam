// Essay section of an exam: (1) writing, with its own clock; (2) self-grading against the model answers.
// Written answers live only in the saved exam state and are dropped when the exam is submitted.
import { h, safeLink } from '../dom.js';
import { icon } from '../icons.js';
import { specialtyName } from '../logic.js';
import { ESSAY } from '../essay.js';
import { essayAnsweredCount, essayScore, setEssayAnswer, toGrade, toggleCheck } from '../exam-state.js';
import { page } from './layout.js';
import { ESSAY_DRAFT_BADGE, ESSAY_DRAFT_NOTE } from './parts.js';
import { createClock } from './clock.js';
import { submitExam } from './submit.js';

const items = (ctx, state) => state.essay.ids.map((id) => ctx.essay.byId.get(id));

function focusTitle(ctx) {
  const t = ctx.root.querySelector('[data-focus]');
  if (t) t.focus({ preventScroll: true });
}

export function renderEssayWrite(ctx, initial) {
  const { store } = ctx;
  let state = initial;
  const list = items(ctx, state);
  const deadline = state.essay.start + state.essay.limit * 1000;
  let confirming = false;
  let finished = false;
  let saveTimer = null;
  let answeredEl = null;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    store.set('exam', state);
  }
  const flush = () => { if (saveTimer) save(); };
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };

  /** End of the writing part. On time-out the section ended at its deadline, even if the learner was away. */
  function finish(timeUp) {
    if (finished) return;
    finished = true;
    clock.stop();
    state = toGrade(state, timeUp ? deadline : Date.now());
    save();
    ctx.announce(timeUp ? 'انتهى وقت القسم المقالي. حان وقت التصحيح الذاتي.' : 'انتهت الكتابة. حان وقت التصحيح الذاتي.');
    ctx.go('exam');
  }

  const clock = createClock(ctx, { start: state.essay.start, limit: state.essay.limit, onExpire: () => finish(true) });
  const notice = ctx.takeNotice();
  if (notice) clock.message(notice);
  if (clock.left() === 0) { finish(true); return; }
  clock.run();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onHide);
  ctx.onLeave(() => {
    flush();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onHide);
  });

  function questionCard(it, k) {
    const len = (state.essay.answers[it.id] || '').length;
    const counter = h('span', { class: 'mono muted' }, `${len} / ${ESSAY.maxAnswerChars}`);
    return h('section', { class: 'card qcard essay-q', 'aria-labelledby': `eq-${it.id}` },
      h('div', { class: 'qmeta' },
        h('span', null, 'سؤال ', h('span', { class: 'mono' }, k + 1), ' من ', h('span', { class: 'mono' }, list.length)),
        h('span', null, specialtyName(it.spec))),
      h('p', { class: 'qtext', id: `eq-${it.id}`, lang: 'ar' }, it.q),
      h('div', { class: 'frow split' },
        h('label', { class: 'lab', for: `ea-${it.id}` }, 'اكتب إجابتك (نقاط مرتبة أو فقرات قصيرة)'),
        counter),
      h('textarea', {
        id: `ea-${it.id}`, class: 'input ta', rows: 9, maxlength: ESSAY.maxAnswerChars, dir: 'auto', lang: 'ar',
        oninput: (e) => {
          state = setEssayAnswer(state, it.id, e.target.value);
          counter.textContent = `${(state.essay.answers[it.id] || '').length} / ${ESSAY.maxAnswerChars}`;
          if (answeredEl) answeredEl.textContent = String(essayAnsweredCount(state));
          saveSoon();
        },
      }, state.essay.answers[it.id] || ''));
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function sheet() {
    const written = essayAnsweredCount(state);
    const empty = list.length - written;
    return h('div', { class: 'card sheet', role: 'group', 'aria-labelledby': 'ec-t', tabindex: '-1', 'data-confirm': '' },
      h('h2', { id: 'ec-t', class: 'h3' }, 'إنهاء الكتابة'),
      h('div', { class: 'stats3 two' },
        h('div', null, h('b', null, written), 'كُتبت'),
        h('div', null, h('b', null, empty), 'فارغة')),
      h('p', null, empty ? `لم تكتب شيئًا في ${empty} من الأسئلة وستُقيَّم بلا نقاط.` : 'كتبت في كل الأسئلة.'),
      h('p', { class: 'notice' }, 'بعد الانتقال لا يمكنك تعديل إجاباتك؛ تقارنها بالإجابات النموذجية وتصحّح نفسك.'),
      h('div', { class: 'frow' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => finish(false) }, icon('check'), 'نعم، انتقل إلى التصحيح الذاتي'),
        h('button', { type: 'button', class: 'btn', onclick: () => { confirming = false; draw(); } }, 'العودة إلى الكتابة')));
  }

  function draw() {
    answeredEl = h('b', { class: 'mono cnt' }, essayAnsweredCount(state));
    const timerCard = h('div', { class: 'timer-card' + (clock.isLow() ? ' low' : '') },
      h('div', { class: 'timer' }, h('small', null, 'وقت القسم المقالي'), clock.el),
      h('div', { class: 'tmeta' },
        h('span', null, 'كُتبت ', answeredEl, ' من ', h('span', { class: 'mono' }, list.length)),
        h('button', { type: 'button', class: 'btn small', onclick: () => { confirming = true; draw(); } }, icon('check'), 'أنهِ الكتابة')));
    clock.bind(timerCard);
    page(ctx, {
      ctxText: `${state.label} · القسم المقالي`,
      actions: [h('button', { type: 'button', class: 'btn small', onclick: () => ctx.go('home') }, 'خروج مؤقت (الوقت يستمر)')],
    },
    h('h1', { class: 'sr-only', tabindex: '-1', 'data-focus': '' }, `القسم المقالي: ${state.label}`),
    h('div', { class: 'exam' },
      h('div', { class: 'mainwrap' },
        clock.alertEl,
        confirming ? sheet() : null,
        h('p', { class: 'notice' }, 'اكتب إجابتك بنفسك دون الرجوع إلى الأسئلة السابقة. تُحفظ كتابتك تلقائيًا في هذا المتصفح. بعد انتهاء الوقت أو إنهائك الكتابة تظهر الإجابة النموذجية لتصحّح نفسك.'),
        list.map(questionCard)),
      h('div', { class: 'side' }, timerCard)));
    const target = confirming ? ctx.root.querySelector('[data-confirm]') : null;
    if (target) target.focus();
  }

  draw();
  focusTitle(ctx);
}

export function renderEssayGrade(ctx, initial) {
  const { store } = ctx;
  let state = initial;
  const list = items(ctx, state);
  const scoreEl = h('b', { class: 'mono' });
  const pctEl = h('span', { class: 'mono' });
  const totalPoints = list.reduce((a, it) => a + it.points.length, 0);
  const rowScore = new Map();

  function paintScore() {
    const sc = essayScore(state, ctx.essay.byId);
    scoreEl.textContent = String(sc.got);
    pctEl.textContent = `${sc.percent}%`;
    for (const it of sc.items) {
      const el = rowScore.get(it.id);
      if (el) el.textContent = String(it.got);
    }
  }

  function point(it, k, text) {
    const ticked = (state.essay.checks[it.id] || []).includes(k);
    return h('label', { class: 'pt' },
      h('input', {
        type: 'checkbox', checked: ticked,
        onchange: () => { state = toggleCheck(state, it.id, k, it); store.set('exam', state); paintScore(); },
      }),
      h('span', null, text));
  }

  function card(it, k) {
    const mine = (state.essay.answers[it.id] || '').trim();
    const sc = h('b', { class: 'mono' });
    rowScore.set(it.id, sc);
    return h('section', { class: 'card qcard essay-q', 'aria-labelledby': `gq-${it.id}` },
      h('div', { class: 'qmeta' },
        h('span', null, 'سؤال ', h('span', { class: 'mono' }, k + 1), ' من ', h('span', { class: 'mono' }, list.length)),
        h('span', null, specialtyName(it.spec)),
        h('span', { class: 'badge dim' }, ESSAY_DRAFT_BADGE)),
      h('p', { class: 'qtext', id: `gq-${it.id}`, lang: 'ar' }, it.q),
      h('div', null, h('div', { class: 'lab' }, 'إجابتك'),
        mine ? h('p', { class: 'ansbox', dir: 'auto' }, state.essay.answers[it.id]) : h('p', { class: 'muted' }, 'لم تكتب إجابة.')),
      h('div', null, h('div', { class: 'lab' }, 'الإجابة النموذجية'), h('p', { class: 'model-ans', lang: 'ar' }, it.model)),
      h('div', { class: 'pts', role: 'group', 'aria-label': `النقاط الأساسية للسؤال ${k + 1}` },
        h('div', { class: 'frow split' }, h('div', { class: 'lab' }, 'علّم النقاط التي غطّيتها في إجابتك'), h('span', null, 'نقاطك: ', sc, ' من ', h('span', { class: 'mono' }, it.points.length))),
        it.points.map((p, i) => point(it, i, p))),
      h('div', { class: 'refs' }, h('div', { class: 'lab' }, 'المراجع'), it.refs.map((r) => safeLink(r.url, r.title))));
  }

  const finishBtn = h('button', { type: 'button', class: 'btn small', onclick: () => submitExam(ctx, state) }, icon('check'), 'إنهاء وعرض النتيجة');
  const scoreCard = h('div', { class: 'timer-card' },
    h('div', { class: 'timer' }, h('small', null, 'درجة المقالي (تصحيح ذاتي)'), scoreEl),
    h('div', { class: 'tmeta' }, h('span', null, 'من ', h('span', { class: 'mono' }, totalPoints), ' نقطة · ', pctEl), finishBtn));

  page(ctx, {
    ctxText: `${state.label} · تصحيح المقالي`,
    actions: [h('button', { type: 'button', class: 'btn small', onclick: () => ctx.go('home') }, 'خروج مؤقت')],
  },
  h('h1', { class: 'page-title', tabindex: '-1', 'data-focus': '' }, 'التصحيح الذاتي للمقالي'),
  h('div', { class: 'exam' },
    h('div', { class: 'mainwrap' },
      h('div', { class: 'notice' }, 'لا وقت هنا. قارن إجابتك بالإجابة النموذجية، وعلّم كل نقطة أساسية غطّيتها. درجتك = النقاط المعلَّمة ÷ كل النقاط، وتُعرض منفصلة عن درجة الاختيار من متعدد.'),
      h('div', { class: 'notice warn' }, ESSAY_DRAFT_NOTE),
      list.map(card),
      h('div', { class: 'card sheet' },
        h('p', null, 'عند الضغط على «إنهاء وعرض النتيجة» تُحفظ درجة المقالي مع النتيجة، ولا تبقى نصوص إجاباتك في المتصفح.'),
        h('div', { class: 'frow' }, h('button', { type: 'button', class: 'btn primary', onclick: () => submitExam(ctx, state) }, icon('check'), 'إنهاء وعرض النتيجة')))),
    h('div', { class: 'side' }, scoreCard)));
  paintScore();
  focusTitle(ctx);
}
