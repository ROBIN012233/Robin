'use strict';

const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const contents = require('./db/contents');
const { excerpt } = require('./text');

const READABILITY_PATH = path.join(__dirname, '..', 'renderer', 'vendor', 'Readability.js');
let readabilitySourceCache = null;

function readabilitySource() {
  if (!readabilitySourceCache) {
    readabilitySourceCache = fs.readFileSync(READABILITY_PATH, 'utf8');
  }
  return readabilitySourceCache;
}

function hostnameTag(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '网页导入';
  }
}

function validHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function importReading({ title, url, body, direction = 'exam', tags = [], summary = '' }) {
  const text = String(body || '').trim();
  if (!text || text.length < 40) throw new Error('正文过短，无法导入');
  const cleanUrl = validHttpUrl(url) ? String(url).trim() : null;
  const domainTag = cleanUrl ? hostnameTag(cleanUrl) : '网页导入';
  const allTags = [...new Set(['网页导入', domainTag, ...(Array.isArray(tags) ? tags : [])])];
  const titleValue = String(title || '').trim() || (cleanUrl ? cleanUrl : '未命名网页');
  return contents.createContent({
    type: 'reading',
    title: titleValue.slice(0, 300),
    body: text,
    sourceType: 'web',
    sourceUrl: cleanUrl,
    domain: ['exam', 'daily', 'research'].includes(direction) ? direction : 'exam',
    tags: allTags,
    meta: {
      direction,
      difficulty: '未分级',
      loadMode: 'text',
      source: cleanUrl ? hostnameTag(cleanUrl) : '网页导入',
      summary: summary || excerpt(text, 150),
      importedAt: new Date().toISOString()
    }
  });
}

const EXTRACT_FN = `
(() => {
  try {
    var module = { exports: {} };
    var exports = module.exports;
    __READABILITY_SOURCE__
    var Readability = module.exports;
    var clone = document.cloneNode(true);
    var article = new Readability(clone, { charThreshold: 180 }).parse();
    if (!article || !article.textContent) {
      return { error: 'NO_CONTENT', title: document.title, url: location.href, text: '' };
    }
    return {
      title: article.title || document.title || '',
      url: location.href,
      byline: article.byline || '',
      siteName: article.siteName || '',
      excerpt: article.excerpt || '',
      text: article.textContent.trim()
    };
  } catch (error) {
    return { error: String(error && error.message || error), title: document.title, url: location.href, text: '' };
  }
})();
`;

function buildExtractionScript() {
  return EXTRACT_FN.replace('__READABILITY_SOURCE__', () => readabilitySource());
}

