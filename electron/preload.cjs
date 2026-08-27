const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  isElectron: true,
  getVersion: () => ipcRenderer.invoke('desktop:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('update:get-status'),
  saveUpdateSettings: (value) => ipcRenderer.invoke('update:save-settings', value),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  showDownloadedUpdate: () => ipcRenderer.invoke('update:show-file'),
  launchDownloadedUpdate: () => ipcRenderer.invoke('update:launch'),
  onUpdateProgress: (callback) => { const listener=(_event,value)=>callback(value); ipcRenderer.on('update:progress',listener); return ()=>ipcRenderer.removeListener('update:progress',listener); },
  loadState: () => ipcRenderer.invoke('desktop:get-state'),
  saveState: (state) => ipcRenderer.invoke('desktop:save-state', state),
  getStorageInfo: () => ipcRenderer.invoke('desktop:get-storage-info'),
  backupNow: () => ipcRenderer.invoke('desktop:backup-now'),
  moveDatabase: () => ipcRenderer.invoke('desktop:move-database'),
  selectExistingDatabase: () => ipcRenderer.invoke('desktop:select-existing-database'),
  setBackupDirectory: () => ipcRenderer.invoke('desktop:set-backup-directory'),
  exportJson: (payload) => ipcRenderer.invoke('export-json', payload),
  importJson: () => ipcRenderer.invoke('import-json'),
  exportPdf: (payload) => ipcRenderer.invoke('export-pdf', payload),
  minimizeWindow: () => ipcRenderer.invoke('desktop:window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('desktop:window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('desktop:window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('desktop:window-is-maximized')
});
