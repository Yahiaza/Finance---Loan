import React,{useMemo,useRef,useState} from 'react';
import {ShoppingCart,Plus,Search,Eye,Printer,Trash2,Paperclip,ImagePlus,FolderOpen,Settings2,X,FileDown,CheckCircle2,Clock3,Building2,UserRoundPlus} from 'lucide-react';
import {uid,todayISO,displayDate,money,parseAmount,requestConfirm} from '../../utils/appUtils.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
const emptyDraft=()=>({orderNumber:'',department:'',amount:'',statement:'',submissionDate:todayISO,requester:'',status:'unspent'});

function PurchasePreview({html,onClose,onNotify}){
  const frame=useRef(null);
  const exportPdf=async()=>{
    if(!window.desktopApp?.exportPdf){frame.current?.contentWindow?.print();return;}
    const result=await window.desktopApp.exportPdf({html,suggestedName:`purchase-orders-${todayISO}.pdf`});
    if(result?.ok)onNotify?.({tone:'success',title:'تم تصدير التقرير',message:`تم حفظ ملف PDF في: ${result.path}`});
    else if(!result?.canceled)onNotify?.({tone:'error',title:'تعذر تصدير التقرير',message:result?.error||'حدث خطأ أثناء إنشاء PDF.'});
  };
  return <div className="print-preview-overlay" role="dialog" aria-modal="true" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div className="print-preview-modal real-preview">
      <div className="print-preview-toolbar"><div className="print-preview-heading"><ShoppingCart/><div><strong>معاينة تقرير أوامر الشراء</strong><span>نسخة الطباعة والاستعراض</span></div></div><div className="print-preview-actions"><button className="btn" onClick={exportPdf}><FileDown/> تصدير PDF</button><button className="btn primary" onClick={()=>frame.current?.contentWindow?.print()}><Printer/> طباعة</button><button className="btn" onClick={onClose}><X/> إغلاق</button></div></div>
      <div className="print-preview-stage real-stage"><iframe ref={frame} className="print-preview-frame" title="معاينة تقرير أوامر الشراء" srcDoc={html}/></div>
    </div>
  </div>;
}

function MasterList({title,icon:Icon,items,onChange,isEditing,placeholder}){
  const [value,setValue]=useState('');
  const add=()=>{const clean=value.trim();if(!clean||items.includes(clean))return;onChange([...items,clean]);setValue('');};
  return <div className="po-master-card"><div className="po-master-title"><Icon/><div><strong>{title}</strong><span>{items.length} مسجل</span></div></div><div className="po-master-add"><input disabled={!isEditing} value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}} placeholder={placeholder}/><button disabled={!isEditing||!value.trim()} onClick={add}><Plus/> إضافة</button></div><div className="po-chips">{items.length?items.map((item,index)=><span key={`${item}-${index}`}>{item}{isEditing&&<button title="حذف" onClick={()=>onChange(items.filter((_,i)=>i!==index))}><X/></button>}</span>):<p>لا توجد بيانات مضافة بعد.</p>}</div></div>;
}

