# Transcription schema (one JSON file per agent group, UTF-8, a JSON array)
Each element = one question exactly as it appears in the source:
{
  "src": "f01",              // file label (f01..f20)
  "page": 3,                 // PDF page number where the question starts
  "no": 7,                   // question number as printed in the source (null if none)
  "lang": "en" | "ar" | "mixed",
  "q": "question text verbatim (English as printed; fix only obvious OCR/line-break breakage)",
  "q_ar": "Arabic translation of the question if the source prints one, else null",
  "options": ["text of option A", "text of option B", ...],   // in source order, without the A)/B) labels
  "answer": 0,               // 0-based index of the option the SOURCE marks correct (tick, bold, key, 'الإجابة الصحيحة'); null if the source does not mark one
  "answer_basis": "tick" | "arabic_answer_line" | "key_table" | "bold" | "none" | "other",
  "answer_ar": "the Arabic answer line if printed, else null",
  "flags": []                // any of: "truncated" (question/options cut off, '??'), "ambiguous_mark", "multiple_marks", "image_needed", "duplicate_options", "source_typo", "unreadable"
}
Rules:
- Transcribe, do NOT answer, correct, improve or complete anything. If the source marks no answer -> answer:null.
- If the source's marked answer is factually doubtful, still record it as printed (verification is a later step).
- Skip Telegram/channel banner lines and page headers.
- If an option is printed as '??' or blank, keep it as "??" and add flag "truncated".
- True/False questions: options ["True","False"] (or as printed).
- Keep a count: end your report with the number of questions per file and how many have answer:null.
