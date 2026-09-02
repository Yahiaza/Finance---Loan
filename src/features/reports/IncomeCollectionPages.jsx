import React,{useEffect,useMemo,useRef,useState} from 'react';
import { Building2, Plus, Trash2, Printer, FileDown, CalendarRange, Layers3, ChevronRight, ChevronLeft, Eye, X } from 'lucide-react';
import { money, parseAmount, uid, displayDate, requestConfirm } from '../../utils/appUtils.js';

const monthNames=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const safeHtml=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const reportCss=`
  @page{size:A4 portrait;margin:10mm}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;padding:0;background:#F6EFE3;color:#0D1B2A;font-family:Cairo,Tahoma,Arial,sans-serif;direction:rtl}
  body{padding:0}.doc{width:100%;background:#fff;padding:7mm;border-radius:14px}
  .brand-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding-bottom:5mm;margin-bottom:5mm;border-bottom:2px solid #98AA9D}
  .brand-side{font-size:10px;color:#697C70;font-weight:700}.brand-side.left{text-align:left}.brand-side.right{text-align:right}
  .report-title{text-align:center}.report-title h1{font-size:20px;margin:0 0 1mm;font-weight:900;color:#0D1B2A}.report-title .meta{font-size:10px;color:#697C70}
  .summary-card{display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(135deg,#F2EFE2,#F8F5EE);border:1px solid #D8D1C5;border-right:4px solid #98AA9D;padding:4mm 5mm;border-radius:10px;margin-bottom:5mm}
  .summary-card span{font-size:11px;color:#697C70;font-weight:700}.summary-card strong{font-size:18px;color:#0D1B2A;white-space:nowrap}
  .department-block{margin:0 0 5mm;border:1px solid #DAD8CF;border-radius:10px;overflow:hidden;break-inside:avoid;background:#fff}
  .department-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:3mm 4mm;background:#EEF1E8;border-bottom:1px solid #DAD8CF}
  .department-head h2{font-size:14px;margin:0;font-weight:900;color:#0D1B2A}.department-head span{font-size:9px;color:#697C70;font-weight:700}
  .department-kpi{font-size:12px!important;color:#0D1B2A!important;font-weight:900!important;white-space:nowrap}
  table{width:76%;margin-right:0;margin-left:auto;border-collapse:collapse;table-layout:fixed;font-size:10px}
  th,td{padding:2.2mm 2.5mm;text-align:right;vertical-align:middle;border-bottom:1px solid #E4E1D8;border-left:1px solid #EEEAE1;overflow-wrap:anywhere}
  th:last-child,td:last-child{border-left:0}th{background:#F7F4EC;color:#44524B;font-weight:800;font-size:9px}
  tbody tr:nth-child(even) td{background:#FCFAF5}.center{text-align:center}.amount{font-weight:900;white-space:nowrap}
  tfoot td{font-weight:900;background:#F2EFE2;border-top:1px solid #CFCBBF;border-bottom:0}
  .empty-department{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:3mm 4mm;color:#758078;font-size:10px;background:#FBF9F3}
  .empty-department strong{color:#697C70}.footer-note{margin-top:4mm;padding-top:3mm;border-top:1px solid #DAD8CF;display:flex;justify-content:space-between;color:#8A918C;font-size:8px}
  @media print{html,body{background:#fff}.doc{padding:0;border-radius:0}}
`;




function monthLabelAr(value){
  const [year,month]=String(value||'').split('-');
  const index=Number(month)-1;
  return Number.isFinite(index)&&monthNames[index]?`${monthNames[index]} ${year}`:value;
}

