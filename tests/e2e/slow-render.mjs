// Optional stress mode for the e2e tests. E2E_SLOW_HASH_MS=250 makes the app handle every hash navigation that many
// milliseconds late, like a slow runner would. It exposes tests that read the page right after a click that changes the
// route (the race that failed the first CI run). Unset = off. A wrong value stops the run instead of being ignored.
export async function applySlowRender(ctx) {
  const raw = process.env.E2E_SLOW_HASH_MS;
  if (raw == null || raw === '') return;
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms < 1 || ms > 5000) throw new Error(`E2E_SLOW_HASH_MS must be an integer from 1 to 5000, got "${raw}"`);
  await ctx.addInitScript(`(() => {
    const add = window.addEventListener.bind(window);
    window.addEventListener = (type, fn, opts) => (type === 'hashchange' ? add(type, (e) => setTimeout(() => fn(e), ${ms}), opts) : add(type, fn, opts));
  })();`);
}
