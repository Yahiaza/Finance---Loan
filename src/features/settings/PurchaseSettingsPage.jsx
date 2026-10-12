import React,{useState} from 'react';
import {Database,FolderOpen,RefreshCw,Download} from 'lucide-react';

export default function PurchaseSettingsPage({accessStatus,onActivateAccess,updateStatus,onCheckUpdate,onDownloadUpdate,onLaunchUpdate}){
  const [busy,setBusy]=useState(false);
  const run=async action=>{setBusy(true);try{await action?.();}finally{setBusy(false);}};
  return <section className="page">
    <div className="settings-card central-server-card access-database-card">
      <div className="central-server-head"><Database/><div><h3>قاعدة Access المشتركة — طلبات الشراء</h3><p>اختر نفس ملف .accdb المستخدم في برنامج الإدارة المالية.</p></div></div>
      <div className="central-activation-box"><strong>{accessStatus?.enabled?(accessStatus.connected?'متصلة':'تعذر الوصول إلى الملف'):'اختر القاعدة المشتركة لبدء التسجيل'}</strong><p dir="ltr">{accessStatus?.databasePath||'—'}</p><button className="btn primary" disabled={busy} onClick={()=>run(onActivateAccess)}><FolderOpen/> اختيار قاعدة Access الموجودة</button><p>يجب أن يصل جميع المحاسبين إلى نفس الملف ونفس مجلد finance-attachments بجواره، مع صلاحية الكتابة لكليهما. تُحفظ الصور وملفات PDF تلقائيًا في هذا المجلد المشترك.</p></div>
    </div>
    <div className="settings-card updater-card"><h3>تحديث نسخة طلبات الشراء — V{updateStatus?.currentVersion}</h3><p>{updateStatus?.updateAvailable?`يتوفر تحديث V${updateStatus.latestVersion}`:updateStatus?.checked?'أنت على أحدث إصدار':'جاهز لفحص التحديثات'}</p>{updateStatus?.message&&<p>{updateStatus.message}</p>}<button className="btn" disabled={busy} onClick={()=>run(()=>onCheckUpdate?.(false))}><RefreshCw/> فحص الآن</button>{updateStatus?.updateAvailable&&!updateStatus?.downloadedPath&&<button className="btn primary" disabled={busy||!updateStatus.asset} onClick={()=>run(onDownloadUpdate)}><Download/> تنزيل التحديث</button>}{updateStatus?.downloading&&<p>جاري التنزيل: {Math.round(updateStatus.progress||0)}%</p>}{updateStatus?.downloadedPath&&<button className="btn primary" onClick={onLaunchUpdate}>تشغيل التحديث</button>}</div>
  </section>;
}
