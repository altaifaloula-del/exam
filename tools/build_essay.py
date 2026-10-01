"""Builds site/data/essay.json from the authored drafts in data/essay/src_*.json.
Every rule below fails loudly. Essays are AI-written drafts grounded in the bank's verified questions and their references;
no physician reviewed them (the site shows a draft badge). Run: python3 tools/build_essay.py"""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPECS = ['assistant', 'nursing', 'midwifery', 'dental']
KEYS = {'spec', 'topic', 'q', 'model', 'points', 'refs', 'from', 'fetched'}
TARGET = {'assistant': 40, 'nursing': 40, 'midwifery': 25, 'dental': 15}   # what the user approved
LIM = {'q': 380, 'model': 1500, 'point_min': 12, 'point_max': 300, 'title': 160}
BAD_TEXT = re.compile(r'https?://|[<>]')


def main():
    bank = {q['id']: q for q in json.loads((ROOT / 'site/data/bank.json').read_text(encoding='utf-8'))['questions']}
    excluded = {(e['src'], e['index']) for e in json.loads((ROOT / 'data/essay/excluded.json').read_text(encoding='utf-8'))}
    rows = []
    for f in sorted((ROOT / 'data/essay').glob('src_*.json')):
        tag = f.stem.split('_', 1)[1]
        for i, it in enumerate(json.loads(f.read_text(encoding='utf-8'))):
            if (tag, i) in excluded:
                continue
            rows.append((tag, i, it))
    assert {(t, i) for t, i, _ in rows}.isdisjoint(excluded)
    seen_q = set()
    clean = []
    for tag, i, it in rows:
        where = f'{tag}[{i}]'
        assert set(it) == KEYS, (where, set(it) ^ KEYS)
        assert it['spec'] in SPECS, where
        assert isinstance(it['topic'], int) and 1 <= it['topic'] <= 13, where
        for k in ('q', 'model'):
            assert isinstance(it[k], str) and it[k].strip() and len(it[k]) <= LIM[k] and not BAD_TEXT.search(it[k]), (where, k)
        assert 3 <= len(it['points']) <= 7, where
        for p in it['points']:
            assert isinstance(p, str) and LIM['point_min'] <= len(p) <= LIM['point_max'] and not BAD_TEXT.search(p), (where, p[:40])
        assert len(set(it['points'])) == len(it['points']), where
        ids = it['from']
        assert isinstance(ids, list) and len(set(ids)) == len(ids) >= 2, where
        allowed = set()
        for qid in ids:
            q = bank[qid]
            assert q['status'] == 'verified' and q['specialty'] == it['spec'], (where, qid)
            allowed |= {r['url'] for r in q['refs']}
        assert isinstance(it['fetched'], list) and all(u.startswith('https://') for u in it['fetched']), where
        allowed |= set(it['fetched'])
        assert it['refs'], where
        for r in it['refs']:
            assert set(r) == {'title', 'url'} and r['url'].startswith('https://') and 0 < len(r['title']) <= LIM['title'], (where, r)
            assert r['url'] in allowed, (where, 'reference not from the source questions or fetched', r['url'])
        key = re.sub(r'\s+', ' ', it['q']).strip()
        assert key not in seen_q, (where, 'duplicate question text')
        seen_q.add(key)
        clean.append((tag, i, it))
    clean.sort(key=lambda x: (SPECS.index(x[2]['spec']), x[2]['topic'], x[0], x[1]))
    items = []
    for n, (tag, i, it) in enumerate(clean, 1):
        items.append({'id': f'E{n:03d}', 'spec': it['spec'], 'topic': it['topic'], 'q': it['q'].strip(), 'model': it['model'].strip(),
                      'points': [p.strip() for p in it['points']], 'refs': it['refs'], 'from': it['from']})
    (ROOT / 'data/essay/id_map.json').write_text(json.dumps({f'E{n:03d}': [t, i] for n, (t, i, _) in enumerate(clean, 1)}, indent=0), encoding='utf-8')
    out = {'v': 1, 'draft': True, 'items': items}
    (ROOT / 'site/data/essay.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    c = Counter(x['spec'] for x in items)
    shortfall = {s: TARGET[s] - c[s] for s in SPECS if c[s] != TARGET[s]}
    report = {'items': len(items), 'per_spec': dict(c), 'approved_target': TARGET, 'shortfall_vs_target': shortfall,
              'points_total': sum(len(x['points']) for x in items), 'fetched_extra_refs': sum(len(r[2]['fetched']) for r in rows)}
    (ROOT / 'data/essay/report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
