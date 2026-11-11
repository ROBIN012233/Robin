import { el, icon, debounce, formatDate, normalizeTagsInput, setBusy, countWords, emitDataChanged, onDataChanged, directionLabel } from '../utils.js';
import { pageHeader, toast, emptyState, openModal, confirmDialog, tagList, notice } from '../ui.js';
import { FilterBar } from '../filter-bar.js';
import { VirtualList } from '../virtual-list.js';
import { renderTranslationResult } from '../components/translation-result.js';
import api from '../api.js';
import { state } from '../state.js';

function newTranslationView(ctx) {
  const page = el('div', { class: 'module-page' });
  const composeZone = el('div', { class: 'compose-shell' });
  const resultZone = el('div', { class: 'translation-doc', hidden: true });
  const titleInput = el('input', { class: 'input', placeholder: '例如：Attention Is All You Need — 第 3 节' });
  const tagsInput = el('input', { class: 'input', placeholder: '翻译标签，逗号分隔（可选）' });
  const textarea = el('textarea', {
    class: 'textarea',
    style: { minHeight: '260px' },
    placeholder: '粘贴英文论文、摘要或章节文本… 也可以上传 .txt / .md / .pdf 文件。'
  });
  const fileInput = el('input', { type: 'file', accept: '.txt,.md,.pdf,text/plain,text/markdown,application/pdf' });
  const charCount = el('span', { class: 'tiny faint', text: '0 字符 · 0 段' });
  const termHint = el('span', { class: 'tiny faint', text: '正在读取术语库…' });
  const progressBox = el('div', { class: 'translation-progress', hidden: true });
  const progressText = el('div', { class: 'progress-label' });
  const progressTrack = el('div', { class: 'progress-track' }, [el('div', { class: 'progress-fill indeterminate' })]);
  const progressSteps = el('div', { class: 'progress-steps' });
  const runButton = el('button', { class: 'btn primary', type: 'button' }, [icon('spark'), el('span', { text: '开始翻译' })]);
  const uploadButton = el('button', { class: 'btn', type: 'button' }, [icon('upload'), el('span', { text: '上传文件' })]);
  const fileInfo = el('div', { class: 'field-hint', text: '支持 .txt / .md / .pdf；PDF 在渲染进程用 pdf.js 提取文本。超过 8000 字符自动分段。' });
  let running = false;
  let currentStage = '';
  let unsubscribe = null;

  const updateCount = () => {
    const text = textarea.value;
    const paragraphs = text.split(/\n\s*\n+/).filter((item) => item.trim()).length;
    charCount.textContent = `${text.length} 字符 · ${paragraphs || 0} 段`;
  };
  textarea.addEventListener('input', updateCount);
  updateCount();

  async function loadTermCount() {
    try {
      const terms = await api.contents.list({ type: 'term', sort: 'title', includeHidden: true });
      termHint.textContent = terms.length
        ? `术语库已有 ${terms.length} 条术语，将自动作为参考并锁定译法`
        : '术语库为空；本次会先提取术语再翻译';
    } catch {
      termHint.textContent = '术语库读取失败，仍可继续翻译';
    }
  }
  loadTermCount();

  async function loadFile(file) {
    if (!file) return;
    const name = file.name || '未命名文件';
    const lower = name.toLowerCase();
    setBusy(uploadButton, true, '读取中…');
    try {
      let text = '';
      if (lower.endsWith('.pdf')) {
        const { extractPdfText } = await import('../pdf.js');
        text = await extractPdfText(file, (pageNumber, total) => {
          setBusy(uploadButton, true, `PDF ${pageNumber}/${total}`);
        });
      } else if (lower.endsWith('.txt') || lower.endsWith('.md')) {
        text = await file.text();
      } else {
        throw new Error('仅支持 .txt / .md / .pdf 文件');
      }
      if (!text.trim()) throw new Error('文件没有可提取的文本');
      textarea.value = text;
      if (!titleInput.value.trim()) titleInput.value = name.replace(/\.[^.]+$/, '');
      updateCount();
      toast(`已读取 ${name}（${text.length} 字符）`, { type: 'success' });
    } catch (error) {
      toast(error.message || '文件读取失败', { type: 'error' });
    } finally {
      setBusy(uploadButton, false);
      fileInput.value = '';
    }
  }

  uploadButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => loadFile(fileInput.files?.[0]));

  const steps = [
    { key: 'terms', label: '术语提取' },
    { key: 'translate', label: '分段翻译' },
    { key: 'back', label: '双栏回译' },
    { key: 'outline', label: '生成大纲' },
    { key: 'done', label: '保存' }
  ];
  const renderSteps = (stage, status = '') => {
    progressSteps.innerHTML = '';
    const order = steps.map((step) => step.key);
    const activeIndex = order.indexOf(stage);
    for (const [index, step] of steps.entries()) {
      const cls = stage === 'done' || (activeIndex >= 0 && index < activeIndex) ? 'done'
        : index === activeIndex ? 'active' : '';
      progressSteps.appendChild(el('span', { class: `progress-step ${cls}`.trim(), text: step.label }));
    }
    if (status) progressText.append(el('span', { class: `badge ${status === 'error' ? 'bad' : 'accent'}`, text: status === 'error' ? '失败' : '进行中' }));
  };

  const showProgress = (show) => { progressBox.hidden = !show; };

  unsubscribe = api.translation.onProgress((progress) => {
    if (!running) return;
    currentStage = progress.stage;
    progressText.innerHTML = '';
    progressText.append(
      el('span', { text: progress.message || '处理中…' }),
      el('span', { class: 'tiny faint', text: progress.total ? `${progress.current}/${progress.total}` : '' })
    );
    renderSteps(progress.stage, progress.stage === 'error' ? 'error' : '');
    const fill = progressTrack.querySelector('.progress-fill');
    if (progress.total > 0 && progress.stage !== 'terms' && progress.stage !== 'translate' && progress.stage !== 'back') {
      fill.classList.remove('indeterminate');
    }
  });

  async function run() {
    if (running) return;
    const text = textarea.value.trim();
    if (text.length < 20) {
      toast('请先粘贴或上传至少 20 个字符的英文原文', { type: 'warn' });
      return;
    }
    running = true;
    setBusy(runButton, true, '翻译中…');
    showProgress(true);
    progressText.innerHTML = '';
    progressText.append(el('span', { text: '准备术语表…' }), el('span', { class: 'tiny faint', text: '' }));
    renderSteps('terms', 'active');
    try {
      const response = await api.translation.run({
        title: titleInput.value.trim(),
        text,
        tags: normalizeTagsInput(tagsInput.value)
      });
      if (!response.ok) {
        progressText.innerHTML = '';
        progressText.append(el('span', { text: response.error.message }), el('span', { class: 'badge bad', text: '接口未连接或返回失败' }));
        renderSteps('terms', 'error');
        toast(response.error.message || '翻译失败', { type: 'error' });
        return;
      }
      showProgress(false);
      emitDataChanged({ type: 'translation-created', id: response.record.id });
      showResult(response.record);
      toast('翻译完成，已保存到翻译历史', { type: 'success' });
    } catch (error) {
      toast(error.message || '翻译失败', { type: 'error' });
    } finally {
      running = false;
      setBusy(runButton, false);
    }
  }
  runButton.addEventListener('click', run);

  function showResult(record) {
    composeZone.hidden = true;
    resultZone.hidden = false;
    resultZone.innerHTML = '';
    const result = renderTranslationResult(record, {
      backLabel: '返回新建',
      title: '新建翻译',
      onBack: () => {
        resultZone.hidden = true;
        composeZone.hidden = false;
        page.scrollTop = 0;
      }
    });
    resultZone.appendChild(result.el);
    page.scrollTop = 0;
  }

  const lead = el('div', { class: 'compose-lead' }, [
    el('div', { class: 'grow' }, [
      el('h3', { text: '从英文原文到可校对的中文译文' }),
      el('p', { text: '三步固定流程：先锁定术语，再分段翻译，最后逐段回译并生成大纲。' })
    ]),
    el('div', { class: 'actions' }, [uploadButton])
  ]);

  const form = el('div', { class: 'compose-grid' }, [
    el('div', { class: 'stack-sm' }, [
      el('div', { class: 'field' }, [
        el('div', { class: 'field-label' }, [el('span', { text: '文档标题' }), el('span', { class: 'hint', text: '可留空，自动取首段' })]),
        titleInput
      ]),
      el('div', { class: 'field' }, [
        el('div', { class: 'field-label' }, [el('span', { text: '英文原文' }), charCount]),
        textarea,
        fileInfo
      ]),
      el('div', { class: 'field' }, [
        el('div', { class: 'field-label' }, [el('span', { text: '标签' })]),
        tagsInput
      ]),
      el('div', { class: 'actions' }, [
        runButton,
        el('span', { class: 'tiny faint', text: '超时 30 秒 · 失败自动重试 1 次' })
      ]),
      progressBox
    ]),
    el('aside', { class: 'compose-aside' }, [
      el('div', { class: 'panel tight' }, [
        el('div', { class: 'section-title', text: '术语锁定' }),
        el('p', { class: 'tiny muted', text: '翻译前先提取 JSON 术语表，temperature 0.1；翻译时注入术语并锁定译法，temperature 0.2。' }),
        el('div', { style: { marginTop: '8px' } }, termHint)
      ]),
      el('div', { class: 'panel tight' }, [
        el('div', { class: 'section-title', text: '双栏回译' }),
        el('p', { class: 'tiny muted', text: '中文译文完成后回译为英文，与译文并排、段落编号对齐，便于检查漏译与误译。' })
      ]),
      el('div', { class: 'panel tight' }, [
        el('div', { class: 'section-title', text: '大纲后置' }),
        el('p', { class: 'tiny muted', text: '从章节标题与段落结构生成大纲；点击节点可滚动到对应段落。' })
      ])
    ])
  ]);

  progressBox.append(progressText, progressTrack, progressSteps);
  composeZone.append(
    pageHeader({
      kicker: 'TRANSLATION · 三层校验',
      title: '新建翻译',
      sub: '上传或粘贴文本，译法会与术语库保持一致。',
      actions: [el('span', { class: 'badge accent', text: '术语 → 翻译 → 回译' })]
    }),
    el('div', { class: 'compose-card panel' }, [lead, form])
  );
  page.append(composeZone, resultZone, fileInput);
  page._cleanup = () => {
    if (unsubscribe) unsubscribe();
  };
  return { el: page };
}

