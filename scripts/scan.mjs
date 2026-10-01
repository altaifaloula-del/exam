// Security scan for the static site. Fails (exit 1) on any finding, so CI cannot merge it.
// Checks: dangerous DOM/eval APIs, secret-looking strings, CSP presence/strictness, http:// resources,
// inline scripts/handlers, inline style attributes (the CSP blocks them), source PDFs/texts inside the published folder.
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

const files = walk(SITE);
for (const f of files) {
  const ext = extname(f).toLowerCase();
  if (['.pdf', '.txt', '.docx'].includes(ext)) fail(f, 'source document inside published folder');
  if (!['.js', '.html', '.css', '.json'].includes(ext)) continue;
  const text = readFileSync(f, 'utf8');
  if (ext === '.js') for (const [re, name] of DANGEROUS) if (re.test(text)) fail(f, `forbidden API ${name}`);
  if (ext === '.js') for (const [re, name] of CSP_BLOCKED) if (re.test(text)) fail(f, `${name} is blocked by the CSP (use a class)`);
  for (const [re, name] of SECRETS) if (re.test(text)) fail(f, `possible secret (${name})`);
  if (ext === '.html' || ext === '.js') {
    if (/\son[a-z]+\s*=\s*["']/i.test(text) && ext === '.html') fail(f, 'inline event handler attribute');
    if (ext === '.html' && /<[a-z][^>]*\sstyle\s*=/i.test(text)) fail(f, 'inline style attribute (blocked by the CSP)');
  }
  if (ext === '.html') {
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(text)) fail(f, 'inline <script>');
    if (/(?:src|href|action)\s*=\s*["']http:\/\//i.test(text)) fail(f, 'http:// (non-TLS) resource');
    const m = text.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
    if (!m) fail(f, 'missing Content-Security-Policy meta');
    else {
      const csp = m[1];
      if (!/default-src 'none'/.test(csp)) fail(f, "CSP must start from default-src 'none'");
      if (/'unsafe-inline'|'unsafe-eval'/.test(csp.replace(/style-src[^;]*/, ''))) fail(f, 'CSP allows unsafe-inline/eval outside styles');
      if (/script-src[^;]*https?:/.test(csp)) fail(f, 'CSP script-src allows a remote origin');
      if (!/object-src 'none'/.test(csp) || !/base-uri 'none'/.test(csp)) fail(f, "CSP must set object-src 'none' and base-uri 'none'");
    }
  }
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
let scanned = files.length;
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
