// Boot + hash router. Route state lives in the URL hash and is validated against whitelists.
import { SPECIALTIES, questionsPhrase, validateBank } from './logic.js';
import { cleanLast, cleanWrong, newExam, validateExam, validateResult } from './exam-state.js';
import { examModels } from './plan.js';
import { validateTopics } from './topics.js';
import { validateEssay } from './essay.js';
import { createStore } from './store.js';
import { h, mount } from './dom.js';
import { renderHome } from './views/home.js';
import { renderReview } from './views/review.js';
import { renderSetup } from './views/setup.js';
import { renderInstructions } from './views/instructions.js';
import { renderExam } from './views/exam.js';
import { renderResults } from './views/results.js';

const root = document.getElementById('app');
const live = document.getElementById('sr-live');
const ROUTES = new Set(['home', 'review', 'setup', 'instructions', 'exam', 'results']);
const SPEC_KEYS = new Set(['all', ...SPECIALTIES.map((s) => s.key)]);
const SETUP_TABS = new Set(['models', 'custom', 'topic']);
const TITLES = {
  home: 'بنك مزاولة المهنة', review: 'وضع المراجعة', setup: 'ابدأ اختبارًا', instructions: 'تعليمات الاختبار', exam: 'اختبار تجريبي', results: 'نتيجة الاختبار',
};

const store = createStore(undefined, (e) => console.error('storage unavailable, using memory only:', e));
let leaveFns = [];

const ctx = {
  root,
  bank: [],
  models: [],
  topics: null,         // { list, map } from data/topics.json when it loaded and validated
  essay: null,          // { items, byId } from data/essay.json when it loaded and validated
  features: { topics: false, essay: false },   // optional data files; a feature is on only when its data loaded and validated
  store,
  warning: null,
  pending: null,        // the plan chosen in setup, waiting on the instructions screen (memory only)
  lastSetup: null,      // the setup choices behind `pending`, so "back" from the instructions keeps them (memory only)
  notice: null,         // one-shot message for the exam screen (e.g. full screen refused)
  go,
  beginExam,
  takeNotice() { const n = ctx.notice; ctx.notice = null; return n; },
  exitFullscreen,
  onLeave: (fn) => leaveFns.push(fn),
  announce(text) {
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 50);
  },
};

function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = ROUTES.has(parts[0]) ? parts[0] : 'home';
  if (name === 'setup') return { name, tab: SETUP_TABS.has(parts[1]) ? parts[1] : 'models', spec: SPEC_KEYS.has(parts[2]) ? parts[2] : 'all' };
  return { name, spec: SPEC_KEYS.has(parts[1]) ? parts[1] : 'all', onlyWrong: parts[2] === 'wrong' };
}

function go(name, p = {}) {
  let target = '#/' + name;
  if (name === 'review') target += '/' + (SPEC_KEYS.has(p.spec) ? p.spec : 'all') + (p.onlyWrong ? '/wrong' : '');
  if (name === 'setup') target += '/' + (SETUP_TABS.has(p.tab) ? p.tab : 'models') + '/' + (SPEC_KEYS.has(p.spec) ? p.spec : 'all');
  if (location.hash === target) render();
  else location.hash = target;
}

/** Starts the planned exam. The clock starts now, not when the plan was built. A live exam is never overwritten. */
function beginExam({ fullscreen = false } = {}) {
  if (validateExam(store.get('exam'), ctx.bank, ctx.essay)) { go('home'); return; }
  const st = validateExam(newExam(ctx.pending, Date.now()), ctx.bank, ctx.essay);
  if (!st) {
    ctx.pending = null;
    ctx.warning = 'تعذّر بدء الاختبار: الخطة غير صالحة. اختر من جديد.';
    go('home');
    return;
  }
  ctx.warning = null;
  ctx.pending = null;
  store.set('exam', st);
  if (fullscreen) enterFullscreen();
  go('exam');
}

function enterFullscreen() {
  const el = document.documentElement;
  if (!el.requestFullscreen) { ctx.notice = 'متصفحك لا يدعم ملء الشاشة. تابع الاختبار كالمعتاد.'; return; }
  el.requestFullscreen().catch((e) => {
    console.error('fullscreen refused:', e);
    ctx.notice = 'تعذّر تفعيل ملء الشاشة. تابع الاختبار كالمعتاد.';
  });
}

function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch((e) => console.error('exit fullscreen failed:', e));
}

