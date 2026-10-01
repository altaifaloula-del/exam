// Wall-clock countdown shared by the multiple-choice and essay sections: the clock element, the red "low time" state,
// the visual alerts (10/5/1 minutes, only those below the section's length) and the expiry callback.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { formatClock, remaining } from '../logic.js';
import { alertSeconds, alertText } from '../plan.js';

export const LOW_SEC = 600;          // the clock turns red for the last 10 minutes
const ALERT_SHOW_MS = 6000;

/** start: ms timestamp the section began; limit: seconds; onExpire: called once when the time reaches zero. */
export function createClock(ctx, { start, limit, onExpire }) {
  const thresholds = alertSeconds(limit);
  const announced = new Set();
  let left = remaining(start, Date.now(), limit);
  let card = null;
  let timer = null;
  let alertTimer = null;
  let stopped = false;
  const el = h('b', { class: 'mono', role: 'timer', 'aria-label': 'الوقت المتبقي' }, formatClock(left));
  const alertEl = h('div', { role: 'status' });
  for (const t of thresholds) if (left <= t) announced.add(t); // never announce a threshold that already passed

  function paint(text) {
    alertEl.replaceChildren(...(text ? [h('div', { class: 'alertbar' }, icon('bell'), text)] : []));
  }
  /** text stays until replaced, or disappears after a few seconds when autoClear is set. */
  function message(text, { autoClear = false } = {}) {
    paint(text);
    clearTimeout(alertTimer);
    if (autoClear) alertTimer = setTimeout(() => paint(null), ALERT_SHOW_MS);
  }

  function tick() {
    if (stopped) return;
    left = remaining(start, Date.now(), limit);
    const txt = formatClock(left);
    if (el.textContent !== txt) el.textContent = txt;
    if (card) card.classList.toggle('low', left <= LOW_SEC);
    for (const t of thresholds) {
      if (left <= t && left > 0 && !announced.has(t)) { announced.add(t); message(alertText(t), { autoClear: true }); }
    }
    if (left <= 0) onExpire();
  }
  const onVisible = () => { if (document.visibilityState === 'visible') tick(); };

  function stop() {
    stopped = true;
    clearInterval(timer);
    clearTimeout(alertTimer);
    document.removeEventListener('visibilitychange', onVisible);
  }
  function run() {
    timer = setInterval(tick, 500);
    document.addEventListener('visibilitychange', onVisible);
    ctx.onLeave(stop);
  }

  return {
    el,
    alertEl,
    left: () => left,
    isLow: () => left <= LOW_SEC,
    bind(c) { card = c; },
    message,
    run,
    stop,
  };
}
