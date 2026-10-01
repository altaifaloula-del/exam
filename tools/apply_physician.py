#!/usr/bin/env python3
"""Validate a decisions file exported by review/doctor-review.html and record it (append-only) in data/physician_review.json.
Strict by default: any invalid row aborts the whole import and nothing is written (no silent drops).
  python3 tools/apply_physician.py FILE.json [--dry-run] [--skip-invalid]
finalize.py applies the recorded decisions in a later step (not part of this tool)."""
import json, sys, os, re, hashlib, datetime

BANK = 'site/data/bank.json'
LOG = 'data/physician_review.json'
MAX_BYTES = 2_000_000
KINDS = {'ok', 'fix', 'invalid', 'note'}

def qhash(q):
    return hashlib.sha1(('|'.join([q['q']] + q['options'])).encode('utf-8')).hexdigest()[:8]

def validate(doc, bank):
    """-> (accepted dict, problems list, warnings list)"""
    problems, warnings, accepted = [], [], {}
    if not isinstance(doc, dict) or set(doc) != {'schema', 'bankVersion', 'reviewer', 'exportedAt', 'decisions'}:
        return {}, ['file is not a physician-review export (unexpected top-level keys)'], []
    if doc['schema'] != 'physician-review/1': problems.append('unsupported schema ' + repr(doc['schema']))
    rv = doc['reviewer']
    if not (isinstance(rv, dict) and set(rv) == {'name'} and isinstance(rv['name'], str) and 1 <= len(rv['name'].strip()) <= 80):
        problems.append('reviewer.name must be 1-80 characters')
    try:
        datetime.datetime.fromisoformat(str(doc['exportedAt']).replace('Z', '+00:00'))
    except ValueError:
        problems.append('exportedAt is not an ISO date')
    if not isinstance(doc['decisions'], dict) or not doc['decisions']:
        problems.append('decisions is empty or not an object')
        return {}, problems, warnings
    current = hashlib.sha256(open(BANK, 'rb').read()).hexdigest()[:12]
    if doc['bankVersion'] != current:
        warnings.append(f"bankVersion {doc['bankVersion']} differs from the current bank {current}: every row is checked against its own hash")
    by_id = {q['id']: q for q in bank}
    for qid, d in doc['decisions'].items():
        where = f'{qid}: '
        q = by_id.get(qid) if isinstance(qid, str) and re.fullmatch(r'Q\d{4}', qid) else None
        if q is None: problems.append(where + 'unknown question id'); continue
        if not isinstance(d, dict) or not set(d) <= {'d', 'h', 'a', 'c'} or d.get('d') not in KINDS:
            problems.append(where + 'malformed decision'); continue
        if d.get('h') != qhash(q): problems.append(where + 'question text changed since the file was produced (hash mismatch)'); continue
        if 'c' in d and not (isinstance(d['c'], str) and len(d['c']) <= 600): problems.append(where + 'comment too long or not text'); continue
        if d['d'] == 'fix':
            a = d.get('a')
            if not (isinstance(a, int) and not isinstance(a, bool) and 0 <= a < len(q['options'])): problems.append(where + 'fix answer out of range'); continue
        elif 'a' in d: problems.append(where + "'a' is only allowed on a fix"); continue
        if d['d'] == 'ok' and q['answer'] is None: problems.append(where + 'ok on a question with no proposed answer'); continue
        accepted[qid] = d
    return accepted, problems, warnings

def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    dry, skip = '--dry-run' in argv, '--skip-invalid' in argv
    if len(args) != 1: sys.exit(__doc__)
    raw = open(args[0], 'rb').read()
    if len(raw) > MAX_BYTES: sys.exit('FAIL: file larger than 2 MB')
    try:
        doc = json.loads(raw)
    except ValueError as e:
        sys.exit('FAIL: not valid JSON: ' + str(e))
    bank = json.load(open(BANK, encoding='utf-8'))['questions']
    accepted, problems, warnings = validate(doc, bank)
    for w in warnings: print('WARN', w)
    for p in problems: print('INVALID', p)
    header_bad = [p for p in problems if ': ' not in p or not re.match(r'Q\d{4}: ', p)]
    if header_bad or (problems and not skip):
        sys.exit(f'FAIL: {len(problems)} problem(s); nothing written' + ('' if skip else ' (use --skip-invalid to import the valid rows only)'))
    sha = hashlib.sha256(raw).hexdigest()
    log = json.load(open(LOG, encoding='utf-8')) if os.path.exists(LOG) else {'_doc': 'Append-only log of physician review batches. Never edit by hand.', 'batches': []}
    if any(b['file_sha256'] == sha for b in log['batches']): sys.exit('FAIL: this exact file was already imported')
    kinds = {k: sum(1 for d in accepted.values() if d['d'] == k) for k in sorted(KINDS)}
    print('accepted', len(accepted), kinds, '| skipped invalid', len(problems))
    if dry: print('dry run: nothing written'); return
    log['batches'].append({'n': len(log['batches']) + 1, 'reviewer': doc['reviewer']['name'].strip(), 'exportedAt': doc['exportedAt'],
                           'importedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
                           'bankVersion': doc['bankVersion'], 'file_sha256': sha, 'decisions': accepted})
    json.dump(log, open(LOG, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('recorded batch', log['batches'][-1]['n'], 'in', LOG)

if __name__ == '__main__':
    main(sys.argv[1:])
