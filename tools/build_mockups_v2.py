"""Builds mockups/v2.html from mockups/v2.template.html using the REAL bank (site/data/bank.json).
The exam-model list is computed, never typed: one candidate per (specialty, source paper) with >= MIN verified
questions; papers whose verified question-id sets are identical are merged into one model.
Duration rule under discussion: ceil(n * 1.2 / 5) * 5 minutes (50 questions in 60 minutes, the agreed ratio)."""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIN_Q = 15
GUIDE = 'الدليل العربي الشامل'          # a study guide, not a past paper
SPEC_AR = {'assistant': 'مساعد طبيب', 'nursing': 'تمريض', 'midwifery': 'قبالة', 'dental': 'أسنان'}


def minutes(n):
    return math.ceil(n * 1.2 / 5) * 5


def models(bank):
    ids = defaultdict(set)
    for q in bank['questions']:
        if q['status'] != 'verified':
            continue
        for s in q['sources']:
            ids[(q['specialty'], s)].add(q['id'])
    by_set = defaultdict(list)
    for (spec, src), s in ids.items():
        if len(s) >= MIN_Q:
            by_set[(spec, frozenset(s))].append(src)
    out, dup_groups = [], 0
    for (spec, s), srcs in by_set.items():
        srcs.sort(key=lambda x: (len(x), x))
        if len(srcs) > 1:
            dup_groups += 1
        sub = 'دليل دراسي وليس ورقة امتحان' if srcs[0] == GUIDE else SPEC_AR[spec]
        if len(srcs) > 1:
            sub = 'نسخ متطابقة: ' + '، '.join(srcs[1:])
        out.append({'spec': spec, 'name': srcs[0], 'src': sub, 'n': len(s), 'min': minutes(len(s)), 'guide': srcs[0] == GUIDE,
                    'same': srcs})
    out.sort(key=lambda m: (list(SPEC_AR).index(m['spec']), -m['n'], m['name']))
    return out, dup_groups


def main():
    bank = json.loads((ROOT / 'site/data/bank.json').read_text(encoding='utf-8'))
    samples = json.loads((Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'mockups/samples_v2.json').read_text(encoding='utf-8'))
    by_id = {q['id']: q for q in bank['questions']}
    for s in samples:                       # samples must be real, verified bank questions with the real wording
        q = by_id[s['id']]
        assert q['status'] == 'verified' and q['q'] == s['q'] and q['options'] == s['options'], s['id']
    ms, dups = models(bank)
    tpl = (ROOT / 'mockups/v2.template.html').read_text(encoding='utf-8')
    # `</` must not appear inside an inline script/JSON block
    js = lambda o: json.dumps(o, ensure_ascii=False).replace('</', '<\\/').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    groups = [m for m in ms if len(m['same']) > 1]
    duptext = ' و'.join(f"«{m['same'][0]}» مع {len(m['same']) - 1} نسخة متطابقة ({m['n']} سؤالًا)" for m in groups)
    assert dups == len(groups)
    out = (tpl.replace('__SAMPLES__', js(samples)).replace('__MODELS__', js(ms))
           .replace('__NMODELS__', str(len(ms))).replace('__DUPS__', duptext))
    assert '__' not in ''.join(w for w in out.split() if w.startswith('__') and w.endswith('__')), 'unfilled placeholder'
    (ROOT / 'mockups/v2.html').write_text(out, encoding='utf-8')
    print(f'models={len(ms)} merged_groups={dups} samples={len(samples)} bytes={len(out.encode())}')
    for m in ms:
        print(f"  {m['spec']:<10}{m['n']:>4}q {m['min']:>4}m  {m['name']}" + ('  [guide]' if m['guide'] else ''))


if __name__ == '__main__':
    main()