function AppMonthPicker({value,onChange}){
  const [open,setOpen]=useState(false);
  const [viewYear,setViewYear]=useState(()=>Number(String(value||'').slice(0,4))||new Date().getFullYear());
  const ref=useRef(null);
  useEffect(()=>{const y=Number(String(value||'').slice(0,4));if(y)setViewYear(y)},[value]);
  useEffect(()=>{
    if(!open)return;
    const close=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};
    const esc=e=>{if(e.key==='Escape')setOpen(false)};
    document.addEventListener('mousedown',close);document.addEventListener('keydown',esc);
    return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',esc)};
  },[open]);
  const selectedMonth=Number(String(value||'').slice(5,7));
  const selectedYear=Number(String(value||'').slice(0,4));
  const chooseMonth=index=>{onChange(`${viewYear}-${String(index+1).padStart(2,'0')}`);setOpen(false)};
  const goThisMonth=()=>{const d=new Date();onChange(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);setViewYear(d.getFullYear());setOpen(false)};
  return <div className="app-month-picker" ref={ref}>
    <button type="button" className="app-month-picker-trigger" onClick={()=>setOpen(v=>!v)}><span>{monthLabelAr(value)}</span><CalendarRange/></button>
    {open&&<div className="app-month-picker-popover">
      <div className="app-month-picker-head"><button type="button" onClick={()=>setViewYear(y=>y-1)}><ChevronRight/></button><strong>{viewYear}</strong><button type="button" onClick={()=>setViewYear(y=>y+1)}><ChevronLeft/></button></div>
      <div className="app-month-picker-grid">{monthNames.map((name,i)=><button type="button" key={name} className={selectedYear===viewYear&&selectedMonth===i+1?'selected':''} onClick={()=>chooseMonth(i)}>{name}</button>)}</div>
      <div className="app-month-picker-footer"><button type="button" onClick={goThisMonth}>هذا الشهر</button></div>
    </div>}
  </div>;
}

function reportHeader({title,monthLabel}){
  return `<div class="brand-head"><div class="brand-side right">الإدارة المالية<br><small>السجل المالي اليومي</small></div><div class="report-title"><h1>${safeHtml(title)}</h1><div class="meta">${safeHtml(monthLabel)}</div></div><div class="brand-side left">تقرير التحصيل الوارد</div></div>`;
}

