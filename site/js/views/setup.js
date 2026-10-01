// Exam setup: ready-made models, custom exam (and, when its data exists, by topic). Builds a plan; nothing starts here.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { SPECIALTIES, essaysPhrase, examPool, questionsPhrase, specialtyName } from '../logic.js';
import { CUSTOM, customPlan, minutesFor, modelPlan } from '../plan.js';
import { ESSAY, attachEssay, essayMinutes, essayPool } from '../essay.js';
import { topicCounts, topicLabel, topicPlan, topicPool } from '../topics.js';
import { page, homeButton, resumeCard } from './layout.js';

const SPEC_CHIPS = [['all', 'الكل'], ...SPECIALTIES.map((s) => [s.key, s.name])];
const essayLabel = (c) => (c === 0 ? 'بدون مقالي' : `${c === 2 ? 'سؤالان' : c + ' أسئلة'} (${essayMinutes(c)} دقيقة)`);

export function renderSetup(ctx, { tab, spec }) {
  const { bank } = ctx;
  const tabs = [['models', 'نماذج جاهزة'], ['custom', 'اختبار مخصّص'], ...(ctx.features.topics ? [['topic', 'حسب الموضوع']] : [])];
  const active = tabs.some(([k]) => k === tab) ? tab : 'models';
  const models = ctx.models.filter((m) => spec === 'all' || m.spec === spec);
  const counts = active === 'topic' ? topicCounts(bank, ctx.topics, spec) : new Map();
  const sel = { model: 0, count: 25, minutes: 'auto', essay: 0, topics: new Set(), error: null };
  // The pool the count/duration options apply to: the whole specialty, or only the chosen topics.
  const poolSize = () => (active === 'topic' ? topicPool(bank, ctx.topics, spec, [...sel.topics]).length : examPool(bank, spec).length);
  // Counts above the pool are disabled, except the smallest one that covers it (it means "everything available").
  const cover = () => CUSTOM.counts.find((c) => c >= poolSize());
  const fitCount = () => { const p = poolSize(); return p >= 50 ? 50 : (cover() ?? CUSTOM.counts[0]); };
  const countOk = (c) => c <= poolSize() || c === cover();
  sel.count = fitCount();
  // Essays follow the same scope as the multiple-choice part: the model's specialty, the chosen specialty, or the chosen topics.
  const essayScope = () => ({ spec: active === 'models' && models[sel.model] ? models[sel.model].spec : spec, topics: active === 'topic' ? [...sel.topics] : null });
  const essayPoolSize = () => {
    if (!ctx.features.essay) return 0;
    const { spec: sp, topics: tp } = essayScope();
    return essayPool(ctx.essay, sp, tp).length;
  };
  const essayOk = (c) => c === 0 || c <= essayPoolSize();
  // Coming back from the instructions screen keeps what was chosen (memory only, validated against this screen's options).
  const prev = ctx.lastSetup;
  if (prev && prev.tab === active && prev.spec === spec) {
    if (Number.isInteger(prev.model) && prev.model >= 0 && prev.model < models.length) sel.model = prev.model;
    if (Array.isArray(prev.topics)) for (const n of prev.topics) if (counts.get(n)) sel.topics.add(n);
    if (CUSTOM.counts.includes(prev.count) && countOk(prev.count)) sel.count = prev.count;
    if (prev.minutes === 'auto' || CUSTOM.minutes.includes(prev.minutes)) sel.minutes = prev.minutes;
    if (ESSAY.counts.includes(prev.essay) && essayOk(prev.essay)) sel.essay = prev.essay;
  }
  const saved = resumeCard(ctx);

  function nav(nextTab, nextSpec) { ctx.go('setup', { tab: nextTab, spec: nextSpec }); }

  function summary() {
    const extra = sel.essay ? ` + قسم مقالي: ${sel.essay === 2 ? 'سؤالان' : sel.essay + ' أسئلة'} في ${essayMinutes(sel.essay)} دقيقة` : '';
    if (active === 'models') {
      const m = models[sel.model];
      return m ? `${m.title}: ${questionsPhrase(m.n)} في ${m.minutes} دقيقة${extra}` : 'لا توجد نماذج في هذا القسم.';
    }
    if (active === 'topic' && sel.topics.size === 0) return 'اختر موضوعًا واحدًا على الأقل.';
    const n = Math.min(sel.count, poolSize());
    if (n === 0) return 'لا توجد أسئلة محقَّقة في هذا القسم.';
    const mins = sel.minutes === 'auto' ? minutesFor(n) : sel.minutes;
    const what = active === 'topic' ? topicLabel(ctx.topics, [...sel.topics]) : 'اختبار مخصّص';
    return `${what}: ${questionsPhrase(n)} في ${mins} دقيقة${extra}`;
  }

  function next() {
    let plan = null;
    const n = Math.min(sel.count, poolSize());
    if (active === 'models') plan = modelPlan(models[sel.model]);
    else if (active === 'topic') plan = topicPlan(bank, ctx.topics, { spec, selected: [...sel.topics], count: n, minutes: sel.minutes });
    else plan = customPlan(bank, { spec, count: n, minutes: sel.minutes });
    if (plan && sel.essay) plan = attachEssay(plan, ctx.essay, { count: sel.essay, topics: essayScope().topics });
    if (!plan) { sel.error = 'تعذّر بناء الاختبار بهذه الخيارات. غيّر القسم أو العدد.'; draw(); return; }
    ctx.pending = plan;
    ctx.lastSetup = { tab: active, spec, model: sel.model, topics: [...sel.topics], count: sel.count, minutes: sel.minutes, essay: sel.essay };
    ctx.go('instructions');
  }

  function toggleTopic(n) {
    const wasEmpty = sel.topics.size === 0;
    if (sel.topics.has(n)) sel.topics.delete(n); else sel.topics.add(n);
    if (wasEmpty || !countOk(sel.count)) sel.count = fitCount();
    draw();
  }
  function setAllTopics(on) {
    sel.topics = new Set(on ? [...counts.keys()] : []);
    sel.count = fitCount();
    draw();
  }

  function essayRow() {
    if (!ctx.features.essay) return null;
    return h('div', { class: 'setrow' },
      h('div', { class: 'lab' }, `قسم مقالي بعد الاختيار من متعدد (المتوفر ${essaysPhrase(essayPoolSize())})`),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'عدد الأسئلة المقالية' }, [0, ...ESSAY.counts].map((c) => h('button', {
        type: 'button', class: 'chip', disabled: !essayOk(c), 'aria-pressed': sel.essay === c ? 'true' : 'false',
        onclick: () => { sel.essay = c; draw(); },
      }, essayLabel(c)))),
      h('div', { class: 'muted' }, 'تكتب إجاباتك ثم تصحّح نفسك بقائمة نقاط؛ لها مؤقّت ودرجة منفصلان. الإجابات النموذجية مسوّدات آلية لم يراجعها طبيب.'));
  }

  function body() {
    if (active === 'models') {
      if (models.length === 0) return h('div', { class: 'notice' }, 'لا توجد نماذج جاهزة في هذا القسم. جرّب «اختبار مخصّص».');
      const essayBox = ctx.features.essay ? h('div', { class: 'card panel-set' }, essayRow()) : null;
      return h('div', { class: 'panel-set' }, h('div', { class: 'models', role: 'group', 'aria-label': 'النماذج الجاهزة' }, models.map((m, i) => h('button', {
        type: 'button', class: 'model', 'aria-pressed': sel.model === i ? 'true' : 'false', onclick: () => { sel.model = i; draw(); },
      },
      h('span', { class: 'nm' }, m.title),
      h('span', { class: 't' }, questionsPhrase(m.n)),
      h('span', { class: 'sub' }, specialtyName(m.spec), m.guide ? h('span', { class: 'badge guide' }, 'دليل دراسي وليس ورقة امتحان') : null,
        m.copies.length ? h('span', null, `نسخ متطابقة: ${m.copies.join('، ')}`) : null),
      h('span', { class: 't' }, h('span', { class: 'mono' }, m.minutes), ' دقيقة')))), essayBox);
    }
    const topicRow = active === 'topic' ? h('div', { class: 'setrow' },
      h('div', { class: 'lab' }, 'المواضيع (اختر واحدًا أو أكثر)'),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'اختيار المواضيع' },
        h('button', { type: 'button', class: 'chip', onclick: () => setAllTopics(true) }, 'تحديد كل المواضيع'),
        h('button', { type: 'button', class: 'chip', disabled: sel.topics.size === 0, onclick: () => setAllTopics(false) }, 'مسح الاختيار')),
      h('div', { class: 'topics', role: 'group', 'aria-label': 'المواضيع' }, ctx.topics.list.map((t) => h('button', {
        type: 'button', class: 'chip topic', disabled: !counts.get(t.n), 'aria-pressed': sel.topics.has(t.n) ? 'true' : 'false',
        onclick: () => toggleTopic(t.n),
      }, h('span', null, t.ar), h('span', { class: 'mono n' }, counts.get(t.n) || 0))))) : null;
    const pool = poolSize();
    return h('div', { class: 'card panel-set' },
      topicRow,
      h('div', { class: 'setrow' },
        h('div', { class: 'lab' }, `عدد الأسئلة (المتوفر ${pool})`),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'عدد الأسئلة' }, CUSTOM.counts.map((c) => h('button', {
          type: 'button', class: 'chip', disabled: !countOk(c), 'aria-pressed': sel.count === c ? 'true' : 'false',
          onclick: () => { sel.count = c; draw(); },
        }, String(c))))),
      h('div', { class: 'setrow' },
        h('div', { class: 'lab' }, 'المدة'),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'المدة' }, [['auto', 'تلقائية (1.2 دقيقة للسؤال)'], ...CUSTOM.minutes.map((m) => [m, `${m} دقيقة`])].map(([v, l]) => h('button', {
          type: 'button', class: 'chip', 'aria-pressed': sel.minutes === v ? 'true' : 'false', onclick: () => { sel.minutes = v; draw(); },
        }, l)))),
      essayRow());
  }

  function draw() {
    if (!essayOk(sel.essay)) sel.essay = 0; // the chosen scope no longer has that many essays (its chip is disabled)
    const noQuestions = active === 'models' ? models.length === 0 : poolSize() === 0;
    page(ctx, { actions: [homeButton(ctx)] },
      h('h1', { class: 'page-title', tabindex: '-1', 'data-focus': '' }, 'ابدأ اختبارًا'),
      saved,
      h('div', { class: 'tabs', role: 'group', 'aria-label': 'نوع الاختبار' }, tabs.map(([k, n]) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': active === k ? 'true' : 'false', onclick: () => nav(k, spec),
      }, n))),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'القسم' }, SPEC_CHIPS.map(([k, n]) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': spec === k ? 'true' : 'false', onclick: () => nav(active, k),
      }, n))),
      body(),
      sel.error ? h('div', { class: 'notice warn', role: 'alert' }, sel.error) : null,
      h('div', { class: 'summary' },
        h('p', { class: 'muted', role: 'status' }, summary()),
        h('button', { type: 'button', class: 'btn primary', disabled: noQuestions || !!saved, onclick: next }, 'التالي: التعليمات', icon('back'))));
  }
  draw();
}
