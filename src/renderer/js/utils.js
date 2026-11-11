export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class' || key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'attrs') {
      for (const [attr, attrValue] of Object.entries(value)) {
        if (attrValue !== false && attrValue !== null && attrValue !== undefined) node.setAttribute(attr, attrValue);
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') {
      node.value = value;
    } else if (key === 'checked') {
      node.checked = Boolean(value);
    } else if (key === 'disabled') {
      node.disabled = Boolean(value);
    } else {
      node.setAttribute(key, value);
    }
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  if (children === null || children === undefined) return parent;
  if (Array.isArray(children)) {
    for (const child of children) append(parent, child);
    return parent;
  }
  if (children instanceof Node) parent.appendChild(children);
  else parent.appendChild(document.createTextNode(String(children)));
  return parent;
}

export function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function debounce(fn, wait = 300) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function formatDate(value, withTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const sameYear = date.getFullYear() === now.getFullYear();
  const day = `${sameYear ? '' : date.getFullYear() + '年'}${date.getMonth() + 1}月${date.getDate()}日`;
  return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}

export function relativeTime(value) {
  if (!value) return '—';
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return '—';
  const diff = Date.now() - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)} 天前`;
  return formatDate(value, false);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function countWords(text) {
  const matches = String(text || '').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g);
  return matches ? matches.length : 0;
}

export function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function normalizeTagsInput(value) {
  if (Array.isArray(value)) return value;
  return String(value || '')
    .split(/[,，;；\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function directionLabel(direction) {
  return { exam: '考试', daily: '日常', research: '科研' }[direction] || direction;
}

export function sortOptionsFor(kind = 'contents') {
  if (kind === 'records') {
    return [
      { value: 'newest', label: '时间 新→旧' },
      { value: 'oldest', label: '时间 旧→新' },
      { value: 'title', label: '标题 A–Z' },
      { value: 'tagCount', label: '标签数' }
    ];
  }
  return [
    { value: 'newest', label: '时间 新→旧' },
    { value: 'oldest', label: '时间 旧→新' },
    { value: 'title', label: '标题 A–Z' },
    { value: 'tagCount', label: '标签数' },
    { value: 'source', label: '来源' }
  ];
}

export function emitDataChanged(detail = {}) {
  window.dispatchEvent(new CustomEvent('lumen:data-changed', { detail }));
}

export function onDataChanged(handler) {
  window.addEventListener('lumen:data-changed', handler);
  return () => window.removeEventListener('lumen:data-changed', handler);
}

export function setBusy(button, busy, label = '处理中…') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    clear(button);
    const spinner = el('span', { class: 'spinner' });
    append(button, [spinner, label]);
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function makeTag(tag, variant = '') {
  return el('span', { class: `tag ${variant}`.trim(), text: tag });
}

export function safeAsync(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(error);
      window.dispatchEvent(new CustomEvent('lumen:error', { detail: { message: error?.message || '操作失败' } }));
      return undefined;
    }
  };
}

export function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  if (!match) return { r: 119, g: 151, b: 255 };
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

export function throttle(fn, wait = 32) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = performance.now();
    const remaining = wait - (now - last);
    clearTimeout(timer);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else {
      timer = setTimeout(() => {
        last = performance.now();
        fn(...args);
      }, remaining);
    }
  };
}
