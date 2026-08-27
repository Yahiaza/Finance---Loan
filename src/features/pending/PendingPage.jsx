import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart3, ClipboardList, Settings, Printer, Plus, Trash2, Check,
  ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Search, CalendarDays,
  ChevronRight, ChevronLeft, RotateCcw, Undo2, MoreVertical, FileJson2, Landmark, ListPlus,
  FileSpreadsheet, Upload, History, X, ArrowLeft, ArrowRight, Minus, Square, Pencil, Save,
  Calendar, Maximize2, WalletCards, Building2, CreditCard, Download, Rows3, Columns2,
  LayoutGrid, List, FolderInput, Layers, SlidersHorizontal } from 'lucide-react';
import { money, uid, pad, toISO, todayISO, displayDate, isOnOrBefore, cleanLegacyNotes, arabicDayDate, parseAmount, formatAmountInput, requestConfirm, confirmDelete } from '../../utils/appUtils.js';
import { PageErrorBoundary, PrintPreviewModal, DesktopTitleBar, Sidebar, MiniDateCalendar, DateHeader, PageToolbar, SummaryCard, DateCell, AmountCell, TextCell, GrowingTextCell, ExpenseAction, PrintReportHeader } from '../../components/common.jsx';


function cleanSpecialistLabel(value){
  return String(value ?? '').trim().replace(/\s+/g,' ');
}

function specialistKey(value){
  return cleanSpecialistLabel(value)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g,'')
    .replace(/[أإآٱ]/g,'ا')
    .replace(/ى/g,'ي')
    .replace(/ة/g,'ه')
    .replace(/ؤ/g,'و')
    .replace(/ئ/g,'ي');
}

function buildSpecialistDirectory(rows=[]){
  const byKey=new Map();
  rows.forEach((row,index)=>{
    if(row?.isDraft) return;
    const label=cleanSpecialistLabel(row?.specialist);
    if(!label) return;
    const key=specialistKey(label);
    if(!key) return;
    if(!byKey.has(key)) byKey.set(key,{key,firstIndex:index,variants:new Map()});
    const entry=byKey.get(key);
    const variant=entry.variants.get(label) || {label,count:0,firstIndex:index};
    variant.count+=1;
    entry.variants.set(label,variant);
  });
  const entries=[...byKey.values()].sort((a,b)=>a.firstIndex-b.firstIndex).map((entry,rank)=>{
    const variants=[...entry.variants.values()].sort((a,b)=>b.count-a.count || a.firstIndex-b.firstIndex);
    return {...entry,rank,canonical:variants[0]?.label || ''};
  });
  const map=new Map(entries.map(entry=>[entry.key,entry]));
  return {
    options:entries.map(entry=>entry.canonical).filter(Boolean),
    rankFor:value=>map.get(specialistKey(value))?.rank ?? Number.MAX_SAFE_INTEGER,
    canonicalize:value=>{
      const cleaned=cleanSpecialistLabel(value);
      if(!cleaned) return '';
      return map.get(specialistKey(cleaned))?.canonical || cleaned;
    }
  };
}

function sortPendingBySpecialistAndDate(items=[],directory,rowOrder=new Map()){
  return [...items].sort((a,b)=>{
    const specialistDiff=directory.rankFor(a.specialist)-directory.rankFor(b.specialist);
    if(specialistDiff) return specialistDiff;
    const keyDiff=specialistKey(a.specialist).localeCompare(specialistKey(b.specialist),'ar');
    if(keyDiff) return keyDiff;
    const dateDiff=String(a.date||'').localeCompare(String(b.date||''));
    if(dateDiff) return dateDiff;
    return (rowOrder.get(a.id) ?? 0)-(rowOrder.get(b.id) ?? 0);
  });
}

function SpecialistInput({value,onChange,canonicalize,disabled=false,placeholder='—',listId='pending-specialist-suggestions'}){
  const normalizeValue=()=>{
    const next=canonicalize ? canonicalize(value) : cleanSpecialistLabel(value);
    if(next!==String(value??'')) onChange(next);
  };
  return <input
    disabled={disabled}
    className="cell-input pending-specialist-input"
    list={listId}
    value={value ?? ''}
    onChange={e=>onChange(e.target.value)}
    onBlur={normalizeValue}
    placeholder={placeholder}
    autoComplete="off"
  />;
}

