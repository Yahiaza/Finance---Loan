import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart3, ClipboardList, Settings, Printer, Plus, Trash2, Check,
  ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Search, CalendarDays,
  ChevronRight, ChevronLeft, RotateCcw, Undo2, MoreVertical, FileJson2, Landmark, ListPlus,
  FileSpreadsheet, Upload, History, X, ArrowLeft, ArrowRight, Minus, Square, Pencil, Save,
  Calendar, Maximize2, WalletCards, Building2, CreditCard, Download, Rows3, Columns2,
  LayoutGrid, List, FolderInput, Layers, SlidersHorizontal, Eye, EyeOff } from 'lucide-react';
import { money, uid, pad, toISO, todayISO, displayDate, isOnOrBefore, cleanLegacyNotes, arabicDayDate, parseAmount, formatAmountInput, confirmDelete } from '../../utils/appUtils.js';
import { PageErrorBoundary, PrintPreviewModal, DesktopTitleBar, Sidebar, MiniDateCalendar, DateHeader, PageToolbar, SummaryCard, DateCell, AmountCell, TextCell, GrowingTextCell, ExpenseAction, PrintReportHeader } from '../../components/common.jsx';

function makeLoanRow(index) {
  return { id: uid(), marker: String(index), dueDate: '', loanInstallment: '', bankCommission: '', insuranceInstallment: '', deferredExpense:'', paidEntries: [] };
}

const getPaidTotal = row => (row.paidEntries || []).reduce((sum,entry)=>sum+parseAmount(entry.amount),0);

function getLoanDerived(rows) {
  const dated = rows.map((r,index) => ({...r,index, year:r.dueDate ? Number(r.dueDate.slice(0,4)) : null, month:r.dueDate ? Number(r.dueDate.slice(5,7)) : null}));
  const yearly = new Map();
  dated.forEach(r => {
    if(!r.year) return;
    const entry = yearly.get(r.year) || {sum:0, rows:[]};
    entry.sum += parseAmount(r.bankCommission);
    entry.rows.push(r);
    yearly.set(r.year,entry);
  });
  const annualByIndex = new Map();
  yearly.forEach((entry,year) => {
    const december = [...entry.rows].reverse().find(r=>r.month===12);
    const target = december || entry.rows[entry.rows.length-1];
    if(target) annualByIndex.set(target.index,{year,sum:entry.sum,deferredExpense:target.deferredExpense||''});
  });
  return rows.map((r,index)=>{
    const bankTotal=parseAmount(r.loanInstallment)+parseAmount(r.bankCommission)+parseAmount(r.insuranceInstallment);
    const paidTotal=getPaidTotal(r);
    const difference=bankTotal-paidTotal;
    return {...r,bankTotal,paidTotal,difference,annual:annualByIndex.get(index)||null};
  });
}

function parseExcelDate(value) {
  if(!value && value!==0) return '';
  if(value instanceof Date && !Number.isNaN(value.getTime())) return toISO(value);
  if(typeof value==='number') {
    const d=XLSX.SSF.parse_date_code(value);
    if(d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const text=String(value).trim();
  let m=text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if(m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m=text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if(m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  const d=new Date(text);
  return Number.isNaN(d.getTime()) ? '' : toISO(d);
}

function LoanCategoryPicker({value,onChange,categories,placeholder='اختر أو اكتب تصنيف القرض',disabled=false}) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState(value||'');
  useEffect(()=>setQuery(value||''),[value]);
  const choices=[...new Set(categories.filter(Boolean))].filter(c=>!query||c.toLowerCase().includes(query.toLowerCase()));
  const choose=c=>{setQuery(c);onChange(c);setOpen(false);};
  return <div className="loan-category-picker">
    <div className={`loan-category-input ${open?'open':''}`}>
      <input disabled={disabled} value={query} placeholder={placeholder} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);onChange(e.target.value);setOpen(true)}}/>
      <button type="button" disabled={disabled} onClick={()=>!disabled&&setOpen(v=>!v)}><ChevronLeft className={open?'open':''}/></button>
    </div>
    {open&&<div className="loan-category-menu">
      {choices.length?choices.map(c=><button type="button" key={c} className={c===value?'selected':''} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(c)}><Layers size={14}/><span>{c}</span>{c===value&&<Check size={13}/>}</button>):<div className="loan-category-new"><Plus size={14}/><span>سيتم إنشاء التصنيف: <b>{query||'—'}</b></span></div>}
    </div>}
  </div>;
}

function ResizableLoanDirectoryHeader({widths,onResize}) {
  const labels=['اسم القرض','رقم القرض','التصنيف','الأقساط','إجراءات'];
  const keys=['name','number','category','count','actions'];

  const startResize=(key,e)=>{
    e.preventDefault();
    e.stopPropagation();
    const startX=e.clientX;
    const startWidth=widths[key];
    const min={name:220,number:110,category:110,count:60,actions:150}[key]||80;
    const move=ev=>{
      // RTL table: dragging left increases visual width, dragging right decreases it.
      const next=Math.max(min,startWidth-(ev.clientX-startX));
      onResize(key,next);
    };
    const up=()=>{
      window.removeEventListener('mousemove',move);
      window.removeEventListener('mouseup',up);
      document.body.classList.remove('resizing-loan-columns');
    };
    document.body.classList.add('resizing-loan-columns');
    window.addEventListener('mousemove',move);
    window.addEventListener('mouseup',up);
  };

  return <div className="loan-directory-header resizable-loan-header">
    {labels.map((label,i)=><span key={keys[i]} className={`loan-header-cell ${i===labels.length-1?'last':''}`}>
      {label}
      {i<labels.length-1&&<i className="loan-col-resizer" onMouseDown={e=>startResize(keys[i],e)} title="اسحب لتغيير عرض العمود"/>}
    </span>)}
  </div>;
}

