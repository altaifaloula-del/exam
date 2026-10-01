// Security scan for the static site. Fails (exit 1) on any finding, so CI cannot merge it.
// Checks: dangerous DOM/eval APIs, secret-looking strings, CSP presence and strictness (allow-list: only 'self'/'none',
// plus data: for img-src, so nothing can be loaded from a third party), noindex, remote resources referenced from HTML
// or CSS, http:// resources, inline scripts/handlers, inline style attributes (the CSP blocks them), source PDFs/texts
// inside the published folder. Remote requests made from JS are not pattern-scanned: connect-src 'self' blocks them in the
// browser and the e2e tests abort and report any non-local request.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const SITE = new URL('../site/', import.meta.url).pathname;
const findings = [];
const fail = (file, msg) => findings.push(`${relative(SITE, file) || file}: ${msg}`);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const DANGEROUS = [
  [/\binnerHTML\b/, 'innerHTML'], [/\bouterHTML\b/, 'outerHTML'], [/\binsertAdjacentHTML\b/, 'insertAdjacentHTML'],
  [/\bdocument\.write\b/, 'document.write'], [/\beval\s*\(/, 'eval()'], [/\bnew\s+Function\b/, 'new Function'],
  [/\bsetTimeout\s*\(\s*['"`]/, 'setTimeout(string)'], [/\bsetInterval\s*\(\s*['"`]/, 'setInterval(string)'],
];
// Only for site/ (its CSP has no 'unsafe-inline' for styles attributes). The standalone physician page has no CSP and is exempt.
const CSP_BLOCKED = [
  [/\bsetAttribute\s*\(\s*['"`]style['"`]/, "setAttribute('style')"],
  [/\bstyle\s*:\s*['"`]/, "a 'style' attribute passed to h()"],
];
const SECRETS = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'], [/sk-[A-Za-z0-9]{20,}/, 'API secret key'],
  [/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\b(?:api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*['"][^'"]{8,}['"]/i, 'hardcoded credential'],
];

// ---- HTML helpers: comments are ignored, quoted and unquoted attributes are read, entities in URLs are decoded.
const stripComments = (t) => t.replace(/<!--[\s\S]*?-->/g, '');
const decodeEntities = (v) => v
  .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&colon;/gi, ':').replace(/&sol;/gi, '/').replace(/&bsol;/gi, '\\');
function tagsOf(html) {
  const out = [];
  for (const m of html.matchAll(/<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g)) {
    const attrs = new Map();
    for (const a of m[2].matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) attrs.set(a[1].toLowerCase(), decodeEntities(a[2] ?? a[3] ?? a[4] ?? ''));
    out.push({ name: m[1].toLowerCase(), attrs });
  }
  return out;
}
const REMOTE_URL = /^\s*(?:(?:https?|wss?|ftp):|[/\\]{2})/i;               // absolute, protocol-relative or backslash form
const URL_ATTRS = ['src', 'href', 'srcset', 'imagesrcset', 'poster', 'data', 'action', 'formaction', 'xlink:href', 'ping'];
const isRemote = (attr, value) => (attr === 'srcset' || attr === 'imagesrcset' ? value.split(',').some((c) => REMOTE_URL.test(c)) : REMOTE_URL.test(value));

/** CSP allow-list: every source of every directive must be 'self' or 'none' (and data: for img-src). */
function checkCsp(f, csp) {
  if (!/default-src 'none'/.test(csp)) fail(f, "CSP must start from default-src 'none'");
  if (!/object-src 'none'/.test(csp) || !/base-uri 'none'/.test(csp)) fail(f, "CSP must set object-src 'none' and base-uri 'none'");
  for (const d of csp.split(';').map((x) => x.trim()).filter(Boolean)) {
    const [name, ...sources] = d.split(/\s+/);
    for (const src of sources) {
      if (src === "'self'" || src === "'none'" || (name === 'img-src' && src === 'data:')) continue;
      fail(f, `CSP ${name} allows ${src}: only 'self' and 'none' (and data: for img-src) are accepted, because the site must load nothing from third parties, fonts included`);
    }
  }
}

const files = walk(SITE);
let scanned = 0;
for (const f of files) {
  const ext = extname(f).toLowerCase();
  if (['.pdf', '.txt', '.docx'].includes(ext)) fail(f, 'source document inside published folder');
  if (!['.js', '.html', '.css', '.json'].includes(ext)) continue;
  scanned++;
  const text = readFileSync(f, 'utf8');
  if (ext === '.js') for (const [re, name] of DANGEROUS) if (re.test(text)) fail(f, `forbidden API ${name}`);
  if (ext === '.js') for (const [re, name] of CSP_BLOCKED) if (re.test(text)) fail(f, `${name} is blocked by the CSP (use a class)`);
  for (const [re, name] of SECRETS) if (re.test(text)) fail(f, `possible secret (${name})`);
  if (ext === '.html') {
    const html = stripComments(text);
    const tags = tagsOf(html);
    if (tags.some((t) => t.name === 'script' && !t.attrs.has('src'))) fail(f, 'inline <script>');
    if (/(?:src|href|action)\s*=\s*["']http:\/\//i.test(html)) fail(f, 'http:// (non-TLS) resource');
    const csp = tags.find((t) => t.name === 'meta' && (t.attrs.get('http-equiv') || '').toLowerCase() === 'content-security-policy');
    if (!csp) fail(f, 'missing Content-Security-Policy meta');
    else checkCsp(f, csp.attrs.get('content') || '');
    const robots = tags.find((t) => t.name === 'meta' && (t.attrs.get('name') || '').toLowerCase() === 'robots');
    if (!robots || !(robots.attrs.get('content') || '').toLowerCase().split(',').map((x) => x.trim()).includes('noindex')) fail(f, 'missing <meta name="robots" content="noindex…"> (the public site must not be indexed)');
    for (const t of tags) {
      if ([...t.attrs.keys()].some((a) => a.startsWith('on'))) fail(f, `inline event handler attribute on <${t.name}>`);
      if (t.attrs.has('style')) fail(f, `inline style attribute on <${t.name}> (blocked by the CSP)`);
      // Outbound text links (<a href>) are allowed: they load nothing until clicked. Everything else must stay local.
      for (const attr of URL_ATTRS) {
        if (t.name === 'a' && attr !== 'ping') continue;
        if (t.attrs.has(attr) && isRemote(attr, t.attrs.get(attr))) fail(f, `remote resource referenced from HTML: <${t.name} ${attr}=…> (third-party request)`);
      }
    }
  }
  if (ext === '.css' && /(?:@import|url\()\s*["']?\s*(?:(?:https?:)?[/\\]{2})/i.test(text)) fail(f, 'remote URL in CSS (@import/url(): third-party request)');
}

// bank.json: every outbound link must be https
const bank = JSON.parse(readFileSync(join(SITE, 'data/bank.json'), 'utf8'));
for (const q of bank.questions) {
  for (const r of q.refs || []) {
    try {
      if (new URL(r.url).protocol !== 'https:') fail(join(SITE, 'data/bank.json'), `${q.id}: non-https ref ${r.url}`);
    } catch {
      fail(join(SITE, 'data/bank.json'), `${q.id}: invalid ref URL`);
    }
  }
}

// The standalone physician review page is handed to third parties: same forbidden APIs, secrets and non-TLS checks.
const REVIEW = new URL('../review/doctor-review.html', import.meta.url).pathname;
try {
  const text = readFileSync(REVIEW, 'utf8');
  scanned++;
  for (const [re, name] of DANGEROUS) if (re.test(text)) fail(REVIEW, `forbidden API ${name}`);
  for (const [re, name] of SECRETS) if (re.test(text)) fail(REVIEW, `possible secret (${name})`);
  if (/(?:src|href|action)\s*=\s*["']http:\/\//i.test(text)) fail(REVIEW, 'http:// (non-TLS) resource');
  if (/<script[^>]+\bsrc=/i.test(text)) fail(REVIEW, 'external script');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

if (findings.length) {
  console.error('SECURITY SCAN FAILED:\n - ' + findings.join('\n - '));
  process.exit(1);
}
console.log(`security scan OK (${scanned} files)`);