function PendingPage({state,data,selectedDate,filter,setFilter,addBlank,updateCell,removeRow,finalizePending,transferPending,partiallyPayPending,isEditing=false,onPrint}) {
  const [importDepartment,setImportDepartment]=useState(state.departments[0]||'');
  const [pendingImport,setPendingImport]=useState(null);
  const importFileRef=useRef(null);
  const specialistDirectory=useMemo(()=>buildSpecialistDirectory(state.pending||[]),[state.pending]);
  const pendingRowOrder=useMemo(()=>new Map((state.pending||[]).map((row,index)=>[row.id,index])),[state.pending]);
  const canonicalizeSpecialist=value=>specialistDirectory.canonicalize(value);
  const matches = x => `${x.amount} ${x.statement} ${x.specialist||''} ${x.department} ${x.notes}`.toLowerCase().includes(filter.toLowerCase());
  const asOf=data.filter(x=>isOnOrBefore(x.date,selectedDate) && matches(x)).map(x=>({
    ...x,
    status: x.spentAt && x.spentAt<=selectedDate ? 'spent' : 'unspent'
  }));
  const dailyRows=asOf.filter(x=>x.date===selectedDate && x.status!=='spent' && x.isDraft);
  const finalized=asOf.filter(x=>!x.isDraft);
  const sortedFinalized=sortPendingBySpecialistAndDate(finalized,specialistDirectory,pendingRowOrder);
  const groups=state.departments.map(dep=>({dep,items:sortedFinalized.filter(x=>x.department===dep)})).filter(g=>g.items.length);
  const unassigned=sortedFinalized.filter(x=>!x.department || !state.departments.includes(x.department));
  if(unassigned.length) groups.push({dep:'بدون قسم',items:unassigned});
  const totalPendingAll=groups.reduce((sum,group)=>sum+group.items
    .filter(item=>item.status!=='spent')
    .reduce((groupSum,item)=>groupSum+parseAmount(item.amount),0),0);

  const readPendingExcel=async file=>{
    if(!file) return;
    if(!importDepartment) { alert('اختر القسم الذي سيتم ربط البيانات به أولًا.'); if(importFileRef.current) importFileRef.current.value=''; return; }
    try{
      const buffer=await file.arrayBuffer();
      const wb=XLSX.read(buffer,{type:'array',cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true,blankrows:true});
      if(!matrix.length) return alert('ملف Excel فارغ.');
      const maxCols=Math.max(1,...matrix.map(r=>r.length));
      const normalized=matrix.map(r=>Array.from({length:maxCols},(_,i)=>r[i]??''));
      setPendingImport({
        fileName:file.name,
        department:importDepartment,
        matrix:normalized,
        step:0,
        pickStart:null,
        ranges:{marker:null,amount:null,statement:null,specialist:null,date:null,notes:null}
      });
    }catch(err){ console.error(err); alert('تعذر قراءة ملف Excel.'); }
    finally{ if(importFileRef.current) importFileRef.current.value=''; }
  };

  const applyPendingImport=()=>{
    if(!pendingImport) return;
    const getVals=key=>{
      const range=pendingImport.ranges[key];
      if(!range) return [];
      const vals=[];
      for(let r=range.startRow;r<=range.endRow;r++) vals.push(pendingImport.matrix[r]?.[range.col]??'');
      return vals;
    };
    const amounts=getVals('amount');
    if(!amounts.length) return alert('حدد خلايا المبلغ أولًا.');
    const keys=['marker','statement','specialist','date','notes'];
    const arrays=Object.fromEntries(keys.map(k=>[k,getVals(k)]));
    const count=amounts.length;
    for(const [key,arr] of Object.entries(arrays)){
      if(arr.length && arr.length!==count) return alert(`نطاق ${key} يجب أن يحتوي على نفس عدد خلايا المبلغ.`);
    }
    const imported=Array.from({length:count},(_,i)=>{
      let date=arrays.date[i]!==undefined ? parseExcelDate(arrays.date[i]) : selectedDate;
      if(!date) date=selectedDate;
      if(date>todayISO) date=todayISO;
      return {
        id:uid(),
        marker:String(arrays.marker[i]??''),
        amount:String(parseAmount(amounts[i])||''),
        statement:String(arrays.statement[i]??''),
        specialist:canonicalizeSpecialist(String(arrays.specialist[i]??'')),
        department:pendingImport.department,
        date,
        notes:String(arrays.notes[i]??''),
        status:'unspent',
        spentAt:null,
        isDraft:false
      };
    }).filter(x=>x.amount || x.statement || x.specialist || x.notes);
    if(!imported.length) return alert('الخلايا المحددة لا تحتوي بيانات قابلة للاستيراد.');
    window.__pendingImportRows=imported;
    // Dispatch through a small custom event so App state remains the single owner.
    window.dispatchEvent(new CustomEvent('financial:import-pending',{detail:imported}));
    setPendingImport(null);
  };

  return <section className="page print-pending">
    <datalist id="pending-specialist-suggestions">{specialistDirectory.options.map(option=><option key={option} value={option}/>)}</datalist>
    <PageToolbar title="المبالغ المطلوبة" subtitle="كل قسم في كارت مستقل — غير منصرف / منصرف" onPrint={onPrint} filter={filter} setFilter={setFilter}/>
    <div className="pending-import-bar">
      <div><FileSpreadsheet/><div><strong>استيراد المبالغ المطلوبة من Excel</strong><span>اختر القسم أولًا ثم حدد الخلايا المطلوبة بنفسك.</span></div></div>
      <div className="pending-import-actions">
        <select value={importDepartment} onChange={e=>setImportDepartment(e.target.value)}><option value="">اختر القسم</option>{state.departments.map(d=><option key={d}>{d}</option>)}</select>
        <input ref={importFileRef} hidden type="file" accept=".xlsx,.xls" onChange={e=>readPendingExcel(e.target.files?.[0])}/>
        <button className="btn excel-btn" disabled={!importDepartment||!isEditing} onClick={()=>isEditing&&importFileRef.current?.click()}><Upload size={16}/> اختيار ملف Excel</button>
      </div>
    </div>
    {pendingImport && <PendingExcelImportWizard data={pendingImport} onChange={setPendingImport} onCancel={()=>setPendingImport(null)} onApply={applyPendingImport}/>}
    <div className="pending-entry"><div className="pending-entry-head"><h3>إضافة مبالغ مطلوبة</h3><button className="add-row-btn" disabled={!isEditing} onClick={()=>isEditing&&addBlank('pending')}><Plus size={17}/> صف جديد</button></div>
      <PendingEntryTable rows={dailyRows} departments={state.departments} canonicalizeSpecialist={canonicalizeSpecialist} updateCell={updateCell} removeRow={removeRow} finalizePending={finalizePending} addBlank={addBlank} isEditing={isEditing}/>
    </div>
    <div className="pending-grand-total-card">
      <div className="pending-grand-total-copy">
        <span>إجمالي المبالغ المطلوبة لجميع الفروع</span>
        <small>إجمالي المبالغ غير المنصرفة حتى {displayDate(selectedDate)}</small>
      </div>
      <strong>{money.format(totalPendingAll)} <small>ر.س</small></strong>
    </div>
    <div className="section-divider"><span>الأقسام</span></div>
    <div className="pending-grid pending-screen-groups">{groups.map(g=><PendingGroup key={g.dep} group={g} departments={state.departments} canonicalizeSpecialist={canonicalizeSpecialist} updateCell={updateCell} transferPending={transferPending} partiallyPayPending={partiallyPayPending} removeRow={removeRow} isEditing={isEditing}/>)}</div>
    <div className="pending-print-only">
      <div className="pending-print-report-header"><PrintReportHeader title="تقرير المبالغ المطلوبة" subtitle={`المبالغ غير المنصرفة حتى ${displayDate(selectedDate)}`}/></div>
      <div className="pending-print-grand-total">
        <span>إجمالي المبالغ المطلوبة لجميع الفروع</span>
        <strong>{money.format(totalPendingAll)} <small>ر.س</small></strong>
      </div>
      {groups.filter(g=>g.items.some(x=>x.status!=='spent')).map(g=><PendingPrintGroup key={`print-${g.dep}`} group={g} canonicalizeSpecialist={canonicalizeSpecialist}/>)}</div>
    {!groups.length && <div className="empty-state">لا توجد مبالغ مطلوبة لهذا اليوم</div>}
  </section>;
}

