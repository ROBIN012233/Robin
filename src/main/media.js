'use strict';

const { app, dialog, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

function mediaDir() {
  const dir = path.join(app.getPath('userData'), 'media');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeUnlink(file) {
  if (!file) return;
  const resolved = path.resolve(file);
  const root = path.resolve(path.join(app.getPath('userData'), 'media')) + path.sep;
  if (resolved.startsWith(root) && fs.existsSync(resolved)) {
    try { fs.unlinkSync(resolved); } catch { /* ignore */ }
  }
}

async function chooseBackground(win) {
  const result = await dialog.showOpenDialog(win, {
    title: '选择封面背景图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  const source = result.filePaths[0];
  const image = nativeImage.createFromPath(source);
  if (image.isEmpty()) throw new Error('无法读取这张图片');
  const ext = path.extname(source).toLowerCase() || '.png';
  const target = path.join(mediaDir(), `cover-${Date.now()}${ext}`);
  fs.copyFileSync(source, target);

  const old = config.getRawSettings().appearance.background.image;
  // updateSettings keeps the old path, so write the new one explicitly.
  config.setSetting('appearance.background.image', target);
  config.setSetting('appearance.background.type', 'image');
  safeUnlink(old);
  return { canceled: false, settings: config.getSettings() };
}

function clearBackground() {
  const old = config.getRawSettings().appearance.background.image;
  config.setSetting('appearance.background.image', null);
  config.setSetting('appearance.background.type', 'gradient');
  safeUnlink(old);
  return config.getSettings();
}

async function chooseIcon(win) {
  const result = await dialog.showOpenDialog(win, {
    title: '选择应用图标',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  const image = nativeImage.createFromPath(result.filePaths[0]);
  if (image.isEmpty()) throw new Error('无法读取这张图片');
  const icon = image.resize({ width: 256, height: 256, quality: 'best' });
  const target = path.join(mediaDir(), `app-icon-${crypto.randomBytes(4).toString('hex')}.png`);
  fs.writeFileSync(target, icon.toPNG());
  const old = config.getRawSettings().appearance.customIcon;
  config.setSetting('appearance.customIcon', target);
  safeUnlink(old);
  if (win && !win.isDestroyed()) win.setIcon(icon);
  return { canceled: false, settings: config.getSettings() };
}

function clearIcon(win) {
  const old = config.getRawSettings().appearance.customIcon;
  config.setSetting('appearance.customIcon', null);
  safeUnlink(old);
  if (win && !win.isDestroyed()) {
    const fallback = windowIconPath();
    if (fallback && fs.existsSync(fallback)) win.setIcon(fallback);
  }
  return config.getSettings();
}

function windowIconPath() {
  const custom = config.getRawSettings().appearance.customIcon;
  if (custom && fs.existsSync(custom)) return custom;
  const packaged = path.join(process.resourcesPath, 'icon.png');
  const dev = path.join(__dirname, '..', '..', 'build', 'icon.png');
  return fs.existsSync(packaged) ? packaged : dev;
}

module.exports = {
  chooseBackground,
  clearBackground,
  chooseIcon,
  clearIcon,
  windowIconPath,
  mediaDir
};
