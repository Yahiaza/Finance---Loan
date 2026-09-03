import React, { useEffect, useMemo, useRef, useState } from 'react';
import { money, uid, pad, toISO, todayISO, refreshTodayISO, displayDate, isOnOrBefore, cleanLegacyNotes, arabicDayDate, parseAmount, formatAmountInput, requestConfirm, confirmDelete } from './utils/appUtils.js';
import { normalizeState, loadState } from './store/state.js';
import { buildPrintPreviewHtml } from './print/preview.js';
import { PageErrorBoundary, PrintPreviewModal, AppConfirmDialog, AppToast, DesktopTitleBar, Sidebar, DateHeader } from './components/common.jsx';
import ReportsPage from './features/reports/ReportsPage.jsx';
import PendingPage from './features/pending/PendingPage.jsx';
import BankBalancesPage from './features/banks/BankBalancesPage.jsx';
import { LoansPage, LoansOverviewPage } from './features/loans/LoansPage.jsx';
import SettingsPage from './features/settings/SettingsPage.jsx';
import { CompaniesPage, MonthlyIncomeCollectionPage, AggregateIncomeCollectionPage } from './features/reports/IncomeCollectionPages.jsx';
import SuppliersPage from './features/suppliers/SuppliersPage.jsx';
import PurchaseOrdersPage from './features/purchaseOrders/PurchaseOrdersPage.jsx';