function PendingExcelImportWizard({data,onChange,onCancel,onApply}) {
  const steps=[
    {key:'marker',label:'م / مسلسل',required:false,question:'حدد خلايا المسلسل أو م'},
    {key:'amount',label:'المبلغ',required:true,question:'حدد خلايا المبلغ'},
    {key:'statement',label:'البيان',required:false,question:'حدد خلايا البيان'},
    {key:'specialist',label:'المختص',required:false,question:'حدد خلايا المختص'},
    {key:'date',label:'التاريخ',required:false,question:'حدد خلايا التاريخ'},
    {key:'notes',label:'ملاحظات',required:false,question:'حدد خلايا الملاحظات'}
  ];
  const colName=index=>{let n=index+1,out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;};
  const label=r=>r?`${colName(r.col)}${r.startRow+1}:${colName(r.col)}${r.endRow+1}`:'—';
  const done=data.step>=steps.length;
  const step=steps[Math.min(data.step,steps.length-1)];
  const choose=(ri,ci)=>{
    if(done)return;
    if(!data.pickStart){onChange({...data,pickStart:{row:ri,col:ci}});return;}
    if(data.pickStart.col!==ci){onChange({...data,pickStart:{row:ri,col:ci}});return;}
    const range={col:ci,startRow:Math.min(data.pickStart.row,ri),endRow:Math.max(data.pickStart.row,ri)};
    onChange({...data,ranges:{...data.ranges,[step.key]:range},pickStart:null,step:Math.min(data.step+1,steps.length)});
  };
  const isSelected=(ri,ci)=>{const r=!done?data.ranges[step.key]:null;return r&&r.col===ci&&ri>=r.startRow&&ri<=r.endRow;};
  return <div className="excel-wizard-card pending-import-wizard">
    <div className="excel-wizard-head"><div><FileSpreadsheet/><div><strong>استيراد Excel — {data.department}</strong><span>{data.fileName}</span></div></div><button className="wizard-close" onClick={onCancel}><X/></button></div>
    {!done?<>
      <div className="wizard-question"><span>الخطوة {data.step+1} من {steps.length}</span><h4>{step.question}</h4><p>{data.pickStart?'اضغط آخر خلية في نفس العمود.':'اضغط أول خلية ثم آخر خلية من النطاق المطلوب فقط.'}</p></div>
      <div className="excel-sheet-preview cell-picker"><table><thead><tr><th></th>{data.matrix[0].map((_,ci)=><th key={ci}>{colName(ci)}</th>)}</tr></thead><tbody>{data.matrix.map((row,ri)=><tr key={ri}><th>{ri+1}</th>{row.map((v,ci)=><td key={ci} className={`${data.pickStart?.row===ri&&data.pickStart?.col===ci?'pick-start ':''}${isSelected(ri,ci)?'range-selected':''}`} onClick={()=>choose(ri,ci)}>{String(v??'')||' '}</td>)}</tr>)}</tbody></table></div>
      <div className="wizard-progress">{steps.map((s,i)=><div key={s.key} className={i<data.step?'done':i===data.step?'active':''}><span>{i<data.step?'✓':i+1}</span><b>{s.label}</b><small>{label(data.ranges[s.key])}</small></div>)}</div>
      <div className="excel-map-actions"><button className="btn soft" disabled={data.step===0} onClick={()=>onChange({...data,pickStart:null,step:Math.max(0,data.step-1)})}>السابق</button>{!step.required&&<button className="btn soft" onClick={()=>onChange({...data,pickStart:null,step:Math.min(data.step+1,steps.length)})}>تخطي</button>}</div>
    </>:<>
      <div className="wizard-summary"><Check/><div><h4>جاهز للاستيراد إلى قسم {data.department}</h4><p>سيتم استيراد الخلايا المحددة فقط.</p></div></div>
      <div className="wizard-map-summary">{steps.map(s=><div key={s.key}><span>{s.label}</span><strong>{label(data.ranges[s.key])}</strong></div>)}</div>
      <div className="excel-map-actions"><button className="btn soft" onClick={()=>onChange({...data,step:steps.length-1})}>تعديل</button><button className="btn primary" onClick={onApply}><Upload/> استيراد</button></div>
    </>}
  </div>;
}

