"""Builds site/data/topics.json (question id -> topic number) from the recorded classification passes.
Final label = lead's adjudication when pass A and pass B disagreed, otherwise pass A (equal to pass B when B exists).
Passes are AI judgements approved in structure by the user (13 topics); no physician reviewed them.
Run: python3 tools/build_topics.py  (deterministic; fails loudly on any inconsistency)."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOPICS = [  # approved by the user on 2026-09-30 (DECISIONS.md)
    (1, 'التشريح والفسيولوجيا', 'Anatomy & Physiology'),
    (2, 'الفحص السريري والعلامات الحيوية', 'Physical examination & vital signs'),
    (3, 'القلب والدورة الدموية والدم والجهاز التنفسي', 'Cardiovascular, hematology & respiratory'),
    (4, 'الجهاز الهضمي والكبد والكلى والمسالك البولية', 'GI, hepatic, renal & urinary'),
    (5, 'الغدد والسكري والتغذية', 'Endocrine, diabetes & nutrition'),
    (6, 'الأعصاب والصحة النفسية', 'Neurology & mental health'),
    (7, 'الأمراض المعدية ومكافحة العدوى والتطعيم', 'Infectious disease, infection control & immunization'),
    (8, 'الأدوية والحقن وحساب الجرعات', 'Pharmacology, injections & dose calculation'),
    (9, 'الإسعاف والطوارئ والإصابات والحروق', 'Emergency, trauma, burns & poisoning'),
    (10, 'الجراحة والجروح والعناية قبل العملية وبعدها', 'Surgery, wounds & perioperative care'),
    (11, 'الحمل والولادة وصحة المرأة والمولود والطفل', 'Obstetrics, gynecology, newborn & pediatrics'),
    (12, 'أساسيات التمريض والإجراءات والصحة العامة والأخلاقيات', 'Nursing fundamentals, procedures, public health & ethics'),
    (13, 'الأسنان وطب الفم', 'Dental & oral health'),
]


def load(name):
    return json.loads((ROOT / 'data/topics' / name).read_text(encoding='utf-8'))


def main():
    bank = json.loads((ROOT / 'site/data/bank.json').read_text(encoding='utf-8'))['questions']
    ids = {q['id'] for q in bank}
    a, b, adj = load('pass_a.json'), load('pass_b.json'), load('adjudication.json')
    assert set(a) == ids, 'pass A must cover exactly the bank'
    assert set(b) <= ids and set(adj) <= set(b), 'pass B / adjudication ids must be bank ids'
    nums = {t[0] for t in TOPICS}
    for d in (a, b):
        for k, v in d.items():
            assert v[0] in nums and v[1] in ('h', 'l'), (k, v)
    disagree = {k for k in b if b[k][0] != a[k][0]}
    assert disagree == set(adj), f'every disagreement needs an adjudication: {disagree ^ set(adj)}'
    assert all(v in nums for v in adj.values())
    final = {k: adj.get(k, a[k][0]) for k in sorted(ids)}
    out = {'v': 1, 'topics': [{'n': n, 'ar': ar, 'en': en} for n, ar, en in TOPICS], 'map': final}
    (ROOT / 'site/data/topics.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    by_id = {q['id']: q for q in bank}
    c = Counter(final.values())
    ver = Counter((by_id[k]['specialty'], v) for k, v in final.items() if by_id[k]['status'] == 'verified')
    report = {
        'questions': len(final), 'per_topic': {str(n): c[n] for n in sorted(c)},
        'double_labelled': len(b), 'disagreements_adjudicated': len(adj),
        'low_confidence_pass_a': sum(1 for v in a.values() if v[1] == 'l'),
        'verified_per_specialty_topic': {f'{s}:{t}': n for (s, t), n in sorted(ver.items())},
    }
    (ROOT / 'data/topics/report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
