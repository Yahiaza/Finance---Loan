import React, { useEffect, useState } from 'react';
import { BarChart3, ClipboardList, Settings, Printer, Plus, Trash2, Check,
  ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Search, CalendarDays,
  ChevronRight, ChevronLeft, RotateCcw, Undo2, MoreVertical, FileJson2, Landmark, ListPlus,
  FileSpreadsheet, Upload, History, X, ArrowLeft, ArrowRight, Minus, Square, Pencil, Save,
  Calendar, Maximize2, WalletCards, Building2, CreditCard, Download, Rows3, Columns2,
  LayoutGrid, List, FolderInput, Layers, SlidersHorizontal } from 'lucide-react';
import { money, uid, pad, toISO, todayISO, displayDate, isOnOrBefore, cleanLegacyNotes, arabicDayDate, parseAmount, formatAmountInput, confirmDelete } from '../../utils/appUtils.js';
import { PageErrorBoundary, PrintPreviewModal, DesktopTitleBar, Sidebar, MiniDateCalendar, DateHeader, PageToolbar, SummaryCard, DateCell, AmountCell, TextCell, GrowingTextCell, ExpenseAction, PrintReportHeader } from '../../components/common.jsx';
import { buildPrintPreviewHtml } from '../../print/preview.js';

function ResizableBankHeader({widths,onResize}) {
  const cols=[
    ['index','م',42],['name','اسم البنك',130],['balance','الرصيد',58],
    ['account','رقم الحساب',135],['status','حالة الرصيد',90],['branch','الفرع',90],['action','إجراء',58]
  ];
  const startResize=(key,min,e)=>{
    e.preventDefault();e.stopPropagation();
    const startX=e.clientX,startWidth=widths[key];
    const move=ev=>{
      const delta=startX-ev.clientX;
      onResize(key,Math.max(min,startWidth+delta));
    };
    const up=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);document.body.classList.remove('resizing-table-columns');};
    document.body.classList.add('resizing-table-columns');
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
  };
  return <thead><tr>{cols.map(([key,label,min],i)=><th key={key} className={`${key==='index'?'bank-index-col ':''}${key==='action'?'bank-action-col ':''}resizable-table-head`}>
    {label}{i<cols.length-1&&<i className="table-col-resizer" onMouseDown={e=>startResize(key,min,e)}/>}
  </th>)}</tr></thead>;
}

