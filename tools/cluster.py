"""Cluster near-duplicate questions across source files (stdlib only)."""
import json, glob, re, sys, difflib, collections

def load():
    rows = []
    # natural order (g2 < g10): batch-1 files keep their positions, so existing uids never change
    for f in sorted(glob.glob('data/src/out_g*.json'), key=lambda p: int(re.search(r'out_g(\d+)', p).group(1))):
        rows += json.load(open(f, encoding='utf-8'))
    for i, r in enumerate(rows):
        r['uid'] = f"{r['src']}-{i:04d}"
    return rows

def norm(s):
    s = (s or '').lower()
    s = re.sub(r'\[q2 true/false\]|true or false:?', ' ', s)
    s = re.sub(r'[^\w؀-ۿ ]+', ' ', s)
    s = re.sub(r'\b(the|a|an|of|is|are|to|in|and|or)\b', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def sig(r):
    return norm(r['q'])

def opts_sig(r):
    return {norm(o) for o in r['options'] if norm(o) and norm(o) not in ('??',)}

def sim(a, b):
    sa, sb = sig(a), sig(b)
    if not sa or not sb:
        return 0.0
    ta, tb = set(sa.split()), set(sb.split())
    jac = len(ta & tb) / max(1, len(ta | tb))
    seq = difflib.SequenceMatcher(None, sa, sb).ratio()
    oa, ob = opts_sig(a), opts_sig(b)
    stem = max(seq, jac)
    if len(a['options']) <= 2 or len(b['options']) <= 2 or not (oa and ob):
        return stem                      # true/false or no usable options: stem only
    oj = len(oa & ob) / max(1, len(oa | ob))
    return stem * 0.75 + oj * 0.25

def cluster(rows, thr=0.62, link=0.50):
    """Average-link-ish agglomeration: join only if the candidate is >= thr to some
    member AND >= link to every member (prevents chaining distinct questions)."""
    n = len(rows)
    S = {}
    for i in range(n):
        for j in range(i + 1, n):
            v = sim(rows[i], rows[j])
            if v >= link:
                S[(i, j)] = v
    def g(i, j):
        return S.get((i, j) if i < j else (j, i), 0.0)
    cl = [[i] for i in range(n)]
    where = list(range(n))
    cand = sorted(((v, i, j) for (i, j), v in S.items() if v >= thr), reverse=True)
    for v, i, j in cand:
        a, b = where[i], where[j]
        if a == b:
            continue
        if all(g(x, y) >= link for x in cl[a] for y in cl[b]):
            cl[a] += cl[b]
            for x in cl[b]:
                where[x] = a
            cl[b] = []
    return [c for c in cl if c], S

if __name__ == '__main__':
    rows = load()
    groups, S = cluster(rows)
    print('rows', len(rows), 'clusters', len(groups), 'largest', max(map(len, groups)))
    print(collections.Counter(len(g) for g in groups))