function LoansPage({loans,onChange,onPrint,isEditing=false}) {
  const [loanName,setLoanName]=useState('');
  const [loanNumber,setLoanNumber]=useState('');
  const [loanCategory,setLoanCategory]=useState('');
  const [categoryPickerKey,setCategoryPickerKey]=useState(0);
  const [installmentCount,setInstallmentCount]=useState('12');
  const [activeLoanId,setActiveLoanId]=useState(loans[0]?.id || null);
  const [excelImport,setExcelImport]=useState(null);
  const [editingLoan,setEditingLoan]=useState(false);
  const [loanContext,setLoanContext]=useState(null);
  const [hidePaid,setHidePaid]=useState(false);
  const [directoryGrouped,setDirectoryGrouped]=useState(()=>localStorage.getItem('loan-directory-grouped')==='1');
  const [directoryWidths,setDirectoryWidths]=useState(()=>({
    name:Number(localStorage.getItem('loan-dir-col-name'))||430,
    number:Number(localStorage.getItem('loan-dir-col-number'))||175,
    category:Number(localStorage.getItem('loan-dir-col-category'))||150,
    count:Number(localStorage.getItem('loan-dir-col-count'))||78,
    actions:Number(localStorage.getItem('loan-dir-col-actions'))||205
  }));
  const resizeDirectoryColumn=(key,width)=>{
    setDirectoryWidths(w=>{
      const next={...w,[key]:Math.round(width)};
      localStorage.setItem(`loan-dir-col-${key}`,String(next[key]));
      return next;
    });
  };
  const [editLoanName,setEditLoanName]=useState('');
  const [editLoanNumber,setEditLoanNumber]=useState('');
  const [editLoanCategory,setEditLoanCategory]=useState('');
  const fileRef=useRef(null);

  useEffect(()=>localStorage.setItem('loan-directory-grouped',directoryGrouped?'1':'0'),[directoryGrouped]);

  useEffect(()=>{
    const close=()=>setLoanContext(null);
    const esc=e=>{if(e.key==='Escape')setLoanContext(null)};
    window.addEventListener('click',close);window.addEventListener('keydown',esc);
    return()=>{window.removeEventListener('click',close);window.removeEventListener('keydown',esc)};
  },[]);

  useEffect(()=>{
    if(activeLoanId && !loans.some(l=>l.id===activeLoanId)) setActiveLoanId(loans[0]?.id || null);
    if(!activeLoanId && loans.length) setActiveLoanId(loans[0].id);
  },[loans,activeLoanId]);

  const activeLoan=loans.find(l=>l.id===activeLoanId) || null;
  const createLoan=()=>{
    const name=loanName.trim();
    const count=Math.max(1,Math.min(600,Number(installmentCount)||1));
    if(!name) return;
    const loan={id:uid(),name,loanNumber:loanNumber.trim(),category:loanCategory.trim(),installmentCount:count,createdAt:todayISO,rows:Array.from({length:count},(_,i)=>makeLoanRow(i+1))};
    onChange(currentLoans=>[...currentLoans,loan]); setActiveLoanId(loan.id); setLoanName(''); setLoanNumber(''); setLoanCategory(''); setCategoryPickerKey(k=>k+1);
  };
  const updateLoan=(id,patch)=>onChange(currentLoans=>currentLoans.map(l=>l.id===id?{...l,...patch}:l));
  const startEditLoan=()=>{ if(!activeLoan) return; setEditLoanName(activeLoan.name); setEditLoanNumber(activeLoan.loanNumber||''); setEditLoanCategory(activeLoan.category||''); setEditingLoan(true); };
  const saveLoanIdentity=()=>{ if(!activeLoan) return; const name=editLoanName.trim(); if(!name) return; updateLoan(activeLoan.id,{name,loanNumber:editLoanNumber.trim(),category:editLoanCategory.trim()}); setEditingLoan(false); };
  const updateRow=(rowId,key,value)=>{
    if(!activeLoanId) return;
    onChange(currentLoans=>currentLoans.map(loan=>{
      if(loan.id!==activeLoanId) return loan;
      const rows=(loan.rows||[]).map(r=>r.id===rowId?{...r,[key]:value}:r);
      return {...loan,rows,installmentCount:rows.length};
    }));
  };
  const addPayment=(rowId,amount,date=todayISO)=>{
    if(!activeLoanId) return;
    const n=parseAmount(amount);
    if(!Number.isFinite(n) || n<=0) return;
    onChange(currentLoans=>currentLoans.map(loan=>{
      if(loan.id!==activeLoanId) return loan;
      const rows=(loan.rows||[]).map(r=>r.id===rowId?{
        ...r,
        paidEntries:[...(Array.isArray(r.paidEntries)?r.paidEntries:[]),{id:uid(),date:date||todayISO,amount:String(n)}]
      }:r);
      return {...loan,rows};
    }));
  };
  const removePayment=async(rowId,paymentId)=>{
    if(!activeLoanId || !(await confirmDelete('دفعة السداد المحددة'))) return;
    onChange(currentLoans=>currentLoans.map(loan=>{
      if(loan.id!==activeLoanId) return loan;
      const rows=(loan.rows||[]).map(r=>r.id===rowId?{
        ...r,
        paidEntries:(Array.isArray(r.paidEntries)?r.paidEntries:[]).filter(p=>p.id!==paymentId)
      }:r);
      return {...loan,rows};
    }));
  };
  const addInstallment=()=>{
    if(!activeLoanId) return;
    onChange(currentLoans=>currentLoans.map(loan=>{
      if(loan.id!==activeLoanId) return loan;
      const currentRows=Array.isArray(loan.rows)?loan.rows:[];
      const rows=[...currentRows,makeLoanRow(currentRows.length+1)];
      return {...loan,rows,installmentCount:rows.length};
    }));
  };
  const removeInstallment=async(rowId)=>{
    if(!activeLoan) return;
    const row=activeLoan.rows.find(r=>r.id===rowId);
    if(!row) return;
    if(!(await confirmDelete(`القسط رقم ${row.marker || ''}`))) return;
    onChange(currentLoans=>currentLoans.map(loan=>{
      if(loan.id!==activeLoanId) return loan;
      const rows=(loan.rows||[]).filter(r=>r.id!==rowId);
      return {...loan,rows,installmentCount:rows.length};
    }));
  };
  const deleteLoan=async()=>{
    if(!activeLoan) return;
    if(!(await confirmDelete(`القرض «${activeLoan.name}» بكل أقساطه`))) return;
    onChange(currentLoans=>currentLoans.filter(l=>l.id!==activeLoan.id));
  };
  const readExcel=async file=>{
    if(!file || !activeLoan) return;
    try{
      const buffer=await file.arrayBuffer();
      const wb=XLSX.read(buffer,{type:'array',cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true,blankrows:true});
      if(!matrix.length) return alert('ملف Excel فارغ.');
      const maxCols=Math.max(1,...matrix.map(r=>r.length));
      const normalized=matrix.map(r=>Array.from({length:maxCols},(_,i)=>r[i]??''));
      setExcelImport({
        fileName:file.name,
        matrix:normalized,
        step:0,
        pickStart:null,
        ranges:{loanInstallment:null,bankCommission:null,dueDate:null,paid:null,marker:null}
      });
    }catch(err){ console.error(err); alert('تعذر قراءة ملف Excel. تأكد أنه بصيغة xlsx أو xls.'); }
    finally{ if(fileRef.current) fileRef.current.value=''; }
  };
  const applyExcelImport=()=>{
    if(!activeLoan || !excelImport) return;
    const getRangeValues=(key)=>{
      const range=excelImport.ranges[key];
      if(!range) return [];
      const values=[];
      for(let r=range.startRow;r<=range.endRow;r++) values.push(excelImport.matrix[r]?.[range.col] ?? '');
      return values;
    };

    const installments=getRangeValues('loanInstallment');
    const commissions=getRangeValues('bankCommission');
    const insuranceValues=getRangeValues('insuranceInstallment');
    const dates=getRangeValues('dueDate');
    const paidValues=getRangeValues('paid');
    const markers=getRangeValues('marker');

    const selectedArrays=[installments,commissions,insuranceValues,dates,paidValues,markers].filter(a=>a.length);
    if(!selectedArrays.length) return;

    // آخر الاختيارات هي المصدر الفعلي. اختلاف أطوال النطاقات لا يمنع الاستيراد.
    const count=Math.max(...selectedArrays.map(a=>a.length));
    const valueAt=(arr,i)=>arr.length && i<arr.length ? (arr[i] ?? '') : '';

    const imported=Array.from({length:count},(_,i)=>{
      const dueRaw=valueAt(dates,i);
      const dueDate=dueRaw!==''?parseExcelDate(dueRaw):'';
      const paidRaw=valueAt(paidValues,i);
      const importedPaid=paidRaw!==''?parseAmount(paidRaw):0;
      return {
        id:uid(),
        marker:markers.length?String(valueAt(markers,i)||i+1):String(i+1),
        dueDate,
        loanInstallment:installments.length?formatAmountInput(valueAt(installments,i)):'',
        bankCommission:commissions.length?formatAmountInput(valueAt(commissions,i)):'',
        insuranceInstallment:insuranceValues.length?formatAmountInput(valueAt(insuranceValues,i)):'',
        deferredExpense:'',
        paidEntries: importedPaid ? [{id:uid(),date:dueDate||todayISO,amount:String(importedPaid)}] : []
      };
    }).filter(r=>
      r.loanInstallment!=='' ||
      r.bankCommission!=='' ||
      r.insuranceInstallment!=='' ||
      r.dueDate!=='' ||
      r.paidEntries.length ||
      (markers.length && r.marker!=='')
    );

    if(!imported.length) return;
    updateLoan(activeLoan.id,{rows:imported,installmentCount:imported.length});
    setExcelImport(null);
  };
  const derived=activeLoan ? getLoanDerived(activeLoan.rows) : [];
  const visibleDerived=hidePaid ? derived.filter(r=>r.difference>0.009) : derived;
  const hiddenPaidCount=derived.length-visibleDerived.length;
  const directoryGroups=directoryGrouped
    ? Object.entries(loans.reduce((acc,loan)=>{
        const category=(loan.category||'بدون تصنيف').trim()||'بدون تصنيف';
        (acc[category] ||= []).push(loan);
        return acc;
      },{})).sort(([a],[b])=>a.localeCompare(b,'ar'))
    : [];

  const renderDirectoryRow=l=><div className={`loan-directory-row ${l.id===activeLoanId?'active':''}`} key={l.id} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setLoanContext({loanId:l.id,x:e.clientX,y:e.clientY})}}>
    <strong className="loan-dir-name" title={l.name}>{l.name}</strong>
    <span className="loan-dir-number" title={l.loanNumber||'—'}>{l.loanNumber||'—'}</span>
    <span className="category-chip loan-dir-category">{l.category||'بدون تصنيف'}</span>
    <span className="loan-dir-count">{l.rows.length}</span>
    <div className="loan-dir-actions"><button onClick={()=>{setActiveLoanId(l.id);setEditingLoan(false)}}><Landmark/> عرض القرض</button><button disabled={!isEditing} onClick={()=>{if(!isEditing)return;setActiveLoanId(l.id);setEditLoanName(l.name);setEditLoanNumber(l.loanNumber||'');setEditLoanCategory(l.category||'');setEditingLoan(true)}}><Pencil/> تعديل</button></div>
  </div>;

  const loanCategories=[...new Set(loans.map(l=>l.category).filter(Boolean))];

  return <section className="page loans-page print-loan-page">
    <div className="page-toolbar loans-toolbar"><div><h2>تسجيل القروض</h2><p>إنشاء القرض أولًا، ثم إدارة بياناته وأقساطه وسداداته من مساحة عمل مستقلة وواضحة.</p></div></div>

    <div className="loan-register-card redesigned-register">
      <div className="register-intro"><div className="register-icon"><Plus/></div><div><span className="register-kicker">قرض جديد</span><h3>بيانات تعريف القرض</h3><p>أدخل البيانات الأساسية فقط. بعد التسجيل ستظهر أدوات الأقساط والاستيراد والطباعة في مساحة القرض.</p></div></div>
      <div className="loan-register-form redesigned-form">
        <label><span><b>1</b> اسم القرض</span><input disabled={!isEditing} value={loanName} onChange={e=>setLoanName(e.target.value)} placeholder="مثال: تمويل المساكن" onKeyDown={e=>e.key==='Enter'&&createLoan()}/></label>
        <label><span><b>2</b> رقم القرض</span><input disabled={!isEditing} value={loanNumber} onChange={e=>setLoanNumber(e.target.value)} placeholder="رقم العقد أو القرض" onKeyDown={e=>e.key==='Enter'&&createLoan()}/></label>
        <label className="category-field"><span><b>3</b> التصنيف</span><LoanCategoryPicker key={categoryPickerKey} disabled={!isEditing} value={loanCategory} onChange={setLoanCategory} categories={loanCategories} placeholder="مثال: قروض بنك الرياض"/></label>
        <label className="count-field"><span><b>4</b> عدد الأقساط</span><input disabled={!isEditing} type="number" min="1" max="600" value={installmentCount} onChange={e=>setInstallmentCount(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createLoan()}/></label>
        <button className="btn primary loan-create-btn" disabled={!isEditing} onClick={()=>isEditing&&createLoan()}><Plus size={17}/> إنشاء القرض</button>
      </div>
    </div>

    {!!loans.length && <div className="loan-directory">
      <div className="loan-directory-head">
        <div><Layers/><div><h3>القروض المسجلة</h3><span>اختر القرض المطلوب ثم اضغط عرض القرض أو تعديل بياناته.</span></div></div>
        <div className="loan-directory-head-actions">
          <button className={`btn soft directory-group-toggle ${directoryGrouped?'active':''}`} onClick={()=>setDirectoryGrouped(v=>!v)}><Rows3 size={15}/>{directoryGrouped?'عرض الكل':'استعراض حسب التصنيف'}</button>
          <small>{loans.length} قرض</small>
        </div>
      </div>
      <div className="loan-directory-table" style={{
        '--loan-name-col':`${directoryWidths.name}px`,
        '--loan-number-col':`${directoryWidths.number}px`,
        '--loan-category-col':`${directoryWidths.category}px`,
        '--loan-count-col':`${directoryWidths.count}px`,
        '--loan-actions-col':`${directoryWidths.actions}px`
      }}>
        <ResizableLoanDirectoryHeader widths={directoryWidths} onResize={resizeDirectoryColumn}/>
        {directoryGrouped
          ? directoryGroups.map(([category,items])=><div className="loan-directory-category-block" key={category}>
              <div className="loan-directory-category-separator"><div><Layers size={14}/><strong>{category}</strong></div><span>{items.length} قرض</span></div>
              {items.map(renderDirectoryRow)}
            </div>)
          : loans.map(renderDirectoryRow)}
      </div>
    </div>}
    {loanContext&&(()=>{
      const l=loans.find(x=>x.id===loanContext.loanId); if(!l)return null;
      const printThis=()=>{setActiveLoanId(l.id);setEditingLoan(false);setLoanContext(null);setTimeout(onPrint,80)};
      return <div className="loan-context-menu" style={{left:loanContext.x,top:loanContext.y}} onClick={e=>e.stopPropagation()}>
        <button onClick={()=>{setActiveLoanId(l.id);setEditingLoan(false);setLoanContext(null)}}><Landmark/> استعراض</button>
        <button onClick={printThis}><Printer/> طباعة</button>
        <button disabled={!isEditing} onClick={()=>{if(!isEditing)return;setActiveLoanId(l.id);setEditLoanName(l.name);setEditLoanNumber(l.loanNumber||'');setEditLoanCategory(l.category||'');setEditingLoan(true);setLoanContext(null)}}><Pencil/> تعديل</button>
        <button className="danger" onClick={async()=>{if(await confirmDelete(`القرض «${l.name}» بكل أقساطه`)){onChange(currentLoans=>currentLoans.filter(x=>x.id!==l.id));setLoanContext(null)}}}><Trash2/> حذف</button>
      </div>
    })()}

    {activeLoan ? <>
      <div className="loan-workspace-card">
        <div className="loan-workspace-main">
          <div className="loan-workspace-icon"><Landmark/></div>
          {!editingLoan ? <div className="loan-identity"><span>القرض المحدد</span><h3>{activeLoan.name}</h3><p>{activeLoan.loanNumber ? <>رقم القرض: <b>{activeLoan.loanNumber}</b></> : 'بدون رقم قرض'} <i>•</i> {activeLoan.category||'بدون تصنيف'} <i>•</i> {activeLoan.rows.length} قسط</p></div> : <div className="loan-edit-fields"><label><span>اسم القرض</span><input disabled={!isEditing} value={editLoanName} onChange={e=>setEditLoanName(e.target.value)}/></label><label><span>رقم القرض</span><input disabled={!isEditing} value={editLoanNumber} onChange={e=>setEditLoanNumber(e.target.value)}/></label><label className="category-field"><span>التصنيف</span><LoanCategoryPicker disabled={!isEditing} value={editLoanCategory} onChange={setEditLoanCategory} categories={loanCategories}/></label></div>}
        </div>
        <div className="loan-workspace-actions">
          {editingLoan ? <><button className="btn primary" onClick={saveLoanIdentity}><Save size={16}/> حفظ التعديل</button><button className="btn soft" onClick={()=>setEditingLoan(false)}><X size={16}/> إلغاء</button></> : <button className="btn soft" disabled={!isEditing} onClick={()=>isEditing&&startEditLoan()}><Pencil size={16}/> تعديل الاسم والرقم</button>}
          <button className="btn dark" onClick={onPrint}><Printer size={16}/> طباعة القرض</button>
        </div>
      </div>

      <div className="loan-sheet-card">
        <div className="loan-sheet-head desktop-loan-actions"><div><h3>جدول الأقساط والسداد</h3><span>التعديلات تحفظ تلقائيًا في ملف بيانات البرنامج</span></div><div className="loan-head-actions">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={e=>readExcel(e.target.files?.[0])}/>
          <button className="btn excel-btn" disabled={!isEditing} onClick={()=>isEditing&&fileRef.current?.click()}><FileSpreadsheet size={16}/> استيراد Excel الذكي</button>
          <button className="btn soft" disabled={!isEditing} onClick={()=>isEditing&&addInstallment()}><ListPlus size={16}/> إضافة قسط</button>
          <button className={`btn soft hide-paid-btn ${hidePaid?'active':''}`} onClick={()=>setHidePaid(v=>!v)}>{hidePaid?<Eye/>:<EyeOff/>} {hidePaid?'إظهار المسدد':`إخفاء المسدد${hiddenPaidCount?` (${hiddenPaidCount})`:''}`}</button>
          <button className="btn danger-soft" disabled={!isEditing} onClick={()=>isEditing&&deleteLoan()}><Trash2 size={16}/> حذف القرض</button>
        </div></div>
        {excelImport && <ExcelImportWizard data={excelImport} onChange={setExcelImport} onCancel={()=>setExcelImport(null)} onApply={applyExcelImport}/>} 
        <div className="loan-print-heading"><h2>{activeLoan.name}</h2><p>{activeLoan.loanNumber?`رقم القرض: ${activeLoan.loanNumber}`:'بدون رقم قرض'} — عدد الأقساط: {activeLoan.rows.length}</p></div>
        <div className="loan-table-wrap"><table className="loan-table"><thead><tr>
          <th className="loan-marker">م</th><th>تاريخ الاستحقاق</th><th>قسط القرض</th><th>العمولات البنكية</th><th>قسط التأمين</th><th>قسط البنك مع العمولات البنكية والتأمين</th><th>المسدد</th><th>الفرق</th><th className="annual-combined-head"><span>عن كل سنة</span><small>العمولات / نفقات إيرادية مؤجلة</small></th><th className="loan-actions-col">حذف</th>
        </tr></thead><tbody>{visibleDerived.map((row,i)=><LoanRow key={row.id} row={row} index={i} isEditing={isEditing} onChange={updateRow} onAddPayment={addPayment} onRemovePayment={removePayment} onDelete={removeInstallment}/>)}</tbody></table></div>
        <button className="loan-add-bottom" disabled={!isEditing} onClick={()=>isEditing&&addInstallment()}><Plus size={16}/> إضافة قسط جديد</button>
      </div>
      <LoanStats loan={activeLoan}/>
      <LoanPrintDocument loan={activeLoan} rows={derived}/>
    </> : <div className="loan-empty"><Landmark size={42}/><h3>لا توجد قروض مسجلة</h3><p>سجل أول قرض من النموذج بالأعلى ليظهر جدول الأقساط والإحصائية.</p></div>}
  </section>;
}

