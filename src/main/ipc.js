'use strict';

const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const media = require('./media');
const db = require('./db');
const contents = require('./db/contents');
const records = require('./db/records');
const words = require('./db/words');
const translation = require('./translation-service');
const writing = require('./writing-service');
const dictionary = require('./dictionary');
const importer = require('./import-service');
const { AIClient } = require('./ai-client');
const { hostnameTag } = importer;

const ai = new AIClient(() => config.getRawSettings().ai.baseUrl);

const DIRECTION_LABEL = { exam: '考试', daily: '日常', research: '科研' };

function expectObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function registerIpc({ getWindow, updater, batch }) {
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => fn(event, ...args));
  };

  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    dbPath: db.getPath()
  }));

  handle('settings:get', () => config.getSettings());
  handle('settings:update', (_event, patch) => {
    const settings = config.updateSettings(expectObject(patch));
    if (patch && patch.updates && typeof patch.updates.auto === 'boolean') {
      updater.setAutoEnabled(patch.updates.auto);
    }
    return settings;
  });
  handle('settings:choose-background', () => media.chooseBackground(getWindow()));
  handle('settings:clear-background', () => media.clearBackground());
  handle('settings:choose-icon', () => media.chooseIcon(getWindow()));
  handle('settings:clear-icon', () => media.clearIcon(getWindow()));

  handle('contents:list', (_event, options) => contents.listContents(expectObject(options)));
  handle('contents:get', (_event, id) => contents.getContent(String(id || '')));
  handle('contents:create', (_event, input) => contents.createContent(expectObject(input)));
  handle('contents:update', (_event, id, input) => contents.updateContent(String(id || ''), expectObject(input)));
  handle('contents:remove', (_event, id) => contents.deleteContent(String(id || '')));
  handle('contents:set-hidden', (_event, id, hidden) => contents.setHidden(String(id || ''), Boolean(hidden)));
  handle('contents:tag-counts', (_event, options) => contents.tagCounts(expectObject(options)));
  handle('contents:counts', () => contents.counts());
  handle('contents:restore-builtins', () => contents.restoreBuiltinPresets());
  handle('contents:clear-words', () => {
    contents.clearType('word');
    return contents.counts();
  });

  handle('records:list', (_event, kind, options) => records.listRecords(String(kind || ''), expectObject(options)));
  handle('records:get', (_event, kind, id) => records.getRecord(String(kind || ''), String(id || '')));
  handle('records:delete', (_event, kind, id) => records.deleteRecord(String(kind || ''), String(id || '')));
  handle('records:clear', (_event, kind) => records.clearRecords(String(kind || '')));
  handle('records:tag-counts', (_event, kind) => records.recordTagCounts(String(kind || '')));
  handle('records:increment-reading-words', (_event, id) => records.incrementReadingWords(String(id || '')));
  handle('records:counts', () => records.counts());

  handle('translation:run', async (event, payload) => {
    const win = getWindow();
    const data = expectObject(payload);
    return translation.runTranslation({
      title: String(data.title || ''),
      text: String(data.text || ''),
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 12) : []
    }, (progress) => {
      if (win && !win.isDestroyed()) win.webContents.send('translation:progress', progress);
    });
  });

  handle('writing:review', async (_event, payload) => {
    const data = expectObject(payload);
    return writing.reviewWriting({
      text: String(data.text || ''),
      topic: String(data.topic || ''),
      prompt: String(data.prompt || '')
    });
  });

  handle('dictionary:lookup', async (_event, word) => dictionary.lookup(String(word || '')));
  handle('dictionary:history', () => records.listRecords('dictionary', { sort: 'newest' }));

  handle('words:add', (_event, payload) => {
    const data = expectObject(payload);
    return words.addWord({
      word: data.word,
      meaning: data.meaning,
      phonetic: data.phonetic,
      examples: data.examples,
      meanings: data.meanings,
      origin: data.origin,
      tags: data.tags,
      sourceUrl: data.sourceUrl
    });
  });
  handle('words:set-mastered', (_event, id, mastered) => words.setMastered(String(id || ''), Boolean(mastered)));
  handle('review:list', () => words.reviewList());
  handle('review:grade', (_event, id, remembered) => words.gradeReview(String(id || ''), Boolean(remembered)));

  handle('reading:save-history', (_event, payload) => {
    const data = expectObject(payload);
    const direction = ['exam', 'daily', 'research'].includes(data.direction) ? data.direction : 'exam';
    const tags = [...new Set([DIRECTION_LABEL[direction], hostnameTag(data.sourceUrl || '')])];
    return records.saveReadingHistory({
      title: String(data.title || '未命名阅读'),
      source: String(data.source || ''),
      sourceUrl: data.sourceUrl || null,
      direction,
      body: String(data.body || ''),
      tags
    });
  });
  handle('reading:import', (_event, payload) => importer.importReading(expectObject(payload)));
  handle('reading:readability-source', () => importer.readabilitySource());

  handle('batch:start', (_event, payload) => batch.start(expectObject(payload)));
  handle('batch:pause', () => batch.pause());
  handle('batch:resume', () => batch.resume());
  handle('batch:cancel', () => batch.cancel());
  handle('batch:retry', (_event, index) => batch.retry(index));
  handle('batch:retry-all', () => batch.retryAll());
  handle('batch:state', () => batch.snapshot());

  handle('ai:test', () => ai.test());
  handle('updates:check', () => updater.checkForUpdates(true));
  handle('updates:state', () => updater.getState());
  handle('updates:install-on-quit', () => updater.installOnQuit());

  handle('data:export-words', async () => {
    const rows = contents.listContents({ type: 'word', sort: 'oldest', includeHidden: true });
    if (!rows.length) throw new Error('生词本为空，没有可导出的内容');
    const stamp = new Date().toISOString().slice(0, 10);
    const parent = getWindow();
    const result = await dialog.showSaveDialog(parent, {
      title: '导出生词本',
      defaultPath: path.join(app.getPath('documents'), `vocabulary-${stamp}.json`),
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] }
      ]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    let filePath = result.filePath;
    const ext = path.extname(filePath).toLowerCase();
    if (!['.json', '.csv'].includes(ext)) filePath += '.json';

    if (filePath.toLowerCase().endsWith('.csv')) {
      const header = ['word', 'meaning', 'phonetic', 'origin', 'mastered', 'added_at', 'tags'];
      const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const lines = [header.join(',')];
      for (const row of rows) {
        lines.push([
          row.title,
          row.body,
          row.meta.phonetic || '',
          row.meta.origin || '',
          row.meta.mastered ? 'yes' : 'no',
          row.meta.addedAt || row.created_at,
          row.tags.join('; ')
        ].map(escape).join(','));
      }
      await fs.promises.writeFile(filePath, '\ufeff' + lines.join('\r\n'), 'utf8');
    } else {
      const data = rows.map((row) => ({
        word: row.title,
        meaning: row.body,
        phonetic: row.meta.phonetic || '',
        origin: row.meta.origin || '',
        mastered: Boolean(row.meta.mastered),
        addedAt: row.meta.addedAt || row.created_at,
        tags: row.tags,
        examples: row.meta.examples || []
      }));
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
    return { canceled: false, path: filePath, count: rows.length };
  });
}

module.exports = { registerIpc };
