# بنك مزاولة المهنة

موقع ثابت (بلا خادم) لمراجعة أسئلة مزاولة المهنة (مساعد طبيب، تمريض، قبالة، أسنان) واختبارات محوسبة بمؤقّت (نماذج جاهزة، مخصّص، حسب الموضوع، مع قسم مقالي اختياري بتصحيح ذاتي).

## التشغيل المحلي
```bash
npm ci
python3 -m http.server 8000 --directory site   # ثم افتح http://localhost:8000
```

## الفحوص
| الأمر | ما يفحصه |
|---|---|
| `npm run lint` | ESLint، ويمنع `innerHTML` وما شابهه |
| `npm test` | اختبارات الوحدة: منطق الاختبار، التخزين، سلامة بيانات البنك |
| `npm run scan` | فحص أمني: واجهات خطرة، أسرار، سياسة CSP بقائمة سماح (`'self'` و`'none'` فقط، و`data:` للصور)، وجود noindex، موارد خارجية في وسوم HTML وفي CSS، روابط غير https، ملفات مصدر في مجلد النشر. الطلبات الصادرة من JS لا يفحصها نمط نصي: تمنعها CSP (`connect-src 'self'`) ويرصدها اختبار e2e |
| `npm run test:e2e` | متصفح فعلي: جوال/لوحي/مكتب، المراجعة، الاختبار، المؤقّت، عبث التخزين |
| `npm run check` | lint + test + scan |

متغير `CHROME_PATH` يحدّد مسار المتصفح لاختبار e2e. و`E2E_SLOW_HASH_MS=250` (اختياري) يؤخّر رسم كل انتقال في الموقع عمدًا ليكشف سباقات التوقيت في الاختبارات؛ يشغّله `ci.yml` تمريرةً ثانية لاختبار الموقع (`tests/e2e/smoke.mjs`) فقط، فصفحة الطبيب لا تعتمد على الانتقال بين المسارات.

## النشر
الخطوات الكاملة (إنشاء المستودع، الرفع، تفعيل Pages، حماية الفرع، التراجع): [docs/DEPLOY.md](docs/DEPLOY.md).

عند الدمج في `main` يعمل `.github/workflows/deploy.yml`: يعيد الفحوص ثم ينشر مجلد `site/` على GitHub Pages.
فعّل من إعدادات المستودع: **Settings → Pages → Source: GitHub Actions** (مرة واحدة).
ولا دمج قبل نجاح `CI` على الـ PR (فعّل حماية الفرع: Require status checks).

## بنية المشروع
```
site/            الموقع المنشور (index.html، css، js/ بوحدات ES، data/، fonts/ خطوط مستضافة ذاتيًا بترخيص OFL)
  js/logic.js        منطق نقي مختبَر (اختيار الأسئلة، الدرجة، المؤقّت، الفلاتر)
  js/exam-state.js   حالة جلسة الاختبار والتحقق من المخزَّن (غير موثوق)
  js/store.js        غلاف localStorage آمن مع رجوع للذاكرة
  js/dom.js          بناء DOM بعقد نصية فقط
  js/plan.js         النماذج والمخصّص والمدد والتنبيهات؛ js/topics.js، js/essay.js: المواضيع والمقالي (بيانات اختيارية)
  js/views/          home، review، setup، instructions، exam، essay-exam، results
data/            خط البيانات (التفريغ، الدمج، التحقق، التقارير)
tools/           build.py (دفعة 1) → merge_batch2.py (دفعة 2) → finalize.py (نتيجة نهائية → site/data/bank.json)
tests/           وحدة + e2e
```

## خط إنتاج البيانات
`data/src/out_g*.json` (تفريغ) → `tools/build.py` (الدفعة 1 → `data/questions.batch1.json` المجمَّدة) → `tools/merge_batch2.py` (الدفعة 2 تُلحَق دون إعادة ترقيم) → `data/verify/result_*.json` → `tools/finalize.py` (+ `overrides.json` و`family_fixes.json`) → `site/data/bank.json`.
ملفات PDF الأصلية والنصوص المستخرجة **لا تُرفع** (انظر `.gitignore` و`DECISIONS.md`).

## تنبيه
الإجابات تحقّق منها آليًا مقابل مراجع ولم يراجعها طبيب. الأسئلة «غير المؤكدة» تظهر بعلامة في المراجعة فقط ولا تدخل الاختبار. لا تعتمد هذا البنك وحده للتحضير.
