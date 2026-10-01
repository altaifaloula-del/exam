import { h } from '../dom.js';
import { SPECIALTIES, filterReview, shuffle, specialtyName } from '../logic.js';
import { statusBadge, questionText, optionsEl, revealPanel } from './parts.js';
import { homeButton, page } from './layout.js';

export function renderReview(ctx, init = {}) {
  const { bank, store } = ctx;
  const wrongIds = new Set(store.get('wrong', []));
  const f = { spec: init.spec || 'all', status: 'all', type: 'all', text: '', random: false, onlyWrong: !!init.onlyWrong && wrongIds.size > 0 };
  const picks = {};
  let list = [];
  let i = 0;

  function rebuild() {
    let l = filterReview(bank, f);
    if (f.onlyWrong) l = l.filter((q) => wrongIds.has(q.id));
    list = f.random ? shuffle(l) : l;
    i = 0;
  }
  const chip = (label, pressed, on) => h('button', { type: 'button', class: 'chip', 'aria-pressed': pressed ? 'true' : 'false', onclick: on }, label);

  function draw() {
    const q = list[i];
    const specChips = [['all', 'الكل'], ...SPECIALTIES.map((s) => [s.key, s.name])];
    const filters = h('div', { class: 'filters' },
      h('div', { class: 'frow', role: 'group', 'aria-label': 'القسم' }, h('label', null, 'القسم'),
        h('div', { class: 'chips' }, specChips.map(([k, n]) => chip(n, f.spec === k, () => { f.spec = k; rebuild(); draw(); })))),
      h('div', { class: 'frow', role: 'group', 'aria-label': 'الحالة' }, h('label', null, 'الحالة'),
        h('div', { class: 'chips' }, [['all', 'الكل'], ['verified', 'محقَّق'], ['tentative', 'غير مؤكد']].map(([k, n]) => chip(n, f.status === k, () => { f.status = k; rebuild(); draw(); })))),
      h('div', { class: 'frow', role: 'group', 'aria-label': 'النوع' }, h('label', null, 'النوع'),
        h('div', { class: 'chips' }, [['all', 'الكل'], ['mcq', 'اختيار من متعدد'], ['tf', 'صح وخطأ']].map(([k, n]) => chip(n, f.type === k, () => { f.type = k; rebuild(); draw(); })))),
      h('div', { class: 'frow' },
        h('label', { for: 'rv-search' }, 'بحث'),
        h('input', { id: 'rv-search', class: 'input', type: 'search', value: f.text, maxlength: '80', autocomplete: 'off',
          onchange: (e) => { f.text = e.target.value.slice(0, 80); rebuild(); draw(); } }),
        chip('ترتيب عشوائي', f.random, () => { f.random = !f.random; rebuild(); draw(); }),
        wrongIds.size ? chip(`أسئلة للمراجعة (${wrongIds.size})`, f.onlyWrong, () => { f.onlyWrong = !f.onlyWrong; rebuild(); draw(); }) : null));

    let body;
    if (!q) {
      body = h('div', { class: 'card' }, h('p', null, 'لا توجد أسئلة تطابق هذه الخيارات. غيّر القسم أو الحالة أو كلمة البحث.'));
    } else {
      const picked = picks[q.id];
      body = h('div', { class: 'card qcard' },
        h('div', { class: 'qmeta' }, h('span', { class: 'mono' }, `${i + 1} / ${list.length}`), statusBadge(q), h('span', null, specialtyName(q.specialty))),
        questionText(q),
        optionsEl(q, { picked, reveal: picked != null, onPick: (k) => { if (picks[q.id] == null) { picks[q.id] = k; draw(); } } }),
        picked != null ? revealPanel(q, picked) : h('button', { type: 'button', class: 'btn small', onclick: () => { picks[q.id] = -1; draw(); } }, 'أظهر الإجابة'));
    }
    const pager = h('div', { class: 'pager' },
      h('button', { type: 'button', class: 'btn', disabled: i === 0, onclick: () => { i--; draw(); } }, 'السابق'),
      h('label', { class: 'pos' }, 'اذهب إلى ',
        h('input', { id: 'rv-jump', class: 'input mono', type: 'number', min: '1', max: String(Math.max(list.length, 1)), value: String(i + 1),
          onchange: (e) => { const n = Number.parseInt(e.target.value, 10); if (Number.isInteger(n) && n >= 1 && n <= list.length) { i = n - 1; } draw(); } })),
      h('button', { type: 'button', class: 'btn primary', disabled: i >= list.length - 1, onclick: () => { i++; draw(); } }, 'التالي'));

    page(ctx, { actions: [homeButton(ctx)] },
      h('h1', { class: 'page-title', tabindex: '-1', 'data-focus': '' }, 'وضع المراجعة'),
      filters, body, list.length ? pager : null);
  }
  rebuild();
  draw();
}
