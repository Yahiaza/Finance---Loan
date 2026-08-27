const { app } = require('electron');
const { DatabaseSync, backup } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const SCHEMA_VERSION = 2;
let db = null;
let initialized = false;
let migrationInfo = null;
let lastBackupAt = 0;
let backupInFlight = null;

const isoDay = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const stamp = (d = new Date()) => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
};

function storageConfigFile() {
  return path.join(app.getPath('userData'), 'storage-config.json');
}

function readStorageConfig() {
  try {
    const file = storageConfigFile();
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('Failed to read storage config:', error);
    return {};
  }
}

function writeStorageConfig(patch = {}) {
  const file = storageConfigFile();
  const next = { ...readStorageConfig(), ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(temp, file);
  return next;
}

function paths() {
  const userData = app.getPath('userData');
  const config = readStorageConfig();
  const defaultDataDir = path.join(userData, 'data');
  const dbPath = config.databasePath ? path.resolve(config.databasePath) : path.join(defaultDataDir, 'finance.db');
  const dataDir = path.dirname(dbPath);
  const backupsDir = config.backupDirectory ? path.resolve(config.backupDirectory) : path.join(userData, 'backups');
  return {
    userData,
    dataDir,
    dbPath,
    backupsDir,
    dailyDir: path.join(backupsDir, 'daily'),
    migrationDir: path.join(backupsDir, 'migration'),
    legacyJson: path.join(userData, 'financial-data.json'),
    storageConfig: storageConfigFile(),
    customDatabasePath: Boolean(config.databasePath),
    customBackupPath: Boolean(config.backupDirectory)
  };
}

function ensureDirectories() {
  const p = paths();
  fs.mkdirSync(p.dataDir, { recursive: true });
  fs.mkdirSync(p.dailyDir, { recursive: true });
  fs.mkdirSync(p.migrationDir, { recursive: true });
  return p;
}

function openDatabase() {
  if (db) return db;
  const p = ensureDirectories();
  db = new DatabaseSync(p.dbPath, { timeout: 5000 });
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
  `);
  createSchema(db);
  return db;
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    ) STRICT;

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    ) STRICT;

    CREATE TABLE IF NOT EXISTS incomes (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL DEFAULT '',
      amount TEXT NOT NULL DEFAULT '',
      statement TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}'
    ) STRICT;

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL DEFAULT '',
      amount TEXT NOT NULL DEFAULT '',
      statement TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}'
    ) STRICT;

    CREATE TABLE IF NOT EXISTS pending_amounts (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL DEFAULT '',
      amount TEXT NOT NULL DEFAULT '',
      statement TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'unspent',
      spent_at TEXT,
      expense_id TEXT,
      marker TEXT NOT NULL DEFAULT '',
      specialist TEXT NOT NULL DEFAULT '',
      original_amount TEXT NOT NULL DEFAULT '',
      is_draft INTEGER NOT NULL DEFAULT 0 CHECK(is_draft IN (0,1)),
      payload_json TEXT NOT NULL DEFAULT '{}'
    ) STRICT;

    CREATE TABLE IF NOT EXISTS pending_payments (
      id TEXT PRIMARY KEY,
      pending_id TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      amount TEXT NOT NULL DEFAULT '',
      expense_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (pending_id) REFERENCES pending_amounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS banks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      account_number TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}'
    ) STRICT;

    CREATE TABLE IF NOT EXISTS bank_balances (
      id TEXT PRIMARY KEY,
      bank_id TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      amount TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      loan_number TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      installment_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}'
    ) STRICT;

    CREATE TABLE IF NOT EXISTS loan_installments (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      marker TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      loan_installment TEXT NOT NULL DEFAULT '',
      bank_commission TEXT NOT NULL DEFAULT '',
      insurance_installment TEXT NOT NULL DEFAULT '',
      deferred_expense TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS loan_payments (
      id TEXT PRIMARY KEY,
      installment_id TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      amount TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (installment_id) REFERENCES loan_installments(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_pending_date_status ON pending_amounts(date, status);
    CREATE INDEX IF NOT EXISTS idx_bank_balances_bank_date ON bank_balances(bank_id, date);
    CREATE INDEX IF NOT EXISTS idx_installments_loan_due ON loan_installments(loan_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_loan_payments_installment_date ON loan_payments(installment_id, date);
  `);

  const insertMeta = database.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)');
  insertMeta.run('schema_version', String(SCHEMA_VERSION));
  insertMeta.run('state_initialized', '0');
  insertMeta.run('created_at', new Date().toISOString());
}

