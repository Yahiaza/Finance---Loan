// Shared formatting, date and value helpers.

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const pad = n => String(n).padStart(2, '0');

const toISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

let todayISO = toISO(new Date());

// Refresh the exported live binding when the calendar day changes.
// Electron apps can stay open for days, so a module-load constant is not enough.
const refreshTodayISO = () => {
  todayISO = toISO(new Date());
  return todayISO;
};

const displayDate = iso => {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d} / ${m} / ${y}`;
};

const isOnOrBefore = (a,b) => !a || a <= b;

const cleanLegacyNotes = value => {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const normalized = v.replace(/[ـ\s-]/g,'');
  if (/^(مرحل|مرحلة|تمالترحيل)(من)?المعلقات$/i.test(normalized)) return '';
  return value;
};

const arabicDayDate = iso => {
  const [y,m,d] = iso.split('-').map(Number);
  const date = new Date(y, m-1, d);
  const day = new Intl.DateTimeFormat('ar-SA', { weekday:'long' }).format(date);
  const full = new Intl.DateTimeFormat('ar-SA', { day:'numeric', month:'long', year:'numeric', calendar:'gregory' }).format(date);
  return { day, full };
};

const parseAmount = value => {
  if (typeof value === 'number') return value;
  const cleaned = String(value ?? '').replace(/,/g,'').replace(/[^0-9.]/g,'');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const formatAmountInput = value => {
  if (value === '' || value === null || value === undefined) return '';
  const raw = String(value).replace(/,/g,'');
  if (raw === '.' || raw.endsWith('.')) {
    const base = raw.slice(0,-1).replace(/\D/g,'');
    return `${base ? Number(base).toLocaleString('en-US') : '0'}.`;
  }
  const [wholeRaw, decimalRaw] = raw.split('.');
  const whole = wholeRaw.replace(/\D/g,'');
  const decimal = (decimalRaw || '').replace(/\D/g,'').slice(0,2);
  const formattedWhole = whole ? Number(whole).toLocaleString('en-US') : '';
  return raw.includes('.') ? `${formattedWhole}.${decimal}` : formattedWhole;
};

const requestConfirm = (message, options = {}) => {
  if (typeof window !== 'undefined' && typeof window.__financialAppConfirm === 'function') {
    return window.__financialAppConfirm({
      title: options.title || 'تأكيد الإجراء',
      message,
      confirmText: options.confirmText || 'نعم',
      cancelText: options.cancelText || 'لا',
      tone: options.tone || 'warning'
    });
  }
  return Promise.resolve(window.confirm(message));
};

const confirmDelete = label => requestConfirm(
  `هل أنت متأكد من حذف ${label || 'هذا العنصر'}؟`,
  { title:'تأكيد الحذف', confirmText:'نعم، حذف', cancelText:'لا', tone:'danger' }
);

export { money, uid, pad, toISO, todayISO, refreshTodayISO, displayDate, isOnOrBefore, cleanLegacyNotes, arabicDayDate, parseAmount, formatAmountInput, requestConfirm, confirmDelete };