function showError(message) {
  mount(root,
    h('div', { class: 'wrap' },
      h('div', { class: 'notice warn', role: 'alert' }, message),
      h('p', null, h('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, 'إعادة تحميل الصفحة'))));
}

function render() {
  for (const fn of leaveFns) {
    try { fn(); } catch (e) { console.error(e); }
  }
  leaveFns = [];
  const { name, spec, onlyWrong, tab } = parseHash(location.hash);
  document.title = TITLES[name];
  try {
    if (name === 'review') renderReview(ctx, { spec, onlyWrong });
    else if (name === 'setup') renderSetup(ctx, { tab, spec });
    else if (name === 'instructions') renderInstructions(ctx);
    else if (name === 'exam') renderExam(ctx);
    else if (name === 'results') renderResults(ctx);
    else renderHome(ctx);
  } catch (e) {
    console.error(e);
    showError('حدث خطأ غير متوقع أثناء عرض الصفحة. رمز الخطأ: ' + String(e && e.message).slice(0, 120));
    return;
  }
  const f = root.querySelector('[data-focus]');
  if (f && name !== 'exam') f.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/** Drop unusable saved data loudly (warning), never silently. */
function checkSaved() {
  const notes = [];
  const rawExam = store.get('exam');
  if (rawExam != null && !validateExam(rawExam, ctx.bank, ctx.essay)) {
    // A saved exam with an essay section is not thrown away just because the essay file failed to load this time.
    if (!ctx.essay && rawExam && typeof rawExam === 'object' && rawExam.essay != null && validateExam({ ...rawExam, essay: undefined, phase: 'mcq' }, ctx.bank)) {
      notes.push('لديك اختبار محفوظ فيه قسم مقالي، وتعذّر تحميل الأسئلة المقالية الآن. أعد تحميل الصفحة لمتابعته؛ لم يُحذف.');
    } else {
      store.remove('exam');
      notes.push('اختبار محفوظ لم يعد صالحًا (تغيّر البنك أو تالف) فأُلغي.');
    }
  }
  const rawResult = store.get('result');
  if (rawResult != null && !validateResult(rawResult, ctx.bank)) {
    store.remove('result');
    notes.push('نتيجة محفوظة غير صالحة فحُذفت.');
  }
  const rawWrong = store.get('wrong');
  if (rawWrong != null) store.set('wrong', cleanWrong(rawWrong, ctx.bank));
  const rawLast = store.get('last');
  if (rawLast != null && !cleanLast(rawLast)) store.remove('last');
  return notes;
}

/** Optional data: a failure turns the feature off and is reported to the user, never swallowed. */
async function loadTopics(bank) {
  try {
    const res = await fetch('data/topics.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const topics = validateTopics(await res.json(), bank);
    if (!topics) throw new Error('invalid topics file');
    return topics;
  } catch (e) {
    console.error('topics unavailable:', e);
    return null;
  }
}

async function loadEssay(bank) {
  try {
    const res = await fetch('data/essay.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const essay = validateEssay(await res.json(), bank);
    if (!essay) throw new Error('invalid essay file');
    return essay;
  } catch (e) {
    console.error('essay unavailable:', e);
    return null;
  }
}

async function boot() {
  let data;
  try {
    const res = await fetch('data/bank.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch (e) {
    console.error(e);
    showError('تعذّر تحميل بنك الأسئلة (' + String(e && e.message).slice(0, 80) + '). تحقق من اتصالك ثم أعد المحاولة.');
    return;
  }
  const v = validateBank(data);
  if (v.questions.length === 0) {
    console.error(v.errors);
    showError('ملف البنك غير صالح ولا يمكن عرضه.');
    return;
  }
  ctx.bank = v.questions;
  ctx.models = examModels(ctx.bank);
  [ctx.topics, ctx.essay] = await Promise.all([loadTopics(ctx.bank), loadEssay(ctx.bank)]);
  ctx.features.topics = ctx.topics !== null;
  ctx.features.essay = ctx.essay !== null;
  const notes = checkSaved();
  if (!ctx.topics) notes.push('تعذّر تحميل تصنيف المواضيع، فالاختبار «حسب الموضوع» غير متاح الآن.');
  if (!ctx.essay) notes.push('تعذّر تحميل الأسئلة المقالية، فالقسم المقالي غير متاح الآن.');
  if (!v.ok) {
    console.error('bank validation:', v.errors);
    notes.push(`تجاهل الموقع ${questionsPhrase(v.errors.length)} لا يجتاز فحص الصحة.`);
  }
  ctx.warning = notes.length ? notes.join(' ') : null;
  window.addEventListener('hashchange', render);
  render();
}

boot();
