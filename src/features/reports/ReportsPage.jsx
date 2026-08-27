import React, { useEffect, useState } from 'react';
import { BarChart3, ClipboardList, Settings, Printer, Plus, Trash2, Check,
  ArrowDownToLine, ArrowUpFromLine, Search, CalendarDays,
  ChevronRight, ChevronLeft, RotateCcw, Undo2, MoreVertical, FileJson2, Landmark, ListPlus,
  FileSpreadsheet, Upload, History, X, ArrowLeft, ArrowRight, Minus, Square, Pencil, Save,
  Calendar, Maximize2, Building2, CreditCard, Download, Rows3, Columns2,
  LayoutGrid, List, FolderInput, Layers, SlidersHorizontal } from 'lucide-react';
import { money, uid, pad, toISO, todayISO, displayDate, isOnOrBefore, cleanLegacyNotes, arabicDayDate, parseAmount, formatAmountInput, confirmDelete } from '../../utils/appUtils.js';
import { PageErrorBoundary, PrintPreviewModal, DesktopTitleBar, Sidebar, MiniDateCalendar, DateHeader, PageToolbar, SummaryCard, DateCell, AmountCell, TextCell, GrowingTextCell, ExpenseAction, PrintReportHeader } from '../../components/common.jsx';

function ReportsPage({state,data,totals,filter,setFilter,addBlank,updateCell,removeRow,restoreExpense,isEditing=false,onPrint}) {
  const [layout,setLayout]=useState(()=>localStorage.getItem('financial-reports-layout')||'vertical');
  useEffect(()=>localStorage.setItem('financial-reports-layout',layout),[layout]);
  const f = arr => arr.filter(x=>`${x.amount} ${x.statement} ${x.company||''} ${x.department} ${x.notes}`.toLowerCase().includes(filter.toLowerCase()));
  return <section className="page print-reports">
    <PageToolbar title="المبالغ الواردة والمنصرفة" subtitle={isEditing?'وضع التعديل مفتوح — يمكنك الإضافة والتعديل والحذف الآن':'البيانات محفوظة ومقفولة ضد التعديل اليدوي'} onPrint={onPrint} filter={filter} setFilter={setFilter}/>
    <div className={`reports-edit-status ${isEditing?'editing':'saved'}`}><span>{isEditing?'وضع التعديل':'محفوظ'}</span><small>{isEditing?'اضغط «حفظ» أعلى الصفحة بعد الانتهاء':'اضغط «تعديل» أعلى الصفحة للسماح بتغيير السجل'}</small></div>
    <div className="summary-grid reports-summary-only"><SummaryCard label="إجمالي المبالغ الواردة" value={totals.income} tone="green" icon={<ArrowDownToLine/>}/><SummaryCard label="إجمالي المبالغ المنصرفة" value={totals.expense} tone="red" icon={<ArrowUpFromLine/>}/></div>
    <div className="reports-layout-bar"><span>طريقة عرض الجداول</span><div><button className={layout==='vertical'?'active':''} onClick={()=>setLayout('vertical')}><Rows3/> رأسي</button><button className={layout==='horizontal'?'active':''} onClick={()=>setLayout('horizontal')}><Columns2/> أفقي</button></div><small>في العرض الأفقي: الوارد يمينًا والمنصرف يسارًا</small></div>
    <div className={`sheet-stack reports-sheets ${layout==='horizontal'?'horizontal':''}`}>
      <ExcelSheet title="مبالغ واردة" tone="green" type="incomes" rows={f(data.incomes)} departments={state.departments} companies={state.companies||[]} addBlank={addBlank} updateCell={updateCell} removeRow={removeRow} isEditing={isEditing}/>
      <ExcelSheet title="مبالغ منصرفة" tone="red" type="expenses" rows={f(data.expenses)} departments={state.departments} addBlank={addBlank} updateCell={updateCell} removeRow={removeRow} restoreExpense={restoreExpense} isEditing={isEditing}/>
    </div>
  </section>;
}