function BankBalancesPage({banks,departments,selectedDate,isEditing=false,onChange,onPrint,onNotify}) {
  const [bankName,setBankName]=useState('');
  const [accountNumber,setAccountNumber]=useState('');
  const [bankDepartment,setBankDepartment]=useState(departments[0]||'');
  const [viewMode,setViewMode]=useState(()=>localStorage.getItem('bank-view-mode')||'list');
  const [grouped,setGrouped]=useState(()=>localStorage.getItem('bank-grouped')==='1');
  const [branchPrintGroup,setBranchPrintGroup]=useState(null);
  const [branchPrintPreview,setBranchPrintPreview]=useState(null);
  const [branchPrintAction,setBranchPrintAction]=useState(null);
  const [bankColWidths,setBankColWidths]=useState(()=>({
    index:Number(localStorage.getItem('bank-col-index'))||48,
    name:Number(localStorage.getItem('bank-col-name'))||245,
    balance:Number(localStorage.getItem('bank-col-balance'))||125,
    account:Number(localStorage.getItem('bank-col-account'))||230,
    status:Number(localStorage.getItem('bank-col-status'))||125,
    branch:Number(localStorage.getItem('bank-col-branch'))||125,
    action:Number(localStorage.getItem('bank-col-action'))||68
  }));
  const resizeBankColumn=(key,width)=>setBankColWidths(prev=>{
    const next={...prev,[key]:Math.round(width)};
    localStorage.setItem(`bank-col-${key}`,String(next[key]));
    return next;
  });
  useEffect(()=>localStorage.setItem('bank-view-mode',viewMode),[viewMode]);
  useEffect(()=>localStorage.setItem('bank-grouped',grouped?'1':'0'),[grouped]);

  useEffect(()=>{
    if(!branchPrintGroup || !branchPrintAction) return;
    const frame=requestAnimationFrame(async()=>{
      const html=buildPrintPreviewHtml('bank-branch');
      if(branchPrintAction==='print'){
        setBranchPrintPreview({mode:'bank-branch',html});
      }else if(branchPrintAction==='pdf'){
        if(window.desktopApp?.exportPdf){
          const safeName=String(branchPrintGroup.label||'فرع').replace(/[\/:*?"<>|]+/g,'-');
          try{
            const result=await window.desktopApp.exportPdf({
              html,
              suggestedName:`أرصدة البنوك - ${safeName} - ${selectedDate}.pdf`
            });
            if(result?.ok){
              onNotify?.({tone:'success',title:'تم تصدير PDF',message:result.path?`تم حفظ الملف في: ${result.path}`:'تم حفظ تقرير الفرع بصيغة PDF.'});
            }else if(result && !result.canceled){
              onNotify?.({tone:'error',title:'تعذر تصدير PDF',message:result.error||'حدث خطأ أثناء إنشاء ملف PDF.'});
            }
          }catch(error){
            onNotify?.({tone:'error',title:'تعذر تصدير PDF',message:error?.message||'حدث خطأ أثناء إنشاء ملف PDF.'});
          }
        }else{
          setBranchPrintPreview({mode:'bank-branch',html});
          onNotify?.({tone:'info',title:'التصدير عبر الطباعة',message:'اختر حفظ كـ PDF من نافذة الطباعة على هذا الجهاز.'});
        }
      }
      setBranchPrintAction(null);
    });
    return()=>cancelAnimationFrame(frame);
  },[branchPrintGroup,branchPrintAction,selectedDate,onNotify]);

  const requestBranchPrint=(group,action)=>{
    setBranchPrintGroup(group);
    setBranchPrintAction(action);
  };
  const closeBranchPrintPreview=()=>{
    setBranchPrintPreview(null);
    delete document.body.dataset.printMode;
    delete document.body.dataset.bankBranchPrint;
  };
  const executeBranchPrint=()=>{
    document.body.dataset.printMode='banks';
    document.body.dataset.bankBranchPrint='1';
    setTimeout(()=>window.print(),80);
  };

  const effectiveEntry=bank=>{
    const valid=(bank.balances||[]).filter(x=>x.date<=selectedDate).sort((a,b)=>b.date.localeCompare(a.date));
    return valid[0]||null;
  };
  const dayEntry=bank=>(bank.balances||[]).find(x=>x.date===selectedDate)||null;
  const total=banks.reduce((sum,b)=>sum+parseAmount(effectiveEntry(b)?.amount),0);
  const previousEntry=bank=>{
    const valid=(bank.balances||[]).filter(x=>x.date<selectedDate).sort((a,b)=>b.date.localeCompare(a.date));
    return valid[0]||null;
  };
  const previousTotal=banks.reduce((sum,b)=>sum+parseAmount(previousEntry(b)?.amount),0);
  const balanceDifference=total-previousTotal;
  const staleAccounts=banks.filter(bank=>{const e=effectiveEntry(bank);return !e||e.date!==selectedDate;}).length;

  const addBank=()=>{
    const name=bankName.trim(); if(!name)return;
    onChange([...banks,{id:uid(),name,accountNumber:accountNumber.trim(),department:bankDepartment,balances:[]}]);
    setBankName('');setAccountNumber('');
  };
  const updateBank=(id,patch)=>onChange(banks.map(b=>b.id===id?{...b,...patch}:b));
  const removeBank=async id=>{const bank=banks.find(b=>b.id===id);if(!bank||!(await confirmDelete(`البنك «${bank.name}» وكل سجل أرصدته`)))return;onChange(banks.filter(b=>b.id!==id));};
  const setBalance=(bank,value)=>{
    const amount=String(value).replace(/,/g,''); const current=dayEntry(bank);
    const balances=current?bank.balances.map(x=>x.id===current.id?{...x,amount}:x):[...(bank.balances||[]),{id:uid(),date:selectedDate,amount}];
    updateBank(bank.id,{balances});
  };
  const groupedBanks=grouped ? [...departments.map(dep=>({label:dep,items:banks.filter(b=>b.department===dep)})),{label:'بدون فرع',items:banks.filter(b=>!b.department||!departments.includes(b.department))}].filter(g=>g.items.length) : [{label:'كل البنوك',items:banks}];

  const renderBankCard=(bank)=>{
    const effective=effectiveEntry(bank), exact=dayEntry(bank), inherited=effective&&effective.date!==selectedDate;
    return <div className="bank-card" key={bank.id}>
      <div className="bank-card-head"><div className="bank-symbol"><Building2/></div><div className="bank-title-edit"><input disabled={!isEditing} value={bank.name} onChange={e=>updateBank(bank.id,{name:e.target.value})}/><input disabled={!isEditing} value={bank.accountNumber} onChange={e=>updateBank(bank.id,{accountNumber:e.target.value})} placeholder="رقم الحساب"/></div><button className="bank-delete" disabled={!isEditing} onClick={()=>isEditing&&removeBank(bank.id)}><Trash2/></button></div>
      <div className="bank-card-department"><span>الفرع</span><select disabled={!isEditing} value={bank.department||''} onChange={e=>updateBank(bank.id,{department:e.target.value})}><option value="">بدون فرع</option>{departments.map(d=><option key={d}>{d}</option>)}</select></div>
      <div className="bank-balance-body"><span>رصيد {displayDate(selectedDate)}</span><div className="bank-balance-input"><input disabled={!isEditing} inputMode="decimal" value={formatAmountInput(exact?.amount??effective?.amount??'')} onChange={e=>setBalance(bank,e.target.value)}/><b>ر.س</b></div>{inherited?<small className="balance-inherited">مُرحّل من {displayDate(effective.date)}</small>:exact?<small className="balance-saved">رصيد مسجل لهذا اليوم</small>:<small>لا يوجد رصيد مسجل</small>}</div>
      <div className="bank-history"><strong>آخر التحديثات</strong>{(bank.balances||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3).map(x=><div key={x.id}><span>{displayDate(x.date)}</span><b>{money.format(parseAmount(x.amount))} ر.س</b></div>)}{!bank.balances?.length&&<p>لا يوجد سجل أرصدة بعد.</p>}</div>
    </div>;
  };

  const renderBankTable=(group)=>{
    const groupTotal=group.items.reduce((s,b)=>s+parseAmount(effectiveEntry(b)?.amount),0);
    return <div className="bank-table-shell">
      <table className="bank-accounts-table resizable-data-table" style={{
        '--bank-index':`${bankColWidths.index}px`,
        '--bank-name':`${bankColWidths.name}px`,
        '--bank-balance':`${bankColWidths.balance}px`,
        '--bank-account':`${bankColWidths.account}px`,
        '--bank-status':`${bankColWidths.status}px`,
        '--bank-branch':`${bankColWidths.branch}px`,
        '--bank-action':`${bankColWidths.action}px`
      }}>
        <ResizableBankHeader widths={bankColWidths} onResize={resizeBankColumn}/>
        <tbody>{group.items.map((bank,index)=>{
          const effective=effectiveEntry(bank), exact=dayEntry(bank), inherited=effective&&effective.date!==selectedDate;
          return <tr key={bank.id}>
            <td className="bank-row-index">{index+1}</td>
            <td className="bank-name-table"><div className="bank-table-icon"><Building2/></div><input disabled={!isEditing} value={bank.name} onChange={e=>updateBank(bank.id,{name:e.target.value})}/></td>
            <td><div className="bank-table-balance"><input disabled={!isEditing} inputMode="decimal" value={formatAmountInput(exact?.amount??effective?.amount??'')} onChange={e=>setBalance(bank,e.target.value)}/><span>ر.س</span></div></td>
            <td><input disabled={!isEditing} className="bank-account-table-input" value={bank.accountNumber} onChange={e=>updateBank(bank.id,{accountNumber:e.target.value})} placeholder="رقم الحساب"/></td>
            <td className="bank-balance-status">{inherited?<><strong className="carried">مرحل</strong><small>{displayDate(effective.date)}</small></>:exact?<><strong className="today">رصيد اليوم</strong><small>{displayDate(exact.date)}</small></>:<><strong className="empty">بدون رصيد</strong><small>—</small></>}</td>
            <td><select disabled={!isEditing} className="bank-table-select" value={bank.department||''} onChange={e=>updateBank(bank.id,{department:e.target.value})}><option value="">بدون فرع</option>{departments.map(d=><option key={d}>{d}</option>)}</select></td>
            <td><button className="bank-table-delete" disabled={!isEditing} onClick={()=>isEditing&&removeBank(bank.id)} title="حذف البنك"><Trash2/></button></td>
          </tr>;
        })}</tbody>
        <tfoot><tr><td colSpan="2">إجمالي {group.label}</td><td className="bank-table-total">{money.format(groupTotal)} ر.س</td><td colSpan="4">{group.items.length} حساب</td></tr></tfoot>
      </table>
    </div>;
  };

  return <section className="page bank-balances-page">
    <div className="page-toolbar bank-page-toolbar"><div><h2>أرصدة البنوك</h2><p>رصيد يومي لكل حساب — يستمر آخر رصيد تلقائيًا حتى تعديله.</p></div><div className="bank-view-controls"><div><button className={viewMode==='list'?'active':''} onClick={()=>setViewMode('list')}><List/> قائمة</button><button className={viewMode==='cards'?'active':''} onClick={()=>setViewMode('cards')}><LayoutGrid/> كروت</button></div><button className={grouped?'grouped active':'grouped'} onClick={()=>setGrouped(v=>!v)}><Building2/> {grouped?'عرض شامل':'عرض حسب الفرع'}</button><button className="btn dark bank-print-button" onClick={onPrint}><Printer/> طباعة الأرصدة</button></div></div>
    <div className="bank-register-card"><div className="bank-register-title"><Building2/><div><h3>إضافة بنك / حساب</h3><span>سجل البنك ورقم الحساب والفرع، ثم أدخل الرصيد اليومي.</span></div></div><div className="bank-register-form bank-register-four"><label><span>اسم البنك</span><input disabled={!isEditing} value={bankName} onChange={e=>setBankName(e.target.value)} placeholder="مثال: بنك البلاد"/></label><label><span>رقم الحساب</span><input disabled={!isEditing} value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} placeholder="رقم الحساب أو IBAN"/></label><label><span>الفرع</span><select disabled={!isEditing} value={bankDepartment} onChange={e=>setBankDepartment(e.target.value)}><option value="">بدون فرع</option>{departments.map(d=><option key={d}>{d}</option>)}</select></label><button className="btn primary" disabled={!isEditing} onClick={()=>isEditing&&addBank()}><Plus/> إضافة البنك</button></div></div>
    <div className="bank-balance-summary-three">
      <div className="bank-summary-balance previous"><span>الرصيد السابق</span><strong>{money.format(previousTotal)} ر.س</strong><small>آخر رصيد مسجل قبل {displayDate(selectedDate)}</small></div>
      <div className="bank-summary-balance current"><span>الرصيد الحالي</span><strong>{money.format(total)} ر.س</strong><small>إجمالي الأرصدة في {displayDate(selectedDate)}</small></div>
      <div className={`bank-summary-balance difference ${balanceDifference>0?'positive':balanceDifference<0?'negative':'neutral'}`}><span>الفرق</span><strong>{balanceDifference>0?'+':''}{money.format(balanceDifference)} ر.س</strong><small>الرصيد الحالي − الرصيد السابق</small></div>
    </div>
    {staleAccounts>0&&<div className="bank-analysis-warning"><History/> يوجد {staleAccounts} حساب لم يتم إدخال رصيد جديد له في هذا اليوم؛ تم استخدام آخر رصيد مرحّل في الإجمالي الحالي.</div>}
    <div className={`bank-groups ${viewMode}`}>
      {groupedBanks.map((group,groupIndex)=><section className={`bank-department-group ${grouped?'grouped-section':'all-section'} group-tone-${groupIndex%4}`} key={group.label}>
        <div className="bank-group-title">
          <div className="bank-group-name"><Building2/><div><h3>{group.label}</h3><span>{group.items.length} حساب بنكي</span></div></div>
          <div className="bank-group-title-side">
            <strong>{money.format(group.items.reduce((s,b)=>s+parseAmount(effectiveEntry(b)?.amount),0))} ر.س</strong>
            {grouped&&<div className="bank-branch-report-actions">
              <button onClick={()=>requestBranchPrint(group,'print')} title={`طباعة أرصدة ${group.label}`}><Printer/> طباعة</button>
              <button onClick={()=>requestBranchPrint(group,'pdf')} title={`تصدير أرصدة ${group.label} PDF`}><Download/> PDF</button>
            </div>}
          </div>
        </div>
        {viewMode==='list' ? renderBankTable(group) : <div className="banks-grid">{group.items.map(renderBankCard)}</div>}
      </section>)}
      {!banks.length&&<div className="loan-empty bank-empty"><WalletCards size={42}/><h3>لا توجد بنوك مسجلة</h3><p>أضف أول بنك ورقم حسابه من النموذج بالأعلى.</p></div>}
    </div>
    <BankBalancesPrintDocument banks={banks} departments={departments} selectedDate={selectedDate} effectiveEntry={effectiveEntry}/>
    {branchPrintGroup&&<BankBranchPrintDocument group={branchPrintGroup} selectedDate={selectedDate} effectiveEntry={effectiveEntry}/>}
    {branchPrintPreview&&<PrintPreviewModal mode="bank-branch" html={branchPrintPreview.html} onPrint={executeBranchPrint} onClose={closeBranchPrintPreview}/>}
  </section>;
}

function BankBranchPrintDocument({group,selectedDate,effectiveEntry}) {
  const groupTotal=group.items.reduce((s,b)=>s+parseAmount(effectiveEntry(b)?.amount),0);
  return <div className="bank-print-document bank-branch-print-document professional-portrait-print">
    <PrintReportHeader title={`تقرير أرصدة البنوك - ${group.label}`} subtitle={`أرصدة الفرع حتى ${displayDate(selectedDate)}`}/>
    <div className="portrait-total"><span>إجمالي أرصدة {group.label}</span><strong>{money.format(groupTotal)} ر.س</strong></div>
    <section className="bank-print-table-section bank-print-tone-0">
      <div className="bank-print-table-title"><div><Building2/><div><h2>{group.label}</h2><span>{group.items.length} حساب بنكي</span></div></div><strong>{money.format(groupTotal)} ر.س</strong></div>
      <table className="bank-print-table">
        <thead><tr><th>م</th><th>اسم البنك</th><th>رقم الحساب</th><th>الرصيد</th><th>آخر تحديث</th></tr></thead>
        <tbody>{group.items.map((bank,index)=>{const entry=effectiveEntry(bank);return <tr key={bank.id}>
          <td>{index+1}</td>
          <td className="bank-print-name-cell">{bank.name||'—'}</td>
          <td className="bank-print-account-cell">{bank.accountNumber||'—'}</td>
          <td className="bank-print-balance-cell">{money.format(parseAmount(entry?.amount))} ر.س</td>
          <td>{entry?displayDate(entry.date):'—'}</td>
        </tr>})}</tbody>
        <tfoot><tr><td colSpan="3">إجمالي {group.label}</td><td>{money.format(groupTotal)} ر.س</td><td>{group.items.length} حساب</td></tr></tfoot>
      </table>
    </section>
    <div className="bank-print-grand-total"><span>إجمالي الفرع</span><strong>{money.format(groupTotal)} ر.س</strong></div>
    <div className="print-footer-note"><span>تقرير أرصدة فرع {group.label}</span><span>الإدارة المالية</span></div>
  </div>;
}

function BankBalancesPrintDocument({banks,departments,selectedDate,effectiveEntry}) {
  const groups=[...departments.map(dep=>({label:dep,items:banks.filter(b=>b.department===dep)})),{label:'بدون فرع',items:banks.filter(b=>!b.department||!departments.includes(b.department))}].filter(g=>g.items.length);
  const total=banks.reduce((s,b)=>s+parseAmount(effectiveEntry(b)?.amount),0);
  return <div className="bank-print-document professional-portrait-print">
    <PrintReportHeader title="تقرير أرصدة البنوك" subtitle={`الأرصدة حتى ${displayDate(selectedDate)}`}/>
    <div className="portrait-total"><span>إجمالي أرصدة جميع الفروع</span><strong>{money.format(total)} ر.س</strong></div>
    {groups.map((group,gi)=>{
      const groupTotal=group.items.reduce((s,b)=>s+parseAmount(effectiveEntry(b)?.amount),0);
      return <section className={`bank-print-table-section bank-print-tone-${gi%4}`} key={group.label}>
        <div className="bank-print-table-title"><div><Building2/><div><h2>{group.label}</h2><span>{group.items.length} حساب بنكي</span></div></div><strong>{money.format(groupTotal)} ر.س</strong></div>
        <table className="bank-print-table">
          <thead><tr><th>م</th><th>اسم البنك</th><th>رقم الحساب</th><th>الرصيد</th><th>آخر تحديث</th></tr></thead>
          <tbody>{group.items.map((bank,index)=>{const entry=effectiveEntry(bank);return <tr key={bank.id}>
            <td>{index+1}</td>
            <td className="bank-print-name-cell">{bank.name||'—'}</td>
            <td className="bank-print-account-cell">{bank.accountNumber||'—'}</td>
            <td className="bank-print-balance-cell">{money.format(parseAmount(entry?.amount))} ر.س</td>
            <td>{entry?displayDate(entry.date):'—'}</td>
          </tr>})}</tbody>
          <tfoot><tr><td colSpan="3">إجمالي {group.label}</td><td>{money.format(groupTotal)} ر.س</td><td>{group.items.length} حساب</td></tr></tfoot>
        </table>
      </section>
    })}
    <div className="bank-print-grand-total"><span>الإجمالي العام</span><strong>{money.format(total)} ر.س</strong></div>
    <div className="print-footer-note"><span>تقرير أرصدة البنوك مصنف حسب الفروع</span><span>الإدارة المالية</span></div>
  </div>;
}

export default BankBalancesPage;
