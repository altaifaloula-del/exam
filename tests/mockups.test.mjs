// The exam-model list shown in the phase-2 mockups is computed from the real bank, never typed by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
execFileSync('python3', ['tools/build_mockups_v2.py'], { cwd: root, stdio: 'pipe' });
const html = readFileSync(`${root}mockups/v2.html`, 'utf8');
const bank = JSON.parse(readFileSync(`${root}site/data/bank.json`, 'utf8'));
const models = JSON.parse(html.match(/const MODELS = (\[.*\]);/)[1]);

test('mockups: no unfilled placeholders', () => {
  assert.equal(/__(MODELS|SAMPLES|NMODELS|DUPS)__/.test(html), false);
});

test('mockups: every model has >= 15 verified questions and the agreed duration rule', () => {
  assert.ok(models.length > 0);
  const seen = new Set();
  for (const m of models) {
    assert.ok(m.n >= 15, m.name);
    assert.equal(m.min, Math.ceil((m.n * 1.2) / 5) * 5, m.name);
    const key = `${m.spec}|${m.name}`;
    assert.ok(!seen.has(key), `duplicate model ${key}`);
    seen.add(key);
  }
});

test('mockups: model sizes match the bank (verified only, one count per question id)', () => {
  for (const m of models) {
    const ids = new Set(bank.questions.filter((q) => q.status === 'verified' && q.specialty === m.spec && q.sources.includes(m.name)).map((q) => q.id));
    assert.equal(ids.size, m.n, m.name);
  }
});

test('mockups: sample questions are real verified bank questions', () => {
  const samples = JSON.parse(html.match(/id="samples">([\s\S]*?)<\/script>/)[1]);
  assert.ok(samples.length >= 6);
  for (const s of samples) {
    const q = bank.questions.find((x) => x.id === s.id);
    assert.ok(q && q.status === 'verified' && q.q === s.q, s.id);
  }
});

test('mockups: the model list equals what the site itself computes (Python builder and plan.js agree)', async () => {
  const { examModels } = await import('../site/js/plan.js');
  const site = examModels(bank.questions).map((m) => [m.spec, m.title, m.n, m.minutes]);
  assert.deepEqual(models.map((m) => [m.spec, m.name, m.n, m.min]), site);
});
