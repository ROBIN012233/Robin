import { el, clear } from './utils.js';

export class VirtualList {
  constructor({ rowHeight = 84, renderRow, empty = '暂无内容', overscan = 6, className = '' }) {
    this.rowHeight = rowHeight;
    this.renderRow = renderRow;
    this.empty = empty;
    this.overscan = overscan;
    this.items = [];
    this.range = { start: -1, end: -1 };
    this.frame = null;

    this.el = el('div', { class: `vlist ${className}`.trim() });
    this.spacer = el('div', { class: 'vlist-spacer' });
    this.window = el('div', { class: 'vlist-window' });
    this.emptyEl = el('div', { class: 'vlist-empty' });
    this.spacer.appendChild(this.window);
    this.el.append(this.spacer, this.emptyEl);
    this.onScroll = () => this.schedule();
    this.el.addEventListener('scroll', this.onScroll, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.schedule());
    this.resizeObserver.observe(this.el);
  }

  setEmpty(value) {
    this.empty = value;
    if (!this.items.length) this.renderEmpty();
  }

  renderEmpty() {
    clear(this.emptyEl);
    if (this.empty instanceof Node) {
      this.emptyEl.appendChild(this.empty);
    } else {
      this.emptyEl.textContent = String(this.empty || '暂无内容');
    }
    this.emptyEl.hidden = this.items.length > 0;
  }

  setItems(items, { reset = false } = {}) {
    this.items = Array.isArray(items) ? items : [];
    this.spacer.style.height = `${this.items.length * this.rowHeight}px`;
    this.renderEmpty();
    if (reset) {
      this.el.scrollTop = 0;
      this.range = { start: -1, end: -1 };
    }
    if (!this.items.length) {
      clear(this.window);
      this.range = { start: -1, end: -1 };
      return;
    }
    const maxScroll = Math.max(0, this.items.length * this.rowHeight - this.el.clientHeight);
    if (this.el.scrollTop > maxScroll) this.el.scrollTop = maxScroll;
    this.render(true);
  }

  schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  render(force = false) {
    const count = this.items.length;
    if (!count) return;
    const height = this.el.clientHeight || 500;
    const start = Math.max(0, Math.floor(this.el.scrollTop / this.rowHeight) - this.overscan);
    const end = Math.min(count, Math.ceil((this.el.scrollTop + height) / this.rowHeight) + this.overscan);
    if (!force && start === this.range.start && end === this.range.end) return;
    this.range = { start, end };
    clear(this.window);
    this.window.style.transform = `translateY(${start * this.rowHeight}px)`;
    const fragment = document.createDocumentFragment();
    for (let index = start; index < end; index += 1) {
      const item = this.items[index];
      const row = el('div', { class: 'vrow', style: { height: `${this.rowHeight}px` } });
      const inner = el('div', { class: 'vrow-inner' });
      try {
        const content = this.renderRow(item, index);
        if (content instanceof Node) inner.appendChild(content);
      } catch (error) {
        console.error('[vlist] row render failed', error);
      }
      row.appendChild(inner);
      fragment.appendChild(row);
    }
    this.window.appendChild(fragment);
  }

  destroy() {
    this.el.removeEventListener('scroll', this.onScroll);
    this.resizeObserver.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.el.remove();
  }
}
