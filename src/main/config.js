'use strict';

const { app } = require('electron');
const Store = require('electron-store');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

const DEFAULT_SETTINGS = {
  appearance: {
    effectsEnabled: true,
    tier: 'high',
    background: {
      type: 'gradient',
      gradient: 'aurora',
      color: '#6f8cff',
      image: null
    },
    customIcon: null
  },
  ai: {
    baseUrl: 'http://127.0.0.1:9655'
  },
  updates: {
    auto: true,
    lastCheckAt: null,
    lastResult: null,
    lastVersion: null
  },
  sorts: {},
  reading: {
    direction: 'exam'
  }
};

let store = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return out;
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        base && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function getStore() {
  if (store) return store;
  store = new Store({
    name: 'lumen-settings',
    cwd: app.getPath('userData'),
    defaults: clone(DEFAULT_SETTINGS),
    clearInvalidConfig: false
  });
  return store;
}

function getRawSettings() {
  const s = getStore();
  return deepMerge(clone(DEFAULT_SETTINGS), {
    appearance: s.get('appearance'),
    ai: s.get('ai'),
    updates: s.get('updates'),
    sorts: s.get('sorts'),
    reading: s.get('reading')
  });
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value) {
  if (typeof value !== 'string' || !isValidHttpUrl(value.trim())) {
    throw new Error('API Base URL 必须是 http 或 https 地址');
  }
  return value.trim().replace(/\/+$/, '');
}

function isMediaPath(value) {
  if (typeof value !== 'string' || !value) return false;
  const mediaRoot = path.join(app.getPath('userData'), 'media');
  const resolved = path.resolve(value);
  return resolved.startsWith(path.resolve(mediaRoot) + path.sep) && fs.existsSync(resolved);
}

function toFileUrl(value) {
  if (!value) return null;
  try {
    return pathToFileURL(value).href;
  } catch {
    return null;
  }
}

/** Settings as sent to the renderer: file paths are turned into local URLs. */
function getSettings() {
  const s = getRawSettings();
  s.appearance.background.imageUrl = toFileUrl(s.appearance.background.image);
  s.appearance.customIconUrl = toFileUrl(s.appearance.customIcon);
  s.updates.currentVersion = app.getVersion();
  return s;
}

const SORT_VALUES = new Set(['newest', 'oldest', 'title', 'tagCount', 'source']);
const TIERS = new Set(['high', 'medium', 'low']);
const BACKGROUND_TYPES = new Set(['solid', 'gradient', 'image']);
const GRADIENTS = new Set(['aurora', 'dusk', 'moss', 'ember', 'mono']);
const DIRECTIONS = new Set(['exam', 'daily', 'research']);

function sanitizePatch(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('设置内容无效');
  const safe = {};

  if (patch.appearance) {
    const a = patch.appearance;
    safe.appearance = {};
    if (typeof a.effectsEnabled === 'boolean') safe.appearance.effectsEnabled = a.effectsEnabled;
    if (TIERS.has(a.tier)) safe.appearance.tier = a.tier;
    if (a.background) {
      const b = a.background;
      const bg = {};
      if (BACKGROUND_TYPES.has(b.type)) bg.type = b.type;
      if (GRADIENTS.has(b.gradient)) bg.gradient = b.gradient;
      if (typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color)) bg.color = b.color;
      safe.appearance.background = bg;
    }
  }

  if (patch.ai && patch.ai.baseUrl !== undefined) {
    safe.ai = { baseUrl: normalizeBaseUrl(patch.ai.baseUrl) };
  }

  if (patch.updates && typeof patch.updates.auto === 'boolean') {
    safe.updates = { auto: patch.updates.auto };
  }

  if (patch.reading && DIRECTIONS.has(patch.reading.direction)) {
    safe.reading = { direction: patch.reading.direction };
  }

  if (patch.sorts && typeof patch.sorts === 'object' && !Array.isArray(patch.sorts)) {
    safe.sorts = {};
    for (const [key, value] of Object.entries(patch.sorts)) {
      if (/^[a-z0-9:_-]{1,80}$/i.test(key) && SORT_VALUES.has(value)) {
        safe.sorts[key] = value;
      }
    }
  }

  return safe;
}

function updateSettings(patch) {
  const safe = sanitizePatch(patch);
  const s = getStore();
  const current = getRawSettings();
  const next = deepMerge(current, safe);

  // Image paths are controlled by the chooser in the main process only.
  next.appearance.background.image = current.appearance.background.image;
  next.appearance.customIcon = current.appearance.customIcon;

  s.set('appearance', next.appearance);
  if (safe.ai) s.set('ai', next.ai);
  if (safe.updates) s.set('updates', { ...next.updates });
  if (safe.reading) s.set('reading', next.reading);
  if (safe.sorts) s.set('sorts', next.sorts);

  return getSettings();
}

function setSetting(key, value) {
  getStore().set(key, value);
}

function setLastUpdate(at, result, version) {
  const updates = getStore().get('updates') || clone(DEFAULT_SETTINGS.updates);
  updates.lastCheckAt = at;
  updates.lastResult = result;
  if (version) updates.lastVersion = version;
  getStore().set('updates', updates);
}

module.exports = {
  DEFAULT_SETTINGS,
  getSettings,
  getRawSettings,
  updateSettings,
  setSetting,
  setLastUpdate,
  isMediaPath
};
