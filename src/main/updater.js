'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const config = require('./config');

const FIRST_CHECK_DELAY = 30 * 1000;
const CHECK_INTERVAL = 4 * 60 * 60 * 1000;

class UpdateManager {
  constructor() {
    this.win = null;
    this.firstTimer = null;
    this.intervalTimer = null;
    this.manualCheck = false;
    this.current = {
      type: 'idle',
      message: '尚未检查更新',
      at: null,
      version: null,
      percent: 0
    };
    this.configured = false;
  }

  log(level, ...args) {
    const line = `[${new Date().toISOString()}] [${level}] ${args.map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    }).join(' ')}`;
    console[level === 'error' ? 'error' : 'log']('[updater]', ...args);
    try {
      const dir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'updater.log'), line + '\n');
    } catch { /* logging must never break the app */ }
  }

  attachWindow(win) {
    this.win = win;
  }

  send(status) {
    this.current = status;
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('update:status', status);
    }
  }

  configure() {
    if (this.configured) return;
    this.configured = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.logger = {
      info: (...args) => this.log('info', ...args),
      warn: (...args) => this.log('warn', ...args),
      error: (...args) => this.log('error', ...args),
      debug: (...args) => this.log('debug', ...args)
    };

    autoUpdater.on('checking-for-update', () => {
      const now = new Date().toISOString();
      config.setLastUpdate(now, '正在检查更新');
      this.send({ type: 'checking', message: '正在检查更新…', at: now });
    });
    autoUpdater.on('update-available', (info) => {
      const now = new Date().toISOString();
      config.setLastUpdate(now, `发现新版本 v${info.version}，正在后台下载`, info.version);
      this.send({
        type: 'available',
        message: `发现新版本 v${info.version}，正在静默下载`,
        version: info.version,
        at: now
      });
    });
    autoUpdater.on('update-not-available', (info) => {
      const now = new Date().toISOString();
      const message = `已是最新版本 v${app.getVersion()}`;
      config.setLastUpdate(now, message, app.getVersion());
      this.send({ type: 'not-available', message, version: info?.version, at: now });
    });
    autoUpdater.on('download-progress', (progress) => {
      this.send({
        type: 'download-progress',
        message: `正在下载更新 ${Math.round(progress.percent)}%`,
        percent: Math.round(progress.percent * 10) / 10,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      const now = new Date().toISOString();
      const message = `v${info.version} 已就绪，退出应用时自动安装`;
      config.setLastUpdate(now, message, info.version);
      // Deliberately no quitAndInstall() here: installation happens on quit.
      autoUpdater.autoInstallOnAppQuit = true;
      this.send({ type: 'downloaded', message, version: info.version, at: now });
    });
    autoUpdater.on('error', (error) => {
      const now = new Date().toISOString();
      const message = error?.message || String(error);
      this.log('error', 'update error', error);
      config.setLastUpdate(now, `更新检查失败：${message.slice(0, 180)}`);
      this.send({ type: 'error', message: `更新检查失败：${message.slice(0, 180)}`, at: now });
    });

    this.schedule();
  }

  clearTimers() {
    if (this.firstTimer) { clearTimeout(this.firstTimer); this.firstTimer = null; }
    if (this.intervalTimer) { clearInterval(this.intervalTimer); this.intervalTimer = null; }
  }

  schedule() {
    this.clearTimers();
    const { auto } = config.getRawSettings().updates;
    if (!auto || !app.isPackaged) return;
    this.firstTimer = setTimeout(() => {
      this.checkForUpdates(false).catch((error) => this.log('error', 'scheduled check failed', error));
    }, FIRST_CHECK_DELAY);
    this.intervalTimer = setInterval(() => {
      this.checkForUpdates(false).catch((error) => this.log('error', 'scheduled check failed', error));
    }, CHECK_INTERVAL);
  }

  setAutoEnabled(enabled) {
    if (enabled) this.schedule();
    else this.clearTimers();
    return this.getState();
  }

  async checkForUpdates(manual = true) {
    this.configure();
    if (!app.isPackaged) {
      const now = new Date().toISOString();
      const state = {
        type: 'dev',
        message: '开发模式不执行自动更新，安装包版本可用',
        at: now,
        version: app.getVersion()
      };
      this.send(state);
      return { ok: false, reason: 'development', state };
    }
    this.manualCheck = manual;
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, result: result ? { version: result.updateInfo?.version } : null };
    } catch (error) {
      this.log('error', 'manual check failed', error);
      return { ok: false, error: error?.message || String(error) };
    }
  }

  installOnQuit() {
    autoUpdater.autoInstallOnAppQuit = true;
    this.send({
      type: 'install-pending',
      message: '已设置：退出应用时安装已下载的新版本',
      at: new Date().toISOString(),
      version: this.current.version
    });
    return { ok: true, message: '已设置：退出应用时安装' };
  }

  getState() {
    const settings = config.getRawSettings();
    return {
      ...this.current,
      auto: settings.updates.auto,
      lastCheckAt: settings.updates.lastCheckAt,
      lastResult: settings.updates.lastResult,
      lastVersion: settings.updates.lastVersion,
      currentVersion: app.getVersion(),
      isPackaged: app.isPackaged
    };
  }
}

module.exports = { UpdateManager, FIRST_CHECK_DELAY, CHECK_INTERVAL };
