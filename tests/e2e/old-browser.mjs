// Optional stress mode for the e2e tests. E2E_OLD_BROWSER=1 removes, before the app starts, browser APIs that are newer than
// the site's syntax floor (ES2019: Chrome 66 / Firefox 60 / Safari 11.1; e.g. flat is Chrome 69 / Safari 12, replaceChildren 86 / 14):
// the app must run without them. ESLint enforces the syntax floor (ecmaVersion 2019); this mode covers the runtime APIs a linter cannot see.
// The list is what the app could plausibly reach for, not every API newer than the floor. Unset = off. A wrong value stops the run,
// and an API that cannot be removed throws inside the page, so the mode can never silently do nothing.
// Not removed on purpose: APIs the test harness itself relies on. globalThis is one (Playwright's evaluate() needs it), so its
// use is checked statically instead: tests/compat.test.mjs.
export const REMOVED = [
  ['Array.prototype', 'flat'], ['Array.prototype', 'flatMap'], ['Array.prototype', 'at'], ['Array.prototype', 'findLast'],
  ['String.prototype', 'at'], ['String.prototype', 'matchAll'], ['String.prototype', 'replaceAll'],
  ['Object', 'fromEntries'], ['Object', 'hasOwn'], ['Promise', 'allSettled'],
  ['Element.prototype', 'replaceChildren'], ['Element.prototype', 'toggleAttribute'],
  ['Document.prototype', 'replaceChildren'], ['DocumentFragment.prototype', 'replaceChildren'],
  ['window', 'structuredClone'],
];

export const oldBrowserOn = () => process.env.E2E_OLD_BROWSER === '1';

export async function applyOldBrowser(ctx) {
  const raw = process.env.E2E_OLD_BROWSER;
  if (raw == null || raw === '') return;
  if (raw !== '1') throw new Error(`E2E_OLD_BROWSER must be 1 or unset, got "${raw}"`);
  await ctx.addInitScript(`(() => {
    for (const [path, key] of ${JSON.stringify(REMOVED)}) {
      const owner = path === 'window' ? window : path.split('.').reduce((o, k) => o[k], window);
      delete owner[key];
      if (key in owner) throw new Error('E2E_OLD_BROWSER: could not remove ' + path + '.' + key);
    }
  })();`);
}

/** Names of the listed APIs that are still present in the page (must be empty when the mode is on). */
export function stillPresent(page) {
  return page.evaluate((list) => list.filter(([path, key]) => {
    const owner = path === 'window' ? window : path.split('.').reduce((o, k) => o[k], window);
    return key in owner;
  }).map(([path, key]) => `${path}.${key}`), REMOVED);
}
