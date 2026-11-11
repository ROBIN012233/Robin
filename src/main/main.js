'use strict';

const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');
const db = require('./db');
const config = require('./config');
const media = require('./media');
const { registerIpc } = require('./ipc');
const { BatchImporter } = require('./import-service');
const { UpdateManager } = require('./updater');

app.setName('Lumen English');
app.setAppUserModelId('com.lumen.english');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;
  let batch = null;
  const updater = new UpdateManager();

  function sendBatch(snapshot) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('batch:progress', snapshot);
    }
  }

  function createWindow() {
    const preload = path.join(__dirname, '..', 'preload', 'preload.js');
    const webviewPreload = path.join(__dirname, '..', 'preload', 'webview-preload.js');
    const icon = media.windowIconPath();

    mainWindow = new BrowserWindow({
      width: 1360,
      height: 860,
      minWidth: 1080,
      minHeight: 700,
      show: false,
      title: 'Lumen English',
      backgroundColor: '#080a10',
      icon: icon || undefined,
      autoHideMenuBar: true,
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: true,
        spellcheck: false,
        webSecurity: true
      }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('file://')) event.preventDefault();
    });

    mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
      const src = String(params.src || '');
      if (src && src !== 'about:blank') {
        try {
          const parsed = new URL(src);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            event.preventDefault();
            return;
          }
        } catch {
          event.preventDefault();
          return;
        }
      }
      webPreferences.preload = webviewPreload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      webPreferences.webSecurity = true;
      delete webPreferences.preloadURL;
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    return mainWindow;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (contents.getType() === 'webview') {
        try {
          const parsed = new URL(url);
          if (!['http:', 'https:'].includes(parsed.protocol)) event.preventDefault();
        } catch {
          event.preventDefault();
        }
      }
    });
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    db.initialize();

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', (event) => {
      // The app has no download feature; keep the sandbox small.
      event.preventDefault();
    });

    batch = new BatchImporter({ onUpdate: sendBatch });
    registerIpc({ getWindow: () => mainWindow, updater, batch });
    createWindow();
    updater.attachWindow(mainWindow);
    updater.configure();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        updater.attachWindow(mainWindow);
      }
    });
  }).catch((error) => {
    console.error('[main] startup failed', error);
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    if (batch) batch.cancel();
  });

  app.on('will-quit', () => {
    db.close();
  });
}