function PurchaseOrdersPage({state,isEditing=false,onChange,onNotify}){
  const orders=state.purchaseOrders||[],departments=state.purchaseOrderDepartments||[],requesters=state.purchaseRequesters||[];
  const [tab,setTab]=useState('report'),[draft,setDraft]=useState(emptyDraft),[query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState('all'),[preview,setPreview]=useState(false);
  const filtered=useMemo(()=>orders.filter(order=>{
    const matchesStatus=statusFilter==='all'||order.status===statusFilter;
    const text=`${order.orderNumber} ${order.department} ${order.statement} ${order.requester}`.toLowerCase();
    return matchesStatus&&text.includes(query.trim().toLowerCase());
  }),[orders,query,statusFilter]);
  const totals=useMemo(()=>({all:orders.reduce((n,x)=>n+parseAmount(x.amount),0),spent:orders.filter(x=>x.status==='spent').reduce((n,x)=>n+parseAmount(x.amount),0),unspent:orders.filter(x=>x.status!=='spent').reduce((n,x)=>n+parseAmount(x.amount),0)}),[orders]);
  const patchOrder=(id,patch)=>onChange({purchaseOrders:orders.map(x=>x.id===id?{...x,...patch}:x)});
  const addOrder=()=>{
    if(!draft.orderNumber.trim()||!draft.department||!parseAmount(draft.amount)||!draft.requester){onNotify?.({tone:'error',title:'بيانات أمر الشراء غير مكتملة',message:'أدخل رقم أمر الشراء والقسم والمبلغ ومقدم الطلب.'});return;}
    if(orders.some(x=>x.orderNumber.trim()===draft.orderNumber.trim())){onNotify?.({tone:'error',title:'رقم أمر الشراء مكرر',message:'يوجد أمر شراء مسجل بنفس الرقم.'});return;}
    onChange({purchaseOrders:[...orders,{id:uid(),...draft,amount:String(parseAmount(draft.amount)),createdAt:new Date().toISOString(),orderAttachment:null,transferAttachment:null}]});
    setDraft(emptyDraft());
    onNotify?.({tone:'success',title:'تم إنشاء أمر الشراء',message:'أضيف الأمر إلى التقرير ويمكن الآن تحديد حالة الصرف وإرفاق الملفات.'});
  };
  const removeOrder=async order=>{if(!(await requestConfirm(`هل تريد حذف أمر الشراء رقم ${order.orderNumber||'—'}؟`,{title:'حذف أمر شراء',confirmText:'حذف',cancelText:'إلغاء',tone:'danger'})))return;onChange({purchaseOrders:orders.filter(x=>x.id!==order.id)});};
  const chooseBrowserFile=(kind)=>new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=kind==='transfer'?'image/*':'image/*,.pdf,application/pdf';input.onchange=()=>{const file=input.files?.[0];if(!file){resolve(null);return;}const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type==='application/pdf'?'pdf':'image',dataUrl:reader.result,addedAt:new Date().toISOString()});reader.onerror=()=>resolve(null);reader.readAsDataURL(file);};input.click();});
  const attach=async(order,kind)=>{
    const result=window.desktopApp?.selectPurchaseAttachment?await window.desktopApp.selectPurchaseAttachment(kind):null;
    const attachment=result?.ok?result.attachment:(!window.desktopApp?.selectPurchaseAttachment?await chooseBrowserFile(kind):null);
    if(!attachment){if(result&&!result.canceled)onNotify?.({tone:'error',title:'تعذر إرفاق الملف',message:result.error||'لم يتم اختيار ملف صالح.'});return;}
    patchOrder(order.id,{[kind==='transfer'?'transferAttachment':'orderAttachment']:attachment});
    onNotify?.({tone:'success',title:'تم إرفاق الملف',message:attachment.name});
  };
  const openAttachment=async attachment=>{
    if(attachment?.dataUrl){window.open(attachment.dataUrl,'_blank');return;}
    const result=await window.desktopApp?.openPurchaseAttachment?.(attachment);
    if(!result?.ok)onNotify?.({tone:'error',title:'تعذر فتح المرفق',message:result?.error||'الملف المرفق غير موجود.'});
  };
  const reportHtml=()=>`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{font-family:Cairo,Tahoma,Arial,sans-serif;color:#0D1B2A;margin:0}.paper{padding:3mm}.head{display:flex;justify-content:space-between;align-items:end;border-bottom:3px solid #697C70;padding-bottom:12px;margin-bottom:13px}.head h1{margin:0;font-size:21px}.head p{margin:4px 0 0;color:#697C70;font-size:10px}.head strong{font-size:11px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.summary div{border:1px solid #d8d1c5;background:#F6EFE3;border-radius:9px;padding:8px 11px}.summary span{display:block;color:#697C70;font-size:9px}.summary b{font-size:13px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}th{background:#E7EBDD;padding:7px 5px;border:1px solid #c7cec0}td{padding:7px 5px;border:1px solid #dedbd2;vertical-align:top;overflow-wrap:anywhere}.num{width:13%}.dep{width:13%}.amount{width:12%}.statement{width:25%}.date{width:12%}.requester{width:14%}.status{width:11%;font-weight:800}.spent{color:#39724f}.unspent{color:#9b642e}tfoot td{background:#F6EFE3;font-weight:900}</style></head><body><div class="paper"><div class="head"><div><h1>تقرير أوامر الشراء</h1><p>بيان أوامر الشراء المنصرفة والتي لم يتم صرفها</p></div><strong>تاريخ التقرير: ${esc(displayDate(todayISO))}</strong></div><div class="summary"><div><span>إجمالي أوامر الشراء</span><b>${money.format(totals.all)} ر.س</b></div><div><span>تم الصرف</span><b>${money.format(totals.spent)} ر.س</b></div><div><span>لم يتم الصرف</span><b>${money.format(totals.unspent)} ر.س</b></div></div><table><thead><tr><th class="num">رقم أمر الشراء</th><th class="dep">القسم</th><th class="amount">المبلغ</th><th class="statement">البيان</th><th class="date">تاريخ التقديم</th><th class="requester">مقدم طلب الشراء</th><th class="status">حالة أمر الشراء</th></tr></thead><tbody>${filtered.map(x=>`<tr><td>${esc(x.orderNumber)}</td><td>${esc(x.department)}</td><td>${money.format(parseAmount(x.amount))} ر.س</td><td>${esc(x.statement)||'—'}</td><td>${esc(displayDate(x.submissionDate))}</td><td>${esc(x.requester)}</td><td class="status ${x.status==='spent'?'spent':'unspent'}">${x.status==='spent'?'تم الصرف':'لم يتم الصرف'}</td></tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:20px">لا توجد أوامر شراء مطابقة</td></tr>'}</tbody><tfoot><tr><td colspan="2">إجمالي التقرير</td><td>${money.format(filtered.reduce((n,x)=>n+parseAmount(x.amount),0))} ر.س</td><td colspan="4">عدد الأوامر: ${filtered.length}</td></tr></tfoot></table></div></body></html>`;

  return <section className="page purchase-orders-page">
    <div className="po-hero"><div className="po-hero-title"><span><ShoppingCart/></span><div><h2>أوامر الشراء</h2><p>إنشاء الأوامر ومتابعة ما تم صرفه وما لم يتم صرفه</p></div></div><div className="po-tabs"><button className={tab==='report'?'active':''} onClick={()=>setTab('report')}><ShoppingCart/> الأوامر والتقرير</button><button className={tab==='data'?'active':''} onClick={()=>setTab('data')}><Settings2/> لوحة البيانات</button></div></div>
    {tab==='report'?<>
      <div className="po-create-card"><div className="po-card-heading"><div><Plus/><span><strong>إنشاء أمر شراء</strong><small>أدخل بيانات الأمر الجديد</small></span></div>{!isEditing&&<em>اضغط «تعديل» أعلى الصفحة للإنشاء أو التعديل</em>}</div><div className="po-form-grid">
        <label><span>رقم أمر الشراء</span><input disabled={!isEditing} value={draft.orderNumber} onChange={e=>setDraft({...draft,orderNumber:e.target.value})} placeholder="مثال: PO-1025"/></label>
        <label><span>القسم</span><select disabled={!isEditing} value={draft.department} onChange={e=>setDraft({...draft,department:e.target.value})}><option value="">اختر القسم</option>{departments.map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>المبلغ</span><input disabled={!isEditing} inputMode="decimal" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value.replace(/[^0-9.,]/g,'')})} placeholder="0.00"/></label>
        <label className="po-statement-field"><span>البيان</span><input disabled={!isEditing} value={draft.statement} onChange={e=>setDraft({...draft,statement:e.target.value})} placeholder="بيان أمر الشراء"/></label>
        <label><span>تاريخ التقديم</span><input disabled={!isEditing} type="date" value={draft.submissionDate} max={todayISO} onChange={e=>setDraft({...draft,submissionDate:e.target.value})}/></label>
        <label><span>مقدم طلب الشراء</span><select disabled={!isEditing} value={draft.requester} onChange={e=>setDraft({...draft,requester:e.target.value})}><option value="">اختر مقدم الطلب</option>{requesters.map(x=><option key={x}>{x}</option>)}</select></label>
        <button className="po-create-btn" disabled={!isEditing} onClick={addOrder}><Plus/> إنشاء أمر الشراء</button>
      </div></div>
      <div className="po-summary"><div><ShoppingCart/><span>إجمالي الأوامر<strong>{money.format(totals.all)} ر.س</strong></span></div><div className="spent"><CheckCircle2/><span>تم الصرف<strong>{money.format(totals.spent)} ر.س</strong></span></div><div className="unspent"><Clock3/><span>لم يتم الصرف<strong>{money.format(totals.unspent)} ر.س</strong></span></div></div>
      <div className="po-report-card"><div className="po-toolbar"><div className="po-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="بحث برقم الأمر أو القسم أو البيان أو مقدم الطلب"/></div><div className="po-filter"><button className={statusFilter==='all'?'active':''} onClick={()=>setStatusFilter('all')}>الكل</button><button className={statusFilter==='spent'?'active':''} onClick={()=>setStatusFilter('spent')}>تم الصرف</button><button className={statusFilter==='unspent'?'active':''} onClick={()=>setStatusFilter('unspent')}>لم يتم الصرف</button></div><button className="po-preview-btn" onClick={()=>setPreview(true)}><Eye/> معاينة وطباعة</button></div>
        <div className="po-table-wrap"><table className="po-table"><thead><tr><th>رقم أمر الشراء</th><th>القسم</th><th>المبلغ</th><th>البيان</th><th>تاريخ التقديم</th><th>مقدم طلب الشراء</th><th>حالة أمر الشراء</th><th>المرفقات</th><th></th></tr></thead><tbody>{filtered.length?filtered.map(order=><tr key={order.id}><td className="po-order-number">{order.orderNumber}</td><td>{order.department}</td><td className="po-amount">{money.format(parseAmount(order.amount))} ر.س</td><td className="po-statement">{order.statement||'—'}</td><td>{displayDate(order.submissionDate)}</td><td>{order.requester}</td><td><select disabled={!isEditing} className={`po-status ${order.status}`} value={order.status} onChange={e=>patchOrder(order.id,{status:e.target.value})}><option value="unspent">لم يتم الصرف</option><option value="spent">تم الصرف</option></select></td><td><div className="po-attachments"><button disabled={!isEditing&&!order.orderAttachment} className={order.orderAttachment?'attached':''} onClick={()=>order.orderAttachment?openAttachment(order.orderAttachment):attach(order,'order')} title={order.orderAttachment?.name||'إرفاق صورة أو PDF لأمر الشراء'}>{order.orderAttachment?<FolderOpen/>:<Paperclip/>}<span>{order.orderAttachment?'أمر الشراء':'إرفاق الأمر'}</span></button><button disabled={!isEditing&&!order.transferAttachment} className={order.transferAttachment?'attached transfer':''} onClick={()=>order.transferAttachment?openAttachment(order.transferAttachment):attach(order,'transfer')} title={order.transferAttachment?.name||'إضافة صورة التحويل'}>{order.transferAttachment?<FolderOpen/>:<ImagePlus/>}<span>{order.transferAttachment?'التحويل':'صورة التحويل'}</span></button></div></td><td>{isEditing&&<button className="po-delete" onClick={()=>removeOrder(order)} title="حذف"><Trash2/></button>}</td></tr>):<tr><td colSpan="9"><div className="po-empty"><ShoppingCart/><strong>لا توجد أوامر شراء مطابقة</strong><span>أنشئ أول أمر شراء من النموذج بالأعلى.</span></div></td></tr>}</tbody></table></div>
      </div>
    </>:<div className="po-master-grid"><MasterList title="أقسام أوامر الشراء" icon={Building2} items={departments} isEditing={isEditing} placeholder="اسم القسم" onChange={purchaseOrderDepartments=>onChange({purchaseOrderDepartments})}/><MasterList title="مقدمو طلبات الشراء" icon={UserRoundPlus} items={requesters} isEditing={isEditing} placeholder="اسم مقدم الطلب" onChange={purchaseRequesters=>onChange({purchaseRequesters})}/></div>}
    {preview&&<PurchasePreview html={reportHtml()} onClose={()=>setPreview(false)} onNotify={onNotify}/>} 
  </section>;
}

export default PurchaseOrdersPage;
