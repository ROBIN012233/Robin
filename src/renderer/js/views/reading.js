import { el, icon, formatDate, setBusy, emitDataChanged, onDataChanged, normalizeTagsInput, directionLabel } from '../utils.js';
import { pageHeader, toast, emptyState, confirmDialog, openModal, notice } from '../ui.js';
import { FilterBar } from '../filter-bar.js';
import { VirtualList } from '../virtual-list.js';
import { createReader } from '../components/reader.js';
import { openImportDialog } from '../components/import-dialog.js';
import { openBatchPanel } from '../components/batch-panel.js';
import api from '../api.js';
import { state } from '../state.js';

function validUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------
   推荐阅读
   ------------------------------------------------------------ */
export function createRecommendedView(ctx) {
  const direction = state.direction;
  const page = el('div', { class: 'module-page' });
  const listZone = el('div', { class: 'stack' });
  const readerZone = el('div', { hidden: true, style: { height: '100%', overflowY: 'auto' } });
  const listWrap = el('div', { style: { height: 'calc(100vh - 300px)', minHeight: '280px' } });
  let reader = null;
  let rows = [];

  const filter = new FilterBar({
    listId: `reading:${direction}:recommended`,
    kind: 'contents',
    placeholder: '搜索推荐阅读…',
    onQuery: () => load()
  });

  const vlist = new VirtualList({
    rowHeight: 112,
    empty: emptyState({
      iconName: 'reading',
      title: '这个方向还没有内容',
      sub: '可以添加自己的阅读条目，或恢复被隐藏的内置条目。'
    }),
    renderRow: (item) => {
      const meta = item.meta || {};
      const isUrl = meta.loadMode === 'url' && item.source_url;
      const row = el('div', { class: 'rec-row', style: { cursor: 'pointer' } }, [
        el('div', { class: 'rec-main' }, [
          el('div', { class: 'rec-title', text: item.title }),
          el('div', { class: 'rec-summary', text: meta.summary || item.source_url || '内置文本' }),
          el('div', { class: 'rec-meta' }, [
            el('span', { class: 'badge', text: meta.source || (isUrl ? 'URL' : '内置文本') }),
            meta.difficulty ? el('span', { class: 'badge accent', text: meta.difficulty }) : null,
            el('span', { class: 'badge', text: isUrl ? '内置浏览器' : '阅读视图' }),
            item.source_type === 'user' || item.source_type === 'web' ? el('span', { class: 'badge good', text: item.source_type === 'web' ? '网页导入' : '我的条目' }) : el('span', { class: 'badge', text: '内置' }),
            ...(item.tags || []).filter((tag) => !['内置', '考试', '日常', '科研'].includes(tag)).slice(0, 2).map((tag) => el('span', { class: 'tag', text: tag }))
          ])
        ]),
        el('div', { class: 'rec-actions' }, [
          el('button', { class: 'btn sm primary', type: 'button' }, [icon(isUrl ? 'globe' : 'book'), el('span', { text: isUrl ? '打开网页' : '开始阅读' })]),
          item.source_type === 'builtin'
            ? el('button', { class: 'btn ghost sm icon-only', type: 'button', title: '隐藏内置条目', onclick: (event) => { event.stopPropagation(); hideItem(item); } }, icon('eye-off'))
            : el('button', { class: 'btn ghost sm icon-only', type: 'button', title: '删除条目', onclick: (event) => { event.stopPropagation(); deleteItem(item); } }, icon('trash'))
        ])
      ]);
      row.addEventListener('click', () => openItem(item));
      row.querySelector('.btn.primary').addEventListener('click', (event) => {
        event.stopPropagation();
        openItem(item);
      });
      return row;
    }
  });
  listWrap.appendChild(vlist.el);

  const addButton = el('button', { class: 'btn', type: 'button' }, [icon('plus'), el('span', { text: '添加条目' })]);
  addButton.addEventListener('click', addEntry);

  listZone.append(
    pageHeader({
      kicker: `READING · ${directionLabel(direction)}`,
      title: '推荐阅读',
      sub: 'URL 型条目用内置浏览器打开；内置文本直接进入阅读视图。可添加自己的条目，或隐藏内置条目。',
      actions: [addButton]
    }),
    filter.el,
    listWrap
  );
  page.append(listZone, readerZone);

  async function load() {
    const query = filter.getState();
    try {
      const [items, tags] = await Promise.all([
        api.contents.list({ type: 'reading', domain: direction, ...query }),
        api.contents.tagCounts({ type: 'reading', domain: direction })
      ]);
      filter.setTagOptions(tags);
      rows = items;
      vlist.setItems(items);
    } catch (error) {
      toast(error.message || '读取推荐阅读失败', { type: 'error' });
    }
  }

  function closeReader() {
    if (reader?.destroy) reader.destroy();
    reader = null;
    readerZone.hidden = true;
    readerZone.innerHTML = '';
    listZone.hidden = false;
    load();
  }

  async function openItem(item) {
    const meta = item.meta || {};
    if (meta.loadMode === 'url' && item.source_url) {
      state.pendingBrowserUrl = item.source_url;
      ctx.router.showSubpage('reading', 'browser');
      return;
    }
    try {
      const record = await api.reading.saveHistory({
        title: item.title,
        source: meta.source || '内置文本',
        sourceUrl: item.source_url || '',
        direction,
        body: item.body
      });
      listZone.hidden = true;
      readerZone.hidden = false;
      readerZone.innerHTML = '';
      if (reader?.destroy) reader.destroy();
      reader = createReader({
        title: item.title,
        source: meta.source || '内置文本',
        sourceUrl: item.source_url || '',
        direction,
        body: item.body,
        historyId: record.id,
        initialWordCount: 0,
        backLabel: '返回推荐',
        onBack: closeReader
      });
      readerZone.appendChild(reader.el);
      readerZone.scrollTop = 0;
    } catch (error) {
      toast(error.message || '打开阅读失败', { type: 'error' });
    }
  }

  async function hideItem(item) {
    if (!(await confirmDialog({
      title: '隐藏内置条目',
      message: `隐藏「${item.title}」？可以在“设置 → 阅读推荐”中恢复。`,
      confirmLabel: '隐藏'
    }))) return;
    try {
      await api.contents.setHidden(item.id, true);
      toast('已隐藏内置条目', { type: 'success' });
      emitDataChanged({ type: 'reading-hidden' });
      load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  async function deleteItem(item) {
    if (!(await confirmDialog({ title: '删除阅读条目', message: `确认删除「${item.title}」？`, confirmLabel: '删除', danger: true }))) return;
    try {
      await api.contents.remove(item.id);
      toast('已删除条目', { type: 'success' });
      emitDataChanged({ type: 'reading-deleted' });
      load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  function addEntry() {
    const titleInput = el('input', { class: 'input', placeholder: '标题' });
    const urlInput = el('input', { class: 'input', placeholder: 'https://…（URL 型条目）' });
    const bodyInput = el('textarea', { class: 'textarea', style: { minHeight: '160px' }, placeholder: '正文（文本型条目，至少 40 字符）' });
    const summaryInput = el('input', { class: 'input', placeholder: '一句话摘要（可选）' });
    const difficulty = el('select', { class: 'select' });
    for (const value of ['入门', '中等', '进阶']) difficulty.appendChild(el('option', { value, text: value }));
    difficulty.value = '中等';
    const tagsInput = el('input', { class: 'input', placeholder: '标签，逗号分隔（可选）' });
    const save = el('button', { class: 'btn primary wide', type: 'button', text: '保存条目' });
    const body = el('div', { class: 'stack-sm' }, [
      notice('文本型条目直接进入阅读视图；URL 型条目点击后在内置浏览器打开。两者可同时填写，正文优先。'),
      el('div', { class: 'field' }, [el('div', { class: 'field-label' }, [el('span', { text: '标题' })]), titleInput]),
      el('div', { class: 'field' }, [el('div', { class: 'field-label' }, [el('span', { text: 'URL' })]), urlInput]),
      el('div', { class: 'field' }, [el('div', { class: 'field-label' }, [el('span', { text: '正文' })]), bodyInput]),
      el('div', { class: 'field' }, [el('div', { class: 'field-label' }, [el('span', { text: '摘要' })]), summaryInput]),
      el('div', { class: 'field' }, [el('div', { class: 'field-label' }, [el('span', { text: '难度' })]), difficulty]),
      el('div', { class: 'field' }, [el('div', { class: 'field-label' }, [el('span', { text: '标签' })]), tagsInput]),
      save
    ]);
    openModal({
      title: '添加阅读条目',
      subtitle: `当前方向：${directionLabel(direction)}`,
      body,
      wide: true,
      actions: [{ label: '取消', value: null }],
      onMount: (modal, close) => {
        save.addEventListener('click', async () => {
          const title = titleInput.value.trim();
          const text = bodyInput.value.trim();
          const url = urlInput.value.trim();
          if (!title) {
            toast('请填写标题', { type: 'warn' });
            return;
          }
          if (text.length < 40 && !validUrl(url)) {
            toast('请填写至少 40 字符的正文，或一个有效的 http/https URL', { type: 'warn' });
            return;
          }
          setBusy(save, true, '保存中…');
          try {
            const isText = text.length >= 40;
            await api.contents.create({
              type: 'reading',
              title,
              body: isText ? text : '',
              sourceType: 'user',
              sourceUrl: validUrl(url) ? url : null,
              domain: direction,
              tags: ['用户添加', difficulty.value, ...normalizeTagsInput(tagsInput.value)],
              meta: {
                direction,
                difficulty: difficulty.value,
                loadMode: isText ? 'text' : 'url',
                source: validUrl(url) ? new URL(url).hostname : '我的条目',
                summary: summaryInput.value.trim() || (isText ? text.slice(0, 140) : ''),
                url: validUrl(url) ? url : null,
                addedAt: new Date().toISOString()
              }
            });
            toast('已添加阅读条目', { type: 'success' });
            emitDataChanged({ type: 'reading-added' });
            close('added');
            load();
          } catch (error) {
            toast(error.message || '保存失败', { type: 'error' });
          } finally {
            setBusy(save, false);
          }
        });
      }
    });
  }

  const listener = onDataChanged((event) => {
    if (!event.detail?.type || String(event.detail.type).startsWith('reading')) {
      if (!readerZone.hidden) return;
      load();
    }
  });
  page._cleanup = () => {
    listener();
    if (reader?.destroy) reader.destroy();
  };

  load();
  return {
    el: page,
    onShow: () => {
      if (readerZone.hidden) load();
      else if (reader?.onHide) reader.onHide();
    },
    onHide: () => {
      if (reader?.onHide) reader.onHide();
    }
  };
}

/* ------------------------------------------------------------
   Browser
   ------------------------------------------------------------ */
export function createBrowserView(ctx) {
  const page = el('div', { class: 'module-page browser-page' });
  const urlInput = el('input', { class: 'input', placeholder: 'https://…', attrs: { spellcheck: 'false' } });
  const goButton = el('button', { class: 'btn primary', type: 'button' }, [icon('globe'), el('span', { text: '打开' })]);
  const extractButton = el('button', { class: 'btn', type: 'button' }, [icon('download'), el('span', { text: '提取正文' })]);
  const importButton = el('button', { class: 'btn', type: 'button' }, [icon('plus'), el('span', { text: '导入' })]);
  const batchButton = el('button', { class: 'btn', type: 'button' }, [icon('download'), el('span', { text: '批量导入' })]);
  const progress = el('div', { class: 'browser-progress' }, [el('div', { class: 'bar' })]);
  const webviewShell = el('div', { class: 'webview-shell' });
  const placeholder = el('div', { class: 'webview-placeholder' }, [
    icon('globe'),
    el('div', { class: 'empty-title', text: '在内置浏览器中打开网页' }),
    el('div', { class: 'empty-sub', text: '输入网址后按 Enter。网页与主界面隔离；提取正文时才运行 Readability。' })
  ]);
  const webview = document.createElement('webview');
  webviewShell.append(webview, placeholder);
  const browserZone = el('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: '0' } }, [
    el('div', { class: 'browser-toolbar' }, [
      el('div', { class: 'browser-url' }, [urlInput]),
      goButton,
      extractButton,
      importButton,
      batchButton
    ]),
    progress,
    webviewShell
  ]);
  const readerZone = el('div', { hidden: true, style: { height: '100%', overflowY: 'auto', padding: '24px' } });
  page.append(browserZone, readerZone);
  let reader = null;
  let articleTitle = '';
  let currentUrl = '';
  let navigating = false;

  const setPlaceholder = (title, sub, show = true) => {
    placeholder.innerHTML = '';
    placeholder.append(icon('globe'), el('div', { class: 'empty-title', text: title }), el('div', { class: 'empty-sub', text: sub }));
    placeholder.hidden = !show;
  };

  function normalizeInput(value) {
    let raw = String(value || '').trim();
    if (!raw) return '';
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    return validUrl(raw) ? raw : '';
  }

  function navigate(value = urlInput.value) {
    const target = normalizeInput(value);
    if (!target) {
      toast('请输入有效的 http/https 网址', { type: 'warn' });
      return;
    }
    urlInput.value = target;
    currentUrl = target;
    navigating = true;
    setPlaceholder('正在加载网页…', target, true);
    progress.querySelector('.bar').style.width = '12%';
    if (webview.getAttribute('src') !== target) webview.setAttribute('src', target);
    else webview.reload();
  }

  goButton.addEventListener('click', () => navigate());
  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') navigate();
  });

  webview.addEventListener('did-start-loading', () => {
    navigating = true;
    progress.querySelector('.bar').style.width = '32%';
    setPlaceholder('正在加载网页…', currentUrl, true);
  });
  webview.addEventListener('did-stop-loading', () => {
    navigating = false;
    progress.querySelector('.bar').style.width = '100%';
    setTimeout(() => { progress.querySelector('.bar').style.width = '0'; }, 350);
    placeholder.hidden = true;
    if (webview.getURL()) urlInput.value = webview.getURL();
  });
  webview.addEventListener('did-navigate', (event) => {
    currentUrl = event.url;
    urlInput.value = event.url;
  });
  webview.addEventListener('page-title-updated', (event) => {
    articleTitle = event.title || articleTitle;
  });
  webview.addEventListener('did-fail-load', (event) => {
    if (event.errorCode === -3) return;
    navigating = false;
    progress.querySelector('.bar').style.width = '0';
    setPlaceholder('网页加载失败', event.errorDescription || '请检查网址与网络连接。', true);
    toast('网页加载失败：' + (event.errorDescription || '未知错误'), { type: 'error' });
  });
  webview.addEventListener('ipc-message', (event) => {
    if (event.channel === 'reader:page-info') {
      const info = event.args?.[0];
      if (info?.url) urlInput.value = info.url;
      if (info?.title) articleTitle = info.title;
    }
  });
  webview.addEventListener('dom-ready', () => {
    setPlaceholder('正在加载网页…', currentUrl, true);
    try { webview.send('reader:request-info'); } catch { /* ignore */ }
  });

  async function extractArticle() {
    const url = webview.getURL();
    if (!url || url === 'about:blank') throw new Error('请先打开一个网页');
    if (navigating) throw new Error('网页仍在加载，请稍候再提取');
    const source = await api.reading.readabilitySource();
    const script = `(function(){try{var module={exports:{}};var exports=module.exports;${source};var R=module.exports;var article=new R(document.cloneNode(true),{charThreshold:180}).parse();if(!article||!article.textContent){return {error:'NO_CONTENT',title:document.title,url:location.href,text:''};}return {title:article.title||document.title,url:location.href,text:article.textContent.trim(),excerpt:article.excerpt||''};}catch(e){return {error:String(e&&e.message||e),title:document.title,url:location.href,text:''};}})()`;
    const result = await webview.executeJavaScript(script, true);
    if (!result || result.error) {
      return { ok: false, title: articleTitle || webview.getTitle() || url, url, text: '', error: result?.error || 'NO_CONTENT' };
    }
    return { ok: true, ...result };
  }

  async function extract() {
    setBusy(extractButton, true, '提取中…');
    try {
      const result = await extractArticle();
      if (!result.ok || !result.text || result.text.length < 180) {
        openImportDialog({
          title: result.title || '',
          url: result.url || webview.getURL(),
          body: '',
          direction: state.direction,
          fallback: true
        });
        toast('自动提取为空或过短，已切换到粘贴文本模式', { type: 'warn' });
        return;
      }
      await viewArticle(result);
    } catch (error) {
      toast(error.message || '提取正文失败', { type: 'error' });
    } finally {
      setBusy(extractButton, false);
    }
  }

  async function viewArticle(article) {
    const record = await api.reading.saveHistory({
      title: article.title || urlInput.value,
      source: new URL(article.url || urlInput.value).hostname,
      sourceUrl: article.url || urlInput.value,
      direction: state.direction,
      body: article.text
    });
    browserZone.hidden = true;
    readerZone.hidden = false;
    readerZone.innerHTML = '';
    if (reader?.destroy) reader.destroy();
    reader = createReader({
      title: article.title || '网页阅读',
      source: new URL(article.url || urlInput.value).hostname,
      sourceUrl: article.url || urlInput.value,
      direction: state.direction,
      body: article.text,
      historyId: record.id,
      initialWordCount: 0,
      backLabel: '返回网页',
      onBack: () => {
        if (reader?.destroy) reader.destroy();
        reader = null;
        readerZone.hidden = true;
        readerZone.innerHTML = '';
        browserZone.hidden = false;
      }
    });
    readerZone.appendChild(reader.el);
    readerZone.scrollTop = 0;
  }

  extractButton.addEventListener('click', extract);
  importButton.addEventListener('click', async () => {
    setBusy(importButton, true, '提取中…');
    try {
      const result = await extractArticle();
      const fallback = !result.ok || !result.text || result.text.length < 180;
      if (fallback) toast('自动提取失败，请粘贴正文后导入', { type: 'warn' });
      openImportDialog({
        title: result.title || '',
        url: result.url || webview.getURL(),
        body: fallback ? '' : result.text,
        direction: state.direction,
        fallback
      });
    } catch (error) {
      toast(error.message || '提取失败，请粘贴正文导入', { type: 'error' });
      openImportDialog({ title: articleTitle, url: currentUrl, body: '', direction: state.direction, fallback: true });
    } finally {
      setBusy(importButton, false);
    }
  });
  batchButton.addEventListener('click', openBatchPanel);

  return {
    el: page,
    isWebview: true,
    onShow: () => {
      if (state.pendingBrowserUrl) {
        const target = state.pendingBrowserUrl;
        state.pendingBrowserUrl = null;
        navigate(target);
      }
      if (reader?.onHide) reader.onHide();
    },
    onHide: () => {
      if (reader?.onHide) reader.onHide();
    },
    _cleanup: () => {
      if (reader?.destroy) reader.destroy();
      try { webview.remove(); } catch { /* ignore */ }
    }
  };
}

/* ------------------------------------------------------------
   Reading history
   ------------------------------------------------------------ */
export function createReadingHistoryView(ctx) {
  const direction = state.direction;
  const page = el('div', { class: 'module-page' });
  const listZone = el('div', { class: 'stack' });
  const detailZone = el('div', { hidden: true, style: { height: '100%', overflowY: 'auto' } });
  const listWrap = el('div', { style: { height: 'calc(100vh - 300px)', minHeight: '280px' } });
  let reader = null;

  const filter = new FilterBar({
    listId: `reading:${direction}:history`,
    kind: 'records',
    placeholder: '搜索阅读标题或正文…',
    onQuery: () => load()
  });

  const vlist = new VirtualList({
    rowHeight: 98,
    empty: emptyState({ iconName: 'clock', title: '还没有阅读记录', sub: '打开任意推荐阅读或网页提取正文后，记录会保存在这里。' }),
    renderRow: (item) => {
      const row = el('div', { class: 'history-row reading-history-row', style: { cursor: 'pointer' } }, [
        el('div', { class: 'history-main' }, [
          el('div', { class: 'history-title', text: item.title }),
          el('div', { class: 'history-excerpt', text: item.source || item.excerpt || '' }),
          el('div', { class: 'history-meta' }, [
            el('span', { class: 'badge accent', text: directionLabel(item.direction) }),
            el('span', { text: formatDate(item.created_at) }),
            el('span', { class: 'meta-dot' }),
            el('span', { text: `${item.word_count || 0} 个生词` }),
            ...(item.tags || []).slice(0, 3).map((tag) => el('span', { class: 'tag', text: tag }))
          ])
        ]),
        el('div', { class: 'list-actions' }, [
          el('button', { class: 'btn sm', type: 'button', text: '重开' }),
          el('button', { class: 'btn ghost sm icon-only', type: 'button', title: '删除', onclick: (event) => { event.stopPropagation(); removeRecord(item); } }, icon('trash'))
        ])
      ]);
      row.addEventListener('click', () => openRecord(item.id));
      row.querySelector('.btn.sm').addEventListener('click', (event) => {
        event.stopPropagation();
        openRecord(item.id);
      });
      return row;
    }
  });
  listWrap.appendChild(vlist.el);

  listZone.append(
    pageHeader({
      kicker: `HISTORY · ${directionLabel(direction)}`,
      title: '阅读历史',
      sub: '保存已读篇章的标题、来源、时间、方向与生词数；可重开继续查词与朗读。'
    }),
    filter.el,
    listWrap
  );
  page.append(listZone, detailZone);

  async function load() {
    const query = filter.getState();
    try {
      const [items, tags] = await Promise.all([
        api.records.list('reading', { ...query, direction }),
        api.records.tagCounts('reading')
      ]);
      filter.setTagOptions(tags);
      vlist.setItems(items);
    } catch (error) {
      toast(error.message || '读取阅读历史失败', { type: 'error' });
    }
  }

  async function openRecord(id) {
    try {
      const record = await api.records.get('reading', id);
      if (!record) throw new Error('记录不存在');
      listZone.hidden = true;
      detailZone.hidden = false;
      detailZone.innerHTML = '';
      if (reader?.destroy) reader.destroy();
      reader = createReader({
        title: record.title,
        source: record.source,
        sourceUrl: record.source_url,
        direction: record.direction,
        body: record.body,
        historyId: record.id,
        initialWordCount: record.word_count || 0,
        backLabel: '返回历史',
        onBack: () => {
          if (reader?.destroy) reader.destroy();
          reader = null;
          detailZone.hidden = true;
          detailZone.innerHTML = '';
          listZone.hidden = false;
          load();
        }
      });
      detailZone.appendChild(reader.el);
      detailZone.scrollTop = 0;
    } catch (error) {
      toast(error.message || '打开记录失败', { type: 'error' });
    }
  }

  async function removeRecord(item) {
    if (!(await confirmDialog({ title: '删除阅读记录', message: `确认删除「${item.title}」？`, confirmLabel: '删除', danger: true }))) return;
    try {
      await api.records.remove('reading', item.id);
      toast('已删除阅读记录', { type: 'success' });
      load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  const listener = onDataChanged((event) => {
    if (!event.detail?.type || String(event.detail.type).startsWith('reading')) {
      if (detailZone.hidden) load();
    }
  });
  page._cleanup = () => {
    listener();
    if (reader?.destroy) reader.destroy();
  };
  load();
  return {
    el: page,
    onShow: load,
    onHide: () => {
      if (reader?.onHide) reader.onHide();
    }
  };
}

