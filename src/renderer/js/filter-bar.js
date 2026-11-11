import { el, icon, debounce, sortOptionsFor, clear } from './utils.js';
import { state } from './state.js';
import api from './api.js';

export class FilterBar {
  constructor({
    listId,
    placeholder = '搜索标题或正文…',
    kind = 'contents',
    onQuery,
    actions = [],
    defaultSort = 'newest'
  }) {
    this.listId = listId;
    this.onQuery = onQuery;
    this.kind = kind;
    this.selected = new Set();
    this.tags = [];
    this.sortOptions = sortOptionsFor(kind);
    this.sort = state.settings?.sorts?.[listId] || defaultSort;
    if (!this.sortOptions.some((option) => option.value === this.sort)) this.sort = defaultSort;

    this.searchInput = el('input', {
      class: 'input',
      type: 'search',
      placeholder,
      attrs: { 'aria-label': '搜索' },
      oninput: debounce(() => this.trigger(), 300)
    });
    this.search = el('label', { class: 'search-box' }, [icon('search'), this.searchInput]);

    this.tagWrap = el('div', { class: 'tag-scroll filter-tags', attrs: { 'aria-label': '标签筛选' } });
    this.sortSelect = el('select', {
      class: 'select compact',
      attrs: { 'aria-label': '排序方式' }
    });
    for (const option of this.sortOptions) {
      this.sortSelect.appendChild(el('option', { value: option.value, text: option.label, selected: option.value === this.sort }));
    }
    this.sortSelect.addEventListener('change', () => {
      this.sort = this.sortSelect.value;
      this.persistSort();
      this.trigger();
    });

    this.el = el('div', { class: 'toolbar filter-bar' }, [
      this.search,
      this.tagWrap,
      this.sortSelect,
      ...actions
    ]);
  }

  async persistSort() {
    const sorts = { ...(state.settings?.sorts || {}), [this.listId]: this.sort };
    if (state.settings) state.settings.sorts = sorts;
    try {
      await api.settings.update({ sorts: { [this.listId]: this.sort } });
    } catch (error) {
      console.error('sort persist failed', error);
    }
  }

  trigger() {
    if (this.onQuery) {
      this.onQuery({
        search: this.searchInput.value.trim(),
        tags: [...this.selected],
        sort: this.sort
      });
    }
  }

  setTagOptions(tags) {
    this.tags = Array.isArray(tags) ? tags : [];
    const available = new Set(this.tags.map((tag) => tag.tag));
    for (const tag of [...this.selected]) {
      if (!available.has(tag)) this.selected.delete(tag);
    }
    this.renderTags();
  }

  renderTags() {
    clear(this.tagWrap);
    if (!this.tags.length) {
      this.tagWrap.appendChild(el('span', { class: 'tiny faint', text: '暂无标签' }));
      return;
    }
    for (const item of this.tags) {
      const tag = typeof item === 'string' ? item : item.tag;
      const count = typeof item === 'string' ? null : item.count;
      const button = el('button', {
        class: `tag-chip ${this.selected.has(tag) ? 'active' : ''}`.trim(),
        type: 'button',
        title: `筛选标签：${tag}`,
        text: count ? `${tag} · ${count}` : tag
      });
      button.addEventListener('click', () => {
        if (this.selected.has(tag)) this.selected.delete(tag);
        else this.selected.add(tag);
        this.renderTags();
        this.trigger();
      });
      this.tagWrap.appendChild(button);
    }
  }

  getState() {
    return {
      search: this.searchInput.value.trim(),
      tags: [...this.selected],
      sort: this.sort
    };
  }

  reset() {
    this.searchInput.value = '';
    this.selected.clear();
    this.renderTags();
    this.trigger();
  }
}
