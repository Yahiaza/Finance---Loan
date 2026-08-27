# تحسينات Desktop

هذه النسخة تحافظ على تعديلات الواجهة والوظائف الموجودة في الملف المرسل، وتم تعديل طبقة Electron فقط قدر الإمكان.

## ما تم تحسينه
- حفظ البيانات المالية Native داخل مجلد Electron userData في ملف `financial-data.json`.
- ترحيل بيانات localStorage القديمة تلقائيًا عند أول تشغيل.
- كتابة Atomic للبيانات لتقليل احتمال تلف الملف عند انقطاع البرنامج أثناء الحفظ.
- منع تشغيل نسختين من البرنامج في نفس الوقت.
- حفظ حجم ومكان النافذة وحالة Maximize وإعادتها عند التشغيل التالي.
- تقوية عزل Electron: contextIsolation + sandbox + nodeIntegration=false.
- منع تنقل نافذة البرنامج إلى مواقع خارجية؛ الروابط الخارجية تفتح في المتصفح.
- DevTools معطلة في النسخة المبنية ومفعلة أثناء التطوير فقط.
- تصدير JSON ما زال يستخدم نافذة Save As الخاصة بـ Windows.
- إزالة vite.config.js المكرر والإبقاء على vite.config.mjs لتفادي تعارض إعدادات Vite.

## البناء
`npm install`
`npm run dev`
`npm run build:portable`

ولأسرع تشغيل كبرنامج محمول:
`npm run build:folder`
ثم تشغيل EXE من `release/win-unpacked`.