function ExcelImportWizard({data,onChange,onCancel,onApply}) {
  const steps=[
    {key:'loanInstallment',label:'قسط القرض',question:'حدد خلايا قسط القرض فقط'},
    {key:'bankCommission',label:'العمولات البنكية',question:'حدد خلايا العمولات البنكية فقط'},
    {key:'insuranceInstallment',label:'قسط التأمين',question:'حدد خلايا قسط التأمين إن كانت موجودة'},
    {key:'dueDate',label:'تاريخ الاستحقاق',question:'حدد خلايا تاريخ الاستحقاق'},
    {key:'paid',label:'المسدد',question:'حدد خلايا المسدد إن كانت موجودة'},
    {key:'marker',label:'م / المسلسل',question:'حدد خلايا المسلسل إن كانت موجودة'}
  ];
  const colName=index=>{
    let n=index+1,out='';
    while(n){ n--; out=String.fromCharCode(65+(n%26))+out; n=Math.floor(n/26); }
    return out;
  };
  const rangeLabel=range=>range?`${colName(range.col)}${range.startRow+1}:${colName(range.col)}${range.endRow+1}`:'—';
  const step=steps[Math.min(data.step,steps.length-1)];
  const done=data.step>=steps.length;
  const isInRange=(ri,ci,range)=>!!range && ci===range.col && ri>=range.startRow && ri<=range.endRow;
  const chooseCell=(ri,ci)=>{
    if(done) return;
    if(!data.pickStart){
      onChange({...data,pickStart:{row:ri,col:ci}});
      return;
    }
    if(data.pickStart.col!==ci){
      onChange({...data,pickStart:{row:ri,col:ci}});
      return;
    }
    const range={col:ci,startRow:Math.min(data.pickStart.row,ri),endRow:Math.max(data.pickStart.row,ri)};
    const nextRanges={...data.ranges,[step.key]:range};
    onChange({...data,ranges:nextRanges,pickStart:null,step:Math.min(data.step+1,steps.length)});
  };
  const skip=()=>onChange({...data,pickStart:null,step:Math.min(data.step+1,steps.length)});
  const back=()=>onChange({...data,pickStart:null,step:Math.max(0,data.step-1)});
  const selectStep=index=>onChange({...data,pickStart:null,step:index});
  const finishSelection=()=>onChange({...data,pickStart:null,step:steps.length});
  const selectedRange=!done?data.ranges[step.key]:null;
  return <div className="excel-wizard-card">
    <div className="excel-wizard-head">
      <div><FileSpreadsheet size={22}/><div><strong>استيراد Excel بتحديد الخلايا</strong><span>{data.fileName} — {data.matrix.length} صف</span></div></div>
      <button className="wizard-close" onClick={onCancel}><X size={17}/></button>
    </div>
    {!done ? <>
      <div className="wizard-question"><span>الخطوة {data.step+1} من {steps.length}</span><h4>{step.question}</h4><p>{data.pickStart ? <>تم تحديد البداية <b>{colName(data.pickStart.col)}{data.pickStart.row+1}</b> — اضغط الآن آخر خلية في نفس العمود.</> : <>اضغط <b>أول خلية</b> من البيانات المطلوبة ثم اضغط <b>آخر خلية</b>. لن يتم استيراد أي خلايا خارج النطاق.</>}</p></div>
      <div className="excel-sheet-preview cell-picker"><table><thead><tr><th className="row-number-head"></th>{data.matrix[0].map((_,ci)=><th key={ci} className="excel-col-letter">{colName(ci)}</th>)}</tr></thead><tbody>{data.matrix.map((r,ri)=><tr key={ri}><th className="excel-row-number">{ri+1}</th>{r.map((v,ci)=>{const activeStart=data.pickStart?.row===ri&&data.pickStart?.col===ci; const selected=isInRange(ri,ci,selectedRange); return <td key={ci} className={`${activeStart?'pick-start ':''}${selected?'range-selected':''}`} onClick={()=>chooseCell(ri,ci)} title={`${colName(ci)}${ri+1}`}>{String(v??'')||' '}</td>})}</tr>)}</tbody></table></div>
      <div className="wizard-field-selector">
        <div className="wizard-field-selector-title"><strong>اختر البيانات المراد استيرادها</strong><span>الترتيب مقترح فقط — يمكنك الضغط على أي خانة مباشرة.</span></div>
        <div className="wizard-progress">{steps.map((st,i)=><button type="button" key={st.key} onClick={()=>selectStep(i)} className={`${data.ranges[st.key]?'done ':''}${i===data.step?'active':''}`}><span>{data.ranges[st.key]?'✓':i+1}</span><b>{st.label}</b><small>{rangeLabel(data.ranges[st.key])}</small></button>)}</div>
      </div>
      <div className="excel-map-actions">
        <button className="btn soft" disabled={data.step===0} onClick={back}><ArrowRight size={15}/> السابق</button>
        {data.pickStart&&<button className="btn soft" onClick={()=>onChange({...data,pickStart:null})}>إلغاء نقطة البداية</button>}
        <button className="btn soft excel-skip-btn" onClick={skip}>Skip / تخطي</button>
        <button className="btn primary" onClick={finishSelection}><Check size={15}/> إنهاء التحديد</button>
      </div>
    </> : <>
      <div className="wizard-summary"><Check size={28}/><div><h4>تم تحديد نطاقات الخلايا</h4><p>لن يدخل في الاستيراد إلا النطاقات الظاهرة أدناه.</p></div></div>
      <div className="wizard-map-summary">{steps.map(st=><div key={st.key}><span>{st.label}</span><strong>{rangeLabel(data.ranges[st.key])}</strong></div>)}</div>
      <div className="excel-map-actions"><button className="btn soft" onClick={()=>onChange({...data,step:0,pickStart:null})}><ArrowRight size={15}/> تعديل الاختيارات</button><button className="btn primary" onClick={onApply}><Upload size={16}/> استيراد الخلايا المحددة</button></div>
    </>}
  </div>;
}