function ExcelSheet({title,tone,type,rows,departments,companies=[],addBlank,updateCell,removeRow,restoreExpense,isEditing=false}) {
  const total=rows.reduce((s,x)=>s+parseAmount(x.amount),0);
  const addFromNotes=()=>{ if(isEditing) addBlank(type); };
  return <div className={`excel-card ${tone}`}>
    <div className="excel-head"><div><h3>{title}</h3><span>{rows.length} حركة في اليوم</span></div><button className="add-row-btn" disabled={!isEditing} onClick={()=>isEditing&&addBlank(type)}><Plus size={17}/> صف جديد</button></div>
    <div className="excel-wrap screen-excel-table"><table className="excel-table"><thead><tr><th className="index-col">#</th><th>التاريخ</th><th>المبلغ</th><th>البيان</th>{type==='incomes'&&<th>الشركة</th>}<th>القسم</th><th>ملاحظات</th><th className="action-col"></th></tr></thead><tbody>
      {rows.map((item,i)=><tr key={item.id}>
        <td className="row-index">{i+1}</td>
        <td><DateCell disabled={!isEditing} value={item.date} onChange={v=>updateCell(type,item.id,'date',v)}/></td>
        <td><AmountCell disabled={!isEditing} value={item.amount} onChange={v=>updateCell(type,item.id,'amount',v)}/></td>
        <td className="statement-cell"><GrowingTextCell disabled={!isEditing} value={item.statement} onChange={v=>updateCell(type,item.id,'statement',v)} placeholder="اكتب البيان..."/></td>
        {type==='incomes'&&<td><select disabled={!isEditing} className="cell-input company-cell-select" value={item.company||''} onChange={e=>updateCell(type,item.id,'company',e.target.value)}><option value="">— بدون شركة —</option>{item.company&&!companies.includes(item.company)&&<option value={item.company}>{item.company}</option>}{companies.map(c=><option key={c}>{c}</option>)}</select></td>}
        <td><select disabled={!isEditing} className="cell-input" value={item.department} onChange={e=>updateCell(type,item.id,'department',e.target.value)}><option value="">— بدون قسم —</option>{departments.map(d=><option key={d}>{d}</option>)}</select></td>
        <td><TextCell disabled={!isEditing} multiline value={item.notes} onChange={v=>updateCell(type,item.id,'notes',v)} placeholder="—" onEnterNewRow={addFromNotes}/></td>
        <td>{isEditing ? (type==='expenses' ? <ExpenseAction item={item} onRestore={restoreExpense} onDelete={()=>removeRow(type,item.id)}/> : <button className="row-delete" onClick={()=>removeRow(type,item.id)} title="حذف الصف"><Trash2 size={15}/></button>) : <span className="row-locked-mark">محفوظ</span>}</td>
      </tr>)}
      {isEditing ? <tr className="new-row" onClick={()=>addBlank(type)}><td><Plus size={15}/></td><td colSpan={type==='incomes'?7:6}>اضغط هنا لإضافة صف جديد</td></tr> : <tr className="new-row locked-new-row"><td></td><td colSpan={type==='incomes'?7:6}>السجل محفوظ — اضغط «تعديل» للسماح بإضافة صف جديد</td></tr>}
    </tbody><tfoot><tr><td colSpan={type==='incomes'?6:5}>إجمالي {title}</td><td colSpan="2"><strong>{money.format(total)} ر.س</strong></td></tr></tfoot></table></div>

    <div className="report-print-table-wrap">
      <table className={`report-print-table ${type==='incomes'?'income-print-table':'expense-print-table'}`}>
        <thead><tr><th>م</th><th>التاريخ</th><th>المبلغ</th><th>البيان</th>{type==='incomes'&&<th>الشركة</th>}<th>القسم</th><th>ملاحظات</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((item,i)=><tr key={`print-${item.id}`}>
            <td>{i+1}</td>
            <td>{displayDate(item.date)}</td>
            <td className="print-amount">{money.format(parseAmount(item.amount))}</td>
            <td>{item.statement || '—'}</td>
            {type==='incomes'&&<td>{item.company || '—'}</td>}
            <td>{item.department || '—'}</td>
            <td>{cleanLegacyNotes(item.notes) || '—'}</td>
          </tr>) : <tr className="print-empty-row"><td colSpan={type==='incomes'?7:6}>لا توجد حركات مسجلة في هذا اليوم</td></tr>}
        </tbody>
        <tfoot><tr><td colSpan={type==='incomes'?5:4}>إجمالي {title}</td><td colSpan="2">{money.format(total)} ر.س</td></tr></tfoot>
      </table>
    </div>
  </div>;
}

export default ReportsPage;
