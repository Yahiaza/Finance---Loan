import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ClipboardList, Settings, Printer, Plus, Trash2, Check,
  ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Search, CalendarDays,
  ChevronRight, ChevronLeft, RotateCcw, Undo2, MoreVertical, FileJson2, Landmark, ListPlus,
  FileSpreadsheet, Upload, History, X, ArrowLeft, ArrowRight, Minus, Square, Pencil, Save,
  Calendar, Maximize2, WalletCards, Building2, CreditCard, Download, Rows3, Columns2,
  LayoutGrid, List, FolderInput, Layers, SlidersHorizontal, Moon, Sun, AlertTriangle, CalendarRange, Layers3, Truck, ShoppingCart } from 'lucide-react';
import { money, uid, pad, toISO, todayISO, displayDate, isOnOrBefore, cleanLegacyNotes, arabicDayDate, parseAmount, formatAmountInput, confirmDelete } from '../utils/appUtils.js';

class PageErrorBoundary extends Component {
  constructor(props){
    super(props);
    this.state={error:null};
  }
  static getDerivedStateFromError(error){
    return {error};
  }
  componentDidCatch(error,info){
    console.error('Page runtime error:',error,info);
  }
  componentDidUpdate(prevProps){
    if(prevProps.resetKey!==this.props.resetKey && this.state.error){
      this.setState({error:null});
    }
  }
  render(){
    if(this.state.error){
      return <div className="page-runtime-error">
        <div className="runtime-error-icon"><X/></div>
        <h2>تعذر فتح هذا القسم</h2>
        <p>حدث خطأ أثناء تحميل الصفحة. تم منع الخطأ من إغلاق واجهة البرنامج بالكامل.</p>
        <code>{String(this.state.error?.message || this.state.error)}</code>
        <button onClick={()=>this.setState({error:null})}><RotateCcw/> إعادة محاولة فتح القسم</button>
      </div>;
    }
    return this.props.children;
  }
}

function PrintPreviewModal({mode,onPrint,onClose,html}) {
  const labels={reports:'المبالغ الواردة والمنصرفة',pending:'المبالغ المطلوبة',banks:'أرصدة البنوك','bank-branch':'أرصدة الفرع',loan:'تقرير القرض','loan-overview':'بيان القروض الشامل','loan-overview-category':'بيان تصنيف القروض','loan-overview-single':'بيان القرض'};
  return <div className="print-preview-overlay" role="dialog" aria-modal="true" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div className="print-preview-modal real-preview">
      <div className="print-preview-toolbar">
        <div className="print-preview-heading"><Printer size={18}/><div><strong>معاينة قبل الطباعة</strong><span>{labels[mode]||'التقرير'}</span></div></div>
        <div className="print-preview-actions">
          <button className="btn primary" onClick={onPrint}><Printer size={16}/> طباعة</button>
          <button className="btn" onClick={onClose}><X size={16}/> إغلاق</button>
        </div>
      </div>
      <div className="print-preview-stage real-stage">
        {html ? <iframe className="print-preview-frame" title="معاينة التقرير" srcDoc={html}/> : <div className="preview-loading">جاري تجهيز المعاينة...</div>}
      </div>
      <div className="print-preview-footer"><span>ESC للإغلاق</span><span>المعاينة تقريبية، والطباعة النهائية تستخدم نفس قالب التقرير.</span></div>
    </div>
  </div>;
}

function DesktopTitleBar() {
  const [maximized,setMaximized]=useState(false);
  useEffect(()=>{ window.desktopApp?.isWindowMaximized?.().then(setMaximized).catch(()=>{}); },[]);
  const toggle=async()=>{ const state=await window.desktopApp?.toggleMaximizeWindow?.(); if(typeof state==='boolean') setMaximized(state); };
  return <div className="desktop-titlebar">
    <div className="desktop-title-drag"><img src="./app-icon.png"/><span>الإدارة المالية</span></div>
    <div className="desktop-window-actions">
      <button onClick={()=>window.desktopApp?.minimizeWindow?.()} title="تصغير"><Minus/></button>
      <button onClick={toggle} title={maximized?'استعادة':'تكبير'}>{maximized?<Square/>:<Maximize2/>}</button>
      <button className="window-close" onClick={()=>window.desktopApp?.closeWindow?.()} title="إغلاق"><X/></button>
    </div>
  </div>;
}

