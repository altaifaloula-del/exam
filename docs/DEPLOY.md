# دليل الرفع والنشر (GitHub + GitHub Pages)

النتيجة النهائية: موقع ثابت على `https://<اسم-حسابك>.github.io/<اسم-المستودع>/` يُنشر تلقائيًا عند كل دمج في `main` بعد نجاح الفحوص. لا خادم ولا حسابات؛ نتائج كل مستخدم تبقى في متصفحه.

## 0) قبل البدء (قرارات منك)
- **اسم المستودع** (مثال: `exam-bank`) واسم حسابك على GitHub: يظهران في الرابط النهائي.
- **ظهور المستودع: عام (Public)** — هذا قرارك المسجّل. GitHub Pages مجاني للمستودعات العامة؛ المستودع الخاص يحتاج خطة مدفوعة (Pro/Team/Enterprise)، ومع ذلك يبقى **الموقع نفسه** عامًا على الإنترنت. المصدر: [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
- المستودع العام يكشف كل ما فيه (نص الأسئلة في `data/`، وأدوات البناء، وصفحة الطبيب `review/`) لا مجلد `site/` وحده. حقوق نشر نص الأسئلة مسؤوليتك (ملف حيكان f15 عليه إشعار طبع).
- ملفات PDF والنصوص المستخرجة **غير موجودة** في الحزمة عمدًا (`.gitignore`).

## 1) أنشئ مستودعًا فارغًا
GitHub ← **New repository** ← الاسم ← Public ← **لا تُفعّل** Add a README ولا .gitignore ولا license (المشروع فيه ملفاته) ← Create.

## 2) فعّل Pages قبل أول دفع (مرة واحدة)
المستودع ← **Settings → Pages → Build and deployment → Source: GitHub Actions**.
إن دفعتَ قبل هذا الخطوة يفشل أول نشر؛ فعّلها ثم **Re-run all jobs** من تبويب Actions.

## 3) ارفع الملفات (من جهازك)
فكّ الضغط ثم افتح الطرفية داخل المجلد (Git مثبّت):

```bash
git init -b main
git add -A
git status          # تحقّق: لا ملفات .pdf أو .txt داخل data/src، ولا node_modules
git commit -m "Initial commit"
git remote add origin https://github.com/<حسابك>/<المستودع>.git
git push -u origin main
```

- **المصادقة**: كلمة مرور الحساب لا تُقبل. استخدم نافذة الدخول التي يفتحها Git Credential Manager (يأتي مع Git for Windows)، أو رمز وصول دقيق (fine-grained token) صلاحيته `Contents: Read and write` على هذا المستودع فقط، أو مفتاح SSH. لا تضع الرمز في الكود ولا في رابط الـ remote ولا ترسله في محادثة.
- **لا تستخدم «رفع الملفات» من واجهة الموقع**: المشروع نحو 230 ملفًا في مجلدات متداخلة (بينها 22 ملف خط)، ولواجهة الرفع حدود على العدد والحجم (لم أتحقق من أرقامها الحالية)؛ `git` أسلم.

## 4) راقب النشر
تبويب **Actions** ← «Deploy to GitHub Pages»: مهمتان: `re-run checks before publishing` (lint + اختبارات الوحدة + فحص أمني + e2e في Chrome) ثم `deploy`. عند النجاح يظهر الرابط في المهمة الثانية وفي Settings → Pages. إن فشلت الفحوص **لا يُنشر شيء** (النشر معلّق على نجاحها).

## 5) حماية الفرع (ميثاقك: لا دمج قبل خضرة الفحوص)
هذا إعداد أمني على حسابك، فتضبطه أنت من الواجهة. ابدأ بعد أن يعمل فحص `CI` مرة على Pull Request (اسمه `lint + test + security scan + e2e`)؛ فإن لم يظهر في القائمة فاكتب اسمه كما هو.
1. المستودع ← **Settings** ← **Rules** ← **Rulesets** ← **New ruleset** ← **New branch ruleset**.
2. **Ruleset name**: `protect-main`. **Enforcement status**: `Active`.
3. **Target branches** ← Add a target ← **Include default branch**.
4. فعّل القواعد التالية:
   - **Restrict deletions** و**Block force pushes** (مفعّلتان افتراضيًا).
   - **Require a pull request before merging**، وابقِ عدد الموافقات المطلوبة `0` (أنت المالك الوحيد؛ طلب موافقة يمنعك من دمج عملك).
   - **Require status checks to pass** ← Add checks ← `lint + test + security scan + e2e`.
5. **Create**. بعدها لا يدخل `main` إلا ما مرّ بـ PR ونجح فيه الفحص. حتى بدون هذه القاعدة، `deploy.yml` يعيد الفحوص ولا ينشر إن فشلت.
- المرجع: [Creating rulesets for a repository](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository) و[Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).
- إن علقت ولم تستطع الدمج لسبب في القاعدة نفسها، فاضبط **Enforcement status** على `Disabled` مؤقتًا بدل إضافة نفسك إلى قائمة التجاوز (Bypass)، ثم أعدها `Active`.

## 6) التحديثات لاحقًا
```bash
git switch -c feature/وصف-قصير
# عدّل، ثم محليًا:
npm ci && npm run check && CHROME_PATH=<مسار Chrome> npm run test:e2e
git add -A && git commit -m "وصف التغيير"
git push -u origin feature/وصف-قصير     # ثم افتح Pull Request؛ بعد خضرة CI ادمج → ينشر تلقائيًا
```
عند تغيير البنك: أعِد تشغيل خط `tools/` كما في CLAUDE.md، وتحقق أن `site/data/bank.json` وملفي `topics.json` و`essay.json` ما زالت تجتاز `npm test`.

## 7) التراجع
Actions ← آخر تشغيل ناجح لـ «Deploy to GitHub Pages» ← **Re-run all jobs**، أو `git revert <commit>` ثم الدفع.

## 8) تحقّق بعد النشر
- افتح الرابط في نافذة خاصة: 5 لافتات أقسام و6 أدوات.
- ابدأ اختبارًا قصيرًا مع قسم مقالي واتركه حتى التسليم.
- الموقع لا يطلب شيئًا من أي جهة خارجية: الخطوط مستضافة داخل `site/fonts/` (ترخيص OFL مرفق). افتح تبويب Network في المتصفح وتحقّق أن كل الطلبات من النطاق نفسه.
- الموقع غير مفهرس (`<meta name="robots" content="noindex, nofollow">`): يمنع ظهوره في محركات البحث لكنه لا يخفيه ولا يمنع من يملك الرابط من فتحه. **لا يشمل المستودع نفسه**: مادة `data/` و`tools/` و`review/` تبقى عامة وقابلة للفهرسة ما دام المستودع عامًا. (ملف `robots.txt` لا يفيد هنا لأن الموقع تحت مسار فرعي `/exam/`، والزواحف تقرأ `robots.txt` من جذر النطاق فقط.)

## ما نُفّذ بموافقتك (2026-10-01) وما ما زال مقترحًا
- نُفّذ: `noindex`؛ واستضافة الخطوط ذاتيًا (يفشل الفحص الأمني إن ظهر في CSP أي مصدر غير `'self'` أو في HTML/CSS مورد خارجي أو غاب `noindex`)؛ وتثبيت إجراءات Actions بأرقام الإيداع (`# v4` بجانب كل رقم)؛ وترقية ESLint إلى 10.11.0 (الإصدار 9 انتهى دعمه في 2026-08-06) و`npm audit`: 0 ثغرات؛ وتمريرة CI ثانية لاختبار الموقع ببطء رسم متعمَّد (`E2E_SLOW_HASH_MS=250`).
- ما زال مقترحًا ولم يُنفَّذ: تفعيل Dependabot للإجراءات و`npm` (يفتح PR تلقائيًا للتحديثات؛ ضروري إن ثبّتّ الإجراءات بالأرقام وإلا بقيت قديمة)، وترقية الإجراءات إلى إصدارات رئيسية أحدث (تحذير «Node.js 20 is deprecated» يظهر الآن في سجل التشغيل ولا يكسر شيئًا).
