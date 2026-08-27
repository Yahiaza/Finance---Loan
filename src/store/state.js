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
  loans: []
};

function normalizeState(raw) {
  const state = raw || initialState;
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
