// Tiny DOM helper. Text is ALWAYS inserted as text nodes (never parsed as HTML).
import { safeHttpsUrl } from './logic.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k of Object.keys(attrs || {})) {
    const v = attrs[k];
    if (v === false || v == null) continue;
    if (k === 'style') throw new Error('inline style is blocked by the CSP; use a class');
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of flatten(kids)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Anchor that only ever points at an https URL; otherwise plain text. */
export function safeLink(url, label) {
  const href = safeHttpsUrl(url);
  if (!href) return h('span', null, label || '');
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label || href);
}

/** Nested arrays -> one flat array (Array.prototype.flat(Infinity) is not available in older browsers). */
export function flatten(list, out = []) {
  for (const x of list) {
    if (Array.isArray(x)) flatten(x, out);
    else out.push(x);
  }
  return out;
}

/** Replaces root's children. null/false entries are skipped (they would otherwise be printed as "null"). */
export function mount(root, ...nodes) {
  const fresh = flatten(nodes).filter((n) => n != null && n !== false);
  while (root.firstChild) root.removeChild(root.firstChild);
  for (const n of fresh) root.append(n);
}
