#!/usr/bin/env python3
"""questions.raw.json + verify/result_*.json + overrides.json -> site/data/bank.json (+ data/report.json).
Policy: 'verified' = verdict in confirmed/corrected/answered AND confidence high|medium AND >=1 ref AND answer set.
        'tentative' = verdict uncertain (answer shown as unconfirmed, never auto-scored).
        'unanswerable' = excluded from study/exam, listed in report only."""
import json, glob, collections, difflib, os, re, sys, urllib.parse
sys.path.insert(0, 'tools')
from sources import label
from cluster import load, norm
PLACEHOLDER = re.compile(r'^[\s.\u2026?\u061f\u2022\-_]*$')
STRONG = ('nih.gov', 'who.int', 'cdc.gov', 'heart.org', 'ahajournals.org', 'medlineplus.gov', 'nhs.uk', 'nice.org.uk',
          'mayoclinic.org', 'merckmanuals.com', 'msdmanuals.com', 'aafp.org', 'acog.org', 'clinicaltrials.gov',
          'cochrane.org', 'cochranelibrary.com', 'nursingcenter.com', 'cancer.gov', 'fda.gov', 'unicef.org', 'rcog.org.uk')

def ref_tier(refs):
    for r in refs:
        h = urllib.parse.urlparse(r['url']).netloc.lower().replace('www.', '')
        if any(h == d or h.endswith('.' + d) for d in STRONG):
            return 'strong'
    return 'general'
POS = ('confirmed', 'corrected', 'answered')

