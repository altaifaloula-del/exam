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
  for (const c of kids.flat(Infinity)) {
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

/** Replaces root's children. null/false entries are skipped (replaceChildren would print them as "null"). */
export function mount(root, ...nodes) {
  root.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false));
}