function Sidebar({page,setPage,theme='light',onToggleTheme}) {
  const [loansOpen,setLoansOpen]=useState(page==='loans' || page==='loanStats');
  useEffect(()=>{ if(page==='loans' || page==='loanStats') setLoansOpen(true); },[page]);
  const loansActive=page==='loans' || page==='loanStats';
  return <aside className="sidebar">
    <div className="brand"><div className="brand-icon brand-image"><img src="./app-icon.png" alt="أيقونة الإدارة المالية"/></div><div><b>الإدارة المالية</b><span>السجل المالي اليومي</span></div></div>
    <div className="side-label">التقارير</div>
    <button className={page==='reports'?'active':''} onClick={()=>setPage('reports')}><BarChart3/> المبالغ الواردة والمنصرفة</button>
    <button className={page==='companies'?'active':''} onClick={()=>setPage('companies')}><Building2/> الشركات</button>
    <button className={page==='incomeCollection'?'active':''} onClick={()=>setPage('incomeCollection')}><CalendarRange/> التحصيل الوارد الشهري</button>
    <button className={page==='incomeCollectionAggregate'?'active':''} onClick={()=>setPage('incomeCollectionAggregate')}><Layers3/> التحصيل الوارد المجمع</button>
    <button className={page==='pending'?'active':''} onClick={()=>setPage('pending')}><ClipboardList/> المبالغ المطلوبة</button>
    <button className={page==='purchaseOrders'?'active':''} onClick={()=>setPage('purchaseOrders')}><ShoppingCart/> أوامر الشراء</button>
    <button className={page==='suppliers'?'active':''} onClick={()=>setPage('suppliers')}><Truck/> بيان الموردين</button>
    <button className={page==='banks'?'active':''} onClick={()=>setPage('banks')}><WalletCards/> أرصدة البنوك</button>

    <div className="sidebar-collapse">
      <button className={`collapse-toggle ${loansActive?'group-active':''}`} onClick={()=>setLoansOpen(v=>!v)}>
        <Landmark/>
        <span>القروض</span>
        <ChevronLeft className={loansOpen?'collapse-arrow open':'collapse-arrow'}/>
      </button>
      {loansOpen && <div className="collapse-children">
        <button className={page==='loans'?'active':''} onClick={()=>setPage('loans')}><ListPlus/> تسجيل القروض</button>
        <button className={page==='loanStats'?'active':''} onClick={()=>setPage('loanStats')}><BarChart3/> بيان القروض</button>
      </div>}
    </div>

    <div className="side-spacer"/>
    <button className="theme-toggle-btn" onClick={onToggleTheme}>
      {theme==='dark'?<Sun/>:<Moon/>}
      <span>{theme==='dark'?'الوضع الفاتح':'الوضع الداكن'}</span>
    </button>
    <button className={page==='settings'?'active':''} onClick={()=>setPage('settings')}><Settings/> الإعدادات والأقسام</button>
  </aside>;
}

