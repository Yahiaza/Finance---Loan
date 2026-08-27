# نشر تحديث جديد — V3.1.0+

## أول إعداد داخل البرنامج
1. افتح: الإعدادات والأقسام > التحديثات التلقائية.
2. اكتب اسم حساب GitHub في «حساب GitHub».
3. اكتب اسم Repository الذي رفعت عليه المشروع.
4. اترك «البحث تلقائيًا عن تحديث عند تشغيل البرنامج» مفعلاً.
5. اضغط «حفظ مصدر التحديث» ثم «فحص الآن».

## نشر إصدار جديد
حدّث version في package.json، مثال 3.1.1، ثم نفّذ:

```powershell
git add .
git commit -m "Release v3.1.1"
git push origin main
git tag -a v3.1.1 -m "v3.1.1"
git push origin v3.1.1
```

Workflow الموجود في `.github/workflows/release.yml` سيبني:

`Financial-Reports-Portable-3.1.1.exe`

ثم ينشئ/يحدث GitHub Release بنفس الـTag.

## ملاحظات
- قاعدة SQLite ليست داخل ملف البرنامج، والتحديث لا يحذفها أو ينقلها.
- قبل تشغيل النسخة الجديدة، البرنامج ينشئ Backup تلقائيًا من SQLite.
- ملف التحديث يتم تنزيله إلى Downloads.
- لا تحتاج SQL Server أو SQLite Studio أو أي برنامج خارجي.
