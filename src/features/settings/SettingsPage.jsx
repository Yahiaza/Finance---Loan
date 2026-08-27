import React, { useState } from 'react';
import { Plus, Trash2, Database, ShieldCheck, HardDrive, RefreshCw, FolderOpen, MoveRight, DatabaseBackup } from 'lucide-react';
import { confirmDelete } from '../../utils/appUtils.js';

const dateTimeText = value => {
  if(!value) return '—';
  try{return new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short',calendar:'gregory'}).format(new Date(value));}
  catch{return String(value);}
};

function SettingsPage({departments,onChange,isEditing=false,storageInfo=null,onBackupNow,onMoveDatabase,onSelectDatabase,onChangeBackupLocation,updateStatus=null,onCheckUpdate,onDownloadUpdate,onShowUpdateFile,onLaunchUpdate,onSaveUpdateSettings}) {
  const [newDep,setNewDep]=useState('');
  const [backingUp,setBackingUp]=useState(false);
  const [storageBusy,setStorageBusy]=useState('');
  const [updateBusy,setUpdateBusy]=useState('');
  const [updateOwner,setUpdateOwner]=useState(updateStatus?.source?.owner||'');
  const [updateRepo,setUpdateRepo]=useState(updateStatus?.source?.repo||'Financial-Reports-Manager');
  const [autoCheck,setAutoCheck]=useState(updateStatus?.source?.autoCheck!==false);
  React.useEffect(()=>{setUpdateOwner(updateStatus?.source?.owner||'');setUpdateRepo(updateStatus?.source?.repo||'Financial-Reports-Manager');setAutoCheck(updateStatus?.source?.autoCheck!==false);},[updateStatus?.source?.owner,updateStatus?.source?.repo,updateStatus?.source?.autoCheck]);
  const add=()=>{const v=newDep.trim();if(v&&!departments.includes(v)){onChange([...departments,v]);setNewDep('')}};
  const doBackup=async()=>{
    if(!onBackupNow||backingUp)return;
    setBackingUp(true);
    try{await onBackupNow();}finally{setBackingUp(false);}
  };
  const runStorageAction=async(key,fn)=>{if(!fn||storageBusy)return;setStorageBusy(key);try{await fn();}finally{setStorageBusy('');}};
  const summary=storageInfo?.summary||{};
  return <section className="page">
    <div className="page-toolbar"><div><h2>الإعدادات والأقسام</h2><p>الأقسام المستخدمة في القوائم والتجميع التلقائي</p></div></div>

    {storageInfo?.backend==='sqlite' && <div className="settings-card database-status-card">
      <div className="database-status-head">
        <div className="database-status-icon"><Database size={23}/></div>
        <div><h3>قاعدة بيانات البرنامج</h3><p>SQLite محلية — التخزين الأساسي للبيانات المالية</p></div>
        <span className="database-ready-pill"><ShieldCheck size={15}/> جاهزة</span>
      </div>
      <div className="database-info-grid">
        <div><span>نوع التخزين</span><strong>SQLite</strong></div>
        <div><span>إصدار المخطط</span><strong>V{storageInfo.schemaVersion||1}</strong></div>
        <div><span>آخر حفظ</span><strong>{dateTimeText(storageInfo.lastSavedAt)}</strong></div>
        <div><span>آخر نسخة احتياطية</span><strong>{dateTimeText(storageInfo.lastBackupAt)}</strong></div>
      </div>
      <div className="database-record-summary">
        <span>الوارد <b>{summary.incomes||0}</b></span>
        <span>المنصرف <b>{summary.expenses||0}</b></span>
        <span>المبالغ المطلوبة <b>{summary.pending||0}</b></span>
        <span>البنوك <b>{summary.banks||0}</b></span>
        <span>القروض <b>{summary.loans||0}</b></span>
        <span>الأقساط <b>{summary.installments||0}</b></span>
      </div>
      <div className="database-path-row storage-location-row"><HardDrive size={16}/><div><span>مكان قاعدة البيانات النشطة</span><code title={storageInfo.databasePath||''}>{storageInfo.databasePath||'—'}</code><small>{storageInfo.customDatabasePath?'مكان مخصص — سيظل البرنامج يستخدمه في التحديثات القادمة':'المكان الافتراضي داخل بيانات مستخدم Windows'}</small></div><div className="storage-location-actions"><button className="btn" disabled={Boolean(storageBusy)} onClick={()=>runStorageAction('move',onMoveDatabase)}>{storageBusy==='move'?<RefreshCw className="spin" size={15}/>:<MoveRight size={15}/>} نقل قاعدة البيانات</button><button className="btn" disabled={Boolean(storageBusy)} onClick={()=>runStorageAction('select',onSelectDatabase)}>{storageBusy==='select'?<RefreshCw className="spin" size={15}/>:<FolderOpen size={15}/>} اختيار قاعدة موجودة</button></div></div>
      <div className="database-backup-row storage-location-row">
        <DatabaseBackup size={16}/><div><span>مجلد النسخ الاحتياطية</span><code title={storageInfo.backupsPath||''}>{storageInfo.backupsPath||'—'}</code><small>{storageInfo.customBackupPath?'مجلد نسخ احتياطي مخصص':'مجلد النسخ الاحتياطي الافتراضي'}</small></div>
        <div className="storage-location-actions"><button className="btn" disabled={Boolean(storageBusy)} onClick={()=>runStorageAction('backupPath',onChangeBackupLocation)}>{storageBusy==='backupPath'?<RefreshCw className="spin" size={15}/>:<FolderOpen size={15}/>} تغيير المكان</button><button className="btn database-backup-btn" onClick={doBackup} disabled={backingUp||Boolean(storageBusy)}>{backingUp?<RefreshCw className="spin" size={16}/>:<ShieldCheck size={16}/>} {backingUp?'جاري النسخ...':'نسخة احتياطية الآن'}</button></div>
      </div>
      <div className="database-storage-note"><ShieldCheck size={16}/><div><strong>حماية من فورمات C:</strong><span>انقل قاعدة البيانات إلى D: واختر مجلد النسخ الاحتياطي على D: أو وسيط آخر. بعد فورمات Windows يمكنك استخدام «اختيار قاعدة موجودة» وربط البرنامج بملف finance.db القديم مباشرة.</span></div></div>
    </div>}

    <div className="settings-card updater-card">
      <div className="updater-head">
        <div className="updater-icon"><RefreshCw size={22}/></div>
        <div><h3>التحديثات التلقائية</h3><p>فحص GitHub Releases وتنزيل أحدث نسخة Portable بدون التأثير على قاعدة البيانات.</p></div>
        <span className="update-version-pill">V{updateStatus?.currentVersion||'3.1.0'}</span>
      </div>
      <div className="update-source-grid">
        <label><span><Database size={14}/> حساب GitHub</span><input value={updateOwner} onChange={e=>setUpdateOwner(e.target.value)} placeholder="مثال: username"/></label>
        <label><span>اسم المستودع</span><input value={updateRepo} onChange={e=>setUpdateRepo(e.target.value)} placeholder="Financial-Reports-Manager"/></label>
        <label className="update-auto-check"><input type="checkbox" checked={autoCheck} onChange={e=>setAutoCheck(e.target.checked)}/><span>البحث تلقائيًا عن تحديث عند تشغيل البرنامج</span></label>
        <button className="btn" disabled={updateBusy==='save'} onClick={async()=>{if(!onSaveUpdateSettings)return;setUpdateBusy('save');try{await onSaveUpdateSettings({owner:updateOwner,repo:updateRepo,autoCheck});}finally{setUpdateBusy('');}}}>{updateBusy==='save'?<RefreshCw className="spin" size={15}/>:<ShieldCheck size={15}/>} حفظ مصدر التحديث</button>
      </div>
      <div className="update-status-panel">
        <div className="update-status-main">
          <span>حالة التحديث</span>
          {!updateStatus?.configured ? <strong>لم يتم تحديد مستودع GitHub بعد</strong> : updateStatus?.updateAvailable ? <strong className="update-available">يتوفر إصدار جديد V{updateStatus.latestVersion}</strong> : updateStatus?.checked ? <strong className="update-current"><ShieldCheck size={16}/> أنت على أحدث إصدار</strong> : <strong>جاهز للفحص</strong>}
          {updateStatus?.lastCheckedAt && <small>آخر فحص: {dateTimeText(updateStatus.lastCheckedAt)}</small>}
          {updateStatus?.message && <small className={updateStatus.error?'update-error':''}>{updateStatus.message}</small>}
        </div>
        <button className="btn" disabled={updateBusy==='check'} onClick={async()=>{if(!onCheckUpdate)return;setUpdateBusy('check');try{await onCheckUpdate(false);}finally{setUpdateBusy('');}}}>{updateBusy==='check'?<RefreshCw className="spin" size={16}/>:<RefreshCw size={16}/>} فحص الآن</button>
      </div>
      {updateStatus?.updateAvailable && <div className="update-release-card">
        <div className="update-release-title"><div><b>V{updateStatus.latestVersion}</b><span>نسخة جديدة متاحة</span></div>{updateStatus.publishedAt&&<small>{dateTimeText(updateStatus.publishedAt)}</small>}</div>
        {updateStatus.notes && <div className="update-notes">{String(updateStatus.notes).split(/\r?\n/).filter(Boolean).slice(0,8).map((line,i)=><p key={i}>{line.replace(/^[-*#]+\s*/,'')}</p>)}</div>}
        {!updateStatus.asset && <div className="update-warning">الإصدار موجود لكن ملف Portable لم يتم رفعه داخل Release بعد.</div>}
        {updateStatus.downloading && <div className="update-progress-wrap"><div><span>جاري تنزيل التحديث...</span><b>{Math.round(updateStatus.progress||0)}%</b></div><div className="update-progress"><i style={{width:`${Math.max(0,Math.min(100,updateStatus.progress||0))}%`}}/></div></div>}
        <div className="update-actions">
          {!updateStatus.downloadedPath && <button className="btn primary" disabled={!updateStatus.asset||updateStatus.downloading||updateBusy==='download'} onClick={async()=>{if(!onDownloadUpdate)return;setUpdateBusy('download');try{await onDownloadUpdate();}finally{setUpdateBusy('');}}}><RefreshCw size={16}/> تنزيل التحديث</button>}
          {updateStatus.downloadedPath && <><button className="btn primary" onClick={onLaunchUpdate}><MoveRight size={16}/> تشغيل التحديث وإغلاق الحالي</button><button className="btn" onClick={onShowUpdateFile}><FolderOpen size={16}/> عرض الملف</button></>}
          {updateStatus.htmlUrl && <button className="btn" onClick={()=>window.open(updateStatus.htmlUrl,'_blank')}><FolderOpen size={15}/> صفحة الإصدار</button>}
        </div>
      </div>}
    </div>

    <div className="settings-card"><h3>إدارة الأقسام</h3><div className="add-dept"><input disabled={!isEditing} value={newDep} onChange={e=>setNewDep(e.target.value)} placeholder="اسم قسم جديد" onKeyDown={e=>e.key==='Enter'&&add()}/><button className="btn primary" disabled={!isEditing} onClick={()=>isEditing&&add()}><Plus size={17}/> إضافة</button></div><div className="dept-list">{departments.map(d=><div key={d}><span>{d}</span><button disabled={!isEditing} onClick={async()=>{if(!isEditing)return;if(await confirmDelete(`القسم «${d}»`)) onChange(departments.filter(x=>x!==d))}}><Trash2 size={16}/></button></div>)}</div></div>
  </section>;
}

export default SettingsPage;
