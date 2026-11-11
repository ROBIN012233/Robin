'use strict';

// This preload runs inside <webview>. It exposes no general IPC bridge: the
// host can only receive the small, read-only messages below.
const { ipcRenderer } = require('electron');

let lastSelection = '';

function sendPageInfo() {
  try {
    ipcRenderer.sendToHost('reader:page-info', {
      title: document.title || '',
      url: location.href,
      readyState: document.readyState
    });
  } catch { /* page may be navigating */ }
}

window.addEventListener('DOMContentLoaded', sendPageInfo, { once: true });
window.addEventListener('load', sendPageInfo, { once: true });

document.addEventListener('mouseup', () => {
  try {
    const selection = String(window.getSelection() || '').trim();
    if (selection && selection !== lastSelection) {
      lastSelection = selection;
      ipcRenderer.sendToHost('reader:selection', { text: selection.slice(0, 1200) });
    }
  } catch { /* ignore */ }
});

ipcRenderer.on('reader:request-info', sendPageInfo);