function LoanRow({row,index,onChange,onAddPayment,onRemovePayment,onDelete,isEditing=false}) {
  const [quickPaid,setQuickPaid]=useState('');
  const [showHistory,setShowHistory]=useState(false);
  const [historyDate,setHistoryDate]=useState(todayISO);
  const [historyAmount,setHistoryAmount]=useState('');
  const handleAmount=(key,value)=>onChange(row.id,key,formatAmountInput(value));
  const addQuick=()=>{
    const raw=String(quickPaid).trim();
    if(!raw) return;
    const amount=parseAmount(raw.replace(/^\+/,''));
    if(!amount) return;
    onAddPayment(row.id,amount,todayISO);
    setQuickPaid('');
  };
  const addHistorical=()=>{
    const amount=parseAmount(historyAmount);
    if(!amount) return;
    onAddPayment(row.id,amount,historyDate||todayISO);
    setHistoryAmount('');
  };
  return <>
    <tr>
      <td><input disabled={!isEditing} className="loan-cell marker-input" value={row.marker} onChange={e=>onChange(row.id,'marker',e.target.value)} placeholder={String(index+1)}/></td>
      <td><DateCell value={row.dueDate} onChange={v=>onChange(row.id,'dueDate',v)}/></td>
      <td><input disabled={!isEditing} className="loan-cell loan-amount" inputMode="decimal" value={row.loanInstallment} onChange={e=>handleAmount('loanInstallment',e.target.value)} placeholder="—"/></td>
      <td><input disabled={!isEditing} className="loan-cell loan-amount" inputMode="decimal" value={row.bankCommission} onChange={e=>handleAmount('bankCommission',e.target.value)} placeholder="—"/></td>
      <td><input disabled={!isEditing} className="loan-cell loan-amount" inputMode="decimal" value={row.insuranceInstallment||''} onChange={e=>handleAmount('insuranceInstallment',e.target.value)} placeholder="—"/></td>
      <td className="loan-calculated">{money.format(row.bankTotal)}</td>
      <td className="payment-cell"><div className="payment-total"><strong>{money.format(row.paidTotal)}</strong><button onClick={()=>setShowHistory(v=>!v)} title="سجل الدفعات"><History size={14}/><small>{(row.paidEntries||[]).length}</small></button></div><div className="quick-payment"><input disabled={!isEditing} inputMode="decimal" value={quickPaid} onChange={e=>setQuickPaid(e.target.value===''?'':formatAmountInput(e.target.value.replace(/^\+/,'')))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addQuick();}else if(e.key==='Escape'){setQuickPaid('');}}} placeholder="+ مبلغ ثم Enter"/><button disabled={!isEditing} onClick={()=>isEditing&&addQuick()}><Plus size={14}/></button></div></td>
      <td className={`loan-calculated ${row.difference>0?'remaining':row.difference<0?'overpaid':'settled'}`}>{money.format(row.difference)}<span className="payment-status">{row.paidTotal===0?'غير مسدد':row.difference>0?'مسدد جزئيًا':row.difference===0?'مسدد بالكامل':'زيادة سداد'}</span></td>
      <td className="annual-combined-cell">{row.annual ? <div className="annual-combined-box">
        <div className="annual-combined-line"><span>العمولات</span><strong>{money.format(row.annual.sum)}</strong></div>
        <div className="annual-combined-line deferred"><span>نفقات إيرادية مؤجلة</span><input disabled={!isEditing} className="loan-cell loan-amount" inputMode="decimal" value={row.deferredExpense||''} onChange={e=>handleAmount('deferredExpense',e.target.value)} placeholder="—"/></div>
        <small>نهاية {row.annual.year}</small>
      </div> : <span className="dash">—</span>}</td>
      <td className="loan-row-actions"><button disabled={!isEditing} onClick={()=>isEditing&&onDelete(row.id)} title="حذف هذا القسط"><Trash2 size={15}/></button></td>
    </tr>
    {showHistory && <tr className="payment-history-row"><td colSpan="10"><div className="payment-history"><div className="payment-history-head"><b>سجل سداد القسط رقم {row.marker || index+1}</b><span>الإجمالي: {money.format(row.paidTotal)} ر.س</span></div><div className="historical-payment-add"><label><span>تاريخ السحب</span><input disabled={!isEditing} type="date" max={todayISO} value={historyDate} onChange={e=>setHistoryDate(e.target.value>todayISO?todayISO:e.target.value)}/></label><label><span>المبلغ</span><input disabled={!isEditing} inputMode="decimal" value={historyAmount} onChange={e=>setHistoryAmount(e.target.value===''?'':formatAmountInput(e.target.value))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addHistorical();}}} placeholder="مثال: 5,000"/></label><button disabled={!isEditing} onClick={()=>isEditing&&addHistorical()}><Plus size={14}/> إضافة دفعة بتاريخ محدد</button></div>{(row.paidEntries||[]).length ? <div className="payment-list">{row.paidEntries.map((p,i)=><div key={p.id}><span className="payment-index">{i+1}</span><span>{displayDate(p.date)}</span><strong>{money.format(parseAmount(p.amount))} ر.س</strong><button onClick={()=>onRemovePayment(row.id,p.id)} title="حذف الدفعة"><Trash2 size={14}/></button></div>)}</div> : <div className="payment-empty">لا توجد دفعات مسجلة لهذا القسط.</div>}</div></td></tr>}
  </>;
}

