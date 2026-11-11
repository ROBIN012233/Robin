import { el, icon, append, clear } from './utils.js';

const modalStack = [];

export function toast(message, options = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const type = options.type || 'info';
  const iconName = type === 'success' ? 'check' : type === 'error' ? 'close' : type === 'warn' ? 'shield' : 'spark';
  const node = el('div', { class: `toast ${type}` }, [
    icon(iconName),
    el('div', { class: 'grow', text: String(message || '') })
  ]);
  root.appendChild(node);
  const duration = options.duration ?? (type === 'error' ? 6000 : 3600);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 240);
  }, duration);
}

export function openModal({
  title,
  subtitle = '',
  body,
  actions = [],
  wide = false,
  dismissible = true,
  onMount,
  onClose
}) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const backdrop = el('div', { class: 'modal-backdrop' });
    const modal = el('div', { class: `modal ${wide ? 'wide' : ''}`.trim(), attrs: { role: 'dialog', 'aria-modal': 'true' } });
    let closed = false;

    const close = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      const index = modalStack.indexOf(close);
      if (index >= 0) modalStack.splice(index, 1);
      if (onClose) {
        try { onClose(value); } catch (error) { console.error(error); }
      }
      resolve(value);
    };

    const onKey = (event) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        close(null);
      }
    };

    const closeBtn = el('button', {
      class: 'btn ghost icon-only sm modal-close',
      type: 'button',
      title: '关闭',
      onclick: () => close(null)
    }, icon('close'));

    const head = el('div', { class: 'modal-head' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'modal-title', text: title || '' }),
        subtitle ? el('div', { class: 'modal-sub', text: subtitle }) : null
      ]),
      dismissible ? closeBtn : null
    ]);

    const bodyEl = el('div', { class: 'modal-body' });
    if (body instanceof Node) bodyEl.appendChild(body);
    else if (typeof body === 'string') bodyEl.textContent = body;

    const foot = el('div', { class: 'modal-foot' });
    const buttons = actions.length ? actions : [{ label: '关闭', value: null, variant: 'ghost' }];
    for (const action of buttons) {
      const btn = el('button', {
        class: `btn ${action.primary ? 'primary' : action.variant || 'ghost'}`.trim(),
        type: 'button',
        onclick: () => {
          if (action.onClick) {
            const result = action.onClick(close);
            if (result === false) return;
          }
          close(action.value === undefined ? action.label : action.value);
        }
      }, action.label);
      foot.appendChild(btn);
    }

    modal.append(head, bodyEl, foot);
    backdrop.appendChild(modal);
    root.appendChild(backdrop);
    modalStack.push(close);
    document.addEventListener('keydown', onKey, true);

    if (dismissible) {
      backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) close(null);
      });
    }

    if (onMount) onMount(modal, close);
    requestAnimationFrame(() => {
      const focusable = modal.querySelector('.modal-body input, .modal-body textarea, .modal-body select, .modal-foot .btn.primary, .modal-foot button');
      if (focusable) focusable.focus({ preventScroll: true });
    });
  });
}

export function confirmDialog({
  title = '确认操作',
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false
} = {}) {
  return openModal({
    title,
    body: el('div', { class: 'notice ' + (danger ? 'bad' : '') }, [
      icon(danger ? 'shield' : 'spark'),
      el('div', { class: 'grow', text: message || '' })
    ]),
    actions: [
      { label: cancelLabel, value: false },
      { label: confirmLabel, value: true, primary: true, variant: danger ? 'danger' : '' }
    ],
    dismissible: true
  }).then((value) => value === true);
}

export function emptyState({ iconName = 'book', title = '暂无内容', sub = '', action = null } = {}) {
  return el('div', { class: 'empty' }, [
    icon(iconName),
    el('div', { class: 'empty-title', text: title }),
    sub ? el('div', { class: 'empty-sub', text: sub }) : null,
    action || null
  ]);
}

export function pageHeader({ kicker = '', title, sub = '', actions = [] }) {
  return el('div', { class: 'page-head' }, [
    el('div', { class: 'grow' }, [
      kicker ? el('p', { class: 'module-kicker', text: kicker }) : null,
      el('h3', { class: 'page-title', text: title }),
      sub ? el('p', { class: 'page-sub', text: sub }) : null
    ]),
    actions.length ? el('div', { class: 'actions' }, actions) : null
  ]);
}

export function notice(message, type = '') {
  const iconName = type === 'bad' ? 'shield' : type === 'warn' ? 'shield' : 'spark';
  return el('div', { class: `notice ${type}`.trim() }, [
    icon(iconName),
    el('div', { class: 'grow', text: message })
  ]);
}

export function tagList(tags, limit = 6) {
  const wrap = el('div', { class: 'tag-scroll' });
  for (const tag of (tags || []).slice(0, limit)) {
    wrap.appendChild(el('span', { class: 'tag', text: tag }));
  }
  return wrap;
}

export function buttonWithIcon(label, iconName, props = {}) {
  return el('button', {
    class: `btn ${props.variant || ''}`.trim(),
    type: 'button',
    ...props
  }, [icon(iconName), el('span', { text: label })]);
}

export function clearNode(node) {
  return clear(node);
}