function setMeta(key, value) {
  openDatabase().prepare(`
    INSERT INTO app_meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(String(key), String(value));
}

function getMeta(key, fallback = null) {
  const row = openDatabase().prepare('SELECT value FROM app_meta WHERE key=?').get(String(key));
  return row ? row.value : fallback;
}

function hasState() {
  return getMeta('state_initialized', '0') === '1';
}

const safeString = value => value === null || value === undefined ? '' : String(value);
const jsonText = value => {
  try { return JSON.stringify(value ?? {}); } catch { return '{}'; }
};
const parseJson = (value, fallback = {}) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const safeId = (value, prefix, index = 0) => safeString(value) || `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2,8)}`;

function clearStateTables(database) {
  database.exec(`
    DELETE FROM loan_payments;
    DELETE FROM loan_installments;
    DELETE FROM loans;
    DELETE FROM bank_balances;
    DELETE FROM banks;
    DELETE FROM pending_payments;
    DELETE FROM pending_amounts;
    DELETE FROM expenses;
    DELETE FROM incomes;
    DELETE FROM companies;
    DELETE FROM departments;
  `);
}

function saveState(state, options = {}) {
  if (!state || typeof state !== 'object') throw new Error('Invalid application state');
  const database = openDatabase();
  const normalized = {
    departments: Array.isArray(state.departments) ? state.departments : [],
    companies: Array.isArray(state.companies) ? state.companies : [],
    incomes: Array.isArray(state.incomes) ? state.incomes : [],
    expenses: Array.isArray(state.expenses) ? state.expenses : [],
    pending: Array.isArray(state.pending) ? state.pending : [],
    banks: Array.isArray(state.banks) ? state.banks : [],
    loans: Array.isArray(state.loans) ? state.loans : []
  };

  const q = {
    dept: database.prepare('INSERT INTO departments(name,sort_order) VALUES(?,?)'),
    company: database.prepare('INSERT INTO companies(name,sort_order) VALUES(?,?)'),
    income: database.prepare('INSERT INTO incomes(id,date,amount,statement,department,notes,payload_json) VALUES(?,?,?,?,?,?,?)'),
    expense: database.prepare('INSERT INTO expenses(id,date,amount,statement,department,notes,payload_json) VALUES(?,?,?,?,?,?,?)'),
    pending: database.prepare(`INSERT INTO pending_amounts(id,date,amount,statement,department,notes,status,spent_at,expense_id,marker,specialist,original_amount,is_draft,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
    pendingPayment: database.prepare('INSERT INTO pending_payments(id,pending_id,date,amount,expense_id,sort_order,payload_json) VALUES(?,?,?,?,?,?,?)'),
    bank: database.prepare('INSERT INTO banks(id,name,account_number,department,payload_json) VALUES(?,?,?,?,?)'),
    balance: database.prepare('INSERT INTO bank_balances(id,bank_id,date,amount,sort_order,payload_json) VALUES(?,?,?,?,?,?)'),
    loan: database.prepare('INSERT INTO loans(id,name,loan_number,category,installment_count,created_at,sort_order,payload_json) VALUES(?,?,?,?,?,?,?,?)'),
    installment: database.prepare('INSERT INTO loan_installments(id,loan_id,marker,due_date,loan_installment,bank_commission,insurance_installment,deferred_expense,sort_order,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)'),
    loanPayment: database.prepare('INSERT INTO loan_payments(id,installment_id,date,amount,sort_order,payload_json) VALUES(?,?,?,?,?,?)')
  };

  database.exec('BEGIN IMMEDIATE');
  try {
    clearStateTables(database);

    normalized.departments.forEach((name, i) => {
      const v = safeString(name).trim();
      if (v) q.dept.run(v, i);
    });

    normalized.companies.forEach((name, i) => {
      const v = safeString(name).trim();
      if (v) q.company.run(v, i);
    });

    normalized.incomes.forEach((x, i) => {
      const id = safeId(x?.id, 'income', i);
      q.income.run(id, safeString(x?.date), safeString(x?.amount), safeString(x?.statement), safeString(x?.department), safeString(x?.notes), jsonText({...x,id}));
    });

    normalized.expenses.forEach((x, i) => {
      const id = safeId(x?.id, 'expense', i);
      q.expense.run(id, safeString(x?.date), safeString(x?.amount), safeString(x?.statement), safeString(x?.department), safeString(x?.notes), jsonText({...x,id}));
    });

    normalized.pending.forEach((x, i) => {
      const id = safeId(x?.id, 'pending', i);
      q.pending.run(
        id, safeString(x?.date), safeString(x?.amount), safeString(x?.statement), safeString(x?.department), safeString(x?.notes),
        safeString(x?.status || 'unspent'), x?.spentAt ? safeString(x.spentAt) : null, x?.expenseId ? safeString(x.expenseId) : null,
        safeString(x?.marker), safeString(x?.specialist), safeString(x?.originalAmount ?? x?.amount), x?.isDraft ? 1 : 0,
        jsonText({...x,id,partialPayments:undefined})
      );
      (Array.isArray(x?.partialPayments) ? x.partialPayments : []).forEach((p, pi) => {
        const pid = safeId(p?.id, `pending-payment-${id}`, pi);
        q.pendingPayment.run(pid, id, safeString(p?.date), safeString(p?.amount), p?.expenseId ? safeString(p.expenseId) : null, pi, jsonText({...p,id:pid}));
      });
    });

    normalized.banks.forEach((bank, i) => {
      const id = safeId(bank?.id, 'bank', i);
      q.bank.run(id, safeString(bank?.name), safeString(bank?.accountNumber), safeString(bank?.department), jsonText({...bank,id,balances:undefined}));
      (Array.isArray(bank?.balances) ? bank.balances : []).forEach((entry, bi) => {
        const bid = safeId(entry?.id, `balance-${id}`, bi);
        q.balance.run(bid, id, safeString(entry?.date), safeString(entry?.amount), bi, jsonText({...entry,id:bid}));
      });
    });

    normalized.loans.forEach((loan, i) => {
      const id = safeId(loan?.id, 'loan', i);
      const rows = Array.isArray(loan?.rows) ? loan.rows : [];
      q.loan.run(id, safeString(loan?.name), safeString(loan?.loanNumber), safeString(loan?.category), Number(loan?.installmentCount || rows.length || 0), safeString(loan?.createdAt), i, jsonText({...loan,id,rows:undefined}));
      rows.forEach((row, ri) => {
        const rid = safeId(row?.id, `installment-${id}`, ri);
        q.installment.run(
          rid, id, safeString(row?.marker), safeString(row?.dueDate), safeString(row?.loanInstallment ?? row?.installment),
          safeString(row?.bankCommission ?? row?.commission), safeString(row?.insuranceInstallment ?? row?.insurance), safeString(row?.deferredExpense), ri,
          jsonText({...row,id:rid,paidEntries:undefined})
        );
        (Array.isArray(row?.paidEntries) ? row.paidEntries : []).forEach((entry, pi) => {
          const pid = safeId(entry?.id, `loan-payment-${rid}`, pi);
          q.loanPayment.run(pid, rid, safeString(entry?.date), safeString(entry?.amount), pi, jsonText({...entry,id:pid}));
        });
      });
    });

    setMetaInTransaction(database, 'state_initialized', '1');
    setMetaInTransaction(database, 'last_saved_at', new Date().toISOString());
    if (options.source) setMetaInTransaction(database, 'last_import_source', options.source);
    database.exec('COMMIT');
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch {}
    throw error;
  }

  scheduleRollingBackup();
  return getStateSummary(normalized);
}

