// Start-up guard. A CLASSIC script (not a module) loaded before the app, written in ES5 on purpose (ESLint enforces it),
// so it runs even in a browser that cannot run the app. Without it such a browser stays on "جارٍ تحميل البنك…" for ever.
// It replaces that line with a visible message when:
//   - the browser does not support ES modules at all, or
//   - one of the site's own scripts (same origin) fails to download, or throws / fails to parse / rejects before the app has drawn its first screen.
// Once the app has drawn anything the "boot" line is gone and this script does nothing. If the app does finish later
// (a slow network, or a false alarm from a browser add-on), the app simply draws over the message.
(function () {
  'use strict';
  var MESSAGE = 'تعذّر تشغيل الموقع في هذا المتصفح، أو لم تكتمل ملفاته بالتحميل. أعد تحميل الصفحة؛ وإن تكرّر ذلك فحدّث المتصفح، أو افتح الرابط في Chrome أو Firefox أو Safari بإصدار حديث.';

  function fail() {
    var boot = document.querySelector('.boot');
    if (!boot || !boot.parentNode) return;      // the app already drew a screen, or the message is already shown
    var wrap = document.createElement('div');
    wrap.className = 'wrap';
    var note = document.createElement('div');
    note.className = 'notice warn';
    note.setAttribute('role', 'alert');
    note.textContent = MESSAGE;                 // text, never HTML
    var p = document.createElement('p');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = 'إعادة تحميل الصفحة';
    btn.onclick = function () { location.reload(); };
    p.appendChild(btn);
    wrap.appendChild(note);
    wrap.appendChild(p);
    boot.parentNode.replaceChild(wrap, boot);
  }

  var ORIGIN = location.origin || (location.protocol + '//' + location.host);
  var ours = function (url) { return typeof url === 'string' && url.indexOf(ORIGIN + '/') === 0; };

  /**
   * Only failures of the site's OWN scripts count (same origin). An image/font/style failing is not fatal, and neither is noise from
   * outside: a script injected by an in-app browser or add-on (its failure fires an error event too), a cross-origin "Script error.",
   * an error with no file name (unless it is a syntax error, which is clearly a parse failure).
   */
  function isOurs(e) {
    if (!e) return false;
    var t = e.target;
    if (t && t !== window) return t.nodeName === 'SCRIPT' && ours(t.src);
    if (e.filename) return ours(e.filename);
    return /SyntaxError/.test(String(e.message));
  }

  /** A rejection counts only when its stack points at one of the site's own files (a rejection with no stack cannot be attributed, so it is ignored). */
  function rejectionIsOurs(e) {
    var r = e && e.reason;
    return !!(r && typeof r.stack === 'string' && r.stack.indexOf(ORIGIN + '/') !== -1);
  }

  if (!('noModule' in document.createElement('script'))) fail();   // no ES-module support: main.js will never run
  window.addEventListener('error', function (e) { if (isOurs(e)) fail(); }, true);   // capture: script download failures do not bubble
  window.addEventListener('unhandledrejection', function (e) { if (rejectionIsOurs(e)) fail(); });
}());
