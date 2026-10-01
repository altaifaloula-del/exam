# Verification task (shared instructions)
You verify answers for medical exam questions (Yemen physician-assistant / nursing / midwifery / dental licensing banks). Input: data/verify/batch_NN.json (array of questions). Output: data/verify/result_NN.json (JSON array, one object per input id, same order).

Each input question has: id, specialty, type (mcq|tf), q, q_ar, options[], source_marked_answer_index/text (what the original PDF marked — may be WRONG; these banks are student-compiled), source_status (none|single|agree), flags (truncated, source_typo, ... = the transcription was cut off or garbled).

Per question output:
{
  "id": "Q0001",
  "verdict": "confirmed" | "corrected" | "answered" | "uncertain" | "unanswerable",
  "answer": <0-based option index, or null>,
  "confidence": "high" | "medium" | "low",
  "agrees_with_source_mark": true | false | null,      // null if the source had no mark
  "note_ar": "سطر واحد بالعربية: لماذا هذه الإجابة (أو لماذا يتعذّر الحسم)",
  "refs": [{"title": "...", "url": "https://..."}]        // real URLs you actually opened/saw in search results; [] only if unanswerable
}
Verdict meaning:
- confirmed   = a reliable reference supports the source's marked answer.
- corrected   = references contradict the source mark; `answer` is your reference-supported index (say so in note_ar).
- answered    = source had no mark; references support `answer`.
- uncertain   = plausible answer but no solid reference, or references disagree / guidelines differ by body (e.g. AHA vs RCUK); give your best index with confidence "low" and explain. Do NOT inflate confidence.
- unanswerable= question/options are truncated, garbled, internally contradictory, needs an image, or has no defensible single answer; answer null.
Rules:
- NEVER invent a URL or quote. Every ref must be a page you actually retrieved via WebSearch/WebFetch. Prefer WHO, CDC, AHA/ERC, NHS, NICE, MedlinePlus, StatPearls/NCBI/PMC, major textbooks/society guidelines. Quiz/flashcard sites (Quizlet, Brainly, nursing-prep blogs) are weak: alone they cap confidence at "medium".
- "high" requires a primary/authoritative source that states the answer explicitly. Well-established textbook facts (e.g. insulin is secreted by pancreatic beta cells) need at least one real reference too; search quickly, it is cheap.
- If the source mark contradicts the reference, say corrected — do not defer to the source. If they agree, confirmed. If the source mark is on an option but the stem is truncated so you cannot judge, use uncertain/unanswerable and say so.
- Questions whose source mark is 'weak' examinee pen-circles: treat as no mark.
- Be efficient: group related questions by topic, reuse a search for several questions. Questions in Arabic: answer/verify in Arabic medical terms; refs may be English.
- Arabic questions often come from Arab/Saudi/Egyptian council banks: if the textbook answer differs from a guideline-specific answer, explain in note_ar and lower confidence.
- Do not change the question or options. If the wording depends on a local convention (e.g. old CPR ratios), say which guideline the answer follows.
Write the file incrementally every ~10 questions (valid JSON array each time) so progress is not lost. Validate with python3 -m json.tool at the end. Final reply: counts per verdict and any question ids you think are problematic. Do not paste the JSON.

## Addendum for batch_14 and later (batch-2 sources)
- Items that carry a `RECHECK` object were verified (or judged unanswerable) before; look at `why`, `previous_*` and decide afresh from references: your new result REPLACES the old one. If `previous_answer` was reference-supported and the new source mark is wrong, answer the same index with verdict `confirmed` or `corrected` as appropriate and say in note_ar that the new source mark disagrees (agrees_with_source_mark=false).
- Many batch-2 questions come from poorly edited copies: if the stem and options clearly belong to different questions, or options are cut (`??`, `...`), use `unanswerable`.
- `source_status: none` is the norm here (most batch-2 sources carry no answer key): you must find the answer from references; do not guess.
- Write the output file named result_NN.json for batch_NN.json (same NN).
