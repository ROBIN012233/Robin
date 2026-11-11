'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function cleanMessage(error) {
  const raw = String(error?.message || error || '操作失败');
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
}

async function invoke(channel, ...args) {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    const next = new Error(cleanMessage(error));
    next.code = error?.code;
    throw next;
  }
}

function on(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  app: {
    info: () => invoke('app:info')
  },
  settings: {
    get: () => invoke('settings:get'),
    update: (patch) => invoke('settings:update', patch),
    chooseBackground: () => invoke('settings:choose-background'),
    clearBackground: () => invoke('settings:clear-background'),
    chooseIcon: () => invoke('settings:choose-icon'),
    clearIcon: () => invoke('settings:clear-icon')
  },
  contents: {
    list: (options) => invoke('contents:list', options),
    get: (id) => invoke('contents:get', id),
    create: (input) => invoke('contents:create', input),
    update: (id, input) => invoke('contents:update', id, input),
    remove: (id) => invoke('contents:remove', id),
    setHidden: (id, hidden) => invoke('contents:set-hidden', id, hidden),
    tagCounts: (options) => invoke('contents:tag-counts', options),
    counts: () => invoke('contents:counts'),
    restoreBuiltins: () => invoke('contents:restore-builtins'),
    clearWords: () => invoke('contents:clear-words')
  },
  records: {
    list: (kind, options) => invoke('records:list', kind, options),
    get: (kind, id) => invoke('records:get', kind, id),
    remove: (kind, id) => invoke('records:delete', kind, id),
    clear: (kind) => invoke('records:clear', kind),
    tagCounts: (kind) => invoke('records:tag-counts', kind),
    incrementReadingWords: (id) => invoke('records:increment-reading-words', id),
    counts: () => invoke('records:counts')
  },
  translation: {
    run: (payload) => invoke('translation:run', payload),
    onProgress: (callback) => on('translation:progress', callback)
  },
  writing: {
    review: (payload) => invoke('writing:review', payload)
  },
  dictionary: {
    lookup: (word) => invoke('dictionary:lookup', word),
    history: () => invoke('dictionary:history')
  },
  words: {
    add: (payload) => invoke('words:add', payload),
    setMastered: (id, mastered) => invoke('words:set-mastered', id, mastered)
  },
  review: {
    list: () => invoke('review:list'),
    grade: (id, remembered) => invoke('review:grade', id, remembered)
  },
  reading: {
    saveHistory: (payload) => invoke('reading:save-history', payload),
    import: (payload) => invoke('reading:import', payload),
    readabilitySource: () => invoke('reading:readability-source')
  },
  batch: {
    start: (payload) => invoke('batch:start', payload),
    pause: () => invoke('batch:pause'),
    resume: () => invoke('batch:resume'),
    cancel: () => invoke('batch:cancel'),
    retry: (index) => invoke('batch:retry', index),
    retryAll: () => invoke('batch:retry-all'),
    state: () => invoke('batch:state'),
    onProgress: (callback) => on('batch:progress', callback)
  },
  ai: {
    test: () => invoke('ai:test')
  },
  updates: {
    check: () => invoke('updates:check'),
    checkForUpdates: () => invoke('updates:check'),
    state: () => invoke('updates:state'),
    installOnQuit: () => invoke('updates:install-on-quit'),
    onStatus: (callback) => on('update:status', callback),
    onUpdateStatus: (callback) => on('update:status', callback)
  },
  data: {
    exportWords: () => invoke('data:export-words')
  },
  // Exact top-level convenience names requested by the release contract.
  checkForUpdates: () => invoke('updates:check'),
  onUpdateStatus: (callback) => on('update:status', callback),
  installOnQuit: () => invoke('updates:install-on-quit')
};

contextBridge.exposeInMainWorld('api', Object.freeze(api));