function AppConfirmDialog({dialog,onResolve}) {
  useEffect(()=>{
    if(!dialog) return;
    const key=e=>{
      if(e.key==='Escape'){e.preventDefault();onResolve(false);}
      if(e.key==='Enter'){e.preventDefault();onResolve(true);}
    };
    window.addEventListener('keydown',key);
    return()=>window.removeEventListener('keydown',key);
  },[dialog,onResolve]);

  if(!dialog) return null;
  return <div className="app-confirm-overlay" role="dialog" aria-modal="true" onMouseDown={e=>e.target===e.currentTarget&&onResolve(false)}>
    <div className={`app-confirm-dialog ${dialog.tone||'warning'}`}>
      <div className="app-confirm-icon"><AlertTriangle/></div>
      <div className="app-confirm-content">
        <h3>{dialog.title||'تأكيد الإجراء'}</h3>
        <p>{dialog.message}</p>
      </div>
      <div className="app-confirm-actions">
        <button className="confirm-cancel" onClick={()=>onResolve(false)}>{dialog.cancelText||'لا'}</button>
        <button autoFocus className="confirm-yes" onClick={()=>onResolve(true)}>{dialog.confirmText||'نعم'}</button>
      </div>
    </div>
  </div>;
}

function MiniDateCalendar({value,onChange,onClose}) {
  const [view,setView]=useState(()=>{const [y,m]=value.split('-').map(Number);return {y,m};});
  useEffect(()=>{const [y,m]=value.split('-').map(Number);setView({y,m});},[value]);
  const first=new Date(view.y,view.m-1,1);
  const daysInMonth=new Date(view.y,view.m,0).getDate();
  const offset=(first.getDay()+1)%7; // السبت هو أول الأسبوع
  const monthName=new Intl.DateTimeFormat('ar-SA',{month:'long',year:'numeric',calendar:'gregory'}).format(first);
  const cells=[...Array(offset).fill(null),...Array.from({length:daysInMonth},(_,i)=>i+1)];
  const changeMonth=delta=>{const d=new Date(view.y,view.m-1+delta,1); const ym=`${d.getFullYear()}-${pad(d.getMonth()+1)}`; const todayYM=todayISO.slice(0,7); if(ym>todayYM) return; setView({y:d.getFullYear(),m:d.getMonth()+1});};
  const choose=day=>{const iso=`${view.y}-${pad(view.m)}-${pad(day)}`; if(iso>todayISO) return; onChange(iso); onClose();};
  return <div className="mini-calendar-popover">
    <div className="mini-calendar-head"><button onClick={()=>changeMonth(1)} disabled={`${view.y}-${pad(view.m)}`>=todayISO.slice(0,7)}><ChevronRight/></button><strong>{monthName}</strong><button onClick={()=>changeMonth(-1)}><ChevronLeft/></button></div>
    <div className="mini-weekdays">{['سبت','أحد','إثن','ثلا','أرب','خمي','جمع'].map(x=><span key={x}>{x}</span>)}</div>
    <div className="mini-days">{cells.map((day,i)=>day===null?<span key={`e${i}`}/>:<button key={day} className={`${value===`${view.y}-${pad(view.m)}-${pad(day)}`?'selected ':''}${`${view.y}-${pad(view.m)}-${pad(day)}`===todayISO?'today':''}`} disabled={`${view.y}-${pad(view.m)}-${pad(day)}`>todayISO} onClick={()=>choose(day)}>{day}</button>)}</div>
    <div className="mini-calendar-foot"><button onClick={()=>{onChange(todayISO);onClose();}}>الذهاب إلى اليوم</button></div>
  </div>;
}