function translationHistoryView(ctx) {
  const page = el('div', { class: 'module-page' });
  const listZone = el('div', { class: 'stack' });
  const detailZone = el('div', { hidden: true });
  const listWrap = el('div', { style: { height: 'calc(100vh - 300px)', minHeight: '260px' } });
  const vlist = new VirtualList({
    rowHeight: 96,
    empty: emptyState({ iconName: 'clock', title: '还没有翻译记录', sub: '新建一次翻译后，记录会出现在这里。' }),
    renderRow: (item) => {
      const row = el('div', { class: 'history-row', style: { cursor: 'pointer' } }, [
        el('div', { class: 'history-main' }, [
          el('div', { class: 'history-title', text: item.title }),
          el('div', { class: 'history-excerpt', text: item.excerpt || '' }),
          el('div', { class: 'history-meta' }, [
            el('span', { text: formatDate(item.created_at) }),
            item.tags?.length ? el('span', { class: 'meta-dot' }) : null,
            ...(item.tags || []).slice(0, 4).map((tag) => el('span', { class: 'tag', text: tag }))
          ])
        ]),
        el('div', { class: 'list-actions' }, [
          el('button', { class: 'btn sm', type: 'button', text: '打开' }),
          el('button', { class: 'btn ghost sm icon-only', type: 'button', title: '删除', onclick: (event) => {
            event.stopPropagation();
            removeRecord(item);
          } }, icon('trash'))
        ])
      ]);
      row.addEventListener('click', () => openRecord(item.id));
      row.querySelector('button').addEventListener('click', (event) => {
        event.stopPropagation();
        openRecord(item.id);
      });
      return row;
    }
  });
  listWrap.appendChild(vlist.el);
  const filter = new FilterBar({
    listId: 'translation-history',
    kind: 'records',
    placeholder: '搜索翻译标题或原文…',
    onQuery: () => load()
  });
  listZone.append(
    pageHeader({
      kicker: 'HISTORY',
      title: '翻译历史',
      sub: '每条记录保留原文、双栏译文、回译、大纲和术语表，可重新打开继续校对。'
    }),
    filter.el,
    listWrap
  );
  page.append(listZone, detailZone);

  async function load() {
    const q = filter.getState();
    try {
      const [items, tags] = await Promise.all([
        api.records.list('translation', q),
        api.records.tagCounts('translation')
      ]);
      filter.setTagOptions(tags);
      vlist.setItems(items);
    } catch (error) {
      toast(error.message || '读取翻译历史失败', { type: 'error' });
    }
  }

  async function openRecord(id) {
    try {
      const record = await api.records.get('translation', id);
      if (!record) throw new Error('记录不存在');
      listZone.hidden = true;
      detailZone.hidden = false;
      detailZone.innerHTML = '';
      const result = renderTranslationResult(record, {
        backLabel: '返回历史',
        title: '翻译历史',
        onBack: () => {
          detailZone.hidden = true;
          listZone.hidden = false;
        }
      });
      detailZone.appendChild(result.el);
      page.scrollTop = 0;
      ctx.router?.setWebviewMode(false);
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  async function removeRecord(item) {
    if (!(await confirmDialog({ title: '删除翻译记录', message: `确认删除「${item.title}」？该操作不可撤销。`, confirmLabel: '删除', danger: true }))) return;
    try {
      await api.records.remove('translation', item.id);
      toast('已删除翻译记录', { type: 'success' });
      load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  const removeListener = onDataChanged((event) => {
    if (!event.detail?.type || String(event.detail.type).startsWith('translation')) load();
  });
  page._cleanup = () => removeListener();
  load();
  return { el: page, onShow: () => { if (!detailZone.hidden) return; load(); } };
}

function termsView(ctx) {
  const page = el('div', { class: 'module-page' });
  const wrap = el('div', { style: { height: 'calc(100vh - 300px)', minHeight: '260px' } });
  const filter = new FilterBar({
    listId: 'term-library',
    kind: 'contents',
    placeholder: '搜索英文术语或中文译名…',
    onQuery: () => load()
  });
  const vlist = new VirtualList({
    rowHeight: 82,
    empty: emptyState({ iconName: 'book', title: '术语库为空', sub: '完成一次论文翻译后，提取的术语会自动去重合并到这里。' }),
    renderRow: (item) => {
      const row = el('div', { class: 'term-row' }, [
        el('div', { class: 'term-main' }, [
          el('div', { class: 'term-en', text: item.title }),
          el('div', { class: 'term-zh', text: item.body || '—' }),
          el('div', { class: 'history-meta' }, [
            item.domain ? el('span', { class: 'badge accent', text: item.domain }) : null,
            ...(item.tags || []).filter((tag) => tag !== item.domain).slice(0, 5).map((tag) => el('span', { class: 'tag', text: tag }))
          ])
        ]),
        el('div', { class: 'list-actions' }, [
          el('button', {
            class: 'btn ghost sm icon-only', type: 'button', title: '删除术语',
            onclick: () => removeTerm(item)
          }, icon('trash'))
        ])
      ]);
      return row;
    }
  });
  wrap.appendChild(vlist.el);
  page.append(
    pageHeader({
      kicker: 'GLOSSARY',
      title: '术语库',
      sub: '历次翻译提取的术语在这里去重合并；新建翻译会自动携带已有术语作为参考。'
    }),
    filter.el,
    wrap
  );

  async function load() {
    const q = filter.getState();
    try {
      const [items, tags] = await Promise.all([
        api.contents.list({ type: 'term', ...q }),
        api.contents.tagCounts({ type: 'term' })
      ]);
      filter.setTagOptions(tags);
      vlist.setItems(items);
    } catch (error) {
      toast(error.message || '读取术语库失败', { type: 'error' });
    }
  }

  async function removeTerm(item) {
    if (!(await confirmDialog({ title: '删除术语', message: `确认删除「${item.title} → ${item.body}」？`, confirmLabel: '删除', danger: true }))) return;
    try {
      await api.contents.remove(item.id);
      toast('已删除术语', { type: 'success' });
      emitDataChanged({ type: 'term-deleted' });
      load();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }

  const listener = onDataChanged((event) => {
    if (!event.detail?.type || event.detail.type === 'translation-created' || event.detail.type === 'term-deleted') load();
  });
  page._cleanup = () => listener();
  load();
  return { el: page, onShow: load };
}

export const translationViews = {
  new: newTranslationView,
  history: translationHistoryView,
  terms: termsView
};