function PendingPrintGroup({group,canonicalizeSpecialist}) {
  const unspent=group.items.filter(x=>x.status!=='spent');
  const unspentTotal=unspent.reduce((s,x)=>s+parseAmount(x.amount),0);
  if(!unspent.length) return null;
  return <section className="pending-print-card">
    <div className="pending-print-title"><h3>{group.dep}</h3><strong>إجمالي غير المنصرف: {money.format(unspentTotal)} ر.س</strong></div>
    <div className="pending-print-section">
      <table><thead><tr><th>م</th><th>المبلغ</th><th>البيان</th><th>المختص</th><th>التاريخ</th><th>ملاحظات</th></tr></thead><tbody>{unspent.map((item,i)=><tr key={item.id}><td>{item.marker||i+1}</td><td>{money.format(parseAmount(item.amount))}</td><td>{item.statement || '—'}</td><td>{canonicalizeSpecialist?.(item.specialist) || item.specialist || '—'}</td><td>{displayDate(item.date)}</td><td>{cleanLegacyNotes(item.notes) || '—'}</td></tr>)}</tbody><tfoot><tr><td colSpan="5">الإجمالي</td><td>{money.format(unspentTotal)} ر.س</td></tr></tfoot></table>
    </div>
  </section>;
}

function PendingEntryTable({rows,departments,canonicalizeSpecialist,updateCell,removeRow,finalizePending,addBlank,isEditing=false}) {
  const save=item=>{
    if(!parseAmount(item.amount)) return alert('اكتب المبلغ قبل إضافته للقسم.');
    if(!item.department) return alert('اختر القسم أولًا.');
    const canonical=canonicalizeSpecialist?.(item.specialist) ?? cleanSpecialistLabel(item.specialist);
    if(canonical!==String(item.specialist??'')) updateCell('pending',item.id,'specialist',canonical);
    finalizePending(item.id);
  };
  return <div className="excel-wrap"><table className="excel-table compact pending-entry-table"><thead><tr><th>م</th><th>المبلغ</th><th>البيان</th><th>المختص</th><th>التاريخ</th><th>ملاحظات</th><th>القسم</th><th>إجراء</th></tr></thead><tbody>
    {rows.map((item,i)=><tr key={item.id}>
      <td><input className="cell-input marker-input" value={item.marker||''} onChange={e=>updateCell('pending',item.id,'marker',e.target.value)} placeholder={String(i+1)}/></td>
      <td><AmountCell disabled={!isEditing} value={item.amount} onChange={v=>updateCell('pending',item.id,'amount',v)}/></td>
      <td className="statement-cell"><GrowingTextCell disabled={!isEditing} value={item.statement} onChange={v=>updateCell('pending',item.id,'statement',v)}/></td>
      <td><SpecialistInput disabled={!isEditing} value={item.specialist||''} canonicalize={canonicalizeSpecialist} onChange={v=>updateCell('pending',item.id,'specialist',v)} placeholder="—"/></td>
      <td><DateCell disabled={!isEditing} value={item.date} onChange={v=>updateCell('pending',item.id,'date',v)}/></td>
      <td><TextCell multiline value={item.notes} onChange={v=>updateCell('pending',item.id,'notes',v)} placeholder="—" onEnterNewRow={()=>save(item)}/></td>
      <td><select className="cell-input" value={item.department} onChange={e=>updateCell('pending',item.id,'department',e.target.value)}><option value="">اختر القسم</option>{departments.map(d=><option key={d}>{d}</option>)}</select></td>
      <td className="pending-actions draft-actions"><button className="save-pending" onClick={()=>save(item)} title="إضافة إلى كارت القسم"><Save size={15}/></button><button className="danger" onClick={()=>removeRow('pending',item.id)} title="حذف"><Trash2 size={15}/></button></td>
    </tr>)}
    <tr className="new-row" onClick={()=>addBlank('pending')}><td><Plus size={15}/></td><td colSpan="7">اضغط هنا لإضافة مبلغ مطلوب جديد</td></tr>
  </tbody></table></div>;
}