function DateHeader({selectedDate,setSelectedDate,shiftDay,onExport,onImport,showEditActions=false,isSectionEditing=false,onEditSection,onSaveSection}) {
  const {day,full}=arabicDayDate(selectedDate);
  const isToday=selectedDate===todayISO;
  const [calendarOpen,setCalendarOpen]=useState(false);
  const safeSet=value=>{ if(!value) return; setSelectedDate(value>todayISO?todayISO:value); };
  return <header className="date-header modern-date-header">
    <div className="date-title"><CalendarDays/><div><span>السجل اليومي</span><h1>{day} — {full}</h1></div></div>
    <div className="date-controls modern-date-controls">
      {showEditActions && <div className="report-lock-actions">
        <button className={`header-save-btn ${!isSectionEditing?'locked':''}`} disabled={!isSectionEditing} onClick={onSaveSection} title="حفظ وإغلاق التعديل"><Save size={16}/> حفظ</button>
        <button className={`header-edit-btn ${isSectionEditing?'active':''}`} disabled={isSectionEditing} onClick={onEditSection} title="السماح بالتعديل وإضافة البيانات"><Pencil size={16}/> تعديل</button>
      </div>}
      <button className="export-btn import-json-btn" onClick={onImport} title="استيراد نسخة JSON محفوظة"><FolderInput size={16}/> استيراد JSON</button>
      <button className="export-btn" onClick={onExport} title="حفظ نسخة JSON لكل البيانات"><FileJson2 size={16}/> تصدير JSON</button>
      <button className="today-btn" disabled={isToday} onClick={()=>safeSet(todayISO)}><RotateCcw size={16}/> اليوم</button>
      <div className="date-navigator">
        <button className="day-nav" onClick={()=>shiftDay(-1)} title="اليوم السابق"><ChevronRight/></button>
        <button className="date-display-button" onClick={()=>setCalendarOpen(v=>!v)}><Calendar size={16}/><strong>{displayDate(selectedDate)}</strong></button>
        <button className="day-nav" disabled={isToday} onClick={()=>shiftDay(1)} title="اليوم التالي"><ChevronLeft/></button>
        {calendarOpen && <MiniDateCalendar value={selectedDate} onChange={safeSet} onClose={()=>setCalendarOpen(false)}/>} 
      </div>
    </div>
  </header>;
}

function PageToolbar({title,subtitle,onPrint,filter,setFilter}) {
  return <div className="page-toolbar"><div><h2>{title}</h2><p>{subtitle}</p></div><div className="toolbar-actions"><div className="search"><Search size={17}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="بحث في سجل اليوم..."/></div><button className="btn dark" onClick={onPrint}><Printer size={18}/> طباعة</button></div></div>;
}

function SummaryCard({icon,label,value,tone}) {
  return <div className={`summary-card ${tone}`}><div className="summary-icon">{icon}</div><div><span>{label}</span><strong>{money.format(value||0)} ر.س</strong></div></div>;
}

function DateCell({value,onChange,disabled=false}) {
  const split = (value || todayISO).split('-');
  const [day,setDay]=useState(split[2] || '01');
  const [month,setMonth]=useState(split[1] || '01');
  const [year,setYear]=useState(split[0] || '2026');
  const dayRef=useRef(null), monthRef=useRef(null), yearRef=useRef(null);

  useEffect(()=>{
    const [y,m,d]=(value || todayISO).split('-');
    setDay(d); setMonth(m); setYear(y);
  },[value]);

  const commit = (d=day,m=month,y=year) => {
    if(!d || !m || y.length<4) return;
    const yy=Math.max(Number(y)||2000,1900);
    const mm=Math.min(Math.max(Number(m)||1,1),12);
    const maxDay=new Date(yy,mm,0).getDate();
    const dd=Math.min(Math.max(Number(d)||1,1),maxDay);
    const iso=`${yy}-${pad(mm)}-${pad(dd)}`;
    if(iso!==value) onChange(iso);
    setDay(pad(dd)); setMonth(pad(mm)); setYear(String(yy));
  };

  const changeDay = raw => {
    const v=raw.replace(/\D/g,'').slice(0,2); setDay(v);
    if(v.length===2){ commit(v,month,year); monthRef.current?.focus(); monthRef.current?.select(); }
  };
  const changeMonth = raw => {
    const v=raw.replace(/\D/g,'').slice(0,2); setMonth(v);
    if(v.length===2){ commit(day,v,year); yearRef.current?.focus(); yearRef.current?.select(); }
  };
  const changeYear = raw => {
    const v=raw.replace(/\D/g,'').slice(0,4); setYear(v);
    if(v.length===4) commit(day,month,v);
  };
  const selectAll = e => e.target.select();
  return <div className="date-cell" dir="ltr">
    <input ref={dayRef} disabled={disabled} value={day} inputMode="numeric" maxLength={2} onFocus={selectAll} onBlur={()=>commit()} onChange={e=>changeDay(e.target.value)} aria-label="اليوم"/>
    <span>/</span>
    <input ref={monthRef} disabled={disabled} value={month} inputMode="numeric" maxLength={2} onFocus={selectAll} onBlur={()=>commit()} onChange={e=>changeMonth(e.target.value)} aria-label="الشهر"/>
    <span>/</span>
    <input ref={yearRef} disabled={disabled} value={year} inputMode="numeric" maxLength={4} onFocus={selectAll} onBlur={()=>commit()} onChange={e=>changeYear(e.target.value)} aria-label="السنة"/>
  </div>;
}

