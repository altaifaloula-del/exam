// End-to-end test of the physician review page (review/doctor-review.html) in a real Chromium.
// Run: npm run test:e2e:review   (CHROME_PATH overrides the browser; SHOT_DIR saves screenshots)
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const PAGE = new URL('../../review/doctor-review.html', import.meta.url).pathname;
const html = await readFile(PAGE);
const data = JSON.parse(String(html).match(/id="bank-data">([\s\S]*?)<\/script>/)[1]);
const ITEMS = data.items;

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const problems = [];
let passed = 0;
const ok = (name) => { passed++; console.log('  ok -', name); };
if (process.env.SHOT_DIR) await mkdir(process.env.SHOT_DIR, { recursive: true });
const shot = async (page, name) => { if (process.env.SHOT_DIR) { await page.waitForTimeout(300); await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` }); } };

async function newPage({ viewport = { width: 390, height: 844 }, colorScheme = 'light', init } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'ar', colorScheme, acceptDownloads: true });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('dialog', (d) => { problems.push('unexpected dialog: ' + d.message()); d.dismiss(); });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());     // any external request is blocked
  // Playwright runs the LAST registered matching route first: the fonts stub must come after the catch-all.
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(url);
  return page;
}
const currentId = (page) => page.locator('.card .id').first().innerText();
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

try {
  // 1. Renders on a phone: one question, proposed option marked, no horizontal scroll, no template leaks.
  {
    const page = await newPage();
    assert.equal(ITEMS.length, 395);
    const first = ITEMS[0];
    assert.equal(await currentId(page), first.id);
    assert.equal(await page.locator('.opt').count(), first.options.length);
    assert.equal(await page.locator('.opt.prop').count(), 1);
    assert.ok(await noHScroll(page), 'no horizontal scroll at 390px');
    const text = await page.locator('#app').innerText();
    for (const bad of ['null', 'undefined', '[object Object]']) assert.ok(!text.includes(bad), 'leak: ' + bad);
    await shot(page, 'review-phone');
    ok('phone: first question, one proposed option, no overflow, no leaks');
    await page.context().close();
  }

  // 2. Decisions: agree advances; fix and invalid are recorded; progress survives a reload.
  {
    const page = await newPage();
    const a = ITEMS[0], b = ITEMS[1], c = ITEMS[2];
    await page.locator('.opt.prop').click();                         // agree with the proposed answer of the first question
    await page.waitForFunction((id) => document.querySelector('.card .id').textContent !== id, a.id);
    assert.equal(await currentId(page), b.id, 'auto-advanced to the next question');
    const other = b.options.findIndex((_, k) => k !== b.ans);
    await page.locator('.opt').nth(other).click();                   // pick another option = correction
    await page.waitForFunction((id) => document.querySelector('.card .id').textContent !== id, b.id);
    assert.equal(await currentId(page), c.id);
    await page.getByRole('button', { name: 'معيب', exact: true }).click();
    await page.waitForFunction((id) => document.querySelector('.card .id').textContent !== id, c.id);
    assert.match(await page.locator('.prog').first().innerText(), /3 من 395 بقرار · وافقتَ على 1 · صحّحتَ 1 · عيّبتَ 1/);
    await page.reload();
    assert.match(await page.locator('.prog').first().innerText(), /3 من 395 بقرار/, 'persisted in localStorage');
    await page.getByRole('button', { name: 'السؤال التالي' }).click();
    assert.equal(await currentId(page), ITEMS[1].id);
    await page.getByRole('button', { name: 'السؤال السابق' }).click();
    assert.equal(await currentId(page), ITEMS[0].id, 'next/previous navigate');
    ok('decisions: agree / fix / invalid recorded, auto-advance, survive reload');
    await page.context().close();
  }

  // 3. Export: needs a name; the file has the agreed schema, per-question hashes and mapped decisions.
  let exported;
  {
    const page = await newPage();
    const [a, b, c] = ITEMS;
    await page.locator('.opt.prop').click();
    await page.waitForFunction((id) => document.querySelector('.card .id').textContent !== id, a.id);
    const other = b.options.findIndex((_, k) => k !== b.ans);
    await page.locator('.opt').nth(other).click();
    await page.waitForFunction((id) => document.querySelector('.card .id').textContent !== id, b.id);
    await page.getByRole('button', { name: 'معيب', exact: true }).click();
    await page.getByRole('tab', { name: 'التسليم' }).click();
    await page.getByRole('button', { name: 'حفظ القرارات كملف' }).click();
    assert.match(await page.getByRole('alert').innerText(), /اكتب اسمك/, 'refuses to export without a reviewer name');
    await page.locator('#reviewer').fill('د. اختبار، طبيب باطنة');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'حفظ القرارات كملف' }).click()]);
    const path = await dl.path();
    exported = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(exported.schema, 'physician-review/1');
    assert.equal(exported.bankVersion, data.version);
    assert.equal(exported.reviewer.name, 'د. اختبار، طبيب باطنة');
    assert.deepEqual(Object.keys(exported.decisions).sort(), [a.id, b.id, c.id].sort());
    assert.equal(exported.decisions[a.id].d, 'ok');
    assert.equal(exported.decisions[b.id].d, 'fix');
    assert.notEqual(exported.decisions[b.id].a, b.ans);
    assert.equal(exported.decisions[c.id].d, 'invalid');
    for (const d of Object.values(exported.decisions)) assert.match(d.h, /^[0-9a-f]{8}$/);
    await shot(page, 'review-export');
    ok('export: name required, schema physician-review/1, hashes, ok/fix/invalid mapped');
    await page.context().close();
  }

  // 4. Continue from a saved file in a fresh browser profile; decisions already made locally are never overwritten.
  {
    const page = await newPage();
    await page.getByRole('tab', { name: 'التسليم' }).click();
    await page.locator('#openf').setInputFiles({ name: 'd.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.waitForFunction(() => /أُضيف 3 قرارًا/.test(document.getElementById('exp-status').textContent));
    assert.equal(await page.locator('#reviewer').inputValue(), 'د. اختبار، طبيب باطنة');
    await page.locator('#openf').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":"nope"}') });
    await page.waitForFunction(() => /ليس قرارات مراجعة صالحة/.test(document.getElementById('exp-status').textContent));
    ok('import: valid file merged, junk file rejected with a visible message');
    await page.context().close();
  }

  // 5. Hostile storage: out-of-range answers, unknown ids, wrong types are dropped without a crash.
  {
    const evil = JSON.stringify({ reviewer: 'x'.repeat(500), dec: {
      [ITEMS[0].id]: { d: 'fix', a: 99 }, ghost: { d: 'ok' }, [ITEMS[1].id]: { d: 'hack' }, [ITEMS[2].id]: { d: 'ok', c: 5 }, [ITEMS[3].id]: 'str' } });
    const page = await newPage({ init: `localStorage.setItem(${JSON.stringify('physician-review:' + data.version)}, ${JSON.stringify(evil)})` });
    assert.match(await page.locator('.prog').first().innerText(), /1 من 395 بقرار/, 'only the one valid entry survives');
    await page.getByRole('tab', { name: 'التسليم' }).click();
    assert.equal((await page.locator('#reviewer').inputValue()).length, 80);
    ok('tampered storage sanitised (range, ids, types, length)');
    await page.context().close();
  }

  // 6. Blocked storage degrades to memory with a visible warning; dark theme and desktop render.
  {
    const page = await newPage({ init: `Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})` });
    await page.locator('.opt.prop').click();
    await page.waitForTimeout(600);
    assert.match(await page.locator('.notice.warn').innerText(), /لن يبقى تقدّمك/);
    await page.context().close();
    const dark = await newPage({ colorScheme: 'dark', viewport: { width: 1100, height: 800 } });
    assert.ok(await noHScroll(dark));
    const bg = await dark.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.notEqual(bg, 'rgb(235, 240, 240)', 'dark tokens applied');
    await shot(dark, 'review-desktop-dark');
    await dark.getByRole('button', { name: /الخريطة والفلاتر/ }).click();
    assert.ok(await dark.locator('.cell').count() === 395);
    await dark.getByRole('button', { name: 'تمريض', exact: true }).click();
    assert.equal(await dark.locator('.cell').count(), ITEMS.filter((q) => q.spec === 'nursing').length);
    await shot(dark, 'review-map-dark');
    ok('blocked storage warns; dark + desktop render; specialty filter and map work');
    await dark.context().close();
  }

  // 7. Every link in the data is https and every proposed index is in range.
  for (const q of ITEMS) {
    assert.ok(q.ans == null || (q.ans >= 0 && q.ans < q.options.length), q.id);
    for (const r of q.refs) assert.ok(r.u.startsWith('https://'), q.id);
    assert.match(q.hash, /^[0-9a-f]{8}$/);
  }
  ok('data: 395 items, indexes in range, https refs, hashes present');
} finally {
  await browser.close();
  server.close();
}
if (problems.length) { console.error('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log(`review e2e OK (${passed} scenarios, no console errors)`);
