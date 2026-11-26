const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('luminareadDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: '1.1.0',

  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  backupDatabase: () => ipcRenderer.invoke('app:backupDatabase'),
  getAppVersion: () => ipcRenderer.invoke('updater:getVersion'),
  checkForUpdate: (feedUrl) => ipcRenderer.invoke('updater:check', feedUrl),
  downloadAndInstallUpdate: (updateInfo) => ipcRenderer.invoke('updater:install', updateInfo),
  onUpdateProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },

  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:getAlwaysOnTop'),
  setTitleBarTheme: (theme) => ipcRenderer.invoke('window:setTitleBarTheme', theme),

  openQuickLookup: () => ipcRenderer.invoke('window:openQuickLookup'),
  closeQuickLookup: () => ipcRenderer.invoke('window:closeQuickLookup'),

  onNavigate: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop:navigate', handler);
    return () => ipcRenderer.removeListener('desktop:navigate', handler);
  },
});
