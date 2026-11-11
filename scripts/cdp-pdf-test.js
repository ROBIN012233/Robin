'use strict';

const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..', '.tmp-ui');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = await fetch('http://127.0.0.1:9333/json/list').then((r) => r.json());
  const target = targets.find((item) => item.url.includes('ui-test/index.html'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const errors = [];
  let nextId = 1;
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const handler = pending.get(message.id);
      if (handler) {
        pending.delete(message.id);
        if (message.error) handler.reject(new Error(JSON.stringify(message.error)));
        else handler.resolve(message.result);
      }
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 860, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8123/ui-test/index.html?v=pdf' });
  await wait(1800);
  await evaluate(`document.querySelector('[data-module="translation"]').click()`);
  await wait(700);
  const doc = await send('DOM.getDocument', { depth: -1 });
  const fileNode = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
  if (!fileNode.nodeId) throw new Error('file input not found');
  await send('DOM.setFileInputFiles', {
    nodeId: fileNode.nodeId,
    files: [path.resolve(__dirname, '..', 'ui-test', 'sample.pdf')]
  });
  await wait(3000);
  const state = await evaluate(`(() => ({
    length: document.querySelector('.compose-grid textarea')?.value.length,
    text: document.querySelector('.compose-grid textarea')?.value.slice(0, 220),
    title: document.querySelector('.compose-grid input.input')?.value,
    toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()),
    fileHint: document.querySelector('.compose-grid .field-hint')?.textContent
  }))()`);
  console.log('PDF', state);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, '18-pdf-import.png'), Buffer.from(shot.data, 'base64'));
  console.log('ERRORS', JSON.stringify(errors, null, 2));
  ws.close();
}

main().catch((error) => { console.error('PDF TEST FAILED', error); process.exitCode = 1; });