def main():
    res = {}
    for f in sorted(glob.glob('data/verify/result_*.json')):
        for r in json.load(open(f, encoding='utf-8')):
            res[r['id']] = r
    qs = json.load(open('data/questions.raw.json', encoding='utf-8'))
    ov = json.load(open('data/overrides.json', encoding='utf-8'))
    items = []
    for q in qs:
        if q['id'] in res:
            r = dict(res[q['id']])
        else:   # only a duplicate variant whose family already has a verified member may lack its own result (checked below)
            r = {'id': q['id'], 'verdict': 'unanswerable', 'answer': None, 'confidence': 'low', 'refs': [], 'agrees_with_source_mark': None,
                 'note_ar': 'نسخة مكررة من سؤال محقَّق في العائلة نفسها؛ لا نتيجة تحقق مستقلة لها.', '_noresult': True}
        o = ov.get(q['id'])
        if o:
            for k in ('q', 'options'):
                if k in o: q[k] = o[k]
            for k in ('verdict', 'answer', 'confidence', 'note_ar', 'refs'):
                if k in o: r[k] = o[k]
        broken_opts = len(q['options']) < 2 or any(PLACEHOLDER.match(o or '') for o in q['options'])
        if broken_opts and r['verdict'] != 'unanswerable':
            r['verdict'] = 'unanswerable'
            r['note_ar'] = 'استُبعد آليًا: خيارات مقطوعة أو فارغة في المصدر. ' + (r.get('note_ar') or '')
        ok = (r['verdict'] in POS and r['confidence'] in ('high', 'medium') and r['refs'] and r['answer'] is not None
              and 0 <= r['answer'] < len(q['options']))
        tier = ref_tier(r['refs']) if r['refs'] else 'none'
        if ok and tier != 'strong' and r['confidence'] == 'high':
            r['confidence'] = 'medium'      # general refs (encyclopedia / nursing-ed sites) never justify 'high'
        status = 'verified' if ok else ('unanswerable' if r['verdict'] == 'unanswerable' else 'tentative')
        srcs = sorted({p['src'] for p in q['provenance']})
        items.append({
            'id': q['id'], 'family': q['family'], 'specialty': q['specialty'], 'type': q['type'], 'lang': q['lang'],
            'q': q['q'], 'q_ar': q.get('q_ar'), 'options': q['options'],
            'answer': r['answer'] if status != 'unanswerable' else None,
            'status': status, 'confidence': r['confidence'], 'verdict': r['verdict'],
            'agrees_with_source': r.get('agrees_with_source_mark'), 'note_ar': r.get('note_ar', ''),
            'refs': r['refs'], 'ref_tier': tier, 'sources': [label(s) for s in srcs], 'appearances': q['appearances'],
            'overridden': bool(o), '_noresult': bool(r.get('_noresult')),
        })
    fx = json.load(open('data/family_fixes.json', encoding='utf-8'))
    by_id = {it['id']: it for it in items}
    orig_family = {i: it['family'] for i, it in by_id.items()}
    for qid in fx['alone']:
        if qid not in by_id: sys.exit('FAIL: family_fixes.json names unknown id ' + qid)
        by_id[qid]['family'] = 'alone-' + qid
    for qid, t in fx['move'].items():
        if qid not in by_id or t['to'] not in by_id or t['to'] in fx['move'] or t['to'] in fx['alone']:
            sys.exit('FAIL: bad family move ' + qid)
        by_id[qid]['family'] = orig_family[t['to']]
    rank = lambda it: ({'verified': 0, 'tentative': 1, 'unanswerable': 2}[it['status']],
                       {'high': 0, 'medium': 1, 'low': 2}[it['confidence']], -len(it['options']), it['id'])
    fam = collections.defaultdict(list)
    for it in items: fam[it['family']].append(it)
    bank, hidden, issues, fam_conflicts = [], [], [], []
    for members in fam.values():
        members.sort(key=rank)
        best = members[0]
        if best['_noresult'] or (best['status'] == 'unanswerable' and any(m['_noresult'] for m in members)):
            sys.exit('FAIL: family %s has no verified result of its own (ids %s) - verify it first' % (best['family'], [m['id'] for m in members]))
        if best['status'] == 'unanswerable':
            issues += members; continue
        vs = [m for m in members if m['status'] == 'verified']
        texts = [norm(m['options'][m['answer']]) for m in vs]
        same = lambda a, b: a in b or b in a or difflib.SequenceMatcher(None, a, b).ratio() >= 0.75    # typos / truncated copies
        if any(not same(texts[0], t) for t in texts[1:]):      # variants of one question verified to different answers
            fam_conflicts.append({'family': best['family'], 'ids': [m['id'] for m in vs],
                                  'answers': [m['options'][m['answer']] for m in vs]})
        best = dict(best); best['variants'] = [m['id'] for m in members[1:]]
        bank.append(best)
        hidden += members[1:]
    order = {'assistant': 0, 'nursing': 1, 'midwifery': 2, 'dental': 3}
    for b in bank:
        b.pop('_noresult', None)
    bank.sort(key=lambda it: (order[it['specialty']], it['id']))
    os.makedirs('site/data', exist_ok=True)
    json.dump({'version': 1, 'count': len(bank), 'questions': bank}, open('site/data/bank.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    rep = {'raw_rows': len(load()), 'unique_variants': len(items), 'families': len(fam), 'in_bank': len(bank),
           'by_status': dict(collections.Counter(b['status'] for b in bank)),
           'by_specialty': dict(collections.Counter(b['specialty'] for b in bank)),
           'verified_strong_refs': sum(b['status']=='verified' and b['ref_tier']=='strong' for b in bank),
           'verified_by_specialty': dict(collections.Counter(b['specialty'] for b in bank if b['status'] == 'verified')),
           'excluded_unanswerable': [{'id': i['id'], 'q': i['q'][:100], 'why': i['note_ar']} for i in issues],
           'collapsed_variants': len(hidden), 'family_fixes': len(fx['alone']) + len(fx['move']), 'family_answer_conflicts': fam_conflicts,
           'corrected_vs_source': [{'id': b['id'], 'q': b['q'][:90], 'note': b['note_ar']} for b in bank if b['verdict'] == 'corrected'],
           'overrides': [k for k in ov if not k.startswith('_')]}
    json.dump(rep, open('data/report.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in rep.items() if k not in ('excluded_unanswerable', 'corrected_vs_source', 'family_answer_conflicts')}, ensure_ascii=False, indent=1))
    print('bank.json KB:', os.path.getsize('site/data/bank.json') // 1024)

if __name__ == '__main__':
    main()