function getLoanInstallmentValue(rows=[]) {
  // قيمة القسط في بيان القروض مرتبطة بأول قسط فعلي مسجل:
  // قسط القرض + العمولة البنكية + قسط التأمين لنفس الصف.
  const first=(rows||[]).find(row=>
    parseAmount(row.loanInstallment)>0.009 ||
    parseAmount(row.bankCommission)>0.009 ||
    parseAmount(row.insuranceInstallment)>0.009
  );
  if(!first) return 0;
  return parseAmount(first.loanInstallment)+parseAmount(first.bankCommission)+parseAmount(first.insuranceInstallment);
}

function LoansOverviewPage({loans,onPrint}) {
  const [categoryFilter,setCategoryFilter]=useState('all');
  const [singlePrintLoanId,setSinglePrintLoanId]=useState(null);
  const [categoryPrintName,setCategoryPrintName]=useState(null);
  const rows=loans.map(loan=>{
    const principal=loan.rows.reduce((sum,row)=>sum+parseAmount(row.loanInstallment),0);
    const interest=loan.rows.reduce((sum,row)=>sum+parseAmount(row.bankCommission),0);
    const insurance=loan.rows.reduce((sum,row)=>sum+parseAmount(row.insuranceInstallment),0);
    const total=principal+interest+insurance;
    const paid=loan.rows.reduce((sum,row)=>sum+getPaidTotal(row),0);
    const balance=total-paid;
    const derivedRows=getLoanDerived(loan.rows||[]);
    const totalInstallments=derivedRows.length;
    // القسط المسدد جزئيًا يظل ضمن المتبقي حتى يصبح الفرق صفراً.
    const paidInstallments=derivedRows.filter(row=>row.bankTotal>0.009 && row.difference<=0.009).length;
    const remainingInstallments=Math.max(0,totalInstallments-paidInstallments);
    const installmentValue=getLoanInstallmentValue(loan.rows||[]);
    return {...loan,principal,interest,total,paid,balance,installmentValue,totalInstallments,paidInstallments,remainingInstallments};
  });
  const categories=[...new Set(rows.map(x=>x.category||'بدون تصنيف'))];
  const visibleRows=categoryFilter==='all'?rows:rows.filter(x=>(x.category||'بدون تصنيف')===categoryFilter);
  const makeTotals=list=>list.reduce((acc,row)=>({total:acc.total+row.total,installmentValue:acc.installmentValue+row.installmentValue,paid:acc.paid+row.paid,balance:acc.balance+row.balance}),{total:0,installmentValue:0,paid:0,balance:0});
  const totals=makeTotals(visibleRows), allTotals=makeTotals(rows);
  const grouped=[...new Set(visibleRows.map(x=>x.category||'بدون تصنيف'))].map(cat=>({cat,items:visibleRows.filter(x=>(x.category||'بدون تصنيف')===cat)}));
  const printLoan=loan=>{
    setSinglePrintLoanId(loan.id);
    setTimeout(()=>onPrint('loan-overview-single'),70);
  };
  const printCategory=cat=>{
    setCategoryPrintName(cat);
    setTimeout(()=>onPrint('loan-overview-category'),70);
  };
  const singleLoan=rows.find(x=>x.id===singlePrintLoanId);

  return <section className="page loans-overview-page">
    <div className="page-toolbar">
      <div><h2>بيان القروض</h2><p>استعراض القروض حسب التصنيف مع إمكانية طباعة بيان كل قرض أو تقرير شامل.</p></div>
      <div className="loan-overview-actions">
        <label className="overview-category-filter"><span>التصنيف</span><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">عرض كل التصنيفات</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
        <button className="btn dark" onClick={()=>onPrint('loan-overview')}><Printer/> طباعة شاملة للقروض</button>
      </div>
    </div>
    <div className="loan-overview-summary">
      <SummaryCard label="إجمالي القروض" value={totals.total} tone="blue" icon={<Landmark/>}/>
      <SummaryCard label="إجمالي قيم الأقساط" value={totals.installmentValue} tone="blue" icon={<CircleDollarSign/>}/>
      <SummaryCard label="إجمالي المسدد" value={totals.paid} tone="green" icon={<Check/>}/>
      <SummaryCard label="إجمالي الرصيد" value={totals.balance} tone="red" icon={<CircleDollarSign/>}/>
    </div>
    <LoansOverviewPrintDocument rows={rows} totals={allTotals}/>
    {categoryPrintName&&<div className="overview-category-print"><LoansOverviewPrintDocument rows={rows.filter(x=>(x.category||'بدون تصنيف')===categoryPrintName)} totals={makeTotals(rows.filter(x=>(x.category||'بدون تصنيف')===categoryPrintName))} title={`بيان ${categoryPrintName}`}/></div>}
    {singleLoan&&<div className="overview-single-loan-print"><LoanPrintDocument loan={singleLoan} rows={getLoanDerived(singleLoan.rows)}/></div>}
    {grouped.length ? <div className="loan-category-sections">{grouped.map(group=><section className="loan-category-section" key={group.cat}>
      <div className="loan-category-title"><div><Layers/><h3>{group.cat}</h3></div><div className="loan-category-title-actions"><span>{group.items.length} قرض</span><button onClick={()=>printCategory(group.cat)}><Printer/> طباعة التصنيف</button></div></div>
      <div className="loan-overview-card"><div className="loan-overview-table-wrap"><table className="loan-overview-table">
        <thead><tr><th>م</th><th>اسم القرض</th><th>رقم القرض</th><th>قسط القرض</th><th>إجمالي القرض</th><th>المسدد</th><th>الرصيد</th><th>بيان</th></tr></thead>
        <tbody>{group.items.map((loan,index)=><tr key={loan.id}><td>{index+1}</td><td className="loan-name-cell"><strong>{loan.name}</strong><div className="loan-installment-counts"><span className="total">{loan.totalInstallments} قسط</span><span className="paid">{loan.paidInstallments} مسدد</span><span className="remaining">{loan.remainingInstallments} متبقي</span></div></td><td>{loan.loanNumber||'—'}</td><td className="installment-value"><strong>{money.format(loan.installmentValue)}</strong></td><td><strong>{money.format(loan.total)}</strong></td><td className="paid-value">{money.format(loan.paid)}</td><td className={loan.balance>0?'balance-value':'paid-value'}>{money.format(loan.balance)}</td><td><button className="loan-row-print" onClick={()=>printLoan(loan)}><Printer/> طباعة بيان القرض</button></td></tr>)}</tbody>
        <tfoot>{(()=>{
          const gt=makeTotals(group.items);
          return <tr className="loan-overview-total-row"><td colSpan="3">الإجمالي</td><td className="installment-value">{money.format(gt.installmentValue)} ر.س</td><td>{money.format(gt.total)} ر.س</td><td className="paid-value">{money.format(gt.paid)} ر.س</td><td className="balance-value">{money.format(gt.balance)} ر.س</td><td>—</td></tr>;
        })()}</tfoot>
      </table></div></div>
    </section>)}</div> : <div className="loan-empty"><Landmark size={42}/><h3>لا توجد قروض في هذا التصنيف</h3></div>}
  </section>;
}

