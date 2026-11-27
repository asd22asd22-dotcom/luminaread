import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  shell,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/app.js';
import { checkpointDb, getActiveDbPath, resolveDbPath } from '../server/db.js';
import { checkForDesktopUpdate, downloadAndApplyDesktopUpdate } from './updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

const ICON_PATH = path.join(__dirname, 'assets', 'icon.ico');
const TRAY_ICON_PATH = path.join(__dirname, 'assets', 'tray.png');
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');

let mainWindow = null;
let quickLookupWindow = null;
let tray = null;
let serverHandle = null;
let isQuitting = false;

function getStateFilePath() {
  const dbPath = getActiveDbPath() || resolveDbPath();
  return path.join(path.dirname(dbPath), 'desktop-state.json');
}

function loadWindowBounds() {
  try {
    const raw = fs.readFileSync(getStateFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      parsed.width >= 900 &&
      parsed.height >= 600
    ) {
      return parsed;
    }
  } catch {
    // Use default bounds
  }
  return { width: 1360, height: 860 };
}

function saveWindowBounds(win) {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  try {
    const bounds = win.getBounds();
    const stateFile = getStateFilePath();
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(bounds, null, 2), 'utf-8');
  } catch {
    // Ignore write failure
  }
}

function isLocalAppUrl(targetUrl, basePort) {
  try {
    const u = new URL(targetUrl);
    return (
      (u.hostname === '127.0.0.1' || u.hostname === 'localhost') &&
      Number(u.port) === Number(basePort)
    );
  } catch {
    return false;
  }
}

function showMainWindow(routePayload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (routePayload) {
    mainWindow.webContents.send('desktop:navigate', routePayload);
  }
}

function createMainWindow() {
  const bounds = loadWindowBounds();
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1040,
    minHeight: 680,
    title: 'LuminaRead · 流光精读',
    icon: ICON_PATH,
    backgroundColor: '#060914',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#070b17',
      symbolColor: '#e2e8f0',
      height: 38,
    },
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  let saveTimer = null;
  const scheduleBoundsSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowBounds(mainWindow), 300);
  };
  mainWindow.on('resize', scheduleBoundsSave);
  mainWindow.on('move', scheduleBoundsSave);

  mainWindow.on('close', (event) => {
    saveWindowBounds(mainWindow);
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocalAppUrl(url, serverHandle.port)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isLocalAppUrl(url, serverHandle.port)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(`${serverHandle.url}/`);
}

function createQuickLookupWindow() {
  if (quickLookupWindow && !quickLookupWindow.isDestroyed()) {
    return quickLookupWindow;
  }

  quickLookupWindow = new BrowserWindow({
    width: 560,
    height: 440,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  quickLookupWindow.on('blur', () => {
    if (quickLookupWindow && !quickLookupWindow.isDestroyed() && quickLookupWindow.isVisible()) {
      quickLookupWindow.hide();
    }
  });

  quickLookupWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      quickLookupWindow?.hide();
    }
  });

  quickLookupWindow.loadURL(`${serverHandle.url}/?mode=quick-lookup`);
  return quickLookupWindow;
}

function toggleQuickLookupWindow() {
  const win = createQuickLookupWindow();
  if (win.isVisible()) {
    win.hide();
    return;
  }
  win.center();
  win.show();
  win.focus();
  win.webContents.send('desktop:navigate', { focusLookup: true });
}

function createTray() {
  const trayImg = nativeImage.createFromPath(TRAY_ICON_PATH);
  tray = new Tray(trayImg);
  tray.setToolTip('LuminaRead 流光精读 · 考研英文精读软件');

  const rebuildMenu = () => {
    const pinned = mainWindow && !mainWindow.isDestroyed() ? mainWindow.isAlwaysOnTop() : false;
    const menu = Menu.buildFromTemplate([
      {
        label: '打开流光精读主界面',
        click: () => showMainWindow(),
      },
      {
        label: '快捷悬浮查词 (Ctrl+Alt+D)',
        click: () => toggleQuickLookupWindow(),
      },
      {
        label: '进入 SM-2 间隔复习',
        click: () => showMainWindow({ view: 'review' }),
      },
      {
        label: '打开生词与笔记库',
        click: () => showMainWindow({ view: 'notes' }),
      },
      { type: 'separator' },
      {
        label: pinned ? '✓ 窗口置顶中' : '窗口置顶',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setAlwaysOnTop(!pinned);
            rebuildMenu();
          }
        },
      },
      {
        label: '打开本地数据目录',
        click: () => {
          const dbDir = path.dirname(getActiveDbPath() || resolveDbPath());
          shell.openPath(dbDir);
        },
      },
      { type: 'separator' },
      {
        label: '退出流光精读',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(menu);
  };

  rebuildMenu();
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      showMainWindow();
    } else if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      showMainWindow();
    }
  });
}

