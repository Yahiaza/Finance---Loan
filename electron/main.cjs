const { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const database = require('./database.cjs');
const updateManager = require('./update-manager.cjs');
const centralClient = require('./central-client.cjs');
const accessClient = require('./access-client.cjs');

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
if (process.platform === 'win32') app.setAppUserModelId('com.yahia.financialreports');

// Prevent opening two copies that could write the same financial data at the same time.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;
let tray = null;

const windowFile = () => path.join(app.getPath('userData'), 'window-state.json');

function getAppIconPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'financial-app-icon.ico');
  return path.join(__dirname, '..', 'build', 'icon.ico');
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray && !tray.isDestroyed()) return tray;
  const iconPath = getAppIconPath();
  let trayIcon = nativeImage.createFromPath(iconPath);
  if (trayIcon.isEmpty()) {
    const fallback = app.isPackaged
      ? path.join(process.resourcesPath, 'financial-app-icon.png')
      : path.join(__dirname, '..', 'build', 'icon.png');
    trayIcon = nativeImage.createFromPath(fallback);
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('الإدارة المالية');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'فتح الإدارة المالية', click: showMainWindow },
    { type: 'separator' },
    { label: 'خروج', click: () => app.quit() }
  ]));
  tray.on('double-click', showMainWindow);
  return tray;
}


function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error('Failed to read JSON:', file, error);
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function safeWindowState() {
  const saved = readJson(windowFile(), {});
  return {
    width: Number(saved?.width) || 1440,
    height: Number(saved?.height) || 900,
    x: Number.isFinite(saved?.x) ? saved.x : undefined,
    y: Number.isFinite(saved?.y) ? saved.y : undefined,
    maximized: Boolean(saved?.maximized)
  };
}

function createWindow() {
  const saved = safeWindowState();
  const options = {
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#eef3f8',
    autoHideMenuBar: true,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  };

  options.icon = getAppIconPath();

  const win = new BrowserWindow(options);
  mainWindow = win;

  if (saved.maximized) win.maximize();

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch(error => {
      console.error('Failed to load packaged renderer:', error);
    });
  }

  // Keep the desktop app inside its own trusted local UI.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:') && !url.startsWith('http://localhost:5173')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer did-fail-load:', { errorCode, errorDescription, validatedURL });
  });

  // Context menu for user selections and editable fields.
  // Copy is shown only when there is a selection. Paste is shown only
  // when Chromium reports that the target is editable and can accept paste.
  win.webContents.on('context-menu', (_event, params) => {
    const template = [];
    if (String(params.selectionText || '').length > 0 && params.editFlags?.canCopy) {
      template.push({ label: 'نسخ', role: 'copy' });
    }
    if (params.isEditable && params.editFlags?.canPaste) {
      template.push({ label: 'لصق', role: 'paste' });
    }
    if (template.length) Menu.buildFromTemplate(template).popup({ window: win });
  });

  let windowSaveTimer;
  const saveWindow = () => {
    clearTimeout(windowSaveTimer);
    windowSaveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
      try { writeJsonAtomic(windowFile(), { ...bounds, maximized: win.isMaximized() }); } catch (e) { console.error(e); }
    }, 250);
  };
  win.on('resize', saveWindow);
  win.on('move', saveWindow);
  win.on('maximize', saveWindow);
  win.on('unmaximize', saveWindow);
  win.on('close', () => {
    clearTimeout(windowSaveTimer);
    if (!win.isDestroyed()) {
      const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
      try { writeJsonAtomic(windowFile(), { ...bounds, maximized: win.isMaximized() }); } catch {}
    }
  });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
}

