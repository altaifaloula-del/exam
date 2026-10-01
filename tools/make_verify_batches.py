#!/usr/bin/env python3
"""Build data/verify/batch_NN.json for batch-2 work: questions that still need an answer check.
need = new questions whose family has no verified old variant (data/batch2_plan.json) + recheck ids
(rescued canonical text, source mark contradicting the verified answer, tentative questions that gained a mark).
Usage: python3 tools/make_verify_batches.py [first_batch_number] [size]"""
import json, sys, glob, collections
first = int(sys.argv[1]) if len(sys.argv) > 1 else 14
size = int(sys.argv[2]) if len(sys.argv) > 2 else 48
raw = {q['id']: q for q in json.load(open('data/questions.raw.json', encoding='utf-8'))}
plan = json.load(open('data/batch2_plan.json'))
ch = json.load(open('data/batch2_changes.json', encoding='utf-8'))
res = {}
for f in sorted(glob.glob('data/verify/result_*.json')):
    for r in json.load(open(f, encoding='utf-8')):
        res[r['id']] = r
conf = collections.defaultdict(list)
for c in ch['conflicts']:
    conf[c['id']].append(c['new_source_mark'])
rescued = set(ch['rescued'])
ids = list(plan['need']) + [i for i in ch['recheck'] if i not in plan['need']]
ids.sort(key=lambda i: (raw[i]['specialty'], raw[i]['family'], i))
out = []
for i in ids:
    q = raw[i]
    item = {'id': i, 'specialty': q['specialty'], 'type': q['type'], 'q': q['q'], 'q_ar': q.get('q_ar'), 'options': q['options'],
            'source_marked_answer_index': q['source_answer'],
            'source_marked_answer_text': q['options'][q['source_answer']] if q['source_answer'] is not None else None,
            'source_status': q['source_status'], 'flags': q['flags'],
            'weak_marks_(examinee_pen_circles_unreliable)': q['weak_marks']}
    if i in ch['recheck']:
        p = res.get(i, {})
        item['RECHECK'] = {
            'why': ('question text was replaced by a complete copy found in a new source' if i in rescued else
                    'a new source marks a different answer than the one verified before' if i in conf else
                    'a new source marks an answer; earlier verdict was not conclusive'),
            'previous_verdict': p.get('verdict'), 'previous_answer': p.get('answer'), 'previous_note_ar': p.get('note_ar'),
            'new_source_marked_indexes': conf.get(i, [])}
    out.append(item)
n = first
for k in range(0, len(out), size):
    json.dump(out[k:k + size], open(f'data/verify/batch_{n:02d}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'batch_{n:02d}.json', len(out[k:k + size]), 'questions,', sum('RECHECK' in x for x in out[k:k + size]), 'recheck')
    n += 1