function registerIpcHandlers() {
  ipcMain.handle('dialog:pickFolder', async () => {
    const target = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const res = await dialog.showOpenDialog(target, {
      title: '选择包含英文精读文章的文件夹',
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('dialog:pickFiles', async () => {
    const target = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const res = await dialog.showOpenDialog(target, {
      title: '选择要导入的英文或 Markdown 文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Markdown / Text', extensions: ['md', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) return [];
    return res.filePaths.map((fp) => ({
      name: path.basename(fp),
      content: fs.readFileSync(fp, 'utf-8'),
    }));
  });

  ipcMain.handle('app:openDataFolder', async () => {
    const dbDir = path.dirname(getActiveDbPath() || resolveDbPath());
    await shell.openPath(dbDir);
    return dbDir;
  });

  ipcMain.handle('app:backupDatabase', async () => {
    const dbPath = getActiveDbPath() || resolveDbPath();
    const today = new Date().toISOString().slice(0, 10);
    const target = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const res = await dialog.showSaveDialog(target, {
      title: '备份 LuminaRead 本地学习数据库',
      defaultPath: `LuminaRead_backup_${today}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    if (serverHandle?.db) {
      checkpointDb(serverHandle.db);
    }
    fs.copyFileSync(dbPath, res.filePath);
    return { canceled: false, filePath: res.filePath };
  });

  ipcMain.handle('window:toggleAlwaysOnTop', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const next = !mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(next);
    return next;
  });

  ipcMain.handle('window:getAlwaysOnTop', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return mainWindow.isAlwaysOnTop();
  });

  ipcMain.handle('window:setTitleBarTheme', (_event, theme) => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.setTitleBarOverlay) return;
    if (theme === 'light') {
      mainWindow.setTitleBarOverlay({
        color: '#e6effe',
        symbolColor: '#0f172a',
        height: 38,
      });
    } else {
      mainWindow.setTitleBarOverlay({
        color: '#070b17',
        symbolColor: '#e2e8f0',
        height: 38,
      });
    }
  });

  ipcMain.handle('window:openQuickLookup', () => {
    toggleQuickLookupWindow();
  });

  ipcMain.handle('window:closeQuickLookup', () => {
    if (quickLookupWindow && !quickLookupWindow.isDestroyed()) {
      quickLookupWindow.hide();
    }
  });

  ipcMain.handle('updater:getVersion', () => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf-8'));
      return pkg.version || app.getVersion();
    } catch {
      return app.getVersion();
    }
  });

  ipcMain.handle('updater:check', async (_event, feedUrl) => {
    let currentVersion = '1.2.0';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf-8'));
      if (pkg?.version) currentVersion = pkg.version;
    } catch {
      currentVersion = app.getVersion();
    }
    return await checkForDesktopUpdate(currentVersion, feedUrl, {
      fetchImpl: net.fetch.bind(net),
    });
  });

  ipcMain.handle('updater:install', async (_event, updateInfo) => {
    const dbPath = getActiveDbPath() || resolveDbPath();
    const dataDir = path.dirname(dbPath);
    const exeName = path.basename(process.execPath).toLowerCase();
    const isPackaged =
      app.isPackaged || (exeName !== 'electron.exe' && exeName !== 'node.exe');

    return await downloadAndApplyDesktopUpdate({
      updateInfo,
      appRoot: APP_ROOT,
      exePath: process.execPath,
      dataDir,
      isPackaged,
      fetchImpl: net.fetch.bind(net),
      onProgress: (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:progress', payload);
        }
      },
      onBeforeQuit: () => {
        isQuitting = true;
        setTimeout(() => {
          try {
            if (serverHandle?.db) checkpointDb(serverHandle.db);
            serverHandle?.server?.close();
          } catch {
            // ignore
          }
          app.quit();
        }, 350);
      },
    });
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    // Allow app root resolution consistently in packaged and dev modes
    if (!fs.existsSync(path.join(APP_ROOT, 'web', 'dist'))) {
      console.error('Warning: web/dist not found; run npm run build:web first.');
    }

    serverHandle = await startServer({
      port: 3456,
      host: '0.0.0.0',
      allowPortFallback: true,
      openBrowser: false,
    });

    registerIpcHandlers();
    createMainWindow();
    createTray();

    globalShortcut.register('CommandOrControl+Alt+D', () => {
      toggleQuickLookupWindow();
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    globalShortcut.unregisterAll();
    try {
      if (serverHandle?.db) checkpointDb(serverHandle.db);
      serverHandle?.server?.close();
    } catch {
      // Ignore shutdown cleanup error
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) {
      app.quit();
    }
  });
}
