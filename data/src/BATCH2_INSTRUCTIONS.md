# Batch-2 transcription task (shared instructions)
Read SCHEMA.md first (same JSON schema as batch 1; src labels are now f21..f39). You transcribe ONLY the files/pages assigned to you and write ONE JSON array to the output file named in your assignment (valid JSON array; write incrementally every ~15 questions and validate with `python3 -m json.tool` at the end).

Files: /home/claude/exam-bank/data/src/fNN.pdf (original) and fNN.txt (pdftotext -layout; may be empty/garbled for scanned or Arabic pages).

## How to read
- Text-layer pages: start from `pdftotext -f P -l P -layout fNN.pdf -`. English text is reliable; Arabic text from PDFs is often in presentation forms and visually reversed/garbled -> normalise with Python `unicodedata.normalize('NFKC', s)` and, when order/meaning is doubtful, READ THE PAGE IMAGE instead.
- Image/scanned pages: render with `pdftoppm -r 110 -f P -l P -png fNN.pdf /tmp/claude-0/-home-claude/a977384c-b799-5cd5-bc51-5c3eeab3533e/scratchpad/<yourtag>` and view with the Read tool (image). No Arabic OCR is installed and GitHub/tessdata downloads are blocked: you read images yourself. Use -r 130-150 for small/handwritten text. Do not dump long text into the conversation.
- ANSWER MARKS are often graphical and invisible in the text layer: ticks, bold, yellow/green highlight, coloured text, circles, strike-through, 'الإجابة الصحيحة' lines, a key table at the end. For EVERY file, look at page images (at least the first two question pages and any page where the marking style changes) to learn the marking style BEFORE deciding `answer_basis`. For highlight/colour/circle-based files read every page visually.
- Circles/pen marks made by an EXAMINEE on a photographed exam paper are NOT an answer key: record them as answer:null, answer_basis:"none", add flag "ambiguous_mark" (they are kept out of verification by the pipeline) - and say so in your report. (Batch 1 did the same for f13.)
- Do NOT answer, correct or complete questions. Record what the source marks; null if it marks nothing.
- Keep question text verbatim (fix only obvious line-break/OCR breakage). Options without the A)/B) labels, in source order. Questions printed in Arabic: lang "ar", q = the Arabic text as printed. Bilingual (English + printed Arabic translation): q = English, q_ar = Arabic.
- If an item spans pages, record it once with `page` = page where it starts.
- Skip banner lines (t.me links, 'انقر نقرة واحدة...'), cover pages, ads, page numbers, instructions like 'Circle the correct answer'.
- `no` = the number printed in the source (null if none).
- Add `"section"` ONLY if a file explicitly contains several specialties (e.g. a heading switching to nursing/midwifery/dental); values: assistant|nursing|midwifery|dental. Otherwise omit it (the pipeline applies a per-file default).
- Use flags per SCHEMA.md ("truncated", "image_needed" when a figure/table is required, "unreadable" when you cannot read it after trying a higher resolution, "source_typo", "duplicate_options", "multiple_marks", "ambiguous_mark").
- Number of questions is unknown in advance: go page by page, do not stop early, and do not skip a page unless it is in your SKIP list.

## Final report (keep it short; do NOT paste the JSON)
For each file: pages done, number of questions, number with answer:null, answer_basis breakdown, the marking style you observed, specialty evidence from the file's own title/content, anything odd (repeated pages, pages of another exam, unreadable regions). Also list any question numbers you think are garbled beyond repair.
