# ضواحي — Dawahi (PWA)

## التشغيل
```bash
npm install
npm run dev      # للتجربة
npm run build    # نسخة النشر داخل مجلد dist
```
على Replit: ارفع المجلد كاملاً ثم اكتب `npm install` ثم `npm run dev`.

## الملفات المهمة
- `src/i18n/LanguageProvider.jsx` — إدارة اللغة وقلب الاتجاه RTL/LTR وحفظ الاختيار.
- `src/i18n/translations.js` — كل نصوص العربي والإنجليزي.
- `src/components/GasOrderSheet.jsx` — طلب الغاز بثلاث خطوات (الأسعار في `PRICING` أعلى الملف).
- `public/manifest.webmanifest` + `public/sw.js` — ما يجعل التطبيق قابلاً للتثبيت على الموبايل.
