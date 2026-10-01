import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!doctype html><div id="app"></div>');
globalThis.document = window.document;
globalThis.Node = window.Node;
const { h, mount, flatten } = await import('../site/js/dom.js');

test('h() refuses the style attribute (the CSP would silently drop it)', () => {
  assert.throws(() => h('div', { style: 'width:1px' }), /inline style is blocked/);
  assert.doesNotThrow(() => h('div', { class: 'a' }));
});

test('h() inserts text as text, never as HTML', () => {
  const el = h('p', null, '<img src=x onerror=alert(1)>');
  assert.equal(el.querySelector('img'), null);
  assert.equal(el.textContent, '<img src=x onerror=alert(1)>');
});

test('h() skips null/false attributes and children; mount() never prints "null"', () => {
  const el = h('button', { disabled: false, 'aria-label': null, type: 'button' }, null, false, 'ok');
  assert.equal(el.getAttribute('type'), 'button');
  assert.equal(el.hasAttribute('disabled'), false);
  assert.equal(el.textContent, 'ok');
  const root = window.document.getElementById('app');
  mount(root, null, el, false);
  assert.equal(root.children.length, 1);
});

test('flatten() flattens arrays of any depth (Array.prototype.flat is not available in older browsers)', () => {
  assert.deepEqual(flatten([1, [2, [3, [4, [5]]]], [], null, 'x']), [1, 2, 3, 4, 5, null, 'x']);
  assert.deepEqual(flatten([]), []);
});

test('mount() replaces the previous children, accepts nested arrays and keeps order', () => {
  const root = window.document.getElementById('app');
  mount(root, h('i', null, 'old'));
  const a = h('b', null, 'a');
  const b = h('b', null, 'b');
  const c = h('b', null, 'c');
  mount(root, [a, [null, b, [false, c]]]);
  assert.deepEqual([...root.children].map((n) => n.textContent), ['a', 'b', 'c']);
  mount(root);
  assert.equal(root.children.length, 0, 'mount() with nothing clears the container');
});
