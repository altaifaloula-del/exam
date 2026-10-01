#!/usr/bin/env python3
"""site/data/bank.json -> review/doctor-review.html : a self-contained page for a physician to review the priority questions.
Priority = tentative | corrected against the source | verified with general-tier references only | manually overridden.
The page exports decisions (schema physician-review/1) that tools/apply_physician.py validates and records.
Usage: python3 tools/build_review.py"""
import json, hashlib, os, re

def qhash(q):
    return hashlib.sha1(('|'.join([q['q']] + q['options'])).encode('utf-8')).hexdigest()[:8]

def main():
    raw = open('site/data/bank.json', 'rb').read()
    version = hashlib.sha256(raw).hexdigest()[:12]
    bank = json.loads(raw)['questions']
    order = {'assistant': 0, 'nursing': 1, 'midwifery': 2, 'dental': 3}
    items = []
    for q in bank:
        why = []
        if q['status'] == 'tentative': why.append('tentative')
        if q['verdict'] == 'corrected': why.append('corrected')
        if q['status'] == 'verified' and q['ref_tier'] != 'strong': why.append('general')
        if q['overridden']: why.append('override')
        if not why: continue
        items.append({'id': q['id'], 'spec': q['specialty'], 'type': q['type'], 'lang': q['lang'], 'q': q['q'], 'qar': q.get('q_ar'),
                      'options': q['options'], 'ans': q['answer'], 'status': q['status'], 'conf': q['confidence'], 'tier': q['ref_tier'],
                      'why': why, 'note': q['note_ar'], 'src_disagrees': q['agrees_with_source'] is False,
                      'refs': [{'t': r.get('title', '')[:160], 'u': r['url']} for r in q['refs'][:5] if r['url'].startswith('https://')],
                      'hash': qhash(q)})
    items.sort(key=lambda i: (order[i['spec']], i['id']))
    data = json.dumps({'version': version, 'items': items}, ensure_ascii=False, separators=(',', ':'))
    data = data.replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    html = open('tools/review_template.html', encoding='utf-8').read().replace('__DATA__', data)
    os.makedirs('review', exist_ok=True)
    open('review/doctor-review.html', 'w', encoding='utf-8').write(html)
    print('items', len(items), '| version', version, '| KB', len(html) // 1024)
    by = {}
    for i in items:
        by[i['spec']] = by.get(i['spec'], 0) + 1
    print(by)

if __name__ == '__main__':
    main()