function App() {
  const [state, setState] = useState(loadState);
  const [page, setPage] = useState('reports');
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [liveToday, setLiveToday] = useState(todayISO);
  const [filter, setFilter] = useState('');
  const [desktopStorageReady, setDesktopStorageReady] = useState(!window.desktopApp?.isElectron);
  const [printPreview, setPrintPreview] = useState(null);
  const [theme,setTheme] = useState(()=>{
    // V2.7.5 palette refresh: start the redesigned UI in light mode once,
    // then preserve the user's theme choice normally afterwards.
    const paletteKey='financial-palette-v275';
    if(localStorage.getItem(paletteKey)!=='ready'){
      localStorage.setItem(paletteKey,'ready');
      return 'light';
    }
    return localStorage.getItem('financial-theme') || 'light';
  });
  const [confirmDialog,setConfirmDialog] = useState(null);
  const [sectionEditing,setSectionEditing] = useState({reports:false,pending:false,purchaseOrders:false,banks:false,loans:false,settings:false,companies:false,suppliers:false});
  const [toast,setToast] = useState(null);
  const [storageInfo,setStorageInfo] = useState(null);
  const [updateStatus,setUpdateStatus] = useState({currentVersion:'4.1.1',source:{owner:'Yahiaza',repo:'Finance---Loan',autoCheck:true},configured:true,checked:false,progress:0,downloading:false,downloadedPath:''});
  const [centralStatus,setCentralStatus]=useState({enabled:false,configured:false,authenticated:false,connected:false,serverUrl:'',username:'',revision:null});
  const [accessStatus,setAccessStatus]=useState({enabled:false,configured:false,connected:false,databasePath:'',revision:null});
  const stateRef=useRef(state);
  const centralSyncBusy=useRef(false);
  useEffect(()=>{stateRef.current=state;},[state]);

  // Keep the app date alive while Electron stays open across midnight.
  // If the user is currently viewing "today", move to the new day automatically.
  // If the user is intentionally browsing an older date, preserve that selection.
  useEffect(()=>{
    let midnightTimer=null;

    const syncCalendarDay=()=>{
      const newToday=refreshTodayISO();
      setLiveToday(previousToday=>{
        if(previousToday!==newToday){
          setSelectedDate(current=>{
            if(current===previousToday) return newToday;
            return current>newToday ? newToday : current;
          });
        }
        return newToday;
      });
    };

    const scheduleNextMidnight=()=>{
      if(midnightTimer) clearTimeout(midnightTimer);
      const now=new Date();
      const nextMidnight=new Date(now);
      nextMidnight.setHours(24,0,2,0); // small 2-second margin after midnight
      midnightTimer=setTimeout(()=>{
        syncCalendarDay();
        scheduleNextMidnight();
      },Math.max(1000,nextMidnight.getTime()-now.getTime()));
    };

    const onVisibility=()=>{ if(document.visibilityState==='visible') syncCalendarDay(); };
    window.addEventListener('focus',syncCalendarDay);
    document.addEventListener('visibilitychange',onVisibility);

    // A minute fallback also covers sleep/resume edge cases where timers are throttled.
    const fallback=setInterval(syncCalendarDay,60_000);
    syncCalendarDay();
    scheduleNextMidnight();

    return()=>{
      if(midnightTimer) clearTimeout(midnightTimer);
      clearInterval(fallback);
      window.removeEventListener('focus',syncCalendarDay);
      document.removeEventListener('visibilitychange',onVisibility);
    };
  },[]);

  useEffect(()=>{
    localStorage.setItem('financial-theme',theme);
    document.body.dataset.theme=theme;
  },[theme]);

  useEffect(()=>{
    window.desktopApp?.getCentralStatus?.().then(result=>{if(result?.ok)setCentralStatus(s=>({...s,...result,connected:result.enabled?s.connected:false}));}).catch(()=>{});
    window.desktopApp?.getAccessStatus?.().then(result=>{if(result?.ok)setAccessStatus(s=>({...s,...result,connected:result.enabled?s.connected:false}));}).catch(()=>{});
  },[]);

  useEffect(()=>{
    if((centralStatus.enabled&&!centralStatus.connected)||(accessStatus.enabled&&!accessStatus.connected))setSectionEditing(current=>Object.fromEntries(Object.keys(current).map(key=>[key,false])));
  },[centralStatus.enabled,centralStatus.connected,accessStatus.enabled,accessStatus.connected]);

  useEffect(()=>{
    window.__financialAppConfirm = options => new Promise(resolve=>{
      const returnFocus=document.activeElement;
      setConfirmDialog({...options,resolve,returnFocus});
    });
    return()=>{ delete window.__financialAppConfirm; };
  },[]);

  const resolveConfirm = result => {
    const current=confirmDialog;
    if(!current) return;
    setConfirmDialog(null);
    requestAnimationFrame(()=>{
      const target=current.returnFocus;
      if(target && target.isConnected && typeof target.focus==='function') target.focus();
      else document.querySelector('.content')?.focus?.();
      setTimeout(()=>current.resolve(Boolean(result)),0);
    });
  };

  // V2.7.0: SQLite is the primary desktop storage.
  // Existing financial-data.json is migrated by Electron before the renderer starts using the database.
  // If no legacy desktop file exists, the current localStorage state is imported once as a compatibility fallback.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!window.desktopApp?.loadState) return;
      let storageCanSave = false;
      try {
        const result = await window.desktopApp.loadState();
        if (!alive) return;
        if (!result?.ok) {
          setStorageInfo(result?.storageInfo || null);
          if(result?.storageInfo?.backend==='postgresql')setCentralStatus(s=>({...s,...result.storageInfo,enabled:true,connected:false}));
          if(result?.storageInfo?.backend==='access')setAccessStatus(s=>({...s,...result.storageInfo,enabled:true,connected:false}));
          setToast({
            tone:'error',
            title:'تعذر تشغيل قاعدة البيانات',
            message:result?.error || 'لم يتم تعديل البيانات القديمة. يمكنك الاستمرار على النسخة السابقة لحين حل المشكلة.'
          });
          return;
        }

        setStorageInfo(result.storageInfo || null);
        if(result.storageInfo?.backend==='postgresql')setCentralStatus(s=>({...s,...result.storageInfo,enabled:true,connected:true}));
        if(result.storageInfo?.backend==='access')setAccessStatus(s=>({...s,...result.storageInfo,enabled:true,connected:true}));
        if (result.state) {
          setState(normalizeState(result.state));
        } else {
          // Fresh database: safely import the current renderer/localStorage state once.
          const saved = await window.desktopApp.saveState(state);
          if (!saved?.ok) throw new Error(saved?.error || 'تعذر إنشاء قاعدة البيانات الأولى.');
          const info = await window.desktopApp.getStorageInfo?.();
          if (alive && info?.ok) setStorageInfo(info);
        }
        storageCanSave = true;

        if (result.storageInfo?.migration?.migrated) {
          const c=result.storageInfo.migration.summary || {};
          setToast({
            tone:'success',
            title:'تم نقل البيانات إلى SQLite بنجاح',
            message:`تم التحقق من البيانات: ${c.incomes||0} وارد، ${c.expenses||0} منصرف، ${c.pending||0} مطلوب، ${c.banks||0} بنك، ${c.loans||0} قرض، ${c.installments||0} قسط.`
          });
        }
      } catch (error) {
        console.error('SQLite data load failed:', error);
        if (alive) setToast({tone:'error',title:'مشكلة في قاعدة البيانات',message:error.message || 'تعذر تهيئة قاعدة البيانات.'});
      } finally {
        if (alive && storageCanSave) setDesktopStorageReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(()=>{
    const handler=e=>setState(s=>({...s,pending:[...s.pending,...(e.detail||[])]}));
    window.addEventListener('financial:import-pending',handler);
    return ()=>window.removeEventListener('financial:import-pending',handler);
  },[]);

  useEffect(() => {
    // Keep localStorage as a lightweight compatibility/fallback copy.
    localStorage.setItem('financial-reports-state-v3', JSON.stringify(state));
    if (!desktopStorageReady || !window.desktopApp?.saveState) return;
    const timer = setTimeout(() => {
      window.desktopApp.saveState(state).then(result => {
        if (result && !result.ok) {
          console.error('Desktop data save failed:', result.error);
          if(result.conflict&&result.state){
            setState(normalizeState(result.state));
            setToast({tone:'error',title:'تعارض تعديل آمن',message:`عدل مستخدم آخر نفس البيانات؛ تم تحميل نسخة القاعدة المشتركة وحفظ نسخة من تعديلك للمراجعة${result.conflictPath?` في: ${result.conflictPath}`:''}.`});
          }else{
            setCentralStatus(s=>s.enabled?{...s,connected:false}:s);
            setAccessStatus(s=>s.enabled?{...s,connected:false}:s);
            setToast({tone:'error',title:'تعذر حفظ البيانات',message:result.error || 'لم يتم حفظ آخر تعديل في قاعدة البيانات.'});
          }
        } else if(result?.ok) {
          setCentralStatus(s=>s.enabled?{...s,connected:true,revision:result.revision??s.revision}:s);
          setAccessStatus(s=>s.enabled?{...s,connected:true,revision:result.revision??s.revision}:s);
          if(result.state&&JSON.stringify(result.state)!==JSON.stringify(stateRef.current))setState(normalizeState(result.state));
          setStorageInfo(info=>info?{...info,summary:result.summary||info.summary,lastSavedAt:new Date().toISOString()}:info);
        }
      }).catch(error => {
        console.error('Desktop data save failed:', error);
        setToast({tone:'error',title:'تعذر حفظ البيانات',message:error.message || 'حدث خطأ أثناء الحفظ في قاعدة البيانات.'});
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [state, desktopStorageReady]);

  useEffect(()=>{
    if(!centralStatus.enabled||!desktopStorageReady||!window.desktopApp?.syncCentralState)return;
    const timer=setInterval(async()=>{
      if(centralSyncBusy.current)return;
      centralSyncBusy.current=true;
      try{
        const result=await window.desktopApp.syncCentralState(stateRef.current);
        if(result?.ok){
          setCentralStatus(s=>({...s,connected:true,revision:result.revision??s.revision}));
          if(result.state&&JSON.stringify(result.state)!==JSON.stringify(stateRef.current))setState(normalizeState(result.state));
        }else if(result?.conflict&&result.state){
          setState(normalizeState(result.state));
          setToast({tone:'error',title:'تم منع تعارض بين المستخدمين',message:'تم تحميل أحدث بيانات السيرفر، وحُفظ التعديل المتعارض في ملف مراجعة محلي.'});
        }else setCentralStatus(s=>({...s,connected:false}));
      }catch{setCentralStatus(s=>({...s,connected:false}));}
      finally{centralSyncBusy.current=false;}
    },5000);
    return()=>clearInterval(timer);
  },[centralStatus.enabled,desktopStorageReady]);

  useEffect(()=>{
    if(!accessStatus.enabled||!desktopStorageReady||!window.desktopApp?.syncAccessState)return;
    const timer=setInterval(async()=>{
      if(centralSyncBusy.current)return;
      centralSyncBusy.current=true;
      try{
        const result=await window.desktopApp.syncAccessState(stateRef.current);
        if(result?.ok){
          setAccessStatus(s=>({...s,connected:true,revision:result.revision??s.revision}));
          if(result.state&&JSON.stringify(result.state)!==JSON.stringify(stateRef.current))setState(normalizeState(result.state));
        }else if(result?.conflict&&result.state){
          setState(normalizeState(result.state));
          setToast({tone:'error',title:'تم منع تعارض بين المستخدمين',message:`تم تحميل أحدث بيانات Access وحُفظ التعديل المتعارض للمراجعة${result.conflictPath?` في: ${result.conflictPath}`:''}.`});
        }else setAccessStatus(s=>({...s,connected:false}));
      }catch{setAccessStatus(s=>({...s,connected:false}));}
      finally{centralSyncBusy.current=false;}
    },5000);
    return()=>clearInterval(timer);
  },[accessStatus.enabled,desktopStorageReady]);


  // V3.1.0: GitHub Releases updater for the Portable build.
  useEffect(()=>{
    if(!window.desktopApp?.getUpdateStatus) return;
    let alive=true;
    const unsubscribe=window.desktopApp.onUpdateProgress?.(value=>{
      if(alive)setUpdateStatus(s=>({...s,progress:Number(value)||0,downloading:true}));
    });
    (async()=>{
      try{
        const status=await window.desktopApp.getUpdateStatus();
        if(!alive||!status?.ok)return;
        setUpdateStatus(s=>({...s,...status,source:status.source||s.source,downloadedPath:status.downloadedUpdatePath||'',checked:false}));
        if(status.configured && status.source?.autoCheck!==false){
          setTimeout(async()=>{
            if(!alive)return;
            try{
              const result=await window.desktopApp.checkForUpdates();
              if(!alive)return;
              if(result?.ok){
                setUpdateStatus(s=>({...s,...result,checked:true,lastCheckedAt:new Date().toISOString(),error:false,message:'',downloadedPath:s.downloadedPath||''}));
                if(result.updateAvailable)setToast({tone:'success',title:`يتوفر تحديث V${result.latestVersion}`,message:'يمكن تنزيل الإصدار الجديد من الإعدادات ← التحديثات التلقائية.'});
              }else if(result?.configured){
                setUpdateStatus(s=>({...s,checked:true,lastCheckedAt:new Date().toISOString(),error:true,message:result.message||'تعذر فحص التحديثات.'}));
              }
            }catch(error){
              console.warn('Automatic update check skipped:',error);
            }
          },3500);
        }
      }catch(error){
        console.warn('Updater initialization skipped:',error);
      }
    })();
    return()=>{alive=false;unsubscribe?.();};
  },[]);

  const checkForUpdate=async(silent=false)=>{
    if(!window.desktopApp?.checkForUpdates)return;
    let result;
    try{result=await window.desktopApp.checkForUpdates();}
    catch(error){result={ok:false,configured:updateStatus.configured,message:error?.message||'تعذر فحص التحديثات.'};}
    if(result?.ok){
      setUpdateStatus(s=>({...s,...result,checked:true,lastCheckedAt:new Date().toISOString(),error:false,message:'',downloadedPath:s.downloadedPath||''}));
      if(!silent)setToast(result.updateAvailable?{tone:'success',title:`يتوفر تحديث V${result.latestVersion}`,message:result.asset?'الإصدار الجديد جاهز للتنزيل.':'الإصدار موجود لكن ملف Portable لم يُرفع بعد.'}:{tone:'success',title:'أنت على أحدث إصدار',message:`الإصدار الحالي V${result.currentVersion}.`});
    }else{
      setUpdateStatus(s=>({...s,configured:result?.configured??s.configured,source:result?.source||s.source,checked:true,lastCheckedAt:new Date().toISOString(),error:true,message:result?.message||'تعذر فحص التحديثات.'}));
      if(!silent)setToast({tone:'error',title:'تعذر فحص التحديثات',message:result?.message||'تحقق من الاتصال وإعدادات GitHub.'});
    }
  };
  const saveUpdateSettings=async(value)=>{
    const result=await window.desktopApp?.saveUpdateSettings?.(value);
    if(result?.ok){setUpdateStatus(s=>({...s,...result,source:result.source||value,configured:result.configured,checked:false,message:''}));setToast({tone:'success',title:'تم حفظ إعدادات التحديث',message:'سيستخدم البرنامج هذا المستودع لفحص الإصدارات الجديدة.'});}
    else setToast({tone:'error',title:'تعذر حفظ إعدادات التحديث',message:result?.error||'حدث خطأ أثناء الحفظ.'});
    return result;
  };
  const downloadUpdate=async()=>{
    setUpdateStatus(s=>({...s,downloading:true,progress:0}));
    const result=await window.desktopApp?.downloadUpdate?.();
    if(result?.ok){setUpdateStatus(s=>({...s,downloading:false,progress:100,downloadedPath:result.path}));setToast({tone:'success',title:'تم تنزيل التحديث',message:'النسخة الجديدة جاهزة. يمكنك تشغيلها من قسم التحديثات.'});}
    else{setUpdateStatus(s=>({...s,downloading:false}));setToast({tone:'error',title:'فشل تنزيل التحديث',message:result?.message||result?.error||'تعذر تنزيل الملف.'});}
    return result;
  };

  const dayData = useMemo(() => ({
    incomes: state.incomes.filter(x => x.date === selectedDate),
    expenses: state.expenses.filter(x => x.date === selectedDate),
    pending: state.pending.filter(x => x.date === selectedDate)
  }), [state, selectedDate]);

  const bankBalanceTotal = useMemo(() => state.banks.reduce((sum,bank)=>{
    const valid=(bank.balances||[]).filter(x=>x.date<=selectedDate).sort((a,b)=>b.date.localeCompare(a.date));
    return sum + (valid.length ? parseAmount(valid[0].amount) : 0);
  },0), [state.banks,selectedDate]);

  // الرصيد السابق الحقيقي = آخر رصيد مسجل لكل حساب قبل اليوم المختار.
  // لا نطرح مصروفات اليوم من الرصيد الحالي الفعلي؛ الرصيد الحالي هو الرقم المكتوب من كشف البنك.
  const previousBankBalanceTotal = useMemo(() => state.banks.reduce((sum,bank)=>{
    const previous=(bank.balances||[]).filter(x=>x.date<selectedDate).sort((a,b)=>b.date.localeCompare(a.date));
    return sum + (previous.length ? parseAmount(previous[0].amount) : 0);
  },0), [state.banks,selectedDate]);

  const totals = useMemo(() => {
    const income=dayData.incomes.reduce((s,x)=>s+parseAmount(x.amount),0);
    const expense=dayData.expenses.reduce((s,x)=>s+parseAmount(x.amount),0);
    const expectedBalance=previousBankBalanceTotal-expense;
    const unrecordedMovement=bankBalanceTotal-expectedBalance;
    return {
      income,
      expense,
      pending: dayData.pending.filter(x=>x.status!=='spent').reduce((s,x)=>s+parseAmount(x.amount),0),
      bankBalance: previousBankBalanceTotal,
      currentBalance: bankBalanceTotal,
      expectedBalance,
      unrecordedMovement
    };
  }, [dayData,bankBalanceTotal,previousBankBalanceTotal]);

  const addBlank = type => setState(s => ({
    ...s,
    [type]: [...s[type], {
      id:uid(), date:selectedDate, amount:'', statement:'', department:s.departments[0] || '', notes:'',
      ...(type === 'incomes' ? { company:'' } : {}),
      ...(type === 'pending' ? { status:'unspent', marker:'', specialist:'', isDraft:true } : {})
    }]
  }));
  const updateCell = (type,id,key,value) => {
    const safeValue = key==='date' && value>todayISO ? todayISO : value;
    setState(s => ({ ...s, [type]: s[type].map(x => x.id===id ? {...x,[key]:safeValue} : x) }));
  };
  const removeRow = async (type,id) => {
    const labels={incomes:'الحركة الواردة',expenses:'الحركة المنصرفة',pending:'المبلغ المطلوب'};
    if(!(await confirmDelete(labels[type]||'هذا السجل'))) return;
    setState(s => ({ ...s, [type]: s[type].filter(x => x.id!==id) }));
  };
  const finalizePending = id => setState(s => ({...s,pending:s.pending.map(x=>x.id===id?{...x,isDraft:false}:x)}));

  const transferPending = item => setState(s => {
    const expenseId = uid();
    return {
      ...s,
      expenses: [...s.expenses, {
        id:expenseId,
        date:selectedDate,
        amount:item.amount,
        statement:item.statement,
        department:item.department,
        notes:item.notes,
        specialist:item.specialist||'',
        marker:item.marker||'',

        sourcePendingId:item.id
      }],
      pending: s.pending.map(x => x.id===item.id ? {...x,status:'spent',expenseId,spentAt:selectedDate} : x)
    };
  });

  const partiallyPayPending = (item,requestedAmount) => {
    const current=parseAmount(item.amount);
    const pay=Math.min(current,parseAmount(requestedAmount));
    if(!pay || pay<=0) return;
    const expenseId=uid();
    setState(s=>({
      ...s,
      expenses:[...s.expenses,{
        id:expenseId,date:selectedDate,amount:String(pay),statement:item.statement,
        department:item.department,notes:item.notes,specialist:item.specialist||'',marker:item.marker||'',
        sourcePendingId:item.id,partialSettlement:true
      }],
      pending:s.pending.map(x=>{
        if(x.id!==item.id) return x;
        const remaining=Math.max(0,current-pay);
        const history=[...(x.partialPayments||[]),{id:uid(),date:selectedDate,amount:String(pay),expenseId}];
        if(remaining<=0){
          return {...x,status:'spent',spentAt:selectedDate,expenseId,amount:String(current),partialPayments:history};
        }
        return {...x,amount:String(remaining),originalAmount:x.originalAmount||String(current),partialPayments:history};
      })
    }));
  };

  const restoreExpense = expense => setState(s => {
    const pendingMatch = expense.sourcePendingId && s.pending.find(p=>p.id===expense.sourcePendingId);
    const pending = pendingMatch
      ? s.pending.map(p=>{
          if(p.id!==expense.sourcePendingId) return p;
          if(expense.partialSettlement){
            const restored=parseAmount(p.amount)+parseAmount(expense.amount);
            return {...p,amount:String(restored),status:'unspent',expenseId:null,spentAt:null,
              partialPayments:(p.partialPayments||[]).filter(pp=>pp.expenseId!==expense.id)};
          }
          return {...p,status:'unspent',expenseId:null,spentAt:null};
        })
      : [...s.pending, {
          id:uid(), date:expense.date, amount:expense.amount, statement:expense.statement,
          department:expense.department, notes:expense.notes, specialist:expense.specialist||'', marker:expense.marker||'', status:'unspent'
        }];
    return {...s, pending, expenses:s.expenses.filter(x=>x.id!==expense.id)};
  });

  const shiftDay = amount => {
    const [y,m,d] = selectedDate.split('-').map(Number);
    const dt = new Date(y,m-1,d);
    dt.setDate(dt.getDate()+amount);
    const next=toISO(dt);
    setSelectedDate(next>todayISO ? todayISO : next);
  };
  const preparePrintMode = mode => {
    document.body.dataset.printMode = mode;
    let style=document.getElementById('dynamic-print-page-style');
    if(!style){style=document.createElement('style');style.id='dynamic-print-page-style';document.head.appendChild(style);}
    const portraitModes=new Set(['pending','banks','reports','loan','loan-overview','loan-overview-category','loan-overview-single']);
    const portrait=portraitModes.has(mode);
    const pageMargin=mode==='banks'?'6mm':(portrait?'9mm':'8mm');
    style.textContent=`@page{size:A4 ${portrait?'portrait':'landscape'};margin:${pageMargin}}`;
  };
  const printReport = mode => {
    preparePrintMode(mode);
    requestAnimationFrame(()=>{
      const html=buildPrintPreviewHtml(mode);
      setPrintPreview({mode,html});
    });
  };
  const closePrintPreview = () => { setPrintPreview(null); delete document.body.dataset.printMode; };
  const executePrint = () => { if(printPreview){preparePrintMode(printPreview.mode);setTimeout(()=>window.print(),80);} };
  useEffect(()=>{
    if(!printPreview)return;
    const h=e=>{if(e.key==='Escape'){e.preventDefault();closePrintPreview();}};
    window.addEventListener('keydown',h);
    return()=>window.removeEventListener('keydown',h);
  },[printPreview]);

  const exportJson = async () => {
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: 'Financial Reports Manager',
      data: state
    };
    if (window.desktopApp?.exportJson) {
      const result = await window.desktopApp.exportJson(payload);
      if (result?.ok) {
        setToast({
          tone:'success',
          title:'تم حفظ النسخة بنجاح',
          message:result.path ? `تم حفظ النسخة في: ${result.path}` : 'تم حفظ ملف JSON بنجاح.'
        });
      } else if(result && !result.canceled) {
        setToast({
          tone:'error',
          title:'تعذر حفظ النسخة',
          message:result.error || 'حدث خطأ أثناء حفظ ملف JSON.'
        });
      }
      return;
    }
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`financial-backup-${todayISO}.json`; a.click();
    URL.revokeObjectURL(url);
    setToast({tone:'success',title:'تم حفظ النسخة الاحتياطية',message:`تم إنشاء ملف financial-backup-${todayISO}.json بنجاح.`});
  };
  const importJson = async () => {
    if(!(await requestConfirm('سيتم استبدال البيانات الحالية بالكامل بالنسخة الاحتياطية المختارة. هل تريد المتابعة؟',{title:'استيراد نسخة احتياطية',confirmText:'نعم، استيراد',cancelText:'إلغاء'}))) return;
    try {
      // Protect the current SQLite database before any JSON restore replaces its contents.
      if(window.desktopApp?.backupNow) await window.desktopApp.backupNow();
      if(window.desktopApp?.importJson){
        const result=await window.desktopApp.importJson();
        if(!result || result.canceled) return;
        if(!result.ok){setToast({tone:'error',title:'تعذر استيراد النسخة',message:result.error||'حدث خطأ أثناء الاستيراد.'});return;}
        const payload=result.data?.data ?? result.data;
        setState(normalizeState(payload));
        setToast({tone:'success',title:'تم الاستيراد بنجاح',message:'تم استيراد النسخة الاحتياطية وتحديث بيانات البرنامج.'});
        return;
      }
      const input=document.createElement('input'); input.type='file'; input.accept='.json,application/json';
      input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const parsed=JSON.parse(await file.text());setState(normalizeState(parsed.data??parsed));setToast({tone:'success',title:'تم الاستيراد بنجاح',message:'تم تحديث بيانات البرنامج من ملف JSON.'});};
      input.click();
    } catch(error){ console.error(error); setToast({tone:'error',title:'ملف غير صالح',message:'ملف JSON غير صالح أو لا يحتوي على نسخة احتياطية صحيحة.'}); }
  };

  return <div className={`app-shell theme-${theme} ${window.desktopApp?.isElectron?'desktop-shell':''}`}>
    {window.desktopApp?.isElectron && <DesktopTitleBar/>}
    <Sidebar page={page} setPage={setPage} theme={theme} onToggleTheme={()=>setTheme(t=>t==='dark'?'light':'dark')}/>
    <main className="content">
      {((centralStatus.enabled&&!centralStatus.connected)||(accessStatus.enabled&&!accessStatus.connected))&&<div className="central-offline-banner">تعذر الوصول إلى قاعدة البيانات المشتركة — تم إيقاف التعديل لحماية البيانات. افتح «الإعدادات والأقسام» لمراجعة الاتصال.</div>}
      <DateHeader selectedDate={selectedDate} setSelectedDate={setSelectedDate} shiftDay={shiftDay} onExport={exportJson} onImport={importJson}
        showEditActions={['reports','pending','purchaseOrders','banks','loans','settings','companies','suppliers'].includes(page)&&(!centralStatus.enabled||centralStatus.connected&&centralStatus.user?.role!=='viewer')&&(!accessStatus.enabled||accessStatus.connected)}
        isSectionEditing={Boolean(sectionEditing[page])}
        onEditSection={()=>setSectionEditing(s=>({...s,[page]:true}))}
        onSaveSection={()=>{
          setSectionEditing(s=>({...s,[page]:false}));
          setToast({tone:'success',title:'تم الحفظ بنجاح',message:'تم حفظ التعديلات وإغلاق وضع التعديل لهذا القسم.'});
        }}/>
      <PageErrorBoundary resetKey={page}>
        {page==='reports' && <ReportsPage state={state} data={dayData} totals={totals} filter={filter} setFilter={setFilter} addBlank={addBlank} updateCell={updateCell} removeRow={removeRow} restoreExpense={restoreExpense} isEditing={sectionEditing.reports} onPrint={()=>printReport('reports')}/>}      
        {page==='companies' && <CompaniesPage companies={state.companies||[]} isEditing={sectionEditing.companies} onChange={companies=>setState(s=>({...s,companies}))} onNotify={setToast}/>}
        {page==='incomeCollection' && <MonthlyIncomeCollectionPage incomes={state.incomes} departments={state.departments} onNotify={setToast}/>}
        {page==='incomeCollectionAggregate' && <AggregateIncomeCollectionPage incomes={state.incomes} departments={state.departments}/>}
        {page==='suppliers' && <SuppliersPage state={state} isEditing={sectionEditing.suppliers} onChange={patch=>setState(prev=>({...prev,...patch}))} onNotify={setToast}/>}
        {page==='pending' && <PendingPage state={state} data={state.pending} selectedDate={selectedDate} filter={filter} setFilter={setFilter} addBlank={addBlank} updateCell={updateCell} removeRow={removeRow} finalizePending={finalizePending} transferPending={transferPending} partiallyPayPending={partiallyPayPending} isEditing={sectionEditing.pending} onPrint={()=>printReport('pending')}/>}      
        {page==='purchaseOrders' && <PurchaseOrdersPage state={state} isEditing={sectionEditing.purchaseOrders} onChange={patch=>setState(prev=>({...prev,...patch}))} onNotify={setToast}/>}
        {page==='loans' && <LoansPage loans={state.loans} isEditing={sectionEditing.loans} onChange={updater=>setState(s=>({...s,loans:typeof updater==='function'?updater(s.loans):updater}))} onPrint={()=>printReport('loan')}/>}
        {page==='loanStats' && <LoansOverviewPage loans={state.loans} onPrint={(mode='loan-overview')=>printReport(mode)}/>}
        {page==='banks' && <BankBalancesPage banks={state.banks} departments={state.departments} selectedDate={selectedDate} isEditing={sectionEditing.banks} onChange={banks=>setState(s=>({...s,banks}))} onPrint={()=>printReport('banks')} onNotify={setToast}/>}
        {page==='settings' && <SettingsPage departments={state.departments} isEditing={sectionEditing.settings} onChange={departments=>setState(s=>({...s,departments}))} storageInfo={storageInfo} updateStatus={updateStatus}
          centralStatus={centralStatus}
          accessStatus={accessStatus}
          onConfigureCentral={async url=>{const r=await window.desktopApp?.configureCentralServer?.(url);setCentralStatus(s=>({...s,...r,connected:false}));setToast(r?.ok?{tone:'success',title:'تم الوصول إلى السيرفر',message:'العنوان صحيح. سجل الدخول الآن.'}:{tone:'error',title:'تعذر الوصول إلى السيرفر',message:r?.error||'تحقق من العنوان والشبكة.'});return Boolean(r?.ok);}}
          onLoginCentral={async credentials=>{const r=await window.desktopApp?.loginCentralServer?.(credentials);setCentralStatus(s=>({...s,...r,connected:r?.enabled?s.connected:false}));setToast(r?.ok?{tone:'success',title:'تم تسجيل الدخول',message:r.enabled?'تم تجديد جلسة الاتصال، وسيتم تحديث البيانات تلقائيًا.':`مرحبًا ${r.user?.displayName||r.user?.username||''}. اختر نقل البيانات أو استخدام بيانات السيرفر.`}:{tone:'error',title:'فشل تسجيل الدخول',message:r?.error||'تحقق من البيانات.'});return Boolean(r?.ok);}}
          onMigrateCentral={async()=>{if(!(await requestConfirm('سيتم إنشاء نسخة احتياطية من SQLite ومرفقاتها ثم نقل البيانات والمرفقات إلى السيرفر. يجب تنفيذ هذا الإجراء مرة واحدة فقط. هل تريد المتابعة؟',{title:'نقل البيانات إلى PostgreSQL',confirmText:'إنشاء نسخة ونقل البيانات',cancelText:'إلغاء'})))return;const r=await window.desktopApp?.migrateLocalToCentral?.();if(r?.ok){setState(normalizeState(r.state));setStorageInfo(r.storageInfo);setCentralStatus(s=>({...s,...r.storageInfo,enabled:true,connected:true}));setDesktopStorageReady(true);setToast({tone:'success',title:'تم نقل البيانات وتفعيل السيرفر',message:`احتُفظ بنسخة SQLite في: ${r.backupPath}${r.attachmentsBackupPath?` ونسخة المرفقات في: ${r.attachmentsBackupPath}`:''}`});}else setToast({tone:'error',title:'لم يتم نقل البيانات',message:r?.error||'لم تتغير قاعدة SQLite.'});}}
          onActivateCentral={async()=>{if(!(await requestConfirm('سيتم استخدام بيانات السيرفر بدل البيانات المحلية على هذا الجهاز. هل تريد المتابعة؟',{title:'ربط جهاز إضافي',confirmText:'استخدام بيانات السيرفر',cancelText:'إلغاء'})))return;const r=await window.desktopApp?.activateExistingCentral?.();if(r?.ok){setState(normalizeState(r.state));setStorageInfo(r.storageInfo);setCentralStatus(s=>({...s,...r.storageInfo,enabled:true,connected:true}));setDesktopStorageReady(true);setToast({tone:'success',title:'تم ربط الجهاز',message:'هذا الجهاز يعمل الآن على قاعدة PostgreSQL المشتركة.'});}else setToast({tone:'error',title:'تعذر ربط الجهاز',message:r?.error||'تحقق من السيرفر.'});}}
          onDisableCentral={async()=>{const emergency=centralStatus.enabled&&!centralStatus.connected;const message=emergency?'السيرفر غير متاح. سيتم الرجوع إلى آخر نسخة محلية محفوظة وقد لا تحتوي على أحدث تعديلات المستخدم الآخر. هل تريد فصل الطوارئ؟':'سيتم أخذ أحدث نسخة من السيرفر وحفظها في SQLite ثم إيقاف الاتصال المشترك على هذا الجهاز فقط. هل تريد المتابعة؟';if(!(await requestConfirm(message,{title:emergency?'فصل طوارئ':'العودة إلى الوضع المحلي',confirmText:emergency?'استخدام النسخة المحلية':'حفظ نسخة والعودة',cancelText:'إلغاء'})))return;const r=await window.desktopApp?.disableCentralServer?.({force:emergency});if(r?.ok){setState(normalizeState(r.state));setStorageInfo(r.storageInfo);setCentralStatus(s=>({...s,...r,enabled:false,connected:false}));setToast({tone:'success',title:'تم الرجوع إلى SQLite',message:emergency?'تم تشغيل آخر نسخة طوارئ محلية.':'تم حفظ أحدث بيانات السيرفر محليًا قبل فصل الاتصال.'});}else setToast({tone:'error',title:'تعذر إيقاف الاتصال',message:r?.error||'لم يتم تغيير وضع التخزين.'});}}
          onMigrateAccess={async()=>{if(!(await requestConfirm('اختر مكانًا واسمًا لملف Access داخل المجلد المشترك. يمكن للبرنامج إنشاء الملف، وسيأخذ نسخة من SQLite والمرفقات ثم ينقل البيانات مرة واحدة فقط.',{title:'نقل البيانات إلى Access',confirmText:'اختيار المكان ونقل البيانات',cancelText:'إلغاء'})))return;const r=await window.desktopApp?.migrateLocalToAccess?.();if(r?.canceled)return;if(r?.ok){setState(normalizeState(r.state));setStorageInfo(r.storageInfo);setAccessStatus(s=>({...s,...r.storageInfo,enabled:true,connected:true}));setDesktopStorageReady(true);setToast({tone:'success',title:'تم تفعيل قاعدة Access المشتركة',message:`القاعدة: ${r.storageInfo.databasePath} — واحتُفظ بنسخة SQLite في: ${r.backupPath}`});}else setToast({tone:'error',title:'لم يتم نقل البيانات إلى Access',message:r?.error||'لم تتغير قاعدة SQLite.'});}}
          onActivateAccess={async()=>{const r=await window.desktopApp?.activateExistingAccess?.();if(r?.canceled)return;if(r?.ok){setState(normalizeState(r.state));setStorageInfo(r.storageInfo);setAccessStatus(s=>({...s,...r.storageInfo,enabled:true,connected:true}));setDesktopStorageReady(true);setToast({tone:'success',title:'تم ربط الجهاز بقاعدة Access',message:r.storageInfo.databasePath});}else setToast({tone:'error',title:'تعذر فتح قاعدة Access',message:r?.error||'تحقق من الملف المشترك وصلاحياته.'});}}
          onDisableAccess={async()=>{const emergency=accessStatus.enabled&&!accessStatus.connected;if(!(await requestConfirm(emergency?'قاعدة Access غير متاحة. سيتم تشغيل آخر نسخة SQLite محلية وقد لا تحتوي على أحدث تعديل. هل تريد المتابعة؟':'سيتم حفظ أحدث بيانات Access محليًا وأخذ نسخة احتياطية ثم العودة إلى SQLite على هذا الجهاز.',{title:emergency?'فصل طوارئ':'العودة إلى SQLite',confirmText:emergency?'استخدام النسخة المحلية':'حفظ نسخة والعودة',cancelText:'إلغاء'})))return;const r=await window.desktopApp?.disableAccessDatabase?.({force:emergency});if(r?.ok){setState(normalizeState(r.state));setStorageInfo(r.storageInfo);setAccessStatus(s=>({...s,...r,enabled:false,connected:false}));setToast({tone:'success',title:'تم الرجوع إلى SQLite',message:emergency?'تم تشغيل آخر نسخة محلية للطوارئ.':'تم حفظ أحدث نسخة من Access قبل الفصل.'});}else setToast({tone:'error',title:'تعذر فصل Access',message:r?.error||'لم يتم تغيير قاعدة البيانات.'});}}
          onCheckUpdate={checkForUpdate} onDownloadUpdate={downloadUpdate} onSaveUpdateSettings={saveUpdateSettings}
          onShowUpdateFile={async()=>{const r=await window.desktopApp?.showDownloadedUpdate?.();if(!r?.ok)setToast({tone:'error',title:'ملف التحديث غير موجود',message:'أعد تنزيل التحديث ثم حاول مرة أخرى.'});}}
          onLaunchUpdate={async()=>{if(!(await requestConfirm('سيتم إنشاء نسخة احتياطية ثم تشغيل النسخة الجديدة وإغلاق البرنامج الحالي. هل تريد المتابعة؟',{title:'تشغيل التحديث',confirmText:'تشغيل التحديث',cancelText:'إلغاء'})))return;const r=await window.desktopApp?.launchDownloadedUpdate?.();if(!r?.ok)setToast({tone:'error',title:'تعذر تشغيل التحديث',message:r?.message||r?.error||'تعذر فتح ملف التحديث.'});}}
          onMoveDatabase={async()=>{
            const result=await window.desktopApp?.moveDatabase?.();
            if(result?.canceled)return;
            if(result?.ok){setStorageInfo(result);setToast({tone:'success',title:'تم نقل قاعدة البيانات',message:`أصبح البرنامج يعمل من: ${result.databasePath}. تم الاحتفاظ بالنسخة السابقة كنسخة أمان.`});}
            else setToast({tone:'error',title:'تعذر نقل قاعدة البيانات',message:result?.error||'حدث خطأ أثناء نقل قاعدة البيانات.'});
          }}
          onSelectDatabase={async()=>{
            const result=await window.desktopApp?.selectExistingDatabase?.();
            if(result?.canceled)return;
            if(result?.ok){
              if(result.state)setState(normalizeState(result.state));
              setStorageInfo(result);
              setToast({tone:'success',title:'تم ربط قاعدة البيانات',message:`تم فتح قاعدة البيانات: ${result.databasePath}`});
            }else setToast({tone:'error',title:'قاعدة البيانات غير صالحة',message:result?.error||'تعذر فتح قاعدة البيانات المحددة.'});
          }}
          onChangeBackupLocation={async()=>{
            const result=await window.desktopApp?.setBackupDirectory?.();
            if(result?.canceled)return;
            if(result?.ok){setStorageInfo(result);setToast({tone:'success',title:'تم تغيير مكان النسخ الاحتياطي',message:`سيتم حفظ النسخ القادمة في: ${result.backupsPath}`});}
            else setToast({tone:'error',title:'تعذر تغيير مكان النسخ',message:result?.error||'المجلد المحدد غير قابل للكتابة.'});
          }}
          onBackupNow={async()=>{
          if(!window.desktopApp?.backupNow) return;
          const result=await window.desktopApp.backupNow();
          if(result?.ok){
            setToast({tone:'success',title:'تم إنشاء نسخة من قاعدة البيانات',message:`تم حفظ النسخة الاحتياطية بنجاح${result.path?` في: ${result.path}`:''}.`});
            const info=await window.desktopApp.getStorageInfo?.();
            if(info?.ok) setStorageInfo(info);
          }else{
            setToast({tone:'error',title:'تعذر إنشاء النسخة الاحتياطية',message:result?.error||'حدث خطأ أثناء نسخ قاعدة البيانات.'});
          }
        }}/>}
      </PageErrorBoundary>      
    </main>
    {printPreview && <PrintPreviewModal mode={printPreview.mode} html={printPreview.html} onPrint={executePrint} onClose={closePrintPreview}/>} 
    <AppConfirmDialog dialog={confirmDialog} onResolve={resolveConfirm}/>
    <AppToast toast={toast} onClose={()=>setToast(null)}/>
  </div>;
}

export default App;