function LoanPrintDocument({loan,rows}) {
  const principal=loan.rows.reduce((s,r)=>s+parseAmount(r.loanInstallment),0);
  const interest=loan.rows.reduce((s,r)=>s+parseAmount(r.bankCommission),0);
  const insurance=loan.rows.reduce((s,r)=>s+parseAmount(r.insuranceInstallment),0);
  const total=principal+interest+insurance;
  const paid=loan.rows.reduce((s,r)=>s+getPaidTotal(r),0);
  const balance=total-paid;
  const installmentValue=getLoanInstallmentValue(loan.rows||[]);
  return <div className="loan-print-document professional-print-document">
    <PrintReportHeader title="تقرير القرض" subtitle="كشف الأقساط والسداد والعمولات البنكية"/>
    <div className="print-loan-identity">
      <div><span>اسم القرض</span><strong>{loan.name}</strong></div>
      <div><span>رقم القرض</span><strong>{loan.loanNumber || '—'}</strong></div>
      <div><span>التصنيف</span><strong>{loan.category||'بدون تصنيف'}</strong></div>
      <div><span>عدد الأقساط</span><strong>{loan.rows.length}</strong></div>
    </div>
    <div className="print-kpi-grid five">
      <div><span>إجمالي أصل القرض</span><strong>{money.format(principal)} <small>ر.س</small></strong></div>
      <div><span>إجمالي الفوائد</span><strong>{money.format(interest)} <small>ر.س</small></strong></div>
      <div><span>إجمالي التأمين</span><strong>{money.format(insurance)} <small>ر.س</small></strong></div>
      <div><span>قسط القرض</span><strong>{money.format(installmentValue)} <small>ر.س</small></strong></div>
      <div className="primary"><span>الإجمالي العام</span><strong>{money.format(total)} <small>ر.س</small></strong></div>
      <div className="success"><span>إجمالي المسدد</span><strong>{money.format(paid)} <small>ر.س</small></strong></div>
      <div className="danger"><span>الرصيد المتبقي</span><strong>{money.format(balance)} <small>ر.س</small></strong></div>
    </div>
    <div className="print-section-title"><h2>جدول الأقساط</h2><span>{rows.length} قسط</span></div>
    <table className="professional-print-table loan-print-table">
      <thead><tr>
        <th>م</th><th>تاريخ الاستحقاق</th><th>قسط القرض</th><th>العمولات البنكية</th><th>قسط التأمين</th><th>قسط البنك + العمولات + التأمين</th><th>المسدد</th><th>الرصيد/الفرق</th><th>العمولات عن كل سنة / نفقات إيرادية مؤجلة</th>
      </tr></thead>
      <tbody>{rows.map((r,i)=><tr key={r.id}>
        <td>{i+1}</td>
        <td>{r.dueDate?displayDate(r.dueDate):'—'}</td>
        <td>{money.format(parseAmount(r.loanInstallment))}</td>
        <td>{money.format(parseAmount(r.bankCommission))}</td>
        <td>{money.format(parseAmount(r.insuranceInstallment))}</td>
        <td className="strong-cell">{money.format(r.bankTotal)}</td>
        <td className="paid-cell">{money.format(r.paidTotal)}</td>
        <td className={r.difference>0?'balance-cell':'paid-cell'}>{money.format(r.difference)}</td>
        <td>{r.annual ? <div className="print-annual-combined">
          <div><span>العمولات</span><strong>{money.format(r.annual.sum)}</strong></div>
          <div><span>نفقات إيرادية مؤجلة</span><strong>{money.format(parseAmount(r.deferredExpense))}</strong></div>
          <small className="year-note">نهاية {r.annual.year}</small>
        </div> : '—'}</td>
      </tr>)}</tbody>
      <tfoot><tr>
        <td colSpan="2">الإجمالي</td>
        <td>{money.format(principal)}</td>
        <td>{money.format(interest)}</td>
        <td>{money.format(insurance)}</td>
        <td>{money.format(total)}</td>
        <td>{money.format(paid)}</td>
        <td>{money.format(balance)}</td>
        <td><div className="print-annual-total"><span>نفقات مؤجلة</span><strong>{money.format(loan.rows.reduce((s,r)=>s+parseAmount(r.deferredExpense),0))}</strong></div></td>
      </tr></tfoot>
    </table>
    <div className="print-footer-note"><span>تم إنشاء التقرير بواسطة نظام الإدارة المالية</span><span>جميع القيم بالريال السعودي</span></div>
  </div>;
}

