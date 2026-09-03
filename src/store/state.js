import { uid, todayISO, cleanLegacyNotes, parseAmount } from '../utils/appUtils.js';

const initialState = {
  departments: ['مستشفى', 'بصريات', 'تجهيزات'],
  companies: [],
  incomes: [
    { id: uid(), date: todayISO, amount: '120', statement: 'حوالة من شركة X', department: 'مستشفى', company: '', notes: 'بنك البلاد' }
  ],
  expenses: [],
  pending: [],
  banks: [],
  loans: [],
  suppliers: [],
  supplierTransfers: [],
  supplierTransferDepartment: '',
  purchaseOrders: [],
  purchaseOrderDepartments: [],
  purchaseRequesters: []
};

function normalizeState(raw) {
  const state = raw || initialState;
  const legacyTransferDepartment = String(state.supplierTransferDepartment ?? '');
  const fix = (arr, type) => (arr || []).map(x => ({
    ...x,
    date: x.date || todayISO,
    department: x.department || '',
    amount: x.amount === 0 ? '0' : String(x.amount ?? ''),
    notes: cleanLegacyNotes(x.notes),
    ...(type === 'income' ? { company: String(x.company ?? '') } : {}),
    ...(type === 'pending' ? {
      status: x.status || 'unspent',
      spentAt: x.spentAt || null,
      marker: String(x.marker ?? ''),
      specialist: String(x.specialist ?? ''),
      originalAmount: String(x.originalAmount ?? x.amount ?? ''),
      partialPayments: Array.isArray(x.partialPayments) ? x.partialPayments.map(p=>({
        id:p.id||uid(), date:p.date||todayISO, amount:String(p.amount??''), expenseId:p.expenseId||null
      })) : [],
      isDraft: Boolean(x.isDraft)
    } : {})
  }));
  return {
    departments: state.departments?.length ? state.departments : initialState.departments,
    companies: Array.isArray(state.companies) ? state.companies.map(x=>String(x||'').trim()).filter(Boolean) : [],
    incomes: fix(state.incomes, 'income'),
    expenses: fix(state.expenses, 'expense'),
    pending: fix(state.pending, 'pending'),
    suppliers: (state.suppliers || []).map((x,i)=>({id:x.id||uid(),supplierNumber:String(x.supplierNumber??''),name:String(x.name??''),iban:String(x.iban??''),phone:String(x.phone??''),email:String(x.email??''),address:String(x.address??''),taxNumber:String(x.taxNumber??'')})),
    supplierTransfers: (state.supplierTransfers || []).map(x=>({
      id:x.id||uid(), supplierNumber:String(x.supplierNumber??''), supplierName:String(x.supplierName??''), amount:String(x.amount??''),
      date:x.date||todayISO, department:String(x.department??legacyTransferDepartment),
      status:x.status==='transferred'?'transferred':'pending', transferredAt:x.transferredAt||null
    })),
    supplierTransferDepartment: legacyTransferDepartment,
    purchaseOrderDepartments: Array.isArray(state.purchaseOrderDepartments) ? state.purchaseOrderDepartments.map(x=>String(x||'').trim()).filter(Boolean) : [],
    purchaseRequesters: Array.isArray(state.purchaseRequesters) ? state.purchaseRequesters.map(x=>String(x||'').trim()).filter(Boolean) : [],
    purchaseOrders: (state.purchaseOrders || []).map(x=>({
      id:x.id||uid(), orderNumber:String(x.orderNumber??''), department:String(x.department??''),
      amount:String(x.amount??''), statement:String(x.statement??''), submissionDate:x.submissionDate||todayISO,
      requester:String(x.requester??''), status:x.status==='spent'?'spent':'unspent',
      orderAttachment:x.orderAttachment&&typeof x.orderAttachment==='object'?x.orderAttachment:null,
      transferAttachment:x.transferAttachment&&typeof x.transferAttachment==='object'?x.transferAttachment:null,
      createdAt:x.createdAt||new Date().toISOString()
    })),
    banks: (state.banks || []).map(bank => ({
      id: bank.id || uid(),
      name: String(bank.name ?? ''),
      accountNumber: String(bank.accountNumber ?? ''),
      department: String(bank.department ?? ''),
      balances: Array.isArray(bank.balances) ? bank.balances.map(entry=>({
        id: entry.id || uid(),
        date: entry.date || todayISO,
        amount: String(entry.amount ?? '')
      })) : []
    })),
    loans: (state.loans || []).map(loan => ({
      id: loan.id || uid(),
      name: loan.name || 'قرض بدون اسم',
      loanNumber: String(loan.loanNumber ?? ''),
      category: String(loan.category ?? ''),
      installmentCount: Number(loan.installmentCount || (loan.rows || []).length || 1),
      createdAt: loan.createdAt || todayISO,
      rows: (loan.rows || []).map((row, index) => ({
        id: row.id || uid(),
        marker: String(row.marker ?? (index + 1)),
        dueDate: row.dueDate || '',
        loanInstallment: String(row.loanInstallment ?? row.installment ?? ''),
        bankCommission: String(row.bankCommission ?? row.commission ?? ''),
        insuranceInstallment: String(row.insuranceInstallment ?? row.insurance ?? ''),
        deferredExpense: String(row.deferredExpense ?? ''),
        paidEntries: Array.isArray(row.paidEntries) ? row.paidEntries.map(entry => ({
          id: entry.id || uid(),
          date: entry.date || row.dueDate || todayISO,
          amount: String(entry.amount ?? '')
        })) : (() => {
          const legacyPaid = parseAmount(row.paid ?? (parseAmount(row.paidLoan) + parseAmount(row.paidCommission) || 0));
          return legacyPaid ? [{id:uid(), date:row.dueDate || todayISO, amount:String(legacyPaid)}] : [];
        })()
      }))
    }))
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem('financial-reports-state-v3') || localStorage.getItem('financial-reports-state-v2') || localStorage.getItem('financial-reports-state-v1');
    return raw ? normalizeState(JSON.parse(raw)) : initialState;
  } catch { return initialState; }
}

export { initialState, normalizeState, loadState };