function buildAllDepartmentsHtml({month,groups}){
  const [year,m]=month.split('-');
  const monthLabel=`${monthNames[Number(m)-1]} ${year}`;
  const grand=groups.reduce((sum,g)=>sum+g.rows.reduce((s,x)=>s+parseAmount(x.amount),0),0);
  const blocks=groups.map(g=>{const total=g.rows.reduce((s,x)=>s+parseAmount(x.amount),0);const rows=g.rows.length?`<table><thead><tr><th style="width:8%">م</th><th style="width:21%">التاريخ</th><th style="width:43%">البيان</th><th style="width:28%">القيمة</th></tr></thead><tbody>${g.rows.map((x,i)=>`<tr><td class="center">${i+1}</td><td>${safeHtml(displayDate(x.date))}</td><td>${safeHtml(x.statement||'—')}</td><td class="amount">${money.format(parseAmount(x.amount))} ر.س</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">إجمالي ${safeHtml(g.department)}</td><td>${money.format(total)} ر.س</td></tr></tfoot></table>`:`<div class="empty-department"><span>لا توجد حركات مسجلة لهذا القسم في الشهر المحدد</span><strong>0 ر.س</strong></div>`;return `<section class="department-block"><div class="department-head"><div><h2>${safeHtml(g.department)}</h2><span>${g.rows.length} حركة</span></div><span class="department-kpi">${money.format(total)} ر.س</span></div>${rows}</section>`}).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${reportCss}</style></head><body><div class="doc">${reportHeader({title:'التحصيل الوارد الشهري — جميع الأقسام',monthLabel})}<div class="summary-card"><span>إجمالي التحصيل لجميع الأقسام</span><strong>${money.format(grand)} ر.س</strong></div>${blocks}<div class="footer-note"><span>تم إنشاء التقرير بواسطة نظام الإدارة المالية</span><span>${safeHtml(monthLabel)}</span></div></div></body></html>`;
}

function buildDepartmentHtml({department,month,rows}){
  const total=rows.reduce((s,x)=>s+parseAmount(x.amount),0);
  const [year,m]=month.split('-');
  const monthLabel=`${monthNames[Number(m)-1]} ${year}`;
  const content=rows.length?`<table><thead><tr><th style="width:8%">م</th><th style="width:21%">التاريخ</th><th style="width:43%">البيان</th><th style="width:28%">القيمة</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td class="center">${i+1}</td><td>${safeHtml(displayDate(x.date))}</td><td>${safeHtml(x.statement||'—')}</td><td class="amount">${money.format(parseAmount(x.amount))} ر.س</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">الإجمالي</td><td>${money.format(total)} ر.س</td></tr></tfoot></table>`:`<div class="empty-department"><span>لا توجد حركات مسجلة في هذا الشهر</span><strong>0 ر.س</strong></div>`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${reportCss}</style></head><body><div class="doc">${reportHeader({title:`التحصيل الوارد الشهري — ${department}`,monthLabel})}<div class="summary-card"><span>إجمالي التحصيل</span><strong>${money.format(total)} ر.س</strong></div><section class="department-block"><div class="department-head"><div><h2>${safeHtml(department)}</h2><span>${rows.length} حركة</span></div><span class="department-kpi">${money.format(total)} ر.س</span></div>${content}</section><div class="footer-note"><span>تم إنشاء التقرير بواسطة نظام الإدارة المالية</span><span>${safeHtml(monthLabel)}</span></div></div></body></html>`;
}

function CollectionReportPreview({html,title,onClose,onPrint,onPdf}){
  useEffect(()=>{const esc=e=>{if(e.key==='Escape')onClose?.()};document.addEventListener('keydown',esc);return()=>document.removeEventListener('keydown',esc)},[onClose]);
  return <div className="collection-preview-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}>
    <div className="collection-preview-modal">
      <div className="collection-preview-toolbar">
        <div><strong>{title}</strong><span>معاينة التقرير قبل الطباعة أو التصدير</span></div>
        <div className="collection-preview-actions">
          {onPdf&&<button type="button" onClick={onPdf}><FileDown/> تصدير PDF</button>}
          <button type="button" className="primary" onClick={onPrint}><Printer/> طباعة</button>
          <button type="button" className="close" onClick={onClose}><X/> إغلاق</button>
        </div>
      </div>
      <div className="collection-preview-canvas"><iframe title={title} srcDoc={html}/></div>
    </div>
  </div>;
}

export function CompaniesPage({companies=[],isEditing=false,onChange,onNotify}){
  const [name,setName]=useState('');
  const add=()=>{const v=name.trim(); if(!v)return; if(companies.some(x=>x.trim().toLowerCase()===v.toLowerCase())){onNotify?.({tone:'error',title:'الشركة موجودة',message:'اسم الشركة مسجل بالفعل.'});return;} onChange([...companies,v]);setName('');};
  const remove=async name=>{if(!(await requestConfirm(`حذف شركة «${name}» من الدليل؟ لن يتم حذف الحوالات القديمة المرتبطة بها.`,{title:'حذف شركة',confirmText:'حذف'})))return;onChange(companies.filter(x=>x!==name));};
  return <section className="page companies-page">
    <div className="page-toolbar"><div><h2>دليل الشركات</h2><p>الشركات التي ترد منها الحوالات الواردة</p></div></div>
    <div className="company-entry-card"><div><Building2/><div><strong>إضافة شركة</strong><span>سيظهر الاسم مباشرة في عمود الشركة داخل المبالغ الواردة</span></div></div><div className="company-entry-fields"><input disabled={!isEditing} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add()}} placeholder="اسم الشركة"/><button disabled={!isEditing} className="btn primary" onClick={add}><Plus/> إضافة</button></div></div>
    <div className="companies-directory-card"><div className="companies-directory-head"><strong>الشركات المسجلة</strong><span>{companies.length} شركة</span></div>{companies.length?<div className="companies-list">{companies.map((c,i)=><div className="company-row" key={c}><span className="company-index">{i+1}</span><strong>{c}</strong><button disabled={!isEditing} className="row-delete" onClick={()=>remove(c)}><Trash2/></button></div>)}</div>:<div className="empty-state">لا توجد شركات مسجلة حتى الآن</div>}</div>
  </section>;
}

export function MonthlyIncomeCollectionPage({incomes=[],departments=[],onNotify}){
  const latest=incomes.map(x=>x.date).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0,10);
  const [month,setMonth]=useState(latest.slice(0,7));
  const [departmentFilter,setDepartmentFilter]=useState('all');
  const [preview,setPreview]=useState(null);
  const monthRows=useMemo(()=>incomes.filter(x=>x.date?.startsWith(month) && x.department && String(x.company||'').trim()),[incomes,month]);
  const allGroups=useMemo(()=>departments.map(department=>({department,rows:monthRows.filter(x=>x.department===department).sort((a,b)=>a.date.localeCompare(b.date))})),[departments,monthRows]);
  const groups=useMemo(()=>allGroups.filter(g=>departmentFilter==='all'?true:g.department===departmentFilter),[allGroups,departmentFilter]);
  const exportHtmlPdf=async(html,suggestedName)=>{if(!window.desktopApp?.exportPdf){onNotify?.({tone:'info',title:'التصدير غير متاح',message:'استخدم الطباعة واختر حفظ كـ PDF.'});return;}const result=await window.desktopApp.exportPdf({html,suggestedName});if(result?.ok)onNotify?.({tone:'success',title:'تم تصدير PDF',message:result.path||'تم حفظ التقرير بنجاح.'});else if(result&&!result.canceled)onNotify?.({tone:'error',title:'تعذر التصدير',message:result.error||'حدث خطأ أثناء التصدير.'});};
  const printHtml=html=>{const frame=document.createElement('iframe');frame.style.position='fixed';frame.style.width='1px';frame.style.height='1px';frame.style.opacity='0';frame.style.pointerEvents='none';document.body.appendChild(frame);frame.onload=()=>{setTimeout(()=>{try{frame.contentWindow?.focus();frame.contentWindow?.print();}finally{setTimeout(()=>frame.remove(),800);}},140)};frame.srcdoc=html;};
  const previewDepartment=g=>{const html=buildDepartmentHtml({department:g.department,month,rows:g.rows});setPreview({title:`التحصيل الوارد — ${g.department}`,html,pdfName:`التحصيل-الوارد-${g.department}-${month}.pdf`})};
  const previewAll=()=>{const html=buildAllDepartmentsHtml({month,groups:allGroups});setPreview({title:'التحصيل الوارد — جميع الأقسام',html,pdfName:`التحصيل-الوارد-جميع-الأقسام-${month}.pdf`})};
  const grand=monthRows.reduce((s,x)=>s+parseAmount(x.amount),0);
  return <section className="page income-collection-page">
    <div className="page-toolbar"><div><h2>التحصيل الوارد الشهري</h2><p>الحوالات الواردة مصنفة حسب القسم والشهر</p></div></div>
    <div className="collection-controls"><div className="collection-month-control"><CalendarRange/><label>الشهر<AppMonthPicker value={month} onChange={setMonth}/></label></div><div className="collection-department-control"><label>استعراض حسب القسم<select value={departmentFilter} onChange={e=>setDepartmentFilter(e.target.value)}><option value="all">الأقسام</option>{departments.map(d=><option key={d}>{d}</option>)}</select></label><button type="button" className="btn" onClick={previewAll}><Eye/> معاينة جميع الأقسام</button><button type="button" className="btn collection-print-all-btn" onClick={()=>printHtml(buildAllDepartmentsHtml({month,groups:allGroups}))}><Printer/> طباعة جميع الأقسام</button><button type="button" className="btn" onClick={()=>exportHtmlPdf(buildAllDepartmentsHtml({month,groups:allGroups}),`التحصيل-الوارد-جميع-الأقسام-${month}.pdf`)}><FileDown/> PDF جميع الأقسام</button></div><strong>إجمالي الشهر: {money.format(grand)} ر.س</strong></div>
    <div className="collection-groups">{groups.map(g=>{const total=g.rows.reduce((s,x)=>s+parseAmount(x.amount),0);return <div className="collection-card" key={g.department}><div className="collection-card-head"><div><h3>{g.department}</h3><span>{g.rows.length} حركة</span></div><div className="collection-card-actions"><button onClick={()=>previewDepartment(g)}><Eye/> معاينة</button><button onClick={()=>printHtml(buildDepartmentHtml({department:g.department,month,rows:g.rows}))}><Printer/> طباعة</button><button onClick={()=>exportHtmlPdf(buildDepartmentHtml({department:g.department,month,rows:g.rows}),`التحصيل-الوارد-${g.department}-${month}.pdf`)}><FileDown/> PDF</button></div></div><div className="collection-total">{money.format(total)} ر.س</div><div className="collection-table-wrap"><table className="collection-table"><colgroup><col className="collection-col-index"/><col className="collection-col-date"/><col className="collection-col-statement"/><col className="collection-col-value"/></colgroup><thead><tr><th>م</th><th>التاريخ</th><th>بيان</th><th>القيمة</th></tr></thead><tbody>{g.rows.length?g.rows.map((x,i)=><tr key={x.id}><td>{i+1}</td><td>{displayDate(x.date)}</td><td><strong>{x.statement||'—'}</strong></td><td>{money.format(parseAmount(x.amount))} ر.س</td></tr>):<tr><td colSpan="4" className="empty-cell">لا توجد حوالات واردة لهذا القسم في الشهر المحدد</td></tr>}</tbody></table></div></div>})}</div>
    {preview&&<CollectionReportPreview title={preview.title} html={preview.html} onClose={()=>setPreview(null)} onPrint={()=>printHtml(preview.html)} onPdf={()=>exportHtmlPdf(preview.html,preview.pdfName)}/>}  
  </section>;
}

export function AggregateIncomeCollectionPage({incomes=[],departments=[]}){
  const currentYear=new Date().getFullYear();
  const years=useMemo(()=>Array.from(new Set([currentYear,...incomes.map(x=>Number(x.date?.slice(0,4))).filter(Boolean)])).sort((a,b)=>b-a),[incomes]);
  const [year,setYear]=useState(years[0]||currentYear);
  const rows=useMemo(()=>departments.map(department=>{const months=Array.from({length:12},(_,i)=>incomes.filter(x=>x.department===department&&String(x.company||'').trim()&&x.date?.startsWith(`${year}-${String(i+1).padStart(2,'0')}`)).reduce((s,x)=>s+parseAmount(x.amount),0));return {department,months,total:months.reduce((a,b)=>a+b,0)}}),[departments,incomes,year]);
  const monthTotals=Array.from({length:12},(_,i)=>rows.reduce((s,r)=>s+r.months[i],0));
  const grand=rows.reduce((s,r)=>s+r.total,0);
  return <section className="page aggregate-collection-page"><div className="page-toolbar"><div><h2>التحصيل الوارد المجمع</h2><p>ملخص الإيراد الشهري لكل قسم خلال السنة</p></div></div><div className="aggregate-year-control"><Layers3/><label>السنة<select value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y}>{y}</option>)}</select></label><strong>إجمالي السنة: {money.format(grand)} ر.س</strong></div><div className="aggregate-table-wrap"><table className="aggregate-table"><thead><tr><th>القسم</th>{monthNames.map(m=><th key={m}>{m}</th>)}<th>الإجمالي</th></tr></thead><tbody>{rows.map(r=><tr key={r.department}><th>{r.department}</th>{r.months.map((v,i)=><td key={i}>{v?money.format(v):'—'}</td>)}<td className="aggregate-total-cell">{money.format(r.total)}</td></tr>)}</tbody><tfoot><tr><th>إجمالي الشهور</th>{monthTotals.map((v,i)=><td key={i}>{v?money.format(v):'—'}</td>)}<td>{money.format(grand)}</td></tr></tfoot></table></div></section>;
}
