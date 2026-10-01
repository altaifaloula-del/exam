#!/usr/bin/env python3
"""Add batch-2 rows (sources f21+) on top of the FROZEN batch-1 questions WITHOUT renumbering.

  data/questions.batch1.json + data/src/out_g*.json + data/merges_batch2.json
      -> data/questions.raw.json   (input of finalize.py)
      -> data/batch2_changes.json  (what changed: new ids, attached rows, rescued, to re-verify)

Rules
 * A new row attaches to an existing question when its best similarity to a member row is >= THR and the option
   sets are compatible (same thresholds as batch 1; true/false stems must also be >= LINK to every member).
   The existing question keeps its id, family and canonical text, so its verification result stays valid.
 * Exception ("rescue"): if the existing canonical is unusable (verdict unanswerable / placeholder options) and an
   attached new row is complete, the new row becomes the canonical text and the question is queued for re-verification.
 * Unattached new rows are clustered among themselves and become new questions Q0644...
 * Questions that gain a trusted source mark contradicting the verified answer (or that were not verified) are queued
   for re-verification.  Deterministic: re-run after editing data/merges_batch2.json or data/src/out_g*.json.
"""
import json, re, sys, glob, collections, difflib
sys.path.insert(0, 'tools')
from cluster import load, cluster, norm, sim
from build import source_info, opt_sets_compatible, clean, quality
from sources import BATCH1, specialty

THR, LINK, FAM = 0.62, 0.50, 0.75   # FAM: new question this similar to another one joins its family
PLACEHOLDER = re.compile(r'^[\s.…?؟•\-_]*$')


def _fuzzy_in(o, pool, cut=0.8):
    return any(o == p or difflib.SequenceMatcher(None, o, p).ratio() >= cut for p in pool)


def compat2(a, b):
    """Batch-1 rule (option Jaccard >= 0.5) OR one option list is (fuzzily) contained in the other:
    a truncated / partial copy of the same question must still attach."""
    if opt_sets_compatible(a, b):
        return True
    sa = {norm(o) for o in a['options'] if norm(o) and '??' not in o}
    sb = {norm(o) for o in b['options'] if norm(o) and '??' not in o}
    if not sa or not sb:
        return True
    small, big = (sa, sb) if len(sa) <= len(sb) else (sb, sa)
    return sum(_fuzzy_in(o, big) for o in small) / len(small) >= 0.75


def unusable(opts):
    return len(opts) < 2 or any(PLACEHOLDER.match(o or '') or '??' in (o or '') for o in opts)


def row_ok(r):
    return (not set(r['flags']) & {'truncated', 'unreadable'} and not unusable(r['options'])
            and len(r['options']) >= 2)


