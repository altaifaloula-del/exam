#!/usr/bin/env python3
"""Merge BATCH-1 transcriptions (f01-f18) -> data/questions.batch1.json (frozen ids Q0001..Q0643).
Deterministic; batch 2 is added on top by tools/merge_batch2.py without renumbering."""
import json, re, sys, collections
sys.path.insert(0, 'tools')
from cluster import load, cluster, norm

from sources import BATCH1, SOURCES, specialty, trust

def clean(s):
    s = re.sub(r'^\[Q2 True/False\]\s*|^True or false:?\s*', '', s or '', flags=re.I).strip()
    return re.sub(r'\s+', ' ', s)

def quality(r):
    bad = sum(f in ('truncated', 'unreadable', 'source_typo', 'duplicate_options') for f in r['flags'])
    n_ok = sum(1 for o in r['options'] if o.strip() and '??' not in o)
    handwritten = r['src'] in ('f04', 'f16', 'f10', 'f13', 'f15')   # photos/scans: less reliable text
    return (-bad, n_ok, not handwritten, len(r['q']))

def opt_sets_compatible(a, b):
    sa = {norm(o) for o in a['options'] if norm(o) and '??' not in o}
    sb = {norm(o) for o in b['options'] if norm(o) and '??' not in o}
    if len(a['options']) <= 2 and len(b['options']) <= 2:
        return True
    if not sa or not sb:
        return True
    return len(sa & sb) / len(sa | sb) >= 0.5

def source_info(members, canon_opts):
    """Provenance entries + source-answer votes for member rows, mapped onto the canonical options.
    Returns (marks, votes, status, src_ans); status in none|single|agree|conflict."""
    nopt = [norm(o) for o in canon_opts]
    marks = []
    for r in members:
        entry = {'uid': r['uid'], 'src': r['src'], 'page': r['page'], 'no': r['no'],
                 'basis': r['answer_basis'], 'trust': trust(r), 'flags': r['flags'],
                 'answer_text': None, 'answer_ar': r.get('answer_ar')}
        if r['answer'] is not None and r['options']:
            entry['answer_text'] = r['options'][r['answer']].strip()
        marks.append(entry)
    votes = collections.defaultdict(list)
    for m in marks:
        if m['answer_text'] and m['trust'] == 'source':
            t = norm(m['answer_text'])
            hit = next((k for k, o in enumerate(nopt) if o == t), None)
            if hit is None:
                hit = next((k for k, o in enumerate(nopt) if t and o and (t in o or o in t)), None)
            m['mapped_index'] = hit
            if hit is not None:
                votes[hit].append(m['src'])
    if not votes:
        status, src_ans = 'none', None
    elif len(votes) == 1:
        src_ans = next(iter(votes)); status = 'agree' if len(votes[src_ans]) > 1 else 'single'
    else:
        src_ans = None; status = 'conflict'
    return marks, votes, status, src_ans


def main():
    rows = [r for r in load() if r['src'] in BATCH1]   # batch 2 is merged by merge_batch2.py
    idx = {r['uid']: i for i, r in enumerate(rows)}
    groups, _ = cluster(rows)
    parent = {}
    for g in groups:
        for i in g:
            parent[i] = g[0]
    def find(x):
        while parent[x] != x:
            x = parent[x]
        return x
    man = json.load(open('data/merges.json', encoding='utf-8'))
    for g in man['merge']:
        r0 = find(idx[g[0]])
        for u in g[1:]:
            parent[find(idx[u])] = r0
    # keep_separate: split auto merges (only affects a pair if both in same cluster)
    clusters = collections.defaultdict(list)
    for i in range(len(rows)):
        clusters[find(i)].append(i)
    final = []
    family_of = {}
    for root, members in clusters.items():
        for i in members:
            family_of[i] = rows[root]['uid']
    for members in clusters.values():
        ms = sorted(members, key=lambda i: rows[i]['uid'])
        # sub-group by compatible option sets so different distractor sets stay separate
        subs = []
        for i in sorted(ms, key=lambda i: quality(rows[i]), reverse=True):
            for s in subs:
                if opt_sets_compatible(rows[s[0]], rows[i]):
                    s.append(i); break
            else:
                subs.append([i])
        final += subs
    out = []
    for n, mem in enumerate(sorted(final, key=lambda m: (specialty(rows[m[0]]), rows[m[0]]['src'], rows[m[0]]['page'], rows[m[0]]['no'] or 0)), 1):
        canon = rows[mem[0]]  # best quality first
        opts = [o.strip() for o in canon['options']]
        marks, votes, status, src_ans = source_info([rows[i] for i in mem], opts)
        weak_marks = [m for m in marks if m['answer_text'] and m['trust'] == 'weak']
        is_tf = len(opts) == 2 and {norm(o) for o in opts} <= {'true', 'false', 't', 'f'}
        out.append({
            'id': f"Q{n:04d}", 'family': family_of[mem[0]], 'specialty': specialty(canon), 'type': 'tf' if is_tf else 'mcq',
            'lang': canon['lang'], 'q': clean(canon['q']), 'q_ar': canon.get('q_ar'),
            'options': opts, 'source_answer': src_ans, 'source_status': status,
            'source_votes': {str(k): v for k, v in votes.items()},
            'weak_marks': [{'src': m['src'], 'answer_text': m['answer_text']} for m in weak_marks],
            'flags': sorted({f for i in mem for f in rows[i]['flags']}),
            'appearances': len(mem), 'provenance': marks,
        })
    json.dump(out, open('data/questions.batch1.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    c = collections.Counter(q['source_status'] for q in out)
    print('raw rows', len(rows), '-> unique questions', len(out))
    print('by specialty', dict(collections.Counter(q['specialty'] for q in out)))
    print('by type', dict(collections.Counter(q['type'] for q in out)))
    print('source status', dict(c))
    print('repeated (>1 source)', sum(q['appearances'] > 1 for q in out))

if __name__ == '__main__':
    main()
