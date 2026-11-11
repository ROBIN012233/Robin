'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:9333';
const OUT = path.resolve(__dirname, '..', '.tmp-ui');
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await fetch(`${BASE}/json/list`).then((r) => r.json());
  const target = targets.find((item) => item.url.includes('ui-test/index.html')) || targets.find((item) => item.type === 'page');
  if (!target) throw new Error('No page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];
  const errors = [];

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const handler = pending.get(message.id);
      if (handler) {
        pending.delete(message.id);
        if (message.error) handler.reject(new Error(JSON.stringify(message.error)));
        else handler.resolve(message.result);
      }
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      errors.push(`exception: ${detail.text} ${detail.exception?.description || ''}`);
    }
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
      const text = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      if (message.params.type === 'error') errors.push(`console.error: ${text}`);
    }
    events.push(message);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text + ' ' + (response.exceptionDetails.exception?.description || ''));
    }
    return response.result.value;
  }

  async function screenshot(name) {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(result.data, 'base64'));
    console.log('shot', name);
  }

  async function click(expression, pause = 500) {
    const value = await evaluate(expression);
    await wait(pause);
    return value;
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1360,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false
  });
  await send('Page.navigate', { url: 'http://127.0.0.1:8123/ui-test/index.html?v=3' });
  await wait(2200);

  const boot = await evaluate(`(() => ({
    tiles: document.querySelectorAll('.cover-tile').length,
    tier: document.body.dataset.tier,
    effects: document.body.dataset.effects,
    cover: !document.getElementById('cover-view').hidden,
    canvas: (() => { const c = document.getElementById('light-canvas'); return c ? { w: c.width, h: c.height } : null })(),
    canvasErr: document.body.dataset.webgl || '',
    version: document.getElementById('cover-version')?.textContent,
    toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim())
  }))()`);
  console.log('boot', boot);
  const bootErrors = errors.splice(0);
  await screenshot('01-cover.png');

  await click(`document.querySelector('[data-module="cet"]').click()`, 800);
  const practice = await evaluate(`(() => ({
    moduleHidden: document.getElementById('module-view').hidden,
    title: document.querySelector('.practice-detail .practice-title')?.textContent,
    rows: document.querySelectorAll('.practice-item').length,
    activeNav: document.querySelector('#secondary-nav button.active')?.textContent,
    activeTab: document.querySelector('.segmented button.active')?.textContent,
    textarea: Boolean(document.querySelector('.practice-detail textarea'))
  }))()`);
  console.log('practice', practice);
  await screenshot('02-cet-practice.png');

  await click(`[...document.querySelectorAll('.segmented button')].find(b => b.textContent === '翻译').click()`, 500);
  const translationPractice = await evaluate(`(() => ({
    title: document.querySelector('.practice-detail .practice-title')?.textContent,
    passage: document.querySelector('.practice-detail .passage')?.textContent?.slice(0, 40),
    textarea: Boolean(document.querySelector('.practice-detail textarea'))
  }))()`);
  console.log('translationPractice', translationPractice);

  await click(`[...document.querySelectorAll('#secondary-nav button')].find(b => b.dataset.sub === 'dictionary').click()`, 500);
  await evaluate(`(() => { const input = document.querySelector('.dict-search input'); input.value = 'serendipity'; input.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('.dict-search .btn').click(); })()`);
  await wait(800);
  const dict = await evaluate(`(() => ({
    word: document.querySelector('.dict-word')?.textContent,
    meanings: document.querySelectorAll('.meaning-block').length,
    add: document.querySelector('.dict-result .btn.primary')?.textContent
  }))()`);
  console.log('dict', dict);
  await screenshot('03-dictionary.png');
  await evaluate(`document.querySelector('.dict-result .btn.primary').click()`);
  await wait(400);
  await click(`[...document.querySelectorAll('#secondary-nav button')].find(b => b.dataset.sub === 'wordbook').click()`, 500);
  const wordbook = await evaluate(`(() => ({
    rows: [...document.querySelectorAll('.module-page:not([hidden]) .wordbook-word')].map(n => n.textContent.trim()),
    total: document.querySelectorAll('.module-page:not([hidden]) .vrow').length
  }))()`);
  console.log('wordbook', wordbook);
  await screenshot('04-wordbook.png');

  await click(`[...document.querySelectorAll('#secondary-nav button')].find(b => b.dataset.sub === 'writing').click()`, 500);
  await evaluate(`(() => { const ta = document.querySelector('.writing-input-card textarea'); ta.value = 'Digital tools are useful, but they can make students lazy. Some people believe that access to the internet improves learning. Others argue that it weakens independent thinking. In my opinion, the answer depends on how the tools are used.'; ta.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('.writing-input-card .btn.primary').click(); })()`);
  await wait(1200);
  const writing = await evaluate(`(() => ({
    columns: document.querySelectorAll('.feedback-column').length,
    sample: Boolean(document.querySelector('.sample-section')),
    comparisons: document.querySelectorAll('.comparison-item').length,
    offline: [...document.querySelectorAll('.notice')].map(n=>n.textContent.trim()).join(' | '),
    resultTop: document.querySelector('.writing-result')?.getBoundingClientRect().top,
    viewport: window.innerHeight
  }))()`);
  console.log('writing', writing);
  await screenshot('05-writing-result.png');

  await click(`document.getElementById('back-btn').click()`, 600);
  await click(`document.querySelector('[data-module="cet"]').click()`, 700);
  const resumeCET = await evaluate(`(() => ({
    activeNav: document.querySelector('#secondary-nav button.active')?.textContent,
    resultVisible: Boolean(document.querySelector('.module-page:not([hidden]) .writing-result')),
    tier: document.body.dataset.tier
  }))()`);
  console.log('resumeCET', resumeCET);
  await click(`document.getElementById('back-btn').click()`, 600);
  await click(`document.querySelector('[data-module="reading"]').click()`, 900);
  const reading = await evaluate(`(() => ({
    rows: document.querySelectorAll('.rec-row').length,
    direction: document.querySelector('#direction-tabs button.active')?.textContent,
    title: document.querySelector('.rec-title')?.textContent,
    nav: document.querySelector('#secondary-nav button.active')?.textContent
  }))()`);
  console.log('reading', reading);
  await screenshot('06-reading-recommended.png');

  await click(`document.querySelector('.rec-row').click()`, 900);
  const reader = await evaluate(`(() => ({
    title: document.querySelector('.reader-title')?.textContent,
    tokens: document.querySelectorAll('.word-token').length,
    body: document.querySelector('.reader-body')?.textContent?.slice(0, 60),
    examNote: Boolean(document.querySelector('.exam-placeholder'))
  }))()`);
  console.log('reader', reader);
  await screenshot('07-reader.png');

  await click(`document.querySelector('.word-token').click()`, 700);
  const popover = await evaluate(`(() => ({
    hidden: document.getElementById('word-popover').hidden,
    word: document.querySelector('#word-popover .pop-word')?.textContent,
    text: document.getElementById('word-popover').textContent.slice(0, 80)
  }))()`);
  console.log('popover', popover);
  await screenshot('08-word-popover.png');
  await click(`document.querySelector('#word-popover .pop-actions .btn.primary').click()`, 600);
  const afterWord = await evaluate(`(() => ({
    toast: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).join(' | '),
    count: [...document.querySelectorAll('.reader-meta span')].map(n => n.textContent).find(t => t.includes('生词')),
    addLabel: document.querySelector('#word-popover .pop-actions .btn.primary')?.textContent
  }))()`);
  console.log('afterWord', afterWord);

  await click(`document.querySelector('.reader-top .btn').click()`, 500);
  await click(`[...document.querySelectorAll('#secondary-nav button')].find(b => b.dataset.sub === 'browser').click()`, 600);
  const browser = await evaluate(`(() => ({
    flag: document.body.dataset.hasWebview,
    surface: getComputedStyle(document.getElementById('module-surface')).backdropFilter,
    secondary: getComputedStyle(document.getElementById('secondary-nav')).backdropFilter,
    shell: document.querySelector('.webview-shell') ? getComputedStyle(document.querySelector('.webview-shell')).backdropFilter : null,
    webview: Boolean(document.querySelector('webview'))
  }))()`);
  console.log('browser', browser);
  await screenshot('09-browser.png');
  await click(`[...document.querySelectorAll('.browser-toolbar button')].find(b => b.textContent.includes('批量导入')).click()`, 600);
  const batchModal = await evaluate(`(() => ({
    title: document.querySelector('.modal-title')?.textContent,
    note: document.querySelector('.modal-body .notice')?.textContent.slice(0, 90),
    stats: document.querySelectorAll('.batch-stat').length
  }))()`);
  console.log('batchModal', batchModal);
  await screenshot('15-batch-modal.png');
  await click(`document.querySelector('.modal-head .modal-close').click()`, 300);

  await click(`document.getElementById('back-btn').click()`, 600);
  await click(`document.querySelector('[data-module="settings"]').click()`, 800);
  const appearance = await evaluate(`(() => ({
    tier: document.body.dataset.tier,
    tiers: document.querySelectorAll('.tier-card').length,
    section: document.querySelector('.module-page:not([hidden]) .page-title')?.textContent,
    backdropCount: [...document.querySelectorAll('*')].filter(e => {
      const s = getComputedStyle(e);
      return s.backdropFilter && s.backdropFilter !== 'none' && e.getClientRects().length > 0;
    }).length
  }))()`);
  console.log('appearance', appearance);
  await screenshot('10-settings-appearance.png');

  await evaluate(`window.__oldCanvas = document.getElementById('light-canvas'); [...document.querySelectorAll('.tier-card')].find(c => c.textContent.includes('中档')).click()`);
  await wait(700);
  const medium = await evaluate(`(() => ({
    tier: document.body.dataset.tier,
    canvasReplaced: document.getElementById('light-canvas') !== window.__oldCanvas,
    canvas: (() => { const c = document.getElementById('light-canvas'); return c ? {w:c.width,h:c.height} : null })()
  }))()`);
  console.log('medium', medium);
  await screenshot('11-settings-medium.png');

  await evaluate(`[...document.querySelectorAll('.tier-card')].find(c => c.textContent.includes('低档')).click()`);
  await wait(600);
  const low = await evaluate(`(() => ({
    tier: document.body.dataset.tier,
    canvas: (() => { const c = document.getElementById('light-canvas'); return c ? {w:c.width,h:c.height} : null })(),
    blur: getComputedStyle(document.getElementById('module-surface')).backdropFilter
  }))()`);
  console.log('low', low);
  await screenshot('16-settings-low.png');

  await evaluate(`document.querySelector('.module-page:not([hidden]) .setting-row .toggle input').click()`);
  await wait(500);
  const effectsOff = await evaluate(`(() => ({
    effects: document.body.dataset.effects,
    canvas: Boolean(document.getElementById('light-canvas')),
    blur: getComputedStyle(document.getElementById('module-surface')).backdropFilter,
    spotlight: getComputedStyle(document.getElementById('spotlight')).display
  }))()`);
  console.log('effectsOff', effectsOff);
  await screenshot('17-settings-effects-off.png');

  await evaluate(`document.querySelector('.module-page:not([hidden]) .setting-row .toggle input').click()`);
  await wait(400);
  await evaluate(`[...document.querySelectorAll('.tier-card')].find(c => c.textContent.includes('高档')).click()`);
  await wait(700);
  const restored = await evaluate(`(() => ({
    effects: document.body.dataset.effects,
    tier: document.body.dataset.tier,
    canvas: Boolean(document.getElementById('light-canvas'))
  }))()`);
  console.log('restored', restored);

  await click(`[...document.querySelectorAll('#secondary-nav button')].find(b => b.dataset.sub === 'data').click()`, 500);
  const data = await evaluate(`(() => ({
    rows: document.querySelectorAll('.data-row').length,
    text: document.body.innerText.includes('数据管理')
  }))()`);
  console.log('data', data);
  await screenshot('12-settings-data.png');

  await click(`document.getElementById('back-btn').click()`, 500);
  await click(`document.querySelector('[data-module="translation"]').click()`, 700);
  await evaluate(`(() => { const ta = document.querySelector('.compose-grid textarea'); ta.value = 'The transformer architecture has changed natural language processing.\\n\\nAttention allows a model to weigh different parts of the input. This design removes recurrence and enables parallel training.'; ta.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('.compose-grid .btn.primary').click(); })()`);
  await wait(1600);
  const translation = await evaluate(`(() => ({
    pairs: document.querySelectorAll('.pair-row').length,
    outline: document.querySelectorAll('.outline-node').length,
    title: document.querySelector('.result-title')?.textContent,
    resultVisible: !document.querySelector('.translation-doc')?.hidden
  }))()`);
  console.log('translation', translation);
  await screenshot('13-translation-result.png');

  await click(`[...document.querySelectorAll('#secondary-nav button')].find(b => b.dataset.sub === 'history').click()`, 600);
  const history = await evaluate(`(() => ({
    vrows: document.querySelectorAll('.module-page:not([hidden]) .vrow').length,
    spacerHeight: document.querySelector('.module-page:not([hidden]) .vlist-spacer')?.style.height,
    first: document.querySelector('.module-page:not([hidden]) .history-title')?.textContent,
    totalText: document.body.innerText.includes('翻译历史')
  }))()`);
  console.log('history', history);
  await screenshot('14-translation-history.png');

  const final = await evaluate(`(() => ({
    bodyTier: document.body.dataset.tier,
    effects: document.body.dataset.effects,
    toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()),
    title: document.title
  }))()`);
  console.log('final', final);

  console.log('ERRORS_BOOT', JSON.stringify(bootErrors, null, 2));
  console.log('ERRORS', JSON.stringify(errors, null, 2));
  fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify({ bootErrors, errors }, null, 2));
  ws.close();
}

main().catch((error) => {
  console.error('UI TEST FAILED', error);
  process.exitCode = 1;
});