function LoansOverviewPrintDocument({rows,totals,title='بيان القروض الشامل'}) {
  const groups=[...new Set(rows.map(x=>x.category||'بدون تصنيف'))].map(cat=>({cat,items:rows.filter(x=>(x.category||'بدون تصنيف')===cat)}));
  return <div className="loans-overview-print-document professional-print-document">
    <PrintReportHeader title={title} subtitle={title==='بيان القروض الشامل'?'تقرير شامل مصنف حسب تصنيفات القروض':'تقرير القروض ضمن التصنيف المحدد'}/>
    {groups.map((group,gi)=>{
      const gt=group.items.reduce((a,x)=>({total:a.total+x.total,installmentValue:a.installmentValue+x.installmentValue,paid:a.paid+x.paid,balance:a.balance+x.balance}),{total:0,installmentValue:0,paid:0,balance:0});
      return <section className={`print-loan-category-block print-tone-${gi%4}`} key={group.cat}>
        <div className="print-loan-category-head"><div><Layers/><h2>{group.cat}</h2></div><strong>{group.items.length} قرض</strong></div>
        <table className="professional-print-table overview-print-table categorized">
          <thead><tr><th>م</th><th>اسم القرض</th><th>رقم القرض</th><th>قسط القرض</th><th>إجمالي القرض</th><th>المسدد</th><th>الرصيد</th></tr></thead>
          <tbody>{group.items.map((loan,index)=><tr key={loan.id}><td>{index+1}</td><td className="loan-name-print"><strong className="loan-print-name-text">{loan.name}</strong><div className="loan-installment-counts print-counts print-counts-under-name"><span className="total">{loan.totalInstallments} قسط</span><span className="paid">{loan.paidInstallments} مسدد</span><span className="remaining">{loan.remainingInstallments} متبقي</span></div></td><td>{loan.loanNumber||'—'}</td><td className="strong-cell installment-value">{money.format(loan.installmentValue)}</td><td className="strong-cell">{money.format(loan.total)}</td><td className="paid-cell">{money.format(loan.paid)}</td><td className={loan.balance>0?'balance-cell':'paid-cell'}>{money.format(loan.balance)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan="3">إجمالي {group.cat}</td><td>{money.format(gt.installmentValue)}</td><td>{money.format(gt.total)}</td><td>{money.format(gt.paid)}</td><td>{money.format(gt.balance)}</td></tr></tfoot>
        </table>
      </section>
    })}
    <section className="grand-loans-totals">
      <h2>الإجماليات العامة لجميع القروض</h2>
      <div className="print-kpi-grid four">
        <div className="primary"><span>إجمالي القروض</span><strong>{money.format(totals.total)} <small>ر.س</small></strong></div>
        <div><span>إجمالي قيم الأقساط</span><strong>{money.format(totals.installmentValue)} <small>ر.س</small></strong></div>
        <div className="success"><span>إجمالي المسدد</span><strong>{money.format(totals.paid)} <small>ر.س</small></strong></div>
        <div className="danger"><span>إجمالي الرصيد</span><strong>{money.format(totals.balance)} <small>ر.س</small></strong></div>
      </div>
    </section>
    <div className="print-footer-note"><span>بيان شامل للقروض مصنف حسب الجهات</span><span>الرصيد = إجمالي القرض − المسدد</span></div>
  </div>;
}

function LoanStats({loan}) {
  const derivedRows=getLoanDerived(loan.rows||[]);
  const activeRows=derivedRows.filter(r=>r.bankTotal>0.009);

  const principalTotal=activeRows.reduce((s,r)=>s+parseAmount(r.loanInstallment),0);
  const interestTotal=activeRows.reduce((s,r)=>s+parseAmount(r.bankCommission),0);
  const insuranceTotal=activeRows.reduce((s,r)=>s+parseAmount(r.insuranceInstallment),0);
  const grandTotal=activeRows.reduce((s,r)=>s+r.bankTotal,0);

  // يعتمد العد على نفس قيمة "الفرق" الظاهرة في جدول الأقساط والسداد.
  // السداد الجزئي لا يُعتبر قسطًا مسددًا بالكامل.
  const paidRows=activeRows.filter(r=>r.difference<=0.009);
  const remainingRows=activeRows.filter(r=>r.difference>0.009);

  const paid=activeRows.reduce((s,r)=>s+Math.min(r.paidTotal,r.bankTotal),0);
  const remaining=remainingRows.reduce((s,r)=>s+r.difference,0);
  const paidInstallments=paidRows.length;
  const remainingInstallments=remainingRows.length;

  return <div className="loan-stats-card">
    <div className="loan-stats-head">
      <div><CircleDollarSign/><div><h3>بيان القرض</h3><span>{loan.name}</span></div></div>
      <strong>{activeRows.length} قسط</strong>
    </div>
    <div className="loan-stat-grid six-stats">
      <LoanStat title="إجمالي القرض (بدون الفوائد)" value={principalTotal} tone="blue"/>
      <LoanStat title="إجمالي الفوائد" value={interestTotal} tone="orange"/>
      <LoanStat title="إجمالي التأمين" value={insuranceTotal} tone="blue"/>
      <LoanStat title="الإجمالي العام" value={grandTotal} tone="blue"/>
      <LoanStat title="المسدد من القرض" value={paid} tone="green" count={paidInstallments} countLabel="قسط مسدد بالكامل"/>
      <LoanStat title="الباقي من القرض" value={remaining} tone={remaining>0?'red':'green'} count={remainingInstallments} countLabel="قسط متبقي"/>
    </div>
  </div>;
}

function LoanStat({title,value,tone,plain=false,count=null,countLabel='',meta=''}) {
  return <div className={`loan-stat ${tone}`}>
    <span>{title}</span>
    <strong>{money.format(value)} {!plain&&<small>ر.س</small>}{plain&&<small>قسط</small>}</strong>
    {count!==null&&<div className="loan-stat-count"><b>{count}</b><span>{countLabel}</span></div>}
    {meta&&<em>{meta}</em>}
  </div>;
}

export { LoansPage, LoansOverviewPage, getLoanDerived, getPaidTotal };
