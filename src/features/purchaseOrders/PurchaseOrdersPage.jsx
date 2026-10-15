import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ShoppingCart,Plus,Search,Eye,Printer,Trash2,Paperclip,ImagePlus,FolderOpen,Settings2,X,FileDown,CheckCircle2,Clock3,Building2,UserRoundPlus,RefreshCw,CircleX,Pencil,Save} from 'lucide-react';
import {RtlDatePicker} from '../../components/common.jsx';
import {uid,todayISO,displayDate,money,parseAmount,formatAmountInput,requestConfirm} from '../../utils/appUtils.js';

import {purchaseStatusLabel,purchaseTotals,paymentAmounts,transferAttachments,transferAttachmentPatch} from './purchaseOrderModel.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
const emptyDraft=()=>({orderNumber:'',department:'',amount:'',statement:'',submissionDate:todayISO,requester:'',status:'unspent'});
const searchable=value=>String(value??'').toLocaleLowerCase('ar').replace(/[,٬\s]/g,'');

function PurchasePreview({html,onClose,onNotify}){
  const frame=useRef(null);
  const exportPdf=async()=>{
    if(!window.desktopApp?.exportPdf){frame.current?.contentWindow?.print();return;}
    const result=await window.desktopApp.exportPdf({html,suggestedName:`purchase-requests-${todayISO}.pdf`});
    if(result?.ok)onNotify?.({tone:'success',title:'تم تصدير التقرير',message:`تم حفظ ملف PDF في: ${result.path}`});
    else if(!result?.canceled)onNotify?.({tone:'error',title:'تعذر تصدير التقرير',message:result?.error||'حدث خطأ أثناء إنشاء PDF.'});
  };
  return <div className="print-preview-overlay" role="dialog" aria-modal="true" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div className="print-preview-modal real-preview">
      <div className="print-preview-toolbar"><div className="print-preview-heading"><ShoppingCart/><div><strong>معاينة تقرير طلبات الشراء</strong><span>نسخة الطباعة والاستعراض</span></div></div><div className="print-preview-actions"><button className="btn" onClick={exportPdf}><FileDown/> تصدير PDF</button><button className="btn primary" onClick={()=>frame.current?.contentWindow?.print()}><Printer/> طباعة</button><button className="btn" onClick={onClose}><X/> إغلاق</button></div></div>
      <div className="print-preview-stage real-stage"><iframe ref={frame} className="print-preview-frame" title="معاينة تقرير طلبات الشراء" srcDoc={html}/></div>
    </div>
  </div>;
}

function EditableMasterItem({item,index,items,onRename}){
  const [value,setValue]=useState(item);
  useEffect(()=>setValue(item),[item]);
  const commit=()=>{
    const clean=value.trim();
    if(!clean||items.some((x,i)=>i!==index&&x.trim()===clean)){setValue(item);return;}
    if(clean!==item)onRename(index,item,clean);
  };
  return <input className="po-master-edit" value={value} onChange={e=>setValue(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){setValue(item);e.currentTarget.blur();}}}/>;
}

function MasterList({title,icon:Icon,items,onChange,onRename,isEditing,placeholder}){
  const [value,setValue]=useState('');
  const add=()=>{const clean=value.trim();if(!clean||items.some(x=>x.trim()===clean))return;onChange([...items,clean]);setValue('');};
  return <div className="po-master-card">
    <div className="po-master-title"><Icon/><div><strong>{title}</strong><span>{items.length} مسجل</span></div></div>
    <div className="po-master-add"><input disabled={!isEditing} value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}} placeholder={placeholder}/><button disabled={!isEditing||!value.trim()} onClick={add}><Plus/> إضافة</button></div>
    <div className="po-chips">{items.length?items.map((item,index)=><span className={isEditing?'editable':''} key={`${index}-${item}`}>{isEditing?<EditableMasterItem item={item} index={index} items={items} onRename={onRename}/>:<b>{item}</b>}{isEditing&&<button title="حذف" onClick={()=>onChange(items.filter((_,i)=>i!==index))}><X/></button>}</span>):<p>لا توجد بيانات مضافة بعد.</p>}</div>
  </div>;
}

