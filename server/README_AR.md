# تشغيل قاعدة البيانات المشتركة على جهاز سيرفر

## قبل أي خطوة

احتفظ بنسخة من ملف `finance.db` ومجلد `purchase-order-attachments` إن كان موجودًا. البرنامج لا يحذف SQLite عند النقل، وينشئ تلقائيًا نسخة إضافية من ملف القاعدة ومجلد المرفقات قبل إرسالهما إلى السيرفر.

## تجهيز جهاز السيرفر

1. ثبّت PostgreSQL وNode.js LTS على جهاز السيرفر.
2. اجعل الجهاز متصلًا بكابل شبكة وحدد له IP ثابتًا من الراوتر.
3. عطّل Sleep وHibernate واضبط الجهاز ليعمل تلقائيًا بعد عودة الكهرباء.
4. يفضل استخدام UPS وقرص آخر للنسخ الاحتياطية.

## إنشاء PostgreSQL

نفّذ من pgAdmin أو `psql` بحساب PostgreSQL الإداري، مع استبدال كلمة المرور:

```sql
CREATE USER finance_app WITH LOGIN PASSWORD 'PUT_A_LONG_RANDOM_PASSWORD_HERE';
CREATE DATABASE finance_shared OWNER finance_app ENCODING 'UTF8';
```

لا تفتح منفذ PostgreSQL `5432` على الشبكة. خدمة البرنامج تعمل على نفس جهاز PostgreSQL وتتصل به عبر `127.0.0.1`.

## إعداد الخدمة

1. انسخ مجلد `server` إلى مسار ثابت مثل `D:\FinanceServer\app`.
2. انسخ `.env.example` باسم `.env`.
3. عدل `DATABASE_URL` وكلمة مرور مدير البرنامج ومسار المرفقات.
4. من داخل مجلد `server` نفّذ `npm install` مرة واحدة.
5. شغّل `START_SERVER.bat`.
6. افتح `http://IP-ADDRESS:5050/api/health` من جهاز آخر؛ يجب أن تظهر `ok: true`.
7. اسمح بالمنفذ `5050` في Windows Firewall للشبكة الخاصة فقط.

## التشغيل التلقائي والنسخ اليومية

بعد اختبار التشغيل اليدوي، افتح PowerShell كمسؤول داخل مجلد `server` وشغّل:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\INSTALL_WINDOWS_TASKS.ps1 -BackupDestination "E:\FinanceBackups"
```

سيبدأ السيرفر تلقائيًا مع Windows، ويُنشئ نسخة احتياطية كل يوم الساعة 2 صباحًا. اختر قرصًا مختلفًا عن قرص بيانات السيرفر إن أمكن.

## إنشاء المستخدم الثاني

من PowerShell داخل مجلد `server`:

```powershell
$env:FINANCE_NEW_USER_PASSWORD = 'A-Strong-Password-Here'
npm run create-user -- seconduser "اسم المستخدم الثاني" editor
Remove-Item Env:FINANCE_NEW_USER_PASSWORD
```

الصلاحيات المتاحة: `admin` مدير، `editor` تعديل، `viewer` مشاهدة فقط.

## نقل SQLite

على الجهاز الرئيسي: الإعدادات والأقسام ← قاعدة البيانات المشتركة ← اكتب عنوان السيرفر ← سجل دخول المدير ← «هذا الجهاز الرئيسي: نقل SQLite» مرة واحدة فقط.

على الجهاز الثاني استخدم نفس العنوان، وسجل بحسابه، ثم اضغط «جهاز إضافي: استخدام بيانات السيرفر».

## النسخ الاحتياطي

شغّل `backup.ps1` يوميًا بواسطة Task Scheduler. يحتاج `pg_dump` أن يكون متاحًا في PATH:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backup.ps1 -Destination "E:\FinanceBackups"
```

كل نسخة تشمل PostgreSQL ومجلد المرفقات، ويحتفظ السكربت بآخر 30 نسخة مؤرخة فقط.

لاختبار النسخ دون انتظار المهمة اليومية، شغّل الأمر السابق الخاص بـ `backup.ps1` ثم تأكد من وجود ملف `finance-postgresql.backup` وملف `attachments.zip` داخل مجلد مؤرخ جديد.

## الوصول من خارج المكان

لا تفتح PostgreSQL أو API مباشرة على الإنترنت. استخدم VPN موثوقًا أو ضع API خلف HTTPS بشهادة صحيحة.

يمكن تفعيل HTTPS مباشرة من الخدمة بتحديد المسارين `FINANCE_TLS_CERT` و`FINANCE_TLS_KEY` في `.env` معًا، ثم استخدام عنوان يبدأ بـ `https://` داخل البرنامج.