function ResizablePendingHeader({widths,onResize}) {
  const cols=[
    ['index','م',40],['statement','البيان',120],['specialist','المختص',85],
    ['date','التاريخ',92],['amount','المبلغ',90],['actions','الإجراءات',105]
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
  return <thead><tr>{cols.map(([key,label,min],i)=><th key={key} className={`${key==='index'?'pending-index-col ':''}${key==='actions'?'pending-actions-col ':''}resizable-table-head`}>
    {label}{i<cols.length-1&&<i className="table-col-resizer" onMouseDown={e=>startResize(key,min,e)}/>}
  </th>)}</tr></thead>;
}

function PendingGroup({group,departments,canonicalizeSpecialist,updateCell,transferPending,partiallyPayPending,removeRow,isEditing=false}) {
  const [tab,setTab]=useState('unspent');
  const [editingId,setEditingId]=useState(null);
  const [partialId,setPartialId]=useState(null);
  const [partialAmount,setPartialAmount]=useState('');
  const [pendingColWidths,setPendingColWidths]=useState(()=>({
    index:Number(localStorage.getItem('pending-col-index'))||46,
    statement:Number(localStorage.getItem('pending-col-statement'))||285,
    specialist:Number(localStorage.getItem('pending-col-specialist'))||135,
    date:Number(localStorage.getItem('pending-col-date'))||118,
    amount:Number(localStorage.getItem('pending-col-amount'))||125,
    actions:Number(localStorage.getItem('pending-col-actions'))||140
  }));
  const resizePendingColumn=(key,width)=>setPendingColWidths(prev=>{
    const next={...prev,[key]:Math.round(width)};
    localStorage.setItem(`pending-col-${key}`,String(next[key]));
    return next;
  });
  const unspent=group.items.filter(x=>x.status!=='spent');
  const spent=group.items.filter(x=>x.status==='spent');
  const items=tab==='unspent'?unspent:spent;
  const total=items.reduce((s,x)=>s+parseAmount(x.amount),0);

  const submitPartial=async item=>{
    const pay=parseAmount(partialAmount);
    if(!pay) return;
    if(pay>=parseAmount(item.amount)){
      if(!(await requestConfirm(`المبلغ المدخل ${money.format(pay)} يساوي أو يتجاوز المتبقي. هل تريد اعتباره سدادًا كاملًا؟`,{title:'تأكيد السداد',confirmText:'سداد كامل',cancelText:'إلغاء'}))) return;
      transferPending(item); setPartialId(null); setPartialAmount(''); return;
    }
    partiallyPayPending(item,pay); setPartialId(null); setPartialAmount('');
  };

  return <div className="pending-card pending-ledger-card">
    <div className="pending-ledger-title">
      <div><h3>{group.dep}</h3><span>{unspent.length} غير منصرف • {spent.length} منصرف</span></div>
      <strong>{money.format(total)} ر.س</strong>
    </div>

    <div className="pending-tabs pending-ledger-tabs">
      <button className={tab==='unspent'?'active':''} onClick={()=>setTab('unspent')}>غير منصرف <span>{unspent.length}</span></button>
      <button className={tab==='spent'?'active':''} onClick={()=>setTab('spent')}>منصرف <span>{spent.length}</span></button>
    </div>

    <div className="pending-live-table-wrap">
      <table className="pending-live-table resizable-data-table" style={{
        '--pending-index':`${pendingColWidths.index}px`,
        '--pending-statement':`${pendingColWidths.statement}px`,
        '--pending-specialist':`${pendingColWidths.specialist}px`,
        '--pending-date':`${pendingColWidths.date}px`,
        '--pending-amount':`${pendingColWidths.amount}px`,
        '--pending-actions':`${pendingColWidths.actions}px`
      }}>
        <ResizablePendingHeader widths={pendingColWidths} onResize={resizePendingColumn}/>
        <tbody>
          {items.map((item,index)=><React.Fragment key={item.id}>
            <tr className={item.status==='spent'?'spent-row':''}>
              <td className="pending-row-index">{item.marker || index+1}</td>
              <td className="pending-statement-table"><strong>{item.statement||'بدون بيان'}</strong><small>{cleanLegacyNotes(item.notes)||'—'}</small>{(item.partialPayments||[]).length>0&&<em>سداد جزئي سابق: {money.format((item.partialPayments||[]).reduce((s,p)=>s+parseAmount(p.amount),0))} ر.س</em>}</td>
              <td className="pending-specialist-table">{canonicalizeSpecialist?.(item.specialist)||item.specialist||'—'}</td>
              <td className="pending-date-table">{displayDate(item.date)}</td>
              <td className="pending-amount-table">{money.format(parseAmount(item.amount))} <small>ر.س</small></td>
              <td className="pending-actions-table">
                {item.status!=='spent'&&isEditing&&<button className="edit-pending" onClick={()=>{setEditingId(editingId===item.id?null:item.id);setPartialId(null)}} title="تعديل"><Pencil size={15}/></button>}
                {item.status!=='spent'&&<button className="partial-pay-btn" onClick={()=>{setPartialId(partialId===item.id?null:item.id);setEditingId(null);setPartialAmount('')}} title="سداد جزئي"><CreditCard size={15}/></button>}
                {item.status!=='spent'&&<button className="ok" onClick={()=>transferPending(item)} title="سداد كامل"><Check size={16}/></button>}
                {item.status!=='spent'&&isEditing&&<button className="danger" onClick={()=>removeRow('pending',item.id)} title="حذف"><Trash2 size={16}/></button>}
              </td>
            </tr>

            {editingId===item.id&&item.status!=='spent'&&<tr className="pending-detail-row"><td colSpan="6">
              <div className="pending-inline-editor pending-table-editor">
                <div className="pending-edit-grid">
                  <label><span>المبلغ</span><AmountCell disabled={!isEditing} value={item.amount} onChange={v=>updateCell('pending',item.id,'amount',v)}/></label>
                  <label className="wide"><span>البيان</span><GrowingTextCell disabled={!isEditing} value={item.statement} onChange={v=>updateCell('pending',item.id,'statement',v)}/></label>
                  <label><span>المختص</span><SpecialistInput disabled={!isEditing} value={item.specialist||''} canonicalize={canonicalizeSpecialist} onChange={v=>updateCell('pending',item.id,'specialist',v)}/></label>
                  <label><span>التاريخ</span><DateCell disabled={!isEditing} value={item.date} onChange={v=>updateCell('pending',item.id,'date',v)}/></label>
                  <label><span>القسم</span><select disabled={!isEditing} value={item.department} onChange={e=>updateCell('pending',item.id,'department',e.target.value)}>{departments.map(d=><option key={d}>{d}</option>)}</select></label>
                  <label className="wide"><span>ملاحظات</span><GrowingTextCell disabled={!isEditing} value={item.notes||''} onChange={v=>updateCell('pending',item.id,'notes',v)}/></label>
                </div>
                <div className="pending-edit-actions"><button className="btn primary" onClick={()=>setEditingId(null)}><Check/> حفظ التعديل</button></div>
              </div>
            </td></tr>}

            {partialId===item.id&&item.status!=='spent'&&<tr className="pending-detail-row"><td colSpan="6">
              <div className="partial-payment-panel pending-table-partial">
                <div><span>المبلغ المتبقي</span><strong>{money.format(parseAmount(item.amount))} ر.س</strong></div>
                <div className="partial-payment-entry"><input autoFocus inputMode="decimal" value={formatAmountInput(partialAmount)} onChange={e=>setPartialAmount(e.target.value)} placeholder="اكتب قيمة السداد الجزئي"/><button onClick={()=>submitPartial(item)}><CreditCard/> ترحيل للمنصرف</button><button className="cancel" onClick={()=>setPartialId(null)}>إلغاء</button></div>
              </div>
            </td></tr>}
          </React.Fragment>)}
          {!items.length&&<tr><td colSpan="6" className="pending-table-empty">لا توجد حركات في هذا التبويب</td></tr>}
        </tbody>
        <tfoot><tr><td colSpan="4">إجمالي {tab==='unspent'?'غير المنصرف':'المنصرف'}</td><td className="pending-table-total">{money.format(total)} ر.س</td><td>{items.length} حركة</td></tr></tfoot>
      </table>
    </div>
  </div>;
}

export default PendingPage;