function PartialPaymentInput({order,isEditing,onCommit,onNotify}){
  const [value,setValue]=useState(()=>formatAmountInput(order.paidAmount));
  useEffect(()=>setValue(formatAmountInput(order.paidAmount)),[order.paidAmount,isEditing]);
  const commit=()=>{
    const amount=parseAmount(value);
    if(!amount||amount>parseAmount(order.amount)){
      setValue(formatAmountInput(order.paidAmount));
      onNotify?.({tone:'error',title:'مبلغ السداد غير صالح',message:'أدخل مبلغًا أكبر من صفر ولا يتجاوز قيمة طلب الشراء.'});
      return;
    }
    onCommit(String(amount));
  };
  return <div className="po-partial-payment"><label><span>إجمالي المسدَّد</span><input aria-label={`إجمالي المسدد للطلب ${order.orderNumber}`} disabled={!isEditing} inputMode="decimal" value={value} onChange={e=>setValue(formatAmountInput(e.target.value))} onBlur={()=>isEditing&&commit()} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/></label><small>المتبقي: {money.format(paymentAmounts(order).remaining)} ر.س</small></div>;
}

function PurchaseOrdersPage({state,isEditing=false,onChange,onNotify}){
  const orders=state.purchaseOrders||[],departments=state.purchaseOrderDepartments||[],requesters=state.purchaseRequesters||[];
  const [tab,setTab]=useState('report'),[draft,setDraft]=useState(emptyDraft),[query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState('all'),[preview,setPreview]=useState(false);
  const [editingOrderId,setEditingOrderId]=useState(null),[editDraft,setEditDraft]=useState(null);
  const ordersRef=useRef(orders),attachmentBusy=useRef(false);
  ordersRef.current=orders;
  useEffect(()=>{if(!isEditing){setEditingOrderId(null);setEditDraft(null);}},[isEditing]);
  const filtered=useMemo(()=>orders.filter(order=>{
    const matchesStatus=statusFilter==='all'||order.status===statusFilter;
    const text=searchable(`${order.orderNumber} ${order.department} ${order.amount} ${money.format(parseAmount(order.amount))} ${order.statement} ${order.requester}`);
    return matchesStatus&&text.includes(searchable(query));
  }),[orders,query,statusFilter]);
  const totals=useMemo(()=>purchaseTotals(orders),[orders]);
  const patchOrder=(id,patch)=>onChange({purchaseOrders:ordersRef.current.map(x=>x.id===id?{...x,...patch}:x)});
  const renameMaster=(kind,index,oldValue,newValue)=>{
    const key=kind==='department'?'purchaseOrderDepartments':'purchaseRequesters';
    const field=kind==='department'?'department':'requester';
    const source=kind==='department'?departments:requesters;
    const next=[...source];next[index]=newValue;
    onChange({[key]:next,purchaseOrders:orders.map(order=>order[field]===oldValue?{...order,[field]:newValue}:order)});
  };
  const addOrder=()=>{
    if(!draft.orderNumber.trim()||!draft.department||!parseAmount(draft.amount)||!draft.requester){onNotify?.({tone:'error',title:'بيانات طلب الشراء غير مكتملة',message:'أدخل رقم طلب الشراء والقسم والمبلغ ومقدم الطلب.'});return;}
    if(orders.some(x=>x.orderNumber.trim()===draft.orderNumber.trim())){onNotify?.({tone:'error',title:'رقم طلب الشراء مكرر',message:'يوجد طلب شراء مسجل بنفس الرقم.'});return;}
    onChange({purchaseOrders:[...orders,{id:uid(),...draft,amount:String(parseAmount(draft.amount)),createdAt:new Date().toISOString(),paidAmount:'',orderAttachment:null,transferAttachment:null,transferAttachments:[]}]});
    setDraft(emptyDraft());
    onNotify?.({tone:'success',title:'تم إنشاء طلب الشراء',message:'أضيف الطلب إلى التقرير ويمكن الآن تحديد حالة الصرف وإرفاق الملفات.'});
  };
  const beginOrderEdit=order=>{setEditingOrderId(order.id);setEditDraft({orderNumber:order.orderNumber,department:order.department,amount:order.amount,statement:order.statement,submissionDate:order.submissionDate,requester:order.requester});};
  const cancelOrderEdit=()=>{setEditingOrderId(null);setEditDraft(null);};
  const saveOrderEdit=()=>{
    if(!editDraft||!editingOrderId)return;
    const orderNumber=editDraft.orderNumber.trim(),amount=parseAmount(editDraft.amount);
    if(!orderNumber||!editDraft.department||!amount||!editDraft.requester){onNotify?.({tone:'error',title:'بيانات طلب الشراء غير مكتملة',message:'أدخل رقم طلب الشراء والقسم والمبلغ ومقدم الطلب.'});return;}
    if(orders.some(x=>x.id!==editingOrderId&&x.orderNumber.trim()===orderNumber)){onNotify?.({tone:'error',title:'رقم طلب الشراء مكرر',message:'يوجد طلب شراء آخر مسجل بنفس الرقم.'});return;}
    const existing=orders.find(x=>x.id===editingOrderId);
    if(existing?.status==='partial'&&parseAmount(existing.paidAmount)>amount){onNotify?.({tone:'error',title:'المبلغ أقل من المسدَّد',message:'لا يمكن أن تقل قيمة الطلب عن مبلغ السداد الجزئي.'});return;}
    patchOrder(editingOrderId,{...editDraft,orderNumber,amount:String(amount)});cancelOrderEdit();
    onNotify?.({tone:'success',title:'تم حفظ التعديل',message:`تم تحديث طلب الشراء رقم ${orderNumber} بنجاح.`});
  };
  const removeOrder=async order=>{
    if(!(await requestConfirm(`هل تريد حذف طلب الشراء رقم ${order.orderNumber||'—'}؟`,{title:'حذف طلب شراء',confirmText:'متابعة',cancelText:'إلغاء',tone:'danger'})))return;
    if(!(await requestConfirm('سيتم الحذف النهائي لهذا الطلب ولا يمكن التراجع عنه. هل تريد الاستمرار؟',{title:'تحذير — حذف نهائي',confirmText:'نعم، حذف نهائي',cancelText:'تراجع',tone:'danger'})))return;
    onChange({purchaseOrders:orders.filter(x=>x.id!==order.id)});if(editingOrderId===order.id)cancelOrderEdit();
    onNotify?.({tone:'success',title:'تم المسح بنجاح',message:`تم حذف طلب الشراء رقم ${order.orderNumber||'—'} نهائيًا.`});
  };
  const chooseBrowserFile=()=>new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='image/*,.pdf,application/pdf';input.onchange=()=>{const file=input.files?.[0];if(!file){resolve(null);return;}const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type==='application/pdf'?'pdf':'image',dataUrl:reader.result,addedAt:new Date().toISOString()});reader.onerror=()=>resolve(null);reader.readAsDataURL(file);};input.click();});
  const attach=async(order,kind,attachmentId=null)=>{
    if(attachmentBusy.current)return;
    attachmentBusy.current=true;
    try{
      const result=window.desktopApp?.selectPurchaseAttachment?await window.desktopApp.selectPurchaseAttachment(kind):null;
      const attachment=result?.ok?result.attachment:(!window.desktopApp?.selectPurchaseAttachment?await chooseBrowserFile():null);
      if(!attachment){if(result&&!result.canceled)onNotify?.({tone:'error',title:'تعذر إرفاق الملف',message:result.error||'لم يتم اختيار ملف صالح.'});return;}
      const current=ordersRef.current.find(x=>x.id===order.id);if(!current)return;
      if(kind==='transfer'){
        const items=transferAttachments(current);
        if(attachmentId&&!items.some(x=>x.attachmentId===attachmentId)){onNotify?.({tone:'error',title:'المرفق غير موجود',message:'تم حذف المرفق أثناء اختيار الملف.'});return;}
        const item={...attachment,attachmentId:attachmentId||uid()};
        patchOrder(order.id,transferAttachmentPatch(attachmentId?items.map(x=>x.attachmentId===attachmentId?item:x):[...items,item]));
      }else patchOrder(order.id,{orderAttachment:attachment});
      onNotify?.({tone:'success',title:attachmentId||kind==='order'&&current.orderAttachment?'تم استبدال المرفق':'تم إرفاق الملف',message:attachment.name});
    }finally{attachmentBusy.current=false;}
  };
  const openAttachment=async attachment=>{
    if(attachment?.dataUrl){window.open(attachment.dataUrl,'_blank');return;}
    const result=await window.desktopApp?.openPurchaseAttachment?.(attachment);
    if(!result?.ok)onNotify?.({tone:'error',title:'تعذر فتح المرفق',message:result?.error||'الملف المرفق غير موجود.'});
  };
  const removeAttachment=async(order,kind,attachment)=>{
    if(!(await requestConfirm(`هل تريد مسح المرفق «${attachment.name||'الملف الحالي'}» من الطلب؟`,{title:'مسح المرفق',confirmText:'مسح المرفق',cancelText:'إلغاء',tone:'danger'})))return;
    const current=ordersRef.current.find(x=>x.id===order.id);if(!current)return;
    if(kind==='transfer')patchOrder(order.id,transferAttachmentPatch(transferAttachments(current).filter(x=>x.attachmentId!==attachment.attachmentId)));
    else patchOrder(order.id,{orderAttachment:null});
    onNotify?.({tone:'success',title:'تم مسح المرفق',message:'تم مسح المرفق المحدد فقط.'});
  };
  const attachmentControls=(order,kind,attachment=null,index=0)=>{
    const transfer=kind==='transfer',label=transfer?`تحويل ${index+1}`:'طلب الشراء';
    attachment=transfer?attachment:order.orderAttachment;
    if(!attachment)return <button disabled={!isEditing} onClick={()=>attach(order,kind)} title="إرفاق طلب الشراء"><Paperclip/><b>إرفاق طلب الشراء</b></button>;
    return <div key={attachment.attachmentId||'order'} className={`po-attachment-item ${transfer?'transfer':''}`} title={attachment.name||label}><strong>{transfer?<ImagePlus/>:<Paperclip/>}<span>{label}</span><small>{attachment.name||'ملف مرفق'}</small></strong><div><button onClick={()=>openAttachment(attachment)} title={`فتح ${label}: ${attachment.name||''}`}><FolderOpen/><span>فتح</span></button>{isEditing&&<><button onClick={()=>attach(order,kind,transfer?attachment.attachmentId:null)} title={`استبدال ${label}`}><RefreshCw/><span>استبدال</span></button><button className="remove" onClick={()=>removeAttachment(order,kind,attachment)} title={`مسح ${label}`}><Trash2/><span>مسح</span></button></>}</div></div>;
  };
  const transferControls=order=><div className="po-transfer-list">{transferAttachments(order).map((attachment,index)=>attachmentControls(order,'transfer',attachment,index))}<button disabled={!isEditing} className="po-add-transfer transfer" onClick={()=>attach(order,'transfer')}><Plus/><span>{transferAttachments(order).length?'إضافة تحويل آخر':'إرفاق التحويل'}</span></button></div>;
  const orderRow=(order,index)=>{
    const editing=editingOrderId===order.id&&editDraft,d=editing?editDraft:order;
    return <tr key={order.id} className={editing?'po-row-editing':''}>
      <td className="po-sequence">{index+1}</td>
      <td className="po-order-number">{editing?<input value={d.orderNumber} onChange={e=>setEditDraft({...d,orderNumber:e.target.value})}/>:order.orderNumber}</td>
      <td>{editing?<select value={d.department} onChange={e=>setEditDraft({...d,department:e.target.value})}>{d.department&&!departments.includes(d.department)&&<option value={d.department}>{d.department}</option>}<option value="">اختر القسم</option>{departments.map(x=><option key={x}>{x}</option>)}</select>:order.department}</td>
      <td className="po-amount">{editing?<input inputMode="decimal" value={d.amount} onChange={e=>setEditDraft({...d,amount:e.target.value.replace(/[^0-9.,]/g,'')})}/>:<>{money.format(parseAmount(order.amount))} ر.س</>}</td>
      <td className="po-statement">{editing?<input value={d.statement} onChange={e=>setEditDraft({...d,statement:e.target.value})}/>:order.statement||'—'}</td>
      <td>{editing?<div className="po-row-date"><RtlDatePicker value={d.submissionDate} onChange={submissionDate=>setEditDraft({...d,submissionDate})}/></div>:displayDate(order.submissionDate)}</td>
      <td>{editing?<select value={d.requester} onChange={e=>setEditDraft({...d,requester:e.target.value})}>{d.requester&&!requesters.includes(d.requester)&&<option value={d.requester}>{d.requester}</option>}<option value="">اختر مقدم الطلب</option>{requesters.map(x=><option key={x}>{x}</option>)}</select>:order.requester}</td>
      <td><div className={`po-status-control ${order.status}`}>{order.status==='spent'?<CheckCircle2/>:order.status==='partial'?<Clock3/>:<CircleX/>}<select disabled={!isEditing} className="po-status" value={order.status} onChange={e=>patchOrder(order.id,{status:e.target.value})}><option className="unspent-option" value="unspent">✕ لم يتم الصرف</option><option className="spent-option" value="spent">✓ تم الصرف</option><option className="partial-option" value="partial">◷ سداد جزئي</option></select></div>{order.status==='partial'&&<PartialPaymentInput order={order} isEditing={isEditing} onCommit={paidAmount=>patchOrder(order.id,{paidAmount})} onNotify={onNotify}/>}</td>
      <td><div className="po-attachments">{attachmentControls(order,'order')}{transferControls(order)}</div></td>
      <td><div className="po-row-actions">{isEditing&&(editing?<><button className="save" onClick={saveOrderEdit} title="حفظ التعديل"><Save/><span>حفظ</span></button><button className="cancel" onClick={cancelOrderEdit} title="إلغاء التعديل"><X/><span>إلغاء</span></button></>:<button className="edit" disabled={Boolean(editingOrderId)} onClick={()=>beginOrderEdit(order)} title="تعديل بيانات الطلب"><Pencil/><span>تعديل</span></button>)}{isEditing&&<button className="delete" onClick={()=>removeOrder(order)} title="حذف طلب الشراء"><Trash2/><span>حذف</span></button>}</div></td>
    </tr>;
  };
  const reportHtml=()=>`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{font-family:Cairo,Tahoma,Arial,sans-serif;color:#0D1B2A;margin:0}.paper{padding:3mm}.head{display:flex;justify-content:space-between;align-items:end;border-bottom:3px solid #697C70;padding-bottom:12px;margin-bottom:13px}.head h1{margin:0;font-size:21px}.head p{margin:4px 0 0;color:#697C70;font-size:10px}.head strong{font-size:11px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.summary div{border:1px solid #d8d1c5;background:#F6EFE3;border-radius:9px;padding:8px 11px}.summary span{display:block;color:#697C70;font-size:9px}.summary b{font-size:13px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}th{background:#E7EBDD;padding:7px 5px;border:1px solid #c7cec0}td{padding:7px 5px;border:1px solid #dedbd2;vertical-align:top;overflow-wrap:anywhere}.serial{width:5%;text-align:center;font-weight:800}.num{width:12%}.dep{width:12%}.amount{width:11%}.statement{width:23%}.date{width:11%}.requester{width:14%}.status{width:12%;font-weight:800}.partial{color:#b76a12}.payment-detail{display:block;font-size:8px;margin-top:4px}.spent{color:#39724f}.unspent{color:#9b642e}tfoot td{background:#F6EFE3;font-weight:900}</style></head><body><div class="paper"><div class="head"><div><h1>تقرير طلبات الشراء</h1><p>بيان طلبات الشراء المنصرفة والتي لم يتم صرفها</p></div><strong>تاريخ التقرير: ${esc(displayDate(todayISO))}</strong></div><div class="summary"><div><span>إجمالي طلبات الشراء</span><b>${money.format(totals.all)} ر.س</b></div><div><span>إجمالي المسدَّد</span><b>${money.format(totals.spent)} ر.س</b></div><div><span>المتبقي للسداد</span><b>${money.format(totals.unspent)} ر.س</b></div><div><span>المسدَّد جزئيًا</span><b>${money.format(totals.partial)} ر.س</b></div></div><table><thead><tr><th class="serial">مسلسل</th><th class="num">رقم طلب الشراء</th><th class="dep">القسم</th><th class="amount">المبلغ</th><th class="statement">البيان</th><th class="date">تاريخ التقديم</th><th class="requester">مقدم طلب الشراء</th><th class="status">حالة طلب الشراء</th></tr></thead><tbody>${filtered.map((x,index)=>`<tr><td class="serial">${index+1}</td><td>${esc(x.orderNumber)}</td><td>${esc(x.department)}</td><td>${money.format(parseAmount(x.amount))} ر.س</td><td>${esc(x.statement)||'—'}</td><td>${esc(displayDate(x.submissionDate))}</td><td>${esc(x.requester)}</td><td class="status ${x.status}">${purchaseStatusLabel(x.status)}${x.status==='partial'?`<span class="payment-detail">المسدَّد: ${money.format(paymentAmounts(x).paid)} ر.س</span><span class="payment-detail">المتبقي: ${money.format(paymentAmounts(x).remaining)} ر.س</span>`:''}</td></tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:20px">لا توجد طلبات شراء مطابقة</td></tr>'}</tbody><tfoot><tr><td colspan="3">إجمالي التقرير</td><td>${money.format(filtered.reduce((n,x)=>n+parseAmount(x.amount),0))} ر.س</td><td colspan="4">عدد الطلبات: ${filtered.length}</td></tr></tfoot></table></div></body></html>`;

  return <section className="page purchase-orders-page">
    <div className="po-hero"><div className="po-hero-title"><span><ShoppingCart/></span><div><h2>طلبات الشراء</h2><p>إنشاء الطلبات ومتابعة ما تم صرفه وما لم يتم صرفه</p></div></div><div className="po-tabs"><button className={tab==='report'?'active':''} onClick={()=>setTab('report')}><ShoppingCart/> الأوامر والتقارير</button><button className={tab==='data'?'active':''} onClick={()=>setTab('data')}><Settings2/> لوحة البيانات</button></div></div>
    {tab==='report'?<>
      <div className="po-create-card"><div className="po-card-heading"><div><Plus/><span><strong>إنشاء طلب شراء</strong><small>أدخل بيانات الطلب الجديد</small></span></div>{!isEditing&&<em>اضغط «تعديل» أعلى الصفحة للإنشاء أو التعديل</em>}</div><div className="po-form-grid">
        <label><span>رقم طلب الشراء</span><input disabled={!isEditing} value={draft.orderNumber} onChange={e=>setDraft({...draft,orderNumber:e.target.value})} placeholder="مثال: PR-1025"/></label>
        <label><span>القسم</span><select disabled={!isEditing} value={draft.department} onChange={e=>setDraft({...draft,department:e.target.value})}><option value="">اختر القسم</option>{departments.map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>المبلغ</span><input disabled={!isEditing} inputMode="decimal" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value.replace(/[^0-9.,]/g,'')})} placeholder="0.00"/></label>
        <label className="po-statement-field"><span>البيان</span><input disabled={!isEditing} value={draft.statement} onChange={e=>setDraft({...draft,statement:e.target.value})} placeholder="بيان طلب الشراء"/></label>
        <label className="po-date-field"><span>تاريخ التقديم</span><RtlDatePicker disabled={!isEditing} value={draft.submissionDate} onChange={submissionDate=>setDraft({...draft,submissionDate})}/></label>
        <label><span>مقدم طلب الشراء</span><select disabled={!isEditing} value={draft.requester} onChange={e=>setDraft({...draft,requester:e.target.value})}><option value="">اختر مقدم الطلب</option>{requesters.map(x=><option key={x}>{x}</option>)}</select></label>
        <button className="po-create-btn" disabled={!isEditing} onClick={addOrder}><Plus/> إنشاء طلب الشراء</button>
      </div></div>
      <div className="po-summary"><div><ShoppingCart/><span>إجمالي الطلبات<strong>{money.format(totals.all)} ر.س</strong></span></div><div className="spent"><CheckCircle2/><span>إجمالي المسدَّد<strong>{money.format(totals.spent)} ر.س</strong></span></div><div className="unspent"><CircleX/><span>المتبقي للسداد<strong>{money.format(totals.unspent)} ر.س</strong></span></div><div className="partial"><Clock3/><span>المسدَّد جزئيًا<strong>{money.format(totals.partial)} ر.س</strong></span></div></div>
      <div className="po-report-card"><div className="po-toolbar"><div className="po-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="بحث برقم الطلب أو القسم أو المبلغ أو البيان أو مقدم الطلب"/></div><div className="po-filter"><button className={statusFilter==='all'?'active':''} onClick={()=>setStatusFilter('all')}>الكل</button><button className={statusFilter==='spent'?'active':''} onClick={()=>setStatusFilter('spent')}>تم الصرف</button><button className={statusFilter==='unspent'?'active':''} onClick={()=>setStatusFilter('unspent')}>لم يتم الصرف</button><button className={statusFilter==='partial'?'active partial':'partial'} onClick={()=>setStatusFilter('partial')}>سداد جزئي</button></div><button className="po-preview-btn" onClick={()=>setPreview(true)}><Eye/> معاينة وطباعة</button></div>
        <div className="po-table-wrap"><table className="po-table"><thead><tr><th>مسلسل</th><th>رقم طلب الشراء</th><th>القسم</th><th>المبلغ</th><th>البيان</th><th>تاريخ التقديم</th><th>مقدم طلب الشراء</th><th>حالة طلب الشراء</th><th>المرفقات</th><th>الإجراءات</th></tr></thead><tbody>{filtered.length?filtered.map(orderRow):<tr><td colSpan="10"><div className="po-empty"><ShoppingCart/><strong>لا توجد طلبات شراء مطابقة</strong><span>أنشئ أول طلب شراء من النموذج بالأعلى.</span></div></td></tr>}</tbody></table></div>
      </div>
    </>:<div className="po-master-grid"><MasterList title="أقسام طلبات الشراء" icon={Building2} items={departments} isEditing={isEditing} placeholder="اسم القسم" onChange={purchaseOrderDepartments=>onChange({purchaseOrderDepartments})} onRename={(index,oldValue,newValue)=>renameMaster('department',index,oldValue,newValue)}/><MasterList title="مقدمو طلبات الشراء" icon={UserRoundPlus} items={requesters} isEditing={isEditing} placeholder="اسم مقدم الطلب" onChange={purchaseRequesters=>onChange({purchaseRequesters})} onRename={(index,oldValue,newValue)=>renameMaster('requester',index,oldValue,newValue)}/></div>}
    {preview&&<PurchasePreview html={reportHtml()} onClose={()=>setPreview(false)} onNotify={onNotify}/>} 
  </section>;
}

export default PurchaseOrdersPage;