function userAgent() {
  const chrome = process.versions.chrome || '142.0.0.0';
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BatchImporter {
  constructor({ onUpdate }) {
    this.onUpdate = onUpdate;
    this.state = 'idle';
    this.jobs = [];
    this.direction = 'exam';
    this.tags = [];
    this.activeWindows = new Set();
    this.nextAllowedAt = 0;
    this.pauseWaiters = [];
    this.runPromise = null;
  }

  snapshot() {
    const completed = this.jobs.filter((job) => job.status === 'done' || job.status === 'failed').length;
    return {
      state: this.state,
      total: this.jobs.length,
      completed,
      succeeded: this.jobs.filter((job) => job.status === 'done').length,
      failed: this.jobs.filter((job) => job.status === 'failed').length,
      active: this.jobs.filter((job) => job.status === 'running').length,
      direction: this.direction,
      tags: this.tags,
      jobs: this.jobs.map((job) => ({
        index: job.index,
        url: job.url,
        status: job.status,
        error: job.error || null
      }))
    };
  }

  emit() {
    try { this.onUpdate(this.snapshot()); } catch { /* window closed */ }
  }

  async start({ urls, direction = 'exam', tags = [] }) {
    if (this.state === 'running' || this.state === 'paused') {
      throw new Error('已有批量导入任务正在运行');
    }
    const list = (Array.isArray(urls) ? urls : [])
      .map((url) => String(url || '').trim())
      .filter(Boolean);
    if (!list.length) throw new Error('请至少提供一个 URL');
    if (list.length > 200) throw new Error('单批最多 200 条 URL');
    const invalid = list.filter((url) => !validHttpUrl(url));
    if (invalid.length) throw new Error(`存在无效 URL：${invalid[0]}`);

    this.jobs = list.map((url, index) => ({ index, url, status: 'pending', error: null }));
    this.direction = ['exam', 'daily', 'research'].includes(direction) ? direction : 'exam';
    this.tags = Array.isArray(tags) ? tags : [];
    this.state = 'running';
    this.nextAllowedAt = 0;
    this.emit();
    this.runPromise = this.runWorkers().catch((error) => {
      this.state = 'done';
      this.emit();
      console.error('[batch] fatal', error);
    });
    return this.snapshot();
  }

  async ensureRunning() {
    if (this.state === 'done' || this.state === 'cancelled' || this.state === 'idle') {
      const pending = this.jobs.some((job) => job.status === 'pending');
      if (pending) {
        this.state = 'running';
        this.nextAllowedAt = 0;
        this.emit();
        this.runPromise = this.runWorkers().catch((error) => {
          console.error('[batch] fatal', error);
          this.state = 'done';
          this.emit();
        });
      }
    }
    return this.snapshot();
  }

  async worker() {
    while (this.state !== 'cancelled') {
      await this.waitIfPaused();
      if (this.state === 'cancelled') return;
      const job = this.jobs.find((item) => item.status === 'pending');
      if (!job) return;
      job.status = 'running';
      this.emit();

      const now = Date.now();
      const startAt = Math.max(now, this.nextAllowedAt);
      this.nextAllowedAt = startAt + 1500 + Math.floor(Math.random() * 1501);
      if (startAt > now) await sleep(startAt - now);
      if (this.state === 'cancelled') {
        job.status = 'failed';
        job.error = '已取消';
        this.emit();
        return;
      }

      try {
        const article = await this.extract(job.url);
        if (this.state === 'cancelled') {
          job.status = 'failed';
          job.error = '已取消';
          this.emit();
          return;
        }
        const created = importReading({
          title: article.title,
          url: article.url || job.url,
          body: article.text,
          direction: this.direction,
          tags: this.tags,
          summary: article.excerpt
        });
        job.status = 'done';
        job.contentId = created.id;
        job.error = null;
      } catch (error) {
        job.status = 'failed';
        job.error = error?.message || '导入失败';
      }
      this.emit();
    }
  }

  async runWorkers() {
    await Promise.all([this.worker(), this.worker()]);
    if (this.state === 'cancelled') {
      this.emit();
      return;
    }
    this.state = 'done';
    this.emit();
  }

  waitIfPaused() {
    if (this.state !== 'paused') return Promise.resolve();
    return new Promise((resolve) => this.pauseWaiters.push(resolve));
  }

  pause() {
    if (this.state !== 'running') return this.snapshot();
    this.state = 'paused';
    this.emit();
    return this.snapshot();
  }

  resume() {
    if (this.state !== 'paused') return this.snapshot();
    this.state = 'running';
    const waiters = this.pauseWaiters.splice(0);
    waiters.forEach((resolve) => resolve());
    this.emit();
    return this.snapshot();
  }

  cancel() {
    if (!['running', 'paused'].includes(this.state)) return this.snapshot();
    this.state = 'cancelled';
    const waiters = this.pauseWaiters.splice(0);
    waiters.forEach((resolve) => resolve());
    for (const win of this.activeWindows) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.activeWindows.clear();
    this.emit();
    return this.snapshot();
  }

  async retry(index) {
    const job = this.jobs.find((item) => item.index === Number(index));
    if (!job) throw new Error('找不到该失败条目');
    if (job.status !== 'failed') throw new Error('只有失败条目可以重试');
    job.status = 'pending';
    job.error = null;
    this.emit();
    return this.ensureRunning();
  }

  async retryAll() {
    for (const job of this.jobs) {
      if (job.status === 'failed') {
        job.status = 'pending';
        job.error = null;
      }
    }
    this.emit();
    return this.ensureRunning();
  }

  async extract(url) {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        images: true,
        spellcheck: false
      }
    });
    this.activeWindows.add(win);
    win.webContents.setUserAgent(userAgent());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    try {
      await Promise.race([
        win.loadURL(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('页面加载超时')), 25000))
      ]);
      await sleep(450);
      const result = await win.webContents.executeJavaScript(buildExtractionScript(), true);
      if (!result || result.error) {
        throw new Error(result?.error === 'NO_CONTENT' ? '未能提取正文，请尝试单条导入' : `正文提取失败：${result?.error || '未知错误'}`);
      }
      if (!result.text || result.text.length < 180) {
        throw new Error('正文提取过短，已跳过');
      }
      return result;
    } finally {
      this.activeWindows.delete(win);
      if (!win.isDestroyed()) win.destroy();
    }
  }
}

module.exports = {
  BatchImporter,
  importReading,
  buildExtractionScript,
  readabilitySource,
  hostnameTag,
  validHttpUrl
};