function AmountCell({value,onChange,disabled=false}) {
  return <input disabled={disabled} className="cell-input amount-input" inputMode="decimal" value={formatAmountInput(value)} onChange={e=>onChange(e.target.value.replace(/,/g,''))} placeholder="0"/>;
}

function TextCell({value,onChange,placeholder='',onEnterNewRow,multiline=false,disabled=false}) {
  if(multiline) return <textarea disabled={disabled} className="cell-input cell-textarea" value={value ?? ''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onKeyDown={e=>{
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); onEnterNewRow?.(); }
  }}/>;
  return <input disabled={disabled} className="cell-input" value={value ?? ''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>;
}

function GrowingTextCell({value,onChange,placeholder='',disabled=false}) {
  const ref=useRef(null);
  const resize=()=>{const el=ref.current;if(!el)return;el.style.height='41px';el.style.height=`${Math.max(41,el.scrollHeight)}px`;};
  useEffect(resize,[value]);
  return <textarea ref={ref} disabled={disabled} className="cell-input growing-textarea" value={value ?? ''} onChange={e=>{onChange(e.target.value);requestAnimationFrame(resize)}} placeholder={placeholder}/>;
}

function ExpenseAction({item,onDelete,onRestore}) {
  const [open,setOpen]=useState(false);
  return <div className="expense-menu-wrap">
    <button className="menu-trigger" onClick={()=>setOpen(v=>!v)} title="إجراءات"><MoreVertical size={16}/></button>
    {open && <div className="expense-menu">
      <button onClick={()=>{onRestore(item);setOpen(false)}}><Undo2 size={15}/> استعادة إلى المعلّقات</button>
      <button className="danger-item" onClick={()=>{onDelete();setOpen(false)}}><Trash2 size={15}/> حذف</button>
    </div>}
  </div>;
}

function PrintReportHeader({title,subtitle}) {
  const now=new Date();
  const date=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{year:'numeric',month:'long',day:'numeric'}).format(now);
  return <div className="professional-print-header">
    <div className="print-brand-block">
      <img src="./app-icon.png" alt=""/>
      <div><strong>الإدارة المالية</strong><span>نظام التقارير والقروض</span></div>
    </div>
    <div className="print-report-name"><h1>{title}</h1><p>{subtitle}</p></div>
    <div className="print-meta"><span>تاريخ التقرير</span><strong>{date}</strong></div>
  </div>;
}


function AppToast({toast,onClose}) {
  useEffect(()=>{
    if(!toast) return;
    const timer=setTimeout(onClose,toast.duration||3200);
    return()=>clearTimeout(timer);
  },[toast,onClose]);
  if(!toast) return null;
  return <div className={`app-toast ${toast.tone||'success'}`}>
    <div className="app-toast-icon">{toast.tone==='error'?<X/>:<Check/>}</div>
    <div><strong>{toast.title||'تم بنجاح'}</strong><span>{toast.message}</span></div>
    <button onClick={onClose}><X/></button>
  </div>;
}

export { PageErrorBoundary, PrintPreviewModal, AppConfirmDialog, AppToast, DesktopTitleBar, Sidebar, MiniDateCalendar, DateHeader, PageToolbar, SummaryCard, DateCell, AmountCell, TextCell, GrowingTextCell, ExpenseAction, PrintReportHeader };