ipcMain.handle('export-pdf', async (_event, payload = {}) => {
  let printWindow = null;
  let tempHtml = null;
  try {
    const html = String(payload?.html || '');
    if (!html.trim()) return { ok:false, error:'لا توجد بيانات صالحة لتصدير PDF.' };
    const suggestedName = String(payload?.suggestedName || 'financial-report.pdf').replace(/[\\/:*?"<>|]+/g, '-');
    const save = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير التقرير PDF',
      defaultPath: suggestedName.toLowerCase().endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`,
      filters: [{ name:'PDF', extensions:['pdf'] }]
    });
    if (save.canceled || !save.filePath) return { ok:false, canceled:true };

    tempHtml = path.join(app.getPath('temp'), `financial-report-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(tempHtml, html, 'utf8');
    printWindow = new BrowserWindow({
      show:false,
      backgroundColor:'#ffffff',
      webPreferences:{ contextIsolation:true, nodeIntegration:false, sandbox:true }
    });
    await printWindow.loadFile(tempHtml);
    await new Promise(resolve => setTimeout(resolve, 180));
    const pdf = await printWindow.webContents.printToPDF({
      printBackground:true,
      preferCSSPageSize:true,
      pageSize:'A4'
    });
    fs.writeFileSync(save.filePath, pdf);
    return { ok:true, path:save.filePath };
  } catch (error) {
    console.error('Failed to export PDF:', error);
    return { ok:false, error:error.message };
  } finally {
    try { if (printWindow && !printWindow.isDestroyed()) printWindow.destroy(); } catch {}
    try { if (tempHtml && fs.existsSync(tempHtml)) fs.unlinkSync(tempHtml); } catch {}
  }
});

ipcMain.handle('purchase-orders:select-attachment', async (_event, kind = 'order') => {
  try {
    const transfer = kind === 'transfer';
    const result = await dialog.showOpenDialog(mainWindow, {
      title: transfer ? 'اختر صورة أو ملف PDF للتحويل' : 'اختر صورة أو ملف PDF لطلب الشراء',
      properties:['openFile'],
      filters: [{name:'الصور وملفات PDF',extensions:['pdf','png','jpg','jpeg','webp']}]
    });
    if(result.canceled || !result.filePaths?.[0]) return {ok:false,canceled:true};
    const source=result.filePaths[0];
    if(centralClient.publicStatus().enabled){
      const attachment=await centralClient.uploadFile(source,path.basename(source));
      return {ok:true,attachment};
    }
    if(accessClient.publicStatus().enabled){
      return {ok:true,attachment:accessClient.copyAttachment(source,path.basename(source))};
    }
    const attachmentDir=path.join(database.paths().dataDir,'purchase-order-attachments');
    fs.mkdirSync(attachmentDir,{recursive:true});
    const ext=path.extname(source).toLowerCase();
    const base=path.basename(source,ext).replace(/[^\p{L}\p{N}._-]+/gu,'-').slice(0,70)||'attachment';
    const target=path.join(attachmentDir,`${Date.now()}-${Math.random().toString(36).slice(2,8)}-${base}${ext}`);
    fs.copyFileSync(source,target);
    return {ok:true,attachment:{name:path.basename(source),path:target,type:ext==='.pdf'?'pdf':'image',addedAt:new Date().toISOString()}};
  } catch(error) {
    return {ok:false,error:error.message};
  }
});

ipcMain.handle('purchase-orders:open-attachment', async (_event, attachment) => {
  try {
    if(attachment?.remote&&attachment?.id){
      const downloaded=await centralClient.downloadAttachment(attachment.id,attachment.name);
      const error=await shell.openPath(downloaded);
      return error?{ok:false,error}:{ok:true};
    }
    const resolved=path.resolve(String(attachment?.path||attachment||''));
    if(!fs.existsSync(resolved)) return {ok:false,error:'الملف المرفق غير موجود في مكانه المحفوظ.'};
    const error=await shell.openPath(resolved);
    return error?{ok:false,error}:{ok:true};
  } catch(error) {
    return {ok:false,error:error.message};
  }
});

ipcMain.handle('desktop:get-state', async () => {
  try {
    await database.initialize();
    if(centralClient.publicStatus().enabled){
      if(accessClient.publicStatus().enabled)accessClient.setEnabled(false);
      const remote=await centralClient.loadState();
      database.saveState(remote.state,{source:'central-cache-load'});
      const local=database.getStorageInfo();
      return {ok:true,state:remote.state,storageInfo:{backend:'postgresql',schemaVersion:'central-1',lastSavedAt:remote.updatedAt,summary:database.getStateSummary(remote.state),localCachePath:local.databasePath,...centralClient.publicStatus()}};
    }
    if(accessClient.publicStatus().enabled){
      const remote=await accessClient.loadState();
      database.saveState(remote.state,{source:'access-cache-load'});
      const local=database.getStorageInfo();
      accessClient.backupIfDue(local.backupsPath).catch(error=>console.error('Access daily backup failed:',error));
      return {ok:true,state:remote.state,storageInfo:{backend:'access',engine:'Microsoft ACE 16.0',schemaVersion:'access-1',lastSavedAt:remote.updatedAt,summary:database.getStateSummary(remote.state),localCachePath:local.databasePath,backupsPath:local.backupsPath,...accessClient.publicStatus()}};
    }
    const storageInfo = database.getStorageInfo();
    if (storageInfo?.migration?.failed) {
      return { ok:false, error:storageInfo.migration.error || 'تعذر ترقية البيانات القديمة إلى قاعدة البيانات.', storageInfo };
    }
    return { ok:true, state:database.loadState(), storageInfo };
  } catch (error) {
    console.error('Failed to load SQLite app state:', error);
    const central=centralClient.publicStatus(),access=accessClient.publicStatus();
    if(access.enabled)accessClient.markDisconnected();
    return {ok:false,error:error.message,storageInfo:central.enabled?{backend:'postgresql',schemaVersion:'central-1',...central}:access.enabled?{backend:'access',schemaVersion:'access-1',...access,connected:false}:null};
  }
});

ipcMain.handle('desktop:save-state', async (_event, state) => {
  try {
    await database.initialize();
    if(centralClient.publicStatus().enabled){
      const result=await centralClient.saveState(state);
      if(!result.ok)return result;
      database.saveState(result.state,{source:'central-cache-save'});
      return {ok:true,state:result.state,revision:result.revision,merged:result.merged,summary:database.getStateSummary(result.state)};
    }
    if(accessClient.publicStatus().enabled){
      const result=await accessClient.saveState(state);
      if(!result.ok)return result;
      database.saveState(result.state,{source:'access-cache-save'});
      return {ok:true,state:result.state,revision:result.revision,merged:result.merged,summary:database.getStateSummary(result.state)};
    }
    const summary = database.saveState(state, { source: 'renderer-state' });
    return { ok: true, summary };
  } catch (error) {
    if(accessClient.publicStatus().enabled)accessClient.markDisconnected();
    console.error('Failed to save app state:', error);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('desktop:get-storage-info', async () => {
  try {
    await database.initialize();
    if(centralClient.publicStatus().enabled){
      const local=database.getStorageInfo();
      return {ok:true,backend:'postgresql',schemaVersion:'central-1',summary:local.summary,localCachePath:local.databasePath,...centralClient.publicStatus()};
    }
    if(accessClient.publicStatus().enabled){
      const local=database.getStorageInfo();
      return {ok:true,backend:'access',engine:'Microsoft ACE 16.0',schemaVersion:'access-1',summary:local.summary,localCachePath:local.databasePath,backupsPath:local.backupsPath,...accessClient.publicStatus()};
    }
    return { ok: true, ...database.getStorageInfo() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('central:get-status',()=>({ok:true,...centralClient.publicStatus()}));
ipcMain.handle('central:configure',async(_event,serverUrl)=>{try{const status=centralClient.configure(serverUrl);const health=await centralClient.health();return {ok:true,...status,health};}catch(error){return {ok:false,error:error.message,...centralClient.publicStatus()}}});
ipcMain.handle('central:login',async(_event,credentials)=>{try{return await centralClient.login(credentials?.username,credentials?.password)}catch(error){return {ok:false,error:error.message,...centralClient.publicStatus()}}});
ipcMain.handle('central:migrate-local',async()=>{try{
  if(accessClient.publicStatus().enabled)throw new Error('أوقف وضع Access أولًا قبل تفعيل PostgreSQL.');
  await database.initialize();
  const backup=await database.createBackup('before-central-migration',true);
  if(!backup?.ok)throw new Error(backup?.error||'تعذر إنشاء نسخة أمان قبل النقل.');
  const localState=database.loadState();
  const result=await centralClient.importState(localState);
  database.saveState(result.state,{source:'central-initial-cache'});
  return {ok:true,state:result.state,backupPath:backup.path,attachmentsBackupPath:backup.attachmentsPath,storageInfo:{backend:'postgresql',schemaVersion:'central-1',summary:database.getStateSummary(result.state),localCachePath:database.getStorageInfo().databasePath,...centralClient.publicStatus()}};
}catch(error){return {ok:false,error:error.message,...centralClient.publicStatus()}}});
ipcMain.handle('central:activate-existing',async()=>{try{if(accessClient.publicStatus().enabled)throw new Error('أوقف وضع Access أولًا قبل تفعيل PostgreSQL.');const result=await centralClient.loadState();centralClient.setEnabled(true);await database.initialize();database.saveState(result.state,{source:'central-existing-cache'});return {ok:true,state:result.state,storageInfo:{backend:'postgresql',schemaVersion:'central-1',summary:database.getStateSummary(result.state),localCachePath:database.getStorageInfo().databasePath,...centralClient.publicStatus()}}}catch(error){return {ok:false,error:error.message,...centralClient.publicStatus()}}});
ipcMain.handle('central:disable',async(_event,options={})=>{try{
  await database.initialize();
  if(centralClient.publicStatus().enabled&&!options.force){const remote=await centralClient.loadState();database.saveState(remote.state,{source:'central-disable-snapshot'});await database.createBackup('central-disable',true);}
  centralClient.setEnabled(false);return {ok:true,state:database.loadState(),storageInfo:database.getStorageInfo(),...centralClient.publicStatus()};
}catch(error){return {ok:false,error:error.message,...centralClient.publicStatus()}}});
ipcMain.handle('central:sync-state',async(_event,state)=>{try{if(!centralClient.publicStatus().enabled)return {ok:true,unchanged:true};const result=await centralClient.syncState(state);if(result.ok&&result.state){await database.initialize();database.saveState(result.state,{source:'central-sync-cache'});}return result}catch(error){return {ok:false,error:error.message,...centralClient.publicStatus()}}});

ipcMain.handle('access:get-status',()=>({ok:true,...accessClient.publicStatus()}));
ipcMain.handle('access:migrate-local',async()=>{try{
  if(centralClient.publicStatus().enabled)throw new Error('أوقف وضع PostgreSQL أولًا قبل تفعيل Access.');
  const pick=await dialog.showSaveDialog(mainWindow,{title:'اختر مكان قاعدة Access المشتركة',defaultPath:'finance-shared.accdb',filters:[{name:'Microsoft Access Database',extensions:['accdb']}]});
  if(pick.canceled||!pick.filePath)return {ok:false,canceled:true};
  await database.initialize();
  const backup=await database.createBackup('before-access-migration',true);if(!backup?.ok)throw new Error(backup?.error||'تعذر إنشاء نسخة أمان قبل النقل.');
  const result=await accessClient.migrate(database.loadState(),pick.filePath);
  database.saveState(result.state,{source:'access-initial-cache'});
  const local=database.getStorageInfo();return {ok:true,state:result.state,backupPath:backup.path,attachmentsBackupPath:backup.attachmentsPath,storageInfo:{backend:'access',engine:'Microsoft ACE 16.0',schemaVersion:'access-1',summary:database.getStateSummary(result.state),localCachePath:local.databasePath,backupsPath:local.backupsPath,...accessClient.publicStatus()}};
}catch(error){return {ok:false,error:error.message,...accessClient.publicStatus()}}});
ipcMain.handle('access:activate-existing',async()=>{try{
  if(centralClient.publicStatus().enabled)throw new Error('أوقف وضع PostgreSQL أولًا قبل تفعيل Access.');
  const pick=await dialog.showOpenDialog(mainWindow,{title:'اختر قاعدة Access المشتركة',properties:['openFile'],filters:[{name:'Microsoft Access Database',extensions:['accdb']}]});
  if(pick.canceled||!pick.filePaths?.[0])return {ok:false,canceled:true};
  const result=await accessClient.activate(pick.filePaths[0]);await database.initialize();database.saveState(result.state,{source:'access-existing-cache'});
  const local=database.getStorageInfo();return {ok:true,state:result.state,storageInfo:{backend:'access',engine:'Microsoft ACE 16.0',schemaVersion:'access-1',summary:database.getStateSummary(result.state),localCachePath:local.databasePath,backupsPath:local.backupsPath,...accessClient.publicStatus()}};
}catch(error){return {ok:false,error:error.message,...accessClient.publicStatus()}}});
ipcMain.handle('access:disable',async(_event,options={})=>{try{
  await database.initialize();
  if(accessClient.publicStatus().enabled&&!options.force){const remote=await accessClient.loadState();database.saveState(remote.state,{source:'access-disable-snapshot'});await accessClient.backup(database.paths().backupsDir);await database.createBackup('access-disable',true);}
  accessClient.setEnabled(false);return {ok:true,state:database.loadState(),storageInfo:database.getStorageInfo(),...accessClient.publicStatus()};
}catch(error){return {ok:false,error:error.message,...accessClient.publicStatus()}}});
ipcMain.handle('access:sync-state',async(_event,state)=>{try{if(!accessClient.publicStatus().enabled)return {ok:true,unchanged:true};const result=await accessClient.syncState(state);if(result.ok&&result.state){await database.initialize();database.saveState(result.state,{source:'access-sync-cache'});}return result}catch(error){accessClient.markDisconnected();return {ok:false,error:error.message,...accessClient.publicStatus()}}});

ipcMain.handle('desktop:backup-now', async () => {
  try {
    await database.initialize();
    if(accessClient.publicStatus().enabled)return await accessClient.backup(database.paths().backupsDir);
    return await database.createBackup('manual', true);
  } catch (error) {
    return { ok: false, error: error.message };
  }
});


ipcMain.handle('desktop:move-database', async () => {
  try {
    await database.initialize();
    const current = database.getStorageInfo();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختر المجلد الجديد لقاعدة البيانات',
      defaultPath: current.databaseDirectory || current.databasePath,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok:false, canceled:true };
    return await database.moveDatabaseTo(result.filePaths[0]);
  } catch (error) {
    console.error('Failed to move database:', error);
    return { ok:false, error:error.message };
  }
});

ipcMain.handle('desktop:select-existing-database', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختيار قاعدة بيانات موجودة',
      properties: ['openFile'],
      filters: [
        { name:'Financial Manager Database', extensions:['db','sqlite','sqlite3'] },
        { name:'All files', extensions:['*'] }
      ]
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok:false, canceled:true };
    return await database.useExistingDatabase(result.filePaths[0]);
  } catch (error) {
    console.error('Failed to select database:', error);
    return { ok:false, error:error.message };
  }
});

ipcMain.handle('desktop:set-backup-directory', async () => {
  try {
    await database.initialize();
    const current = database.getStorageInfo();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختر مجلد النسخ الاحتياطية',
      defaultPath: current.backupsPath,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok:false, canceled:true };
    const saved=database.setBackupDirectory(result.filePaths[0]);
    if(accessClient.publicStatus().enabled)return {ok:true,backend:'access',engine:'Microsoft ACE 16.0',schemaVersion:'access-1',summary:saved.summary,localCachePath:saved.databasePath,backupsPath:saved.backupsPath,...accessClient.publicStatus()};
    return saved;
  } catch (error) {
    console.error('Failed to set backup directory:', error);
    return { ok:false, error:error.message };
  }
});



// V3.1.0 — Portable automatic updates from GitHub Releases.
ipcMain.handle('update:get-status', () => ({ ok:true, ...updateManager.getStatus() }));
ipcMain.handle('update:save-settings', (_event, value={}) => {
  try { return { ok:true, source:updateManager.saveSettings(value), ...updateManager.getStatus() }; }
  catch(error){ return { ok:false, error:error.message }; }
});
ipcMain.handle('update:check', async () => {
  const result=await updateManager.check();
  return { ok:Boolean(result.success), ...result };
});
ipcMain.handle('update:download', async () => {
  const result=await updateManager.download(value=>{
    if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:progress', value);
  });
  return { ok:Boolean(result.success), ...result };
});
ipcMain.handle('update:show-file', () => ({ ok:updateManager.showDownloaded() }));
ipcMain.handle('update:launch', async () => {
  try {
    // Extra safety snapshot before starting a newer portable build.
    await database.initialize();
    try { await database.createBackup('before-update', true); } catch {}
    const result=await updateManager.launchDownloaded();
    if(result.success) setTimeout(()=>app.quit(),700);
    return { ok:Boolean(result.success), ...result };
  } catch(error){ return { ok:false, error:error.message }; }
});

ipcMain.handle('desktop:get-version', () => app.getVersion());
ipcMain.handle('desktop:window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  return true;
});
ipcMain.handle('desktop:window-toggle-maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('desktop:window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  return true;
});
ipcMain.handle('desktop:window-is-maximized', () => Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized()));

ipcMain.handle('export-json', async (_event, payload) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'حفظ نسخة احتياطية من البيانات',
    defaultPath: `financial-backup-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    writeJsonAtomic(result.filePath, payload);
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});


ipcMain.handle('import-json', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'استيراد نسخة احتياطية JSON',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
  try {
    const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    return { ok: true, data: parsed, path: result.filePaths[0] };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  try {
    await database.initialize();
    console.log('SQLite storage ready:', database.getStorageInfo().databasePath);
  } catch (error) {
    console.error('SQLite initialization failed:', error);
  }
  createTray();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
  database.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
