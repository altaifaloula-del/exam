// End-to-end smoke test in a real Chromium. Run: npm run test:e2e
// CHROME_PATH overrides the browser binary (CI: /usr/bin/google-chrome). SHOT_DIR saves screenshots.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
import { examPool, formatClock, questionsPhrase } from '../../site/js/logic.js';
import { examModels, minutesFor } from '../../site/js/plan.js';
import { topicCounts, topicPool, validateTopics } from '../../site/js/topics.js';
import { essayPool, validateEssay } from '../../site/js/essay.js';

const SITE = new URL('../../site/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const bank = JSON.parse(await readFile(join(SITE, 'data/bank.json'), 'utf8')).questions;
const models = examModels(bank);
const topicsRaw = JSON.parse(await readFile(join(SITE, 'data/topics.json'), 'utf8'));
const topics = validateTopics(topicsRaw, bank);
const essay = validateEssay(JSON.parse(await readFile(join(SITE, 'data/essay.json'), 'utf8')), bank);
const ws = (s) => s.replace(/\s+/g, ' ').trim();
const keyOf = (q, opts) => ws(q) + '||' + opts.map(ws).join('|');
const byKey = new Map(bank.map((q) => [keyOf(q.q, q.options), q]));

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = join(SITE, path === '/' ? 'index.html' : path);
    if (!file.startsWith(SITE)) throw new Error('outside');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', connection: 'close' });
    res.end(body);
  } catch {
    res.writeHead(404, { connection: 'close' }).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const problems = [];
let passed = 0;
const ok = (name) => { passed++; console.log('  ok -', name); };

async function newPage(viewport = { width: 1280, height: 800 }, { expectConsole = null } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'ar' });
  const page = await ctx.newPage();
  const at = () => `[scenario ${passed + 1}]`;
  page.on('console', (m) => { if (m.type() === 'error' && !(expectConsole && expectConsole.test(m.text()))) problems.push(`${at()} console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${at()} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`${at()} request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('dialog', (d) => { problems.push('unexpected dialog: ' + d.message()); d.dismiss(); });
  // Playwright runs the LAST registered matching route first: catch-all first, fonts stub second.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  return page;
}
// Catches template leaks such as "null"/"undefined"/"[object Object]" printed into the UI.
const noLeaks = async (page, where) => {
  const t = await page.locator('#app').innerText();
  assert.ok(!/\b(null|undefined|NaN)\b|\[object/.test(t), `template leak in ${where}: ${t.match(/.{0,20}(null|undefined|NaN|\[object).{0,20}/)?.[0]}`);
};
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
/**
 * Hash navigation (section chips, tabs) re-renders on a LATER task, so right after a click the page can still show the
 * old list. Wait until the page shows `expected` matches, then assert (on a timeout the assertion reports the real count).
 */
async function expectCount(page, selector, expected, what = selector) {
  await page.waitForFunction(([s, n]) => document.querySelectorAll(s).length === n, [selector, expected], { timeout: 5000 }).catch(() => null);
  assert.equal(await page.locator(selector).count(), expected, `${what}: expected ${expected}`);
}
/** Same idea for the page heading: a hash change keeps the OLD h1 on screen until the new page is drawn. */
async function expectHeading(page, re, what) {
  await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('h1')?.textContent || ''), re.source, { timeout: 5000 }).catch(() => null);
  assert.match(await page.locator('h1').innerText(), re, what);
}
// The CSP blocks inline style attributes, so none may ever be rendered.
const noInlineStyle = async (page, where) => assert.equal(await page.locator('#app [style]').count(), 0, `inline style attribute in ${where}`);
const shot = async (page, name, full = false) => { if (process.env.SHOT_DIR) await page.screenshot({ path: join(process.env.SHOT_DIR, name), fullPage: full }); };

/** Seeds localStorage BEFORE the app boots, once per browser session, so a test cannot race the app's first load. */
async function seed(page, entries) {
  await page.context().addInitScript((e) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      for (const [k, v] of Object.entries(e)) localStorage.setItem('bank:v1:' + k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }, entries);
}

/** setup -> instructions. Waits for the instructions heading: a click that only changes the hash has not rendered yet when it resolves. */
async function toInstructions(page) {
  await page.getByRole('button', { name: 'التالي: التعليمات' }).click();
  await page.getByRole('heading', { level: 1, name: 'تعليمات قبل البدء' }).waitFor();
}

/** home -> setup -> instructions -> exam for a given plan position. */
async function startFromSetup(page) {
  await page.getByRole('button', { name: 'التالي: التعليمات' }).click();
  await page.getByRole('heading', { level: 1, name: 'تعليمات قبل البدء' }).waitFor();
  await page.getByRole('button', { name: 'ابدأ الاختبار' }).click();
  await page.locator('.dot').first().waitFor();
}

async function answer(page, count, { rightUntil }) {
  let correct = 0;
  let wrong = 0;
  for (let i = 0; i < count; i++) {
    const qt = await page.locator('.qblock .qtext').first().innerText();
    const opts = await page.locator('.opt .t').allInnerTexts();
    const q = byKey.get(keyOf(qt, opts));
    assert.ok(q, 'question found in bank: ' + qt.slice(0, 40));
    assert.equal(q.status, 'verified', 'only verified questions appear in an exam');
    const right = i < rightUntil;
    await page.locator('.opt').nth(right ? q.answer : (q.answer + 1) % q.options.length).click();
    if (right) correct++; else wrong++;
    if (i === 2) await page.locator('#flagbtn').click();
    await page.getByRole('button', { name: 'التالي' }).click();
  }
  return { correct, wrong };
}

try {
  // 1. Home at three widths: five signs, tool grid, no horizontal scroll, no inline styles.
  for (const [w, h] of [[360, 740], [768, 1024], [1280, 800]]) {
    const page = await newPage({ width: w, height: h });
    await page.goto(base);
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert.ok(await noHScroll(page), `home horizontal scroll at ${w}`);
    assert.equal(await page.locator('a.sign').count(), 5);
    assert.equal(await page.locator('.tool').count(), 6, 'models, custom, topic, review, mistakes, last result');
    assert.equal(await page.locator('button.tool:disabled').count(), 2, 'no mistakes / no last result yet');
    await noLeaks(page, `home ${w}`);
    await noInlineStyle(page, `home ${w}`);
    await shot(page, `home-${w}.png`, true);
    await page.context().close();
  }
  ok('home: 5 signs + 6-tool grid at 360/768/1280, no horizontal scroll, no inline style');

  // 2. Review from the tool grid: reveal, https refs, tentative badge, empty filter message.
  {
    const page = await newPage();
    await page.goto(base);
    await page.locator('a.tool', { hasText: 'مراجعة' }).click();
    await page.locator('.opt').first().waitFor();
    await page.locator('.opt').first().click();
    assert.ok(await page.locator('.reveal').isVisible());
    await noLeaks(page, 'review');
    assert.equal(await page.locator('.opt.right').count(), 1);
    const hrefs = await page.locator('.refs a').evaluateAll((as) => as.map((a) => a.href));
    assert.ok(hrefs.length > 0 && hrefs.every((u) => u.startsWith('https://')));
    assert.ok(await page.locator('.refs a').first().getAttribute('rel').then((r) => r.includes('noopener')));
    await page.getByRole('button', { name: 'غير مؤكد', exact: true }).click();
    assert.ok(await page.locator('.qcard .badge.tent').first().isVisible());
    await page.getByRole('button', { name: 'التالي' }).click();
    await page.locator('#rv-search').fill('zzzzzz-no-match');
    await page.locator('#rv-search').press('Enter');
    await page.locator('#rv-search').evaluate((e) => e.dispatchEvent(new Event('change')));
    assert.ok(await page.getByText('لا توجد أسئلة تطابق').isVisible());
    await page.context().close();
  }
  ok('review: reveal, https refs, tentative badge, empty filter message');

  // 3. Setup lists exactly the models the plan layer computes, per specialty and for "all".
  {
    const page = await newPage();
    await page.goto(base);
    await page.locator('a.sign.s-all').click();
    await page.locator('.model').first().waitFor();
    assert.equal(await page.locator('.model').count(), models.length);
    await page.locator('.chips[aria-label="القسم"]').getByRole('button', { name: 'تمريض', exact: true }).click();
    const nursing = models.filter((m) => m.spec === 'nursing');
    await expectCount(page, '.model', nursing.length, 'nursing models after the section chip');
    const texts = await page.locator('.model .nm').allInnerTexts();
    assert.deepEqual(texts.map(ws), nursing.map((m) => ws(m.title)));
    await noInlineStyle(page, 'setup');
    await noLeaks(page, 'setup');
    assert.ok(await noHScroll(page));
    await page.context().close();
  }
  ok('setup: model list equals the computed models for "all" and for one specialty');

  // 4. Full flow on a ready model: setup -> instructions -> exam -> review sheet -> results -> mistakes.
  {
    const m = models.filter((x) => x.spec === 'assistant')[0];
    const page = await newPage({ width: 360, height: 740 });
    await page.goto(base);
    await page.locator('a.sign.s-assistant').click();
    await page.locator('.model').first().waitFor();
    assert.match(await page.locator('.summary [role=status]').innerText(), new RegExp(`${questionsPhrase(m.n)} في ${m.minutes} دقيقة`));
    await toInstructions(page);
    const instr = await page.locator('#app').innerText();
    assert.ok(instr.includes(m.title) && instr.includes(questionsPhrase(m.n)) && instr.includes(`${m.minutes} دقيقة`), 'instructions state the plan');
    await shot(page, 'instructions-360.png', true);
    await page.getByRole('button', { name: 'ابدأ الاختبار' }).click();
    await page.locator('.dot').first().waitFor();
    assert.equal(await page.locator('.dot').count(), m.n);
    const t0 = await page.locator('[role=timer]').innerText();
    assert.ok([formatClock(m.minutes * 60), formatClock(m.minutes * 60 - 1)].includes(t0), `timer starts at the plan limit, got ${t0}`);
    assert.equal(await page.locator('.reveal').count(), 0, 'no answers shown during exam');
    await noLeaks(page, 'exam');
    await noInlineStyle(page, 'exam');
    assert.ok(await noHScroll(page), 'exam horizontal scroll at 360');
    await shot(page, 'exam-360.png');

    const { correct, wrong } = await answer(page, 15, { rightUntil: 10 });
    assert.equal(await page.locator('.dot.done').count(), 15);
    assert.equal(await page.locator('.dot.flag').count(), 1);

    await page.reload();
    await page.locator('.dot').first().waitFor();
    assert.equal(await page.locator('.dot.done').count(), 15, 'answers survive reload');
    assert.equal(await page.locator('.dot.cur').innerText(), '16', 'position survives reload');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bank:v1:exam')).v), 2);

    await page.getByRole('button', { name: 'مراجعة وتسليم' }).first().click();
    await page.getByText(`لم تُجب عن ${questionsPhrase(m.n - 15)}`).waitFor();
    assert.ok(await page.getByText('لديك 1 معلّمة للمراجعة').isVisible());
    assert.equal(await page.locator('.stats3 b').allInnerTexts().then((a) => a.join(',')), `15,${m.n - 15},1`);
    await shot(page, 'sheet-360.png');
    await page.getByRole('button', { name: 'العودة إلى الأسئلة' }).click();
    assert.equal(await page.locator('.sheet').count(), 0);
    await page.getByRole('button', { name: 'مراجعة وتسليم' }).first().click();
    await page.getByRole('button', { name: 'نعم، أنهِ الاختبار' }).click();
    await page.locator('.score').waitFor();
    assert.equal(await page.locator('.score').innerText(), `${correct}/${m.n}`);
    assert.ok((await page.locator('.resultcard').innerText()).includes(m.title), 'result names the model');
    await noLeaks(page, 'results');
    await noInlineStyle(page, 'results');
    // Regression: a CSS class collision (.skip link vs. result state) once made items overlap.
    const tops = await page.locator('.ritem').evaluateAll((els) => els.map((e) => [getComputedStyle(e).position, e.getBoundingClientRect().top + window.scrollY]));
    assert.equal(tops.length, wrong + (m.n - 15));
    assert.ok(tops.every(([pos]) => pos === 'static'), 'result items are in normal flow');
    assert.ok(tops.every(([, t], i) => i === 0 || t > tops[i - 1][1]), 'result items do not overlap');
    assert.deepEqual(await page.locator('.rbox b').allInnerTexts(), [String(correct), String(wrong), String(m.n - 15)]);
    assert.ok(await noHScroll(page), 'results horizontal scroll at 360');
    await shot(page, 'results-360.png', true);
    assert.equal(await page.evaluate(() => localStorage.getItem('bank:v1:exam')), null, 'exam state cleared after finish');

    await page.getByRole('button', { name: 'راجع أخطائي في وضع المراجعة' }).click();
    await page.locator('.qcard').waitFor();
    assert.match(await page.locator('.qmeta .mono').first().innerText(), new RegExp(`^1 / ${wrong + (m.n - 15)}$`));

    // "new exam in the same section" returns to the models tab of that specialty
    await page.goto(base + '#/results');
    await page.getByRole('button', { name: 'اختبار جديد في القسم نفسه' }).click();
    await page.locator('.model').first().waitFor();
    assert.match(page.url(), /#\/setup\/models\/assistant$/);
    await page.context().close();
  }
  ok('ready model: plan shown -> instructions -> exam (timer, persistence, review sheet) -> results match bank.json -> mistakes');

  // 5. Custom exam: disabled counts above the pool, auto duration, explicit duration, alert line for the length.
  {
    const page = await newPage({ width: 390, height: 800 });
    await page.goto(base + '#/setup/custom/dental');
    await page.locator('.chips[aria-label="عدد الأسئلة"]').waitFor();
    const pool = examPool(bank, 'dental').length;
    const dis = await page.locator('.chips[aria-label="عدد الأسئلة"] button').evaluateAll((bs) => bs.map((b) => [b.textContent, b.disabled]));
    assert.ok(pool > 10 && pool <= 25, 'test assumes the dental pool sits between 10 and 25');
    assert.deepEqual(dis.filter(([, d]) => !d).map(([t]) => t), ['10', '25'], 'only counts up to the first that covers the pool are enabled');
    assert.match(await page.locator('.summary [role=status]').innerText(), new RegExp(`${questionsPhrase(pool)} في ${minutesFor(pool)} دقيقة`));
    await page.context().close();

    const p2 = await newPage({ width: 390, height: 800 });
    await p2.goto(base + '#/setup/custom/nursing');
    await p2.locator('.chips[aria-label="عدد الأسئلة"]').getByRole('button', { name: '25', exact: true }).click();
    await p2.locator('.chips[aria-label="المدة"]').getByRole('button', { name: '30 دقيقة', exact: true }).click();
    assert.match(await p2.locator('.summary [role=status]').innerText(), /اختبار مخصّص: 25 سؤالًا في 30 دقيقة/);
    await shot(p2, 'custom-390.png');
    await toInstructions(p2);
    assert.ok((await p2.locator('#app').innerText()).includes('تنبيه مرئي عند بقاء 10 و5 و1 دقيقة'));
    await p2.getByRole('button', { name: 'رجوع' }).click();
    await p2.locator('.chips[aria-label="المدة"]').waitFor();
    await p2.getByRole('button', { name: 'التالي: التعليمات' }).click();
    await p2.getByRole('button', { name: 'ابدأ الاختبار' }).click();
    await p2.locator('.dot').first().waitFor();
    assert.equal(await p2.locator('.dot').count(), 25);
    assert.ok(['30:00', '29:59'].includes(await p2.locator('[role=timer]').innerText()));
    const saved = await p2.evaluate(() => JSON.parse(localStorage.getItem('bank:v1:exam')));
    assert.equal(saved.kind, 'custom');
    assert.equal(saved.limit, 1800);
    assert.equal(saved.spec, 'nursing');
    await p2.context().close();
  }
  ok('custom exam: counts capped by the pool, chosen duration honoured, alert line, back keeps selection');

  // 6. Alerts at 10/5/1 minutes, red clock, no alert for thresholds already passed, auto-submit at zero.
  {
    const page = await newPage({ width: 390, height: 800 });
    await page.goto(base + '#/setup/custom/assistant');
    await page.locator('.chips[aria-label="عدد الأسئلة"]').getByRole('button', { name: '25', exact: true }).click();
    await page.locator('.chips[aria-label="المدة"]').getByRole('button', { name: '30 دقيقة', exact: true }).click();
    await startFromSetup(page);
    const setRemaining = (sec) => page.evaluate((s) => {
      const st = JSON.parse(localStorage.getItem('bank:v1:exam'));
      st.start = Date.now() - (st.limit - s) * 1000;
      localStorage.setItem('bank:v1:exam', JSON.stringify(st));
    }, sec);
    assert.equal(await page.locator('.timer-card.low').count(), 0, 'clock is not red at the start');
    for (const [sec, text] of [[601, 'متبقٍ 10 دقائق'], [301, 'متبقٍ 5 دقائق'], [61, 'متبقٍ دقيقة واحدة']]) {
      await setRemaining(sec);
      await page.reload();
      await page.locator('.dot').first().waitFor();
      await page.locator('.alertbar').waitFor({ timeout: 4000 });
      assert.equal(await page.locator('.alertbar').innerText(), text);
      assert.equal(await page.locator('[role=status] .alertbar').count(), 1, 'alert sits in a live region');
    }
    assert.equal(await page.locator('.timer-card.low').count(), 1, 'clock is red in the last 10 minutes');
    await shot(page, 'alert-390.png');
    // Reloading when a threshold is already behind us must not replay its alert.
    await setRemaining(240);
    await page.reload();
    await page.locator('.dot').first().waitFor();
    await page.waitForTimeout(1300);
    assert.equal(await page.locator('.alertbar').count(), 0, 'no stale alert after reload');
    // Time runs out while the page is open: auto-submit with every question unanswered.
    await setRemaining(2);
    await page.reload();
    await page.locator('.score').waitFor({ timeout: 8000 });
    assert.equal(await page.locator('.rbox b').nth(2).innerText(), '25');
    assert.equal(await page.evaluate(() => localStorage.getItem('bank:v1:exam')), null);
    await page.context().close();
  }
  ok('alerts at 10/5/1 min in a live region, red clock, no stale alert on reload, auto-submit at zero');

  // 7. A live exam blocks a second start (setup + resume card), and expiry while away resolves on resume.
  {
    const page = await newPage();
    await page.goto(base + '#/setup/custom/assistant');
    await page.getByRole('button', { name: 'التالي: التعليمات' }).click();
    await page.getByRole('button', { name: 'ابدأ الاختبار' }).click();
    await page.locator('.dot').first().waitFor();
    await page.evaluate(() => {
      const k = 'bank:v1:exam';
      const s = JSON.parse(localStorage.getItem(k));
      s.start = Date.now() - (s.limit - 2) * 1000;
      localStorage.setItem(k, JSON.stringify(s));
    });
    await page.goto(base + '#/home');
    await page.getByText('لديك اختبار غير منتهٍ').waitFor();
    await page.locator('a.sign.s-assistant').click();
    await page.locator('.model').first().waitFor();
    await page.getByText('لديك اختبار غير منتهٍ').waitFor();
    assert.ok(await page.getByRole('button', { name: 'التالي: التعليمات' }).isDisabled(), 'cannot start a second exam');
    await page.getByRole('button', { name: 'متابعة الاختبار' }).click();
    await page.locator('.score').waitFor({ timeout: 10000 });
    assert.equal(await page.locator('.rbox b').nth(2).innerText(), '50');
    await page.context().close();
  }
  ok('live exam blocks a second start; expired exam auto-submits on resume');

  // 8. Saved state from the first release (v1: 50 q / 3600 s) still resumes and is upgraded on the next save.
  {
    const page = await newPage();
    const ids = examPool(bank, 'assistant').slice(0, 10).map((q) => q.id);
    await seed(page, { exam: { v: 1, spec: 'assistant', ids, answers: {}, flags: [], cur: 0, start: Date.now() - 10000, limit: 3600 } });
    await page.goto(base);
    await page.getByText('لديك اختبار غير منتهٍ: اختبار مخصّص').waitFor();
    await page.getByRole('button', { name: 'متابعة الاختبار' }).click();
    await page.locator('.dot').first().waitFor();
    assert.equal(await page.locator('.dot').count(), 10);
    await page.locator('.opt').first().click();
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('bank:v1:exam')));
    assert.equal(st.v, 2);
    assert.equal(st.kind, 'custom');
    assert.equal(st.limit, 3600);
    await page.context().close();
  }
  ok('v1 saved exam resumes and upgrades to v2');

  // 9. Tampered storage and hostile hash/pending state are handled visibly and safely.
  {
    const page = await newPage();
    await seed(page, {
      exam: { v: 1, spec: 'assistant', ids: ['NOPE'], answers: {}, flags: [], cur: 0, start: 1, limit: 3600 },
      result: '"junk"',
      wrong: { a: 1 },
    });
    await page.goto(base);
    await page.getByRole('alert').first().waitFor();
    const msg = await page.getByRole('alert').first().innerText();
    assert.ok(msg.includes('اختبار محفوظ') && msg.includes('نتيجة محفوظة'), msg);
    assert.equal(await page.getByText('لديك اختبار غير منتهٍ').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('bank:v1:exam')), null, 'bad exam removed');
    assert.equal(await page.evaluate(() => localStorage.getItem('bank:v1:wrong')), '[]', 'bad wrong-list reset');
    await page.goto(base + '#/review/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E/wrong');
    await page.locator('.qcard').first().waitFor();
    assert.equal(await page.locator('#app img').count(), 0);
    await page.goto(base + '#/setup/%3Cscript%3E/%3Cimg%3E');
    await page.locator('.model').first().waitFor();
    assert.match(page.url(), /#\/setup\//);
    assert.equal(await page.locator('#app img, #app script').count(), 0);
    await page.goto(base + '#/exam');
    await expectHeading(page, /إلى أين/, '/exam without a saved exam goes home');
    await page.goto(base + '#/instructions');
    await expectHeading(page, /إلى أين/, 'instructions without a plan goes home');
    await page.context().close();
  }
  ok('tampered storage reported and discarded; hostile hash ignored; /exam and /instructions without state go home');

  // 10. A v2 exam whose limit or ids were edited is rejected, not trusted.
  {
    const page = await newPage();
    const ids = examPool(bank, 'nursing').slice(0, 5).map((q) => q.id);
    await seed(page, { exam: { v: 2, kind: 'custom', spec: 'nursing', label: 'x', ids, answers: {}, flags: [], cur: 0, start: Date.now(), limit: 99999999 } });
    await page.goto(base);
    await page.getByRole('alert').first().waitFor();
    assert.ok((await page.getByRole('alert').first().innerText()).includes('اختبار محفوظ'));
    assert.equal(await page.evaluate(() => localStorage.getItem('bank:v1:exam')), null);
    await page.context().close();
  }
  ok('v2 exam with an out-of-range limit is discarded');

  // 11. Full screen refused: the exam continues and says so on screen.
  {
    const page = await newPage({ width: 1280, height: 800 }, { expectConsole: /fullscreen refused/ });
    await page.context().addInitScript(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { get: () => true });
      window.Element.prototype.requestFullscreen = () => Promise.reject(new Error('denied'));
    });
    await page.goto(base + '#/setup/custom/assistant');
    await page.getByRole('button', { name: 'التالي: التعليمات' }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'ابدأ الاختبار' }).click();
    await page.locator('.dot').first().waitFor();
    await page.locator('.alertbar').waitFor();
    assert.ok((await page.locator('.alertbar').innerText()).includes('تعذّر تفعيل ملء الشاشة'));
    assert.ok(await page.locator('.opt').first().isVisible(), 'exam still usable');
    await page.context().close();
  }
  ok('refused full screen shows a visible notice and the exam continues');

  // 11b. Exam by topic: only enabled topics with questions, selection drives pool/count, plan -> exam uses only those topics.
  {
    const page = await newPage({ width: 390, height: 800 });
    await page.goto(base + '#/setup/topic/assistant');
    await page.locator('.topics .chip').first().waitFor();
    assert.equal(await page.locator('.topics .chip').count(), 13);
    assert.ok(await page.getByRole('button', { name: 'التالي: التعليمات' }).isDisabled(), 'nothing chosen yet');
    assert.match(await page.locator('.summary [role=status]').innerText(), /اختر موضوعًا واحدًا على الأقل/);
    const counts = topicCounts(bank, topics, 'assistant');
    const shown = await page.locator('.topics .chip .n').allInnerTexts();
    assert.deepEqual(shown.map(Number), topics.list.map((t) => counts.get(t.n) || 0), 'each chip shows its real count');
    const names = await page.locator('.topics .chip span:first-child').allInnerTexts();
    assert.deepEqual(names.map(ws), topics.list.map((t) => ws(t.ar)));
    await page.locator('.topics .chip').nth(8).click();   // topic 9
    await page.locator('.topics .chip').nth(9).click();   // topic 10
    const pool = topicPool(bank, topics, 'assistant', [9, 10]).length;
    assert.match(await page.locator('.chips[aria-label="عدد الأسئلة"]').evaluate((e) => e.previousElementSibling.textContent), new RegExp(`المتوفر ${pool}`));
    const want = Math.min(50, pool);
    assert.match(await page.locator('.summary [role=status]').innerText(), new RegExp(`2 مواضيع مختارة: ${questionsPhrase(want)} في ${minutesFor(want)} دقيقة`));
    await shot(page, 'topic-390.png', true);
    await page.getByRole('button', { name: 'التالي: التعليمات' }).click();
    await page.getByRole('button', { name: 'رجوع' }).click();
    await page.locator('.topics .chip[aria-pressed="true"]').first().waitFor();
    assert.equal(await page.locator('.topics .chip[aria-pressed="true"]').count(), 2, 'back keeps the chosen topics');
    await page.getByRole('button', { name: 'التالي: التعليمات' }).click();
    await page.getByRole('button', { name: 'ابدأ الاختبار' }).click();
    await page.locator('.dot').first().waitFor();
    assert.equal(await page.locator('.dot').count(), want);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bank:v1:exam')));
    assert.equal(saved.kind, 'topic');
    assert.equal(saved.label, '2 مواضيع مختارة');
    for (const id of saved.ids) assert.ok([9, 10].includes(topics.map.get(id)), `${id} belongs to a chosen topic`);
    assert.ok(saved.ids.every((id) => bank.find((q) => q.id === id).status === 'verified'));
    await page.getByRole('button', { name: 'مراجعة وتسليم' }).first().click();
    await page.getByRole('button', { name: 'نعم، أنهِ الاختبار' }).click();
    await page.locator('.score').waitFor();
    assert.ok((await page.locator('.resultcard').innerText()).includes('2 مواضيع مختارة'));
    await page.getByRole('button', { name: 'اختبار جديد في القسم نفسه' }).click();
    await page.locator('.topics .chip').first().waitFor();
    assert.match(page.url(), /#\/setup\/topic\/assistant$/, 'kind topic returns to the topic tab');
    await page.context().close();

    // dental: only topics that have verified dental questions are enabled; select-all / clear work
    const p2 = await newPage({ width: 1280, height: 800 });
    await p2.goto(base + '#/setup/topic/dental');
    await p2.locator('.topics .chip').first().waitFor();
    const dentalCounts = topicCounts(bank, topics, 'dental');
    const enabled = await p2.locator('.topics .chip').evaluateAll((bs) => bs.map((b, i) => (b.disabled ? 0 : i + 1)).filter(Boolean));
    assert.deepEqual(enabled, [...dentalCounts.keys()].sort((a, b) => a - b));
    await p2.getByRole('button', { name: 'تحديد كل المواضيع' }).click();
    assert.equal(await p2.locator('.topics .chip[aria-pressed="true"]').count(), dentalCounts.size);
    await p2.getByRole('button', { name: 'مسح الاختيار' }).click();
    assert.equal(await p2.locator('.topics .chip[aria-pressed="true"]').count(), 0);
    await noInlineStyle(p2, 'topic setup');
    assert.ok(await noHScroll(p2));
    await p2.context().close();
  }
  ok('topic exam: real counts per topic, selection drives pool, plan uses only chosen topics, back keeps selection');

  // 11c. topics.json unavailable: the feature turns off, the user is told, nothing else breaks.
  {
    const page = await newPage({ width: 1280, height: 800 }, { expectConsole: /topics unavailable|Failed to load resource/ });
    await page.route('**/data/topics.json', (r) => r.fulfill({ status: 404, body: 'nope' }));
    await page.goto(base);
    await page.getByRole('alert').first().waitFor();
    assert.ok((await page.getByRole('alert').first().innerText()).includes('تصنيف المواضيع'));
    assert.equal(await page.locator('.tool').count(), 5, 'no topic tool');
    await page.goto(base + '#/setup/topic/assistant');
    await page.locator('.model').first().waitFor();   // setup is drawn (and fell back to models) before the tab check, or that check would run on the home page
    assert.equal(await page.getByRole('button', { name: 'حسب الموضوع' }).count(), 0, 'no topic tab');
    assert.equal(await page.locator('.model').first().isVisible(), true, 'falls back to models');
    await page.context().close();
  }
  ok('missing topics.json: feature off with a visible notice, rest of the app works');

  // ---------- essay section ----------
  assert.ok(essay && essay.items.length > 0, 'essay.json is valid');
  const essayByQ = new Map(essay.items.map((e) => [ws(e.q), e]));
  const seededExam = (over = {}) => ({
    v: 2, kind: 'custom', spec: 'assistant', label: 'اختبار مخصّص', ids: examPool(bank, 'assistant').slice(0, 10).map((q) => q.id),
    answers: {}, flags: [], cur: 0, limit: 600, phase: 'mcq', start: Date.now(), ...over,
  });
  const [ea, eb] = essayPool(essay, 'assistant');
  const freshEssay = (over = {}) => ({ ids: [ea.id, eb.id], limit: 840, start: null, end: null, answers: {}, checks: {}, ...over });

  // 11d. Whole essay flow on a phone: setup -> instructions -> MCQ section -> hand-over -> write (autosave) -> grade -> results.
  {
    const page = await newPage({ width: 390, height: 800 });
    await page.goto(base + '#/setup/custom/assistant');
    await page.locator('.chips[aria-label="عدد الأسئلة"]').getByRole('button', { name: '10', exact: true }).click();
    const poolN = essayPool(essay, 'assistant').length;
    assert.match(await page.locator('.chips[aria-label="عدد الأسئلة المقالية"]').evaluate((e) => e.previousElementSibling.textContent), new RegExp(`المتوفر ${poolN}`));
    await page.locator('.chips[aria-label="عدد الأسئلة المقالية"]').getByRole('button', { name: /3 أسئلة/ }).click();
    assert.match(await page.locator('.summary [role=status]').innerText(), /اختبار مخصّص: 10 أسئلة في 15 دقيقة \+ قسم مقالي: 3 أسئلة في 21 دقيقة/);
    await shot(page, 'setup-essay-390.png', true);
    await toInstructions(page);
    const instr = await page.locator('#app').innerText();
    assert.ok(instr.includes('ثم قسم مقالي: 3 أسئلة') && instr.includes('21 دقيقة') && instr.includes('لم يراجعها طبيب'), 'instructions describe the essay section');
    await page.getByRole('button', { name: 'رجوع' }).click();
    assert.equal(await page.locator('.chips[aria-label="عدد الأسئلة المقالية"] [aria-pressed="true"]').innerText().then(ws), ws('3 أسئلة (21 دقيقة)'), 'back keeps the essay choice');
    await page.getByRole('button', { name: 'التالي: التعليمات' }).click();
    await page.getByRole('button', { name: 'ابدأ الاختبار' }).click();
    await page.locator('.dot').first().waitFor();

    // section 1
    assert.equal(await page.locator('.dot').count(), 10);
    assert.match(await page.locator('.timer-card small').innerText(), /وقت القسم الأول/);
    assert.ok(['15:00', '14:59'].includes(await page.locator('[role=timer]').innerText()));
    const { correct } = await answer(page, 4, { rightUntil: 3 });
    const st1 = await page.evaluate(() => JSON.parse(localStorage.getItem('bank:v1:exam')));
    assert.equal(st1.phase, 'mcq');
    assert.equal(st1.essay.ids.length, 3);
    assert.equal(st1.essay.start, null, 'the essay clock has not started');
    await page.getByRole('button', { name: 'مراجعة وإنهاء القسم' }).first().click();
    assert.ok((await page.locator('.sheet').innerText()).includes('لا يمكنك العودة إلى أسئلة الاختيار من متعدد'));
    await page.getByRole('button', { name: 'نعم، أنهِ القسم وابدأ المقالي' }).click();

    // section 2: writing
    await page.locator('textarea').first().waitFor();
    assert.equal(await page.locator('textarea').count(), 3);
    assert.equal(await page.locator('.dot').count(), 0, 'no way back to section 1');
    assert.ok(['21:00', '20:59', '20:58'].includes(await page.locator('[role=timer]').innerText()));
    assert.match(await page.locator('.timer-card small').innerText(), /وقت القسم المقالي/);
    assert.equal(await page.getByLabel(/اكتب إجابتك/).count(), 3, 'every answer box has a visible label');
    const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem('bank:v1:exam')));
    assert.equal(st2.phase, 'essay');
    assert.ok(Number.isFinite(st2.mcqEnd) && st2.essay.start === st2.mcqEnd);
    assert.equal(await page.locator('.reveal, .model-ans, .pt').count(), 0, 'no model answers while writing');
    await noLeaks(page, 'essay write');
    await noInlineStyle(page, 'essay write');
    assert.ok(await noHScroll(page), 'essay write horizontal scroll at 390');
    await shot(page, 'essay-write-390.png', true);

    const mine1 = 'أولًا: تعريف الحالة (definition). ثانيًا: الأعراض والعلامات.\nثالثًا: التدبير.';
    const t = page.locator('textarea');
    await t.nth(0).fill(mine1);
    assert.equal(await page.locator('.timer-card .cnt').innerText(), '1');
    await page.waitForTimeout(700);
    await page.reload();
    await page.locator('textarea').first().waitFor();
    assert.equal(await page.locator('textarea').first().inputValue(), mine1, 'autosave survives reload');
    // leaving right after typing must not lose the text (flush on leave)
    await page.locator('textarea').nth(1).fill('إجابة ثانية');
    await page.getByRole('button', { name: 'خروج مؤقت (الوقت يستمر)' }).click();
    await page.getByText('لديك اختبار غير منتهٍ').waitFor();
    await page.getByRole('button', { name: 'متابعة الاختبار' }).click();
    await page.locator('textarea').first().waitFor();
    assert.equal(await page.locator('textarea').nth(1).inputValue(), 'إجابة ثانية');
    assert.equal(await page.locator('.timer-card .cnt').innerText(), '2');

    // finish writing -> confirm sheet -> grading
    await page.getByRole('button', { name: 'أنهِ الكتابة' }).click();
    assert.equal(await page.locator('.stats3 b').allInnerTexts().then((a) => a.join(',')), '2,1');
    await page.getByRole('button', { name: 'العودة إلى الكتابة' }).click();
    assert.equal(await page.locator('textarea').first().inputValue(), mine1, 'going back keeps the text');
    await page.getByRole('button', { name: 'أنهِ الكتابة' }).click();
    await page.getByRole('button', { name: 'نعم، انتقل إلى التصحيح الذاتي' }).click();
    await page.getByRole('heading', { level: 1, name: 'التصحيح الذاتي للمقالي' }).waitFor();
    assert.equal(await page.locator('textarea').count(), 0);
    assert.equal(await page.locator('[role=timer]').count(), 0, 'no clock while grading');
    const st3 = await page.evaluate(() => JSON.parse(localStorage.getItem('bank:v1:exam')));
    assert.equal(st3.phase, 'grade');
    assert.ok(Number.isFinite(st3.essay.end));

    // each card shows the learner's text, the model answer, its key points and https references
    const cards = page.locator('.essay-q');
    assert.equal(await cards.count(), 3);
    let totalPts = 0;
    const picked = [];
    for (let k = 0; k < 3; k++) {
      const card = cards.nth(k);
      const q = ws(await card.locator('.qtext').innerText());
      const it = essayByQ.get(q);
      assert.ok(it, 'essay question comes from essay.json: ' + q.slice(0, 40));
      assert.equal(st3.essay.ids[k], it.id);
      assert.equal(ws(await card.locator('.model-ans').innerText()), ws(it.model));
      assert.equal(await card.locator('.pt').count(), it.points.length);
      assert.deepEqual((await card.locator('.pt span').allInnerTexts()).map(ws), it.points.map(ws));
      const hrefs = await card.locator('.refs a').evaluateAll((as) => as.map((a) => a.href));
      assert.ok(hrefs.length === it.refs.length && hrefs.every((u) => u.startsWith('https://')));
      assert.ok((await card.locator('.badge').innerText()).includes('مسوّدة آلية'));
      totalPts += it.points.length;
      picked.push(it);
    }
    assert.equal(await cards.nth(0).locator('.ansbox').innerText(), mine1);
    assert.equal(await cards.nth(2).locator('.ansbox').count(), 0, 'nothing written: no answer box');
    assert.ok((await cards.nth(2).innerText()).includes('لم تكتب إجابة'));
    assert.ok((await page.locator('#app').innerText()).includes('لم يراجعها طبيب'));
    assert.equal(await page.locator('.timer-card b').innerText(), '0');
    assert.ok((await page.locator('.timer-card .tmeta').innerText()).includes(`من ${totalPts} نقطة`), 'score card names the total points');

    await cards.nth(0).locator('.pt input').nth(0).check();
    await cards.nth(0).locator('.pt input').nth(2).check();
    await cards.nth(1).locator('.pt input').nth(1).check();
    await cards.nth(1).locator('.pt input').nth(1).uncheck();
    await cards.nth(1).locator('.pt input').nth(0).check();
    assert.equal(await page.locator('.timer-card b').innerText(), '3');
    assert.ok((await cards.nth(0).innerText()).includes(`نقاطك: 2 من ${picked[0].points.length}`), 'per-question score');
    await page.waitForTimeout(100);
    await page.reload();
    await page.getByRole('heading', { level: 1, name: 'التصحيح الذاتي للمقالي' }).waitFor();
    assert.equal(await page.locator('.timer-card b').innerText(), '3', 'ticks survive reload');
    assert.ok(await noHScroll(page), 'grade horizontal scroll at 390');
    await noLeaks(page, 'essay grade');
    await noInlineStyle(page, 'essay grade');
    const unnamed = await page.locator('#app button, #app a, #app input, #app textarea').evaluateAll((els) => els.filter((e) => !(e.getAttribute('aria-label') || e.labels?.[0]?.textContent || e.textContent || '').trim()).length);
    assert.equal(unnamed, 0, 'every control has an accessible name');
    await shot(page, 'essay-grade-390.png', true);
    await page.locator('.timer-card').getByRole('button', { name: 'إنهاء وعرض النتيجة' }).click();

    // results: two separate scores
    await page.locator('.score').first().waitFor();
    const scores = await page.locator('.score').allInnerTexts();
    assert.equal(scores.length, 2);
    assert.equal(scores[0], `${correct}/10`);
    assert.equal(scores[1], `3/${totalPts}`);
    assert.ok((await page.locator('.resultcard').nth(1).innerText()).includes('لا تُجمع مع درجة الاختيار من متعدد'));
    assert.equal(await page.locator('.resultcard').nth(1).locator('details').count(), 3);
    assert.equal(await page.evaluate(() => localStorage.getItem('bank:v1:exam')), null, 'exam cleared');
    const res = await page.evaluate(() => localStorage.getItem('bank:v1:result'));
    assert.ok(!res.includes('ثانيًا') && !res.includes('إجابة ثانية'), 'written answers are not kept after submission');
    assert.equal(JSON.parse(res).essay.got, 3);
    await noLeaks(page, 'results with essay');
    await noInlineStyle(page, 'results with essay');
    assert.ok(await noHScroll(page), 'results horizontal scroll at 390');
    await shot(page, 'results-essay-390.png', true);
    await page.reload();
    await page.locator('.score').first().waitFor();
    assert.equal(await page.locator('.score').count(), 2, 'saved result with essay reloads');
    await page.context().close();
  }
  ok('essay flow: setup -> instructions -> MCQ -> hand-over -> writing autosave -> self-grading -> two separate scores');

  // 11e. Time runs out while away: MCQ expiry hands over at its deadline; essay expiry lands in grading at its deadline.
  {
    const start = Date.now() - 605 * 1000;
    const page = await newPage({ width: 1280, height: 800 });
    await seed(page, { exam: seededExam({ start, essay: freshEssay() }) });
    await page.goto(base + '#/exam');
    await page.locator('textarea').first().waitFor({ timeout: 15000 });
    const left = await page.locator('[role=timer]').innerText();
    assert.match(left, /^13:(3|4|5)\d$/, `essay clock counts from the MCQ deadline, got ${left}`);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('bank:v1:exam')));
    assert.equal(st.phase, 'essay');
    assert.equal(st.mcqEnd, start + 600 * 1000);
    assert.equal(st.essay.start, st.mcqEnd);
    await page.context().close();

    const start2 = Date.now() - (600 + 850) * 1000;
    const p2 = await newPage({ width: 1280, height: 800 });
    await seed(p2, { exam: seededExam({ start: start2, essay: freshEssay() }) });
    await p2.goto(base + '#/exam');
    await p2.getByRole('heading', { level: 1, name: 'التصحيح الذاتي للمقالي' }).waitFor({ timeout: 15000 });
    const st2 = await p2.evaluate(() => JSON.parse(localStorage.getItem('bank:v1:exam')));
    assert.equal(st2.phase, 'grade');
    assert.equal(st2.essay.end, start2 + (600 + 840) * 1000, 'section 2 ended at its own deadline');
    await p2.locator('.essay-q').first().locator('.pt input').first().check();
    await p2.locator('.timer-card').getByRole('button', { name: 'إنهاء وعرض النتيجة' }).click();
    await p2.locator('.score').first().waitFor();
    assert.deepEqual(await p2.locator('.resultcard').first().locator('.rbox b').allInnerTexts(), ['0', '0', '10']);
    assert.equal((await p2.locator('.score').nth(1).innerText()).split('/')[0], '1');
    await p2.context().close();
  }
  ok('expiry while away: section 1 hands over at its deadline, section 2 lands in grading at its deadline');

  // 11f. The essay clock has its own alerts and red state, and moves to grading by itself at zero.
  {
    const page = await newPage({ width: 1280, height: 800 });
    const s0 = Date.now() - 1000;
    await seed(page, { exam: seededExam({ start: s0 - 700 * 1000, limit: 600, phase: 'essay', mcqEnd: s0 - 100 * 1000, essay: freshEssay({ start: Date.now() - (840 - 606) * 1000 }) }) });
    await page.goto(base + '#/exam');
    await page.locator('textarea').first().waitFor();
    assert.equal(await page.locator('.timer-card.low').count(), 0, 'not red above 10 minutes');
    await page.locator('.alertbar').waitFor({ timeout: 15000 });
    assert.match(await page.locator('.alertbar').innerText(), /متبقٍ 10 دقائق/);
    assert.equal(await page.locator('[role=status] .alertbar').count(), 1, 'announced in a live region');
    assert.equal(await page.locator('.timer-card.low').count(), 1, 'red for the last 10 minutes');
    await page.context().close();

    const p2 = await newPage({ width: 1280, height: 800 });
    await seed(p2, { exam: seededExam({ start: Date.now() - 2000 * 1000, phase: 'essay', mcqEnd: Date.now() - 1000 * 1000, essay: freshEssay({ start: Date.now() - (840 - 4) * 1000, answers: { [ea.id]: 'كتبت شيئًا قبل انتهاء الوقت' } }) }) });
    await p2.goto(base + '#/exam');
    await p2.locator('textarea').first().waitFor();
    await p2.getByRole('heading', { level: 1, name: 'التصحيح الذاتي للمقالي' }).waitFor({ timeout: 15000 });
    assert.equal(await p2.locator('.essay-q').first().locator('.ansbox').innerText(), 'كتبت شيئًا قبل انتهاء الوقت', 'text written before the end is kept');
    await p2.context().close();
  }
  ok('essay section: own alerts and red clock, auto-move to grading at zero keeps the written text');

  // 11g. Essay pool limits follow the scope (specialty / model / topics); counts above the pool are disabled.
  {
    const page = await newPage({ width: 1280, height: 800 });
    await page.goto(base + '#/setup/custom/dental');
    const poolD = essayPool(essay, 'dental').length;
    const chips = page.locator('.chips[aria-label="عدد الأسئلة المقالية"] button');
    await chips.first().waitFor();
    assert.deepEqual(await chips.evaluateAll((bs) => bs.map((b) => b.disabled)), [false, ...[2, 3, 5].map((c) => c > poolD)]);
    // a topic scope with the smallest essay pool
    let best = null;
    for (const sp of ['assistant', 'nursing', 'midwifery', 'dental']) {
      const counts = topicCounts(bank, topics, sp);
      for (const n of counts.keys()) {
        const p = essayPool(essay, sp, [n]).length;
        if (!best || p < best.p) best = { sp, n, p };
      }
    }
    await page.goto(base + `#/setup/topic/${best.sp}`);
    await page.locator('.topics .chip').first().waitFor();
    await page.locator('.topics .chip').nth(best.n - 1).click();
    assert.match(await page.locator('.chips[aria-label="عدد الأسئلة المقالية"]').evaluate((e) => e.previousElementSibling.textContent), new RegExp(`المتوفر ${best.p} `));
    assert.deepEqual(
      await page.locator('.chips[aria-label="عدد الأسئلة المقالية"] button').evaluateAll((bs) => bs.map((b) => b.disabled)),
      [false, ...[2, 3, 5].map((c) => c > best.p)],
    );
    // models tab: scoped to the selected model's specialty
    const m = models.find((x) => x.spec === 'midwifery');
    await page.goto(base + '#/setup/models/midwifery');
    await page.locator('.model').first().waitFor();
    assert.match(await page.locator('.chips[aria-label="عدد الأسئلة المقالية"]').evaluate((e) => e.previousElementSibling.textContent), new RegExp(`المتوفر ${essayPool(essay, m.spec).length} `));
    await page.context().close();
  }
  ok('essay counts are limited by the real pool of the chosen specialty, model or topics');

  // 11h. A saved essay exam that was tampered with is discarded visibly.
  {
    const page = await newPage();
    const s0 = Date.now() - 5000;
    await seed(page, { exam: seededExam({ phase: 'grade', mcqEnd: s0, essay: freshEssay({ start: s0, end: s0 + 100, checks: { [ea.id]: [99] } }) }) });
    await page.goto(base);
    await page.getByRole('alert').first().waitFor();
    assert.ok((await page.getByRole('alert').first().innerText()).includes('اختبار محفوظ'));
    assert.equal(await page.evaluate(() => localStorage.getItem('bank:v1:exam')), null);
    await page.context().close();
  }
  ok('tampered essay state (tick out of range) is reported and discarded');

  // 11i. essay.json unavailable: feature off with a notice; a saved essay exam is NOT thrown away and works after a reload.
  {
    const page = await newPage({ width: 1280, height: 800 }, { expectConsole: /essay unavailable|Failed to load resource/ });
    const s0 = Date.now() - 5000;
    await seed(page, { exam: seededExam({ start: s0 - 100 * 1000, phase: 'essay', mcqEnd: s0, essay: freshEssay({ start: s0 }) }) });
    await page.route('**/data/essay.json', (r) => r.fulfill({ status: 404, body: 'nope' }));
    await page.goto(base);
    await page.getByRole('alert').first().waitFor();
    const msg = await page.getByRole('alert').first().innerText();
    assert.ok(msg.includes('تعذّر تحميل الأسئلة المقالية') && msg.includes('لم يُحذف'), msg);
    assert.notEqual(await page.evaluate(() => localStorage.getItem('bank:v1:exam')), null, 'the saved exam is kept');
    await page.goto(base + '#/setup/custom/assistant');
    await page.locator('.chips[aria-label="عدد الأسئلة"]').waitFor();
    assert.equal(await page.locator('.chips[aria-label="عدد الأسئلة المقالية"]').count(), 0, 'no essay row');
    await page.unroute('**/data/essay.json');
    await page.reload(); // the app is fully loaded here (its notice is on screen), so no request is in flight
    await page.getByText('لديك اختبار غير منتهٍ').waitFor();
    await page.getByRole('button', { name: 'متابعة الاختبار' }).click();
    await page.locator('textarea').first().waitFor();
    await page.context().close();
  }
  ok('missing essay.json: feature off with a visible notice, saved essay exam kept and resumable after reload');


  // 12. Storage blocked entirely: app still works through the new flow and says so.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/storage unavailable|blocked/.test(m.text())) problems.push('console: ' + m.text()); });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await page.route(/^https:\/\/fonts\./, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto(base);
    await page.getByText('التخزين في المتصفح غير متاح').waitFor();
    await page.locator('a.sign.s-assistant').click();
    await page.locator('.model').first().waitFor();
    await startFromSetup(page);
    await ctx.close();
  }
  ok('blocked localStorage degrades to memory with a visible notice; exam still starts');

  // 13. Keyboard: options selectable with Space, flag and navigation reachable, visible focus ring, icon-only names.
  {
    const page = await newPage();
    await page.goto(base + '#/review/nursing');
    await page.locator('.opt').first().waitFor();
    await page.locator('.opt').first().focus();
    await page.keyboard.press('Space');
    assert.ok(await page.locator('.reveal').isVisible());
    const outline = await page.locator('.btn').first().evaluate((el) => { el.focus(); return getComputedStyle(el).outlineStyle; });
    assert.notEqual(outline, 'none');
    await page.goto(base + '#/setup/custom/assistant');
    await page.getByRole('button', { name: 'التالي: التعليمات' }).click();
    await page.getByRole('button', { name: 'ابدأ الاختبار' }).click();
    await page.locator('.dot').first().waitFor();
    await page.locator('.opt').nth(1).focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.opt[aria-checked="true"]').count(), 1);
    const unnamed = await page.locator('#app button, #app a').evaluateAll((els) => els.filter((e) => !(e.getAttribute('aria-label') || e.textContent || '').trim()).length);
    assert.equal(unnamed, 0, 'every button and link has an accessible name');
    await page.context().close();
  }
  ok('keyboard operation, visible focus and accessible names');
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error('PROBLEMS:\n - ' + [...new Set(problems)].join('\n - '));
  process.exit(1);
}
console.log(`e2e OK (${passed} scenarios, no console errors)`);
