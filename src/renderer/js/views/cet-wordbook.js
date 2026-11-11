import { el, icon, formatDate, emitDataChanged, onDataChanged } from '../utils.js';
import { pageHeader, toast, emptyState, confirmDialog } from '../ui.js';
import { FilterBar } from '../filter-bar.js';
import { VirtualList } from '../virtual-list.js';
import api from '../api.js';

export function createWordbookView() {
  const page = el('div', { class: 'module-page' });
  const wrap = el('div', { style: { height: 'calc(100vh - 280px)', minHeight: '300px' } });
  const filter = new FilterBar({
    listId: 'wordbook',
    kind: 'contents',
    placeholder: '搜索单词或释义…',
    onQuery: () => load()
  });

  const vlist = new VirtualList({
    rowHeight: 94,
    empty: emptyState({
      iconName: 'book',
      title: '生词本还是空的',
      sub: '在词典查词后点“加入生词本”，或在阅读视图里点任意英文单词，都会把词收进这里。'
    }),
    renderRow: (item) => {
      const mastered = Boolean(item.meta?.mastered);
      const row = el('div', { class: `wordbook-row ${mastered ? 'mastered' : ''}`.trim() }, [
        el('div', { class: 'wordbook-main' }, [
          el('div', { class: 'wordbook-word' }, [
            el('span', { text: item.title }),
            item.meta?.phonetic ? el('span', { class: 'phonetic', text: item.meta.phonetic }) : null,
            mastered ? el('span', { class: 'badge good', text: '已掌握' }) : null
          ]),
          el('div', { class: 'wordbook-meaning', text: (item.body || '').replace(/\n+/g, ' · ') }),
          el('div', { class: 'wordbook-meta' }, [
            el('span', { class: 'tag', text: item.meta?.origin || '词典' }),
            el('span', { text: formatDate(item.meta?.addedAt || item.created_at, false) }),
            el('span', { class: 'meta-dot' }),
            el('span', { text: mastered ? '已移出复习队列' : '复习队列' })
          ])
        ]),
        el('div', { class: 'list-actions' }, [
          el('button', {
            class: 'btn sm',
            type: 'button',
            onclick: () => toggleMastered(item)
          }, [icon('check'), el('span', { text: mastered ? '取消掌握' : '标记已掌握' })]),
          el('button', {
            class: 'btn ghost sm icon-only',
            type: 'button',
            title: '删除',
            onclick: () => removeWord(item)
          }, icon('trash'))
        ])
      ]);
      return row;
    }
  });
  wrap.appendChild(vlist.el);

  page.append(
    pageHeader({
      kicker: 'VOCABULARY',
      title: '生词本',
      sub: '来自“词典”与“阅读”的单词统一管理；标记为已掌握后会移出复习队列。'
    }),
    filter.el,
    wrap
  );

  async function load() {
    const query = filter.getState();
    try {
      const [rows, tags] = await Promise.all([
        api.contents.list({ type: 'word', ...query }),
        api.contents.tagCounts({ type: 'word' })
      ]);
      filter.setTagOptions(tags);
      vlist.setItems(rows);
    } catch (error) {
      toast(error.message || '读取生词本失败', { type: 'error' });
    }
  }

  async function toggleMastered(item) {
    try {
      await api.words.setMastered(item.id, !item.meta?.mastered);
      toast(item.meta?.mastered ? '已取消掌握' : '已标记为掌握，移出复习队列', { type: 'success' });
      emitDataChanged({ type: 'word-updated' });
      load();
    } catch (error) {
      toast(error.message || '操作失败', { type: 'error' });
    }
  }

  async function removeWord(item) {
    if (!(await confirmDialog({ title: '删除生词', message: `确认删除 “${item.title}”？该操作不可撤销。`, confirmLabel: '删除', danger: true }))) return;
    try {
      await api.contents.remove(item.id);
      toast('已删除生词', { type: 'success' });
      emitDataChanged({ type: 'word-deleted' });
      load();
    } catch (error) {
      toast(error.message || '删除失败', { type: 'error' });
    }
  }

  const listener = onDataChanged((event) => {
    const type = event.detail?.type;
    if (!type || ['word-updated', 'word-deleted', 'word-added'].includes(type)) load();
  });
  page._cleanup = () => listener();
  load();
  return { el: page, onShow: load };
}