function setMetaInTransaction(database, key, value) {
  database.prepare(`INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(key), String(value));
}

function loadState() {
  const database = openDatabase();
  if (!hasState()) return null;

  const departments = database.prepare('SELECT name FROM departments ORDER BY sort_order,id').all().map(r => r.name);
  const companies = database.prepare('SELECT name FROM companies ORDER BY sort_order,id').all().map(r => r.name);

  const mapSimple = (table) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(r => ({
    ...parseJson(r.payload_json, {}),
    id:r.id,
    date:r.date,
    amount:r.amount,
    statement:r.statement,
    department:r.department,
    notes:r.notes
  }));

  const incomes = mapSimple('incomes');
  const expenses = mapSimple('expenses');

  const pendingPayments = new Map();
  database.prepare('SELECT * FROM pending_payments ORDER BY pending_id,sort_order,rowid').all().forEach(r => {
    if (!pendingPayments.has(r.pending_id)) pendingPayments.set(r.pending_id, []);
    pendingPayments.get(r.pending_id).push({
      ...parseJson(r.payload_json, {}), id:r.id, date:r.date, amount:r.amount, expenseId:r.expense_id || null
    });
  });
  const pending = database.prepare('SELECT * FROM pending_amounts ORDER BY rowid').all().map(r => ({
    ...parseJson(r.payload_json, {}),
    id:r.id, date:r.date, amount:r.amount, statement:r.statement, department:r.department, notes:r.notes,
    status:r.status, spentAt:r.spent_at || null, expenseId:r.expense_id || null, marker:r.marker, specialist:r.specialist,
    originalAmount:r.original_amount, isDraft:Boolean(r.is_draft), partialPayments:pendingPayments.get(r.id) || []
  }));

  const balances = new Map();
  database.prepare('SELECT * FROM bank_balances ORDER BY bank_id,sort_order,rowid').all().forEach(r => {
    if (!balances.has(r.bank_id)) balances.set(r.bank_id, []);
    balances.get(r.bank_id).push({...parseJson(r.payload_json, {}), id:r.id, date:r.date, amount:r.amount});
  });
  const banks = database.prepare('SELECT * FROM banks ORDER BY rowid').all().map(r => ({
    ...parseJson(r.payload_json, {}), id:r.id, name:r.name, accountNumber:r.account_number, department:r.department,
    balances:balances.get(r.id) || []
  }));

  const loanPayments = new Map();
  database.prepare('SELECT * FROM loan_payments ORDER BY installment_id,sort_order,rowid').all().forEach(r => {
    if (!loanPayments.has(r.installment_id)) loanPayments.set(r.installment_id, []);
    loanPayments.get(r.installment_id).push({...parseJson(r.payload_json, {}), id:r.id, date:r.date, amount:r.amount});
  });
  const installments = new Map();
  database.prepare('SELECT * FROM loan_installments ORDER BY loan_id,sort_order,rowid').all().forEach(r => {
    if (!installments.has(r.loan_id)) installments.set(r.loan_id, []);
    installments.get(r.loan_id).push({
      ...parseJson(r.payload_json, {}), id:r.id, marker:r.marker, dueDate:r.due_date,
      loanInstallment:r.loan_installment, bankCommission:r.bank_commission, insuranceInstallment:r.insurance_installment,
      deferredExpense:r.deferred_expense, paidEntries:loanPayments.get(r.id) || []
    });
  });
  const loans = database.prepare('SELECT * FROM loans ORDER BY sort_order,rowid').all().map(r => ({
    ...parseJson(r.payload_json, {}), id:r.id, name:r.name, loanNumber:r.loan_number, category:r.category,
    installmentCount:Number(r.installment_count), createdAt:r.created_at, rows:installments.get(r.id) || []
  }));

  return { departments, companies, incomes, expenses, pending, banks, loans };
}

const numericAmount = value => {
  const n = Number(String(value ?? '').replace(/,/g,'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n) ? n : 0;
};

function getStateSummary(state) {
  const s = state || {};
  const incomes=s.incomes || [];
  const expenses=s.expenses || [];
  const pending=s.pending || [];
  const banks=s.banks || [];
  const loans=s.loans || [];
  const loanRows=loans.flatMap(x=>Array.isArray(x?.rows)?x.rows:[]);
  const bankEntries=banks.flatMap(x=>Array.isArray(x?.balances)?x.balances:[]);
  return {
    departments:(s.departments || []).length,
    companies:(s.companies || []).length,
    incomes:incomes.length,
    expenses:expenses.length,
    pending:pending.length,
    pendingPayments:pending.reduce((n,x)=>n+(Array.isArray(x?.partialPayments)?x.partialPayments.length:0),0),
    banks:banks.length,
    bankBalances:bankEntries.length,
    loans:loans.length,
    installments:loanRows.length,
    loanPayments:loanRows.reduce((n,r)=>n+(Array.isArray(r?.paidEntries)?r.paidEntries.length:0),0),
    incomeTotal:incomes.reduce((n,x)=>n+numericAmount(x?.amount),0),
    expenseTotal:expenses.reduce((n,x)=>n+numericAmount(x?.amount),0),
    pendingTotal:pending.reduce((n,x)=>n+numericAmount(x?.amount),0),
    bankBalanceEntriesTotal:bankEntries.reduce((n,x)=>n+numericAmount(x?.amount),0),
    loanInstallmentsTotal:loanRows.reduce((n,x)=>n+numericAmount(x?.loanInstallment ?? x?.installment),0),
    bankCommissionsTotal:loanRows.reduce((n,x)=>n+numericAmount(x?.bankCommission ?? x?.commission),0),
    insuranceTotal:loanRows.reduce((n,x)=>n+numericAmount(x?.insuranceInstallment ?? x?.insurance),0),
    loanPaidTotal:loanRows.reduce((n,r)=>n+(Array.isArray(r?.paidEntries)?r.paidEntries.reduce((m,p)=>m+numericAmount(p?.amount),0):0),0)
  };
}

function sameSummary(a, b) {
  const countKeys=['departments','companies','incomes','expenses','pending','pendingPayments','banks','bankBalances','loans','installments','loanPayments'];
  const moneyKeys=['incomeTotal','expenseTotal','pendingTotal','bankBalanceEntriesTotal','loanInstallmentsTotal','bankCommissionsTotal','insuranceTotal','loanPaidTotal'];
  return countKeys.every(k => Number(a[k] || 0) === Number(b[k] || 0))
    && moneyKeys.every(k => Math.abs(Number(a[k] || 0)-Number(b[k] || 0)) < 0.001);
}

function copyLegacyJsonForMigration(sourcePath) {
  const p = ensureDirectories();
  const target = path.join(p.migrationDir, `financial-data-before-sqlite-${stamp()}.json`);
  fs.copyFileSync(sourcePath, target);
  return target;
}

async function createBackup(kind = 'daily', force = false) {
  const database = openDatabase();
  if (!hasState()) return { ok:false, reason:'empty' };
  if (backupInFlight) return backupInFlight;

  const p = ensureDirectories();
  let target;
  if (kind === 'migration') target = path.join(p.migrationDir, `finance-after-migration-${stamp()}.db`);
  else if (kind === 'manual') target = path.join(p.backupsDir, `finance-manual-${stamp()}.db`);
  else target = path.join(p.dailyDir, `finance-${isoDay()}.db`);

  if (!force && fs.existsSync(target)) return { ok:true, path:target, skipped:true };

  backupInFlight = backup(database, target, { rate: 100 })
    .then(() => {
      lastBackupAt = Date.now();
      setMeta('last_backup_at', new Date().toISOString());
      setMeta('last_backup_path', target);
      cleanupDailyBackups(30);
      return { ok:true, path:target };
    })
    .catch(error => ({ ok:false, error:error.message }))
    .finally(() => { backupInFlight = null; });
  return backupInFlight;
}

function cleanupDailyBackups(keep = 30) {
  try {
    const p = ensureDirectories();
    const files = fs.readdirSync(p.dailyDir)
      .filter(name => /^finance-\d{4}-\d{2}-\d{2}\.db$/i.test(name))
      .map(name => ({name, path:path.join(p.dailyDir,name), mtime:fs.statSync(path.join(p.dailyDir,name)).mtimeMs}))
      .sort((a,b)=>b.mtime-a.mtime);
    files.slice(keep).forEach(f=>{ try{fs.unlinkSync(f.path);}catch{} });
  } catch {}
}

function scheduleRollingBackup() {
  // At most one backup every 10 minutes while the program is being edited.
  if (Date.now() - lastBackupAt < 10 * 60 * 1000) return;
  setTimeout(() => { createBackup('daily', true).catch(()=>{}); }, 800);
}

async function migrateLegacyIfNeeded() {
  openDatabase();
  if (hasState()) return { migrated:false };
  const p = ensureDirectories();
  if (!fs.existsSync(p.legacyJson)) return { migrated:false };

  try {
    const raw = JSON.parse(fs.readFileSync(p.legacyJson, 'utf8'));
    const sourceState = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
    const before = getStateSummary(sourceState);
    const legacyBackup = copyLegacyJsonForMigration(p.legacyJson);
    saveState(sourceState, { source:'legacy-financial-data.json' });
    const afterState = loadState();
    const after = getStateSummary(afterState);
    if (!sameSummary(before, after)) {
      throw new Error(`Migration validation failed. Before=${JSON.stringify(before)} After=${JSON.stringify(after)}`);
    }
    const dbBackup = await createBackup('migration', true);
    migrationInfo = {
      migrated:true,
      source:'financial-data.json',
      migratedAt:new Date().toISOString(),
      legacyBackup,
      databaseBackup:dbBackup?.path || null,
      summary:after
    };
    setMeta('last_migration_at', migrationInfo.migratedAt);
    setMeta('last_migration_source', migrationInfo.source);
    return migrationInfo;
  } catch (error) {
    migrationInfo = { migrated:false, failed:true, error:error.message };
    // Keep database marked uninitialized if migration failed.
    try {
      const database = openDatabase();
      database.exec('BEGIN IMMEDIATE');
      clearStateTables(database);
      setMetaInTransaction(database, 'state_initialized', '0');
      database.exec('COMMIT');
    } catch {}
    return migrationInfo;
  }
}


function validateDatabaseFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('ملف قاعدة البيانات غير موجود.');
  let testDb = null;
  try {
    testDb = new DatabaseSync(filePath, { readOnly: true, timeout: 5000 });
    const integrityRows = testDb.prepare('PRAGMA integrity_check').all();
    const ok = integrityRows.length > 0 && integrityRows.every(row => Object.values(row).some(v => String(v).toLowerCase() === 'ok'));
    if (!ok) throw new Error('فحص سلامة قاعدة البيانات لم ينجح.');
    // V3.0.0: companies is additive. Older V2.8.x databases are valid and
    // createSchema() will add the companies table automatically when opened.
    const required = ['app_meta','departments','incomes','expenses','pending_amounts','banks','bank_balances','loans','loan_installments','loan_payments'];
    const names = new Set(testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
    const missing = required.filter(name => !names.has(name));
    if (missing.length) throw new Error(`الملف ليس قاعدة بيانات صالحة للبرنامج. جداول مفقودة: ${missing.join(', ')}`);
    return true;
  } finally {
    try { testDb?.close(); } catch {}
  }
}

function ensureWritableDirectory(directory) {
  if (!directory) throw new Error('لم يتم تحديد مجلد صالح.');
  const resolved = path.resolve(directory);
  fs.mkdirSync(resolved, { recursive: true });
  const probe = path.join(resolved, `.finance-write-test-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(probe, 'ok', 'utf8');
  fs.unlinkSync(probe);
  return resolved;
}

async function moveDatabaseTo(directory) {
  await initialize();
  if (backupInFlight) await backupInFlight;
  const targetDir = ensureWritableDirectory(directory);
  const current = paths();
  const target = path.join(targetDir, 'finance.db');
  if (path.resolve(target).toLowerCase() === path.resolve(current.dbPath).toLowerCase()) {
    return { ok:true, skipped:true, ...getStorageInfo() };
  }
  if (fs.existsSync(target)) {
    throw new Error('يوجد ملف finance.db بالفعل في المجلد المحدد. استخدم «اختيار قاعدة بيانات موجودة» إذا كنت تريد فتحه.');
  }

  const database = openDatabase();
  try { database.exec('PRAGMA wal_checkpoint(FULL)'); } catch {}
  const safety = await createBackup('manual', true);
  if (!safety?.ok) throw new Error(safety?.error || 'تعذر إنشاء نسخة أمان قبل نقل قاعدة البيانات.');

  await backup(database, target, { rate: 100 });
  validateDatabaseFile(target);

  const oldPath = current.dbPath;
  close();
  writeStorageConfig({ databasePath: target });
  initialized = false;
  openDatabase();
  initialized = true;
  setMeta('database_moved_at', new Date().toISOString());
  setMeta('previous_database_path', oldPath);
  const storedBackup = getMeta('backup_directory', null);
  if (storedBackup && fs.existsSync(storedBackup)) writeStorageConfig({ backupDirectory: storedBackup });
  return { ok:true, previousDatabasePath:oldPath, ...getStorageInfo() };
}

async function useExistingDatabase(filePath) {
  if (!filePath) throw new Error('لم يتم اختيار قاعدة بيانات.');
  const resolved = path.resolve(filePath);
  validateDatabaseFile(resolved);

  try {
    await initialize();
    if (hasState()) await createBackup('manual', true);
  } catch (error) {
    console.warn('Could not back up current database before switching:', error);
  }

  const oldPath = paths().dbPath;
  close();
  writeStorageConfig({ databasePath: resolved });
  initialized = false;
  openDatabase();
  initialized = true;
  const storedBackup = getMeta('backup_directory', null);
  if (storedBackup) {
    try {
      ensureWritableDirectory(storedBackup);
      writeStorageConfig({ backupDirectory: storedBackup });
    } catch {}
  }
  return { ok:true, previousDatabasePath:oldPath, state:loadState(), ...getStorageInfo() };
}

function setBackupDirectory(directory) {
  const target = ensureWritableDirectory(directory);
  writeStorageConfig({ backupDirectory: target });
  ensureDirectories();
  try { setMeta('backup_directory', target); } catch {}
  return { ok:true, ...getStorageInfo() };
}

async function initialize() {
  if (initialized) return getStorageInfo();
  openDatabase();
  await migrateLegacyIfNeeded();
  initialized = true;
  if (hasState()) createBackup('daily', false).catch(()=>{});
  return getStorageInfo();
}

function getStorageInfo() {
  const p = ensureDirectories();
  return {
    backend:'sqlite',
    engine:'node:sqlite',
    databasePath:p.dbPath,
    databaseDirectory:p.dataDir,
    backupsPath:p.backupsDir,
    customDatabasePath:p.customDatabasePath,
    customBackupPath:p.customBackupPath,
    storageConfigPath:p.storageConfig,
    schemaVersion:Number(getMeta('schema_version', SCHEMA_VERSION)),
    initialized:hasState(),
    lastSavedAt:getMeta('last_saved_at', null),
    lastBackupAt:getMeta('last_backup_at', null),
    lastBackupPath:getMeta('last_backup_path', null),
    migration:migrationInfo,
    summary:hasState() ? getStateSummary(loadState()) : getStateSummary(null)
  };
}

function close() {
  if (!db) return;
  try { db.close(); } catch {}
  db = null;
}

module.exports = {
  initialize,
  loadState,
  saveState,
  createBackup,
  getStorageInfo,
  close,
  getStateSummary,
  paths,
  moveDatabaseTo,
  useExistingDatabase,
  setBackupDirectory,
  validateDatabaseFile
};