def main():
    rows = load()
    by_uid = {r['uid']: r for r in rows}
    old = json.load(open('data/questions.batch1.json', encoding='utf-8'))
    man = json.load(open('data/merges_batch2.json', encoding='utf-8'))
    q_of_uid = {p['uid']: n for n, q in enumerate(old) for p in q['provenance']}
    new_rows = [r for r in rows if r['src'] not in BATCH1]
    old_members = [[by_uid[p['uid']] for p in q['provenance']] for q in old]
    assert all(r['uid'] in q_of_uid for r in rows if r['src'] in BATCH1), 'batch-1 rows changed: rebuild batch1 first'
    forced_attach = {}          # new uid -> old question index
    forced_group = []           # groups of new uids that must be one question
    sep = {frozenset(p) for p in man.get('keep_separate', [])}
    for g in man.get('merge', []):
        olds = [q_of_uid[u] for u in g if u in q_of_uid]
        news = [u for u in g if u not in q_of_uid]
        if olds:
            for u in news:
                forced_attach[u] = olds[0]
        elif len(news) > 1:
            forced_group.append(news)

    # ---- step 1: attach to existing questions
    old_rows_flat = [(r, n) for n, mem in enumerate(old_members) for r in mem]
    attached = collections.defaultdict(list)   # old question index -> new rows
    free = []
    for nr in new_rows:
        if nr['uid'] in forced_attach:
            attached[forced_attach[nr['uid']]].append(nr)
            continue
        best = (0.0, None, None)
        per_q = collections.defaultdict(list)
        for r, n in old_rows_flat:
            if frozenset((nr['uid'], r['uid'])) in sep:
                continue
            s = sim(nr, r)
            per_q[n].append(s)
            if s > best[0]:
                best = (s, r, n)
        s, r, n = best
        if r is not None and s >= THR and compat2(nr, r):
            tf = len(nr['options']) <= 2 or len(r['options']) <= 2
            if not tf or min(per_q[n]) >= LINK:
                attached[n].append(nr)
                continue
        free.append(nr)

    # ---- step 2: new questions from the remaining rows
    uidpos = {r['uid']: i for i, r in enumerate(free)}
    groups, _ = cluster(free) if free else ([], None)
    parent = {i: g[0] for g in groups for i in g}
    find = lambda x: x if parent[x] == x else find(parent[x])
    for g in forced_group:
        ids = [uidpos[u] for u in g if u in uidpos]
        for i in ids[1:]:
            parent[find(i)] = find(ids[0])
    clusters = collections.defaultdict(list)
    for i in range(len(free)):
        clusters[find(i)].append(i)
    final, family_of = [], {}
    for root, members in clusters.items():
        for i in members:
            family_of[i] = free[root]['uid']
        subs = []
        for i in sorted(sorted(members, key=lambda i: free[i]['uid']), key=lambda i: quality(free[i]), reverse=True):
            for s_ in subs:
                if opt_sets_compatible(free[s_[0]], free[i]):
                    s_.append(i); break
            else:
                subs.append([i])
        final += subs

    # ---- existing results (to decide rescue / re-verification)
    res = {}
    for f in sorted(glob.glob('data/verify/result_*.json')):
        for r in json.load(open(f, encoding='utf-8')):
            res[r['id']] = r
    ov = json.load(open('data/overrides.json', encoding='utf-8'))

    changes = {'attached': {}, 'rescued': [], 'recheck': [], 'conflicts': [], 'new_ids': []}
    out = []
    for n, q in enumerate(old):
        q = json.loads(json.dumps(q))
        add = attached.get(n, [])
        if add:
            members = old_members[n] + add
            canon_row = by_uid[q['provenance'][0]['uid']]
            r0 = res.get(q['id'], {})
            defect = r0.get('verdict') == 'unanswerable' or unusable(q['options'])
            better = [r for r in add if row_ok(r) and compat2(r, canon_row)]
            if defect and better and q['id'] not in ov:
                best = sorted(better, key=quality, reverse=True)[0]
                members = [best] + [m for m in members if m is not best]
                q['q'], q['q_ar'], q['lang'] = clean(best['q']), best.get('q_ar'), best['lang']
                q['options'] = [o.strip() for o in best['options']]
                changes['rescued'].append(q['id'])
                changes['recheck'].append(q['id'])
            marks, votes, status, src_ans = source_info(members, q['options'])
            q['provenance'] = marks
            q['source_answer'], q['source_status'] = src_ans, status
            q['source_votes'] = {str(k): v for k, v in votes.items()}
            q['weak_marks'] = [{'src': m['src'], 'answer_text': m['answer_text']} for m in marks if m['answer_text'] and m['trust'] == 'weak']
            q['flags'] = sorted({f for m in members for f in m['flags']})
            q['appearances'] = len(members)
            changes['attached'][q['id']] = [r['uid'] for r in add]
            new_votes = {k for k, v in votes.items() if any(s not in BATCH1 for s in v)}
            cur = (ov.get(q['id']) or {}).get('answer', r0.get('answer'))
            verified_like = r0.get('verdict') in ('confirmed', 'corrected', 'answered') and r0.get('confidence') in ('high', 'medium')
            if new_votes:
                if (not verified_like) and q['id'] not in changes['recheck']:
                    changes['recheck'].append(q['id'])
                for k in sorted(new_votes):
                    if verified_like and cur is not None and k != cur:
                        changes['conflicts'].append({'id': q['id'], 'verified_answer': cur, 'new_source_mark': k})
                        if q['id'] not in changes['recheck']:
                            changes['recheck'].append(q['id'])
        out.append(q)

    nxt = len(old) + 1
    order = sorted(final, key=lambda m: (specialty(free[m[0]]), free[m[0]]['src'], free[m[0]]['page'], free[m[0]]['no'] or 0))
    for mem in order:
        canon = free[mem[0]]
        opts = [o.strip() for o in canon['options']]
        members = [free[i] for i in mem]
        marks, votes, status, src_ans = source_info(members, opts)
        is_tf = len(opts) == 2 and {norm(o) for o in opts} <= {'true', 'false', 't', 'f'}
        qid = f"Q{nxt:04d}"; nxt += 1
        out.append({
            'id': qid, 'family': family_of[mem[0]], 'specialty': specialty(canon), 'type': 'tf' if is_tf else 'mcq',
            'lang': canon['lang'], 'q': clean(canon['q']), 'q_ar': canon.get('q_ar'), 'options': opts,
            'source_answer': src_ans, 'source_status': status, 'source_votes': {str(k): v for k, v in votes.items()},
            'weak_marks': [{'src': m['src'], 'answer_text': m['answer_text']} for m in marks if m['answer_text'] and m['trust'] == 'weak'],
            'flags': sorted({f for r in members for f in r['flags']}), 'appearances': len(members), 'provenance': marks,
        })
        changes['new_ids'].append(qid)

    # ---- families: collapse same-question variants whose option sets differ (shown once in the bank)
    canon_of = {q['id']: by_uid[q['provenance'][0]['uid']] for q in out}
    fam_parent = {}
    def ff(x):
        fam_parent.setdefault(x, x)
        while fam_parent[x] != x:
            fam_parent[x] = fam_parent[fam_parent[x]]; x = fam_parent[x]
        return x
    def fu(a, b):
        ra, rb = ff(a), ff(b)
        if ra != rb:                       # keep the family with the smallest global row index (old ones win)
            keep, drop = sorted((ra, rb), key=lambda f: int(f.rsplit('-', 1)[1]))
            fam_parent[drop] = keep
    for q in out:
        ff(q['family'])
    newset = set(changes['new_ids'])
    ids = [q['id'] for q in out]
    for a in changes['new_ids']:
        for b in ids:
            if b == a or (b in newset and b < a):
                continue
            if sim(canon_of[a], canon_of[b]) >= FAM:
                fu(next(q['family'] for q in out if q['id'] == a), next(q['family'] for q in out if q['id'] == b))
    uid_fam = {p['uid']: q['family'] for q in out for p in q['provenance']}
    for g in man.get('family', []):
        fams = [uid_fam[u] for u in g if u in uid_fam]
        for f in fams[1:]:
            fu(fams[0], f)
    moved = 0
    for q in out:
        nf = ff(q['family'])
        if nf != q['family']:
            moved += 1; q['family'] = nf
    changes['families_joined'] = moved
    json.dump(out, open('data/questions.raw.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(changes, open('data/batch2_changes.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    new_q = out[len(old):]
    print('batch-1 questions kept:', len(old), '| batch-2 rows:', len(new_rows))
    print(' attached to existing questions:', sum(len(v) for v in attached.values()), 'rows ->', len(attached), 'questions')
    print(' new questions:', len(new_q), 'from', len(free), 'unattached rows')
    print(' by specialty:', dict(collections.Counter(q['specialty'] for q in new_q)))
    print(' by type:', dict(collections.Counter(q['type'] for q in new_q)))
    print(' new with a trusted source mark:', sum(q['source_status'] != 'none' for q in new_q), '| repeated inside batch 2:', sum(q['appearances'] > 1 for q in new_q))
    print(' questions whose family changed (duplicate variants collapsed):', moved)
    print(' rescued:', len(changes['rescued']), '| conflicts with verified answer:', len(changes['conflicts']), '| recheck total:', len(changes['recheck']))


if __name__ == '__main__':
    main()
