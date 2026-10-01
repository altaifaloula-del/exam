"""Single source of truth about the source files: public label, default specialty and how much to trust
in-source answer marks. Shared by build.py (batch 1), merge_batch2.py and finalize.py."""

# trust: 'source' = marks are the compiler's answer key; 'weak' = examinee pen circles (never an answer key)
SOURCES = {
    'f01': ('صنعاء 24/3/2022', 'assistant', 'source'), 'f02': ('صنعاء (مترجم)', 'assistant', 'source'),
    'f03': ('مساعد طبيب إنجليزي محلول', 'assistant', 'source'), 'f04': ('صنعاء (مخطوط)', 'assistant', 'source'),
    'f05': ('صنعاء 1/2/2024', 'assistant', 'source'), 'f06': ('مساعد طبيب (104 أسئلة)', 'assistant', 'source'),
    'f07': ('الحديدة 18 يناير', 'assistant', 'source'), 'f08': ('إب 29/2/2024', 'assistant', 'source'),
    'f09': ('تمريض بكالوريوس 7/9/2023', 'nursing', 'source'), 'f10': ('صنعاء 16/3/2023', 'assistant', 'source'),
    'f11': ('إب 29/2/2024', 'assistant', 'source'), 'f12': ('إب 23/11/2023', 'assistant', 'source'),
    'f13': ('إب 29/12/2022', 'assistant', 'weak'), 'f14': ('الدليل العربي الشامل', None, 'source'),
    'f15': ('صنعاء 16/3/2023 (حيكان)', 'assistant', 'source'), 'f16': ('إب (دفتر)', 'assistant', 'source'),
    'f17': ('صنعاء 23/11/2023', 'assistant', 'source'), 'f18': ('صنعاء 30/6/2022', 'assistant', 'source'),
    # ---- batch 2 (specialty = what each file's own title says) ----
    'f21': ('صنعاء 30/6/2022 (نسخة نصية)', 'assistant', 'source'),
    'f22': ('إب (دفتر) — نسخة', 'assistant', 'source'),
    'f23': ('صنعاء 27/5/2024', 'assistant', 'source'),
    'f24': ('نموذج 2 — 23/11/2023', 'assistant', 'source'),
    'f25': ('تمريض دبلوم 9/2023', 'nursing', 'source'),
    'f26': ('تمريض إب وصنعاء 29/12/2022', 'nursing', 'source'),
    'f27': ('صنعاء 30/6/2022 (نسخة ثانية)', 'assistant', 'source'),
    'f28': ('H-Doctor ج12 (1/2/2024 و29/2/2024)', 'assistant', 'source'),
    'f29': ('تمريض حيكان ج11 (22/6/2023)', 'nursing', 'source'),
    'f30': ('صنعاء 23/11/2023 (نسخة ثانية)', 'assistant', 'source'),
    'f31': ('صنعاء 1/2/2024 (ملزمة)', 'assistant', 'source'),
    'f32': ('صنعاء 24/10/2024', 'assistant', 'source'),
    'f33': ('صنعاء 16/3/2023 (نسخة)', 'assistant', 'source'),
    'f34': ('أسئلة تمريض بالعربية', 'nursing', 'source'),
    'f35': ('تمريض صنعاء 23/11/2023', 'nursing', 'source'),
    'f36': ('صنعاء 16/3/2023 (مترجم)', 'assistant', 'source'),
    'f37': ('تمريض (صور ورقة امتحان)', 'nursing', 'weak'),
    'f38': ('ملزمة الفرحان 2026', 'assistant', 'source'),
    'f39': ('تمريض حيكان ج10 (16/3/2023)', 'nursing', 'source'),
}
BATCH1 = {f'f{i:02d}' for i in range(1, 19)}
SPEC_KEYS = ('assistant', 'nursing', 'midwifery', 'dental')


def label(src):
    return SOURCES[src][0]


def specialty(r):
    """Row-level 'section' (explicit in the file) wins; f14 has sections only; otherwise the file default."""
    sec = r.get('section')
    if r['src'] == 'f14':
        return sec if sec in SPEC_KEYS else 'other'
    if sec in SPEC_KEYS and r['src'] not in BATCH1:
        return sec
    return SOURCES[r['src']][1]


def trust(r):
    """'source' if the row's mark may count as an answer key, else 'weak'.
    Batch-1 rows keep their original per-file rule (frozen results); batch 2 adds per-row rules."""
    base = SOURCES[r['src']][2]
    if r['src'] in BATCH1:
        return base
    if base == 'weak' or 'ambiguous_mark' in r.get('flags', []):
        return 'weak'
    if r['src'] == 'f34' and r.get('answer_basis') == 'other':   # a commenter's unsure pick, not a key
        return 'weak'
    return 'source'
