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
- **لا تستخدم «رفع الملفات» من واجهة الموقع**: المشروع 157 ملفًا في مجلدات متداخلة، ولواجهة الرفع حدود على العدد والحجم (لم أتحقق من أرقامها الحالية)؛ `git` أسلم.

## 4) راقب النشر
تبويب **Actions** ← «Deploy to GitHub Pages»: مهمتان: `re-run checks before publishing` (lint + اختبارات الوحدة + فحص أمني + e2e في Chrome) ثم `deploy`. عند النجاح يظهر الرابط في المهمة الثانية وفي Settings → Pages. إن فشلت الفحوص **لا يُنشر شيء** (النشر معلّق على نجاحها).

## 5) حماية الفرع (ميثاقك: لا دمج قبل خضرة الفحوص)
Settings → Branches (أو Rules → Rulesets) ← قاعدة على `main`:
- Require a pull request before merging
- Require status checks to pass: اختر `lint + test + security scan + e2e` (من `ci.yml`). **يظهر اسم الفحص في القائمة فقط بعد أن يعمل مرة على الأقل**، فافتح أول PR ثم اضبط القاعدة.
ملاحظة: حتى بلا هذه القاعدة، `deploy.yml` يعيد الفحوص ولا ينشر إن فشلت.

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
- الخطوط من Google Fonts: إن ظهر الخط افتراضيًا فافحص تبويب Network (لم تُختبر في بيئة البناء لأن الوصول للخطوط محجوب هناك).

## ما لم يُعتمد بعد (بانتظار موافقتك)
استضافة الخطوط ذاتيًا (يُوقف طلبات Google من متصفحات المستخدمين)، وسم `noindex` (يمنع ظهور الموقع في محركات البحث)، تثبيت إجراءات Actions بـ SHA بدل الوسوم (أمان سلسلة التوريد).
