import { el, normalizeTagsInput, setBusy, emitDataChanged } from '../utils.js';
import { openModal, toast, notice } from '../ui.js';
import api from '../api.js';

export function openImportDialog({
  title = '',
  url = '',
  body = '',
  direction = 'exam',
  fallback = false,
  onImported
} = {}) {
  const titleInput = el('input', { class: 'input', value: title, placeholder: '文章标题' });
  const urlInput = el('input', { class: 'input', value: url, placeholder: 'https://…' });
  const tagInput = el('input', { class: 'input', placeholder: '标签，逗号分隔（自动附加域名标签）' });
  const bodyInput = el('textarea', {
    class: 'textarea',
    style: { minHeight: '190px' },
    placeholder: '在这里粘贴正文…'
  });
  bodyInput.value = body || '';
  const charCount = el('span', { class: 'tiny faint', text: `${(body || '').length} 字符` });
  bodyInput.addEventListener('input', () => {
    charCount.textContent = `${bodyInput.value.trim().length} 字符`;
  });

  const importButton = el('button', { class: 'btn primary wide', type: 'button' }, '导入阅读集合');
  const content = el('div', { class: 'stack-sm' }, [
    fallback ? notice('未能自动提取到足够正文，已切换到“粘贴文本”模式。你仍可补充标题、URL 与正文后入库。', 'warn') : null,
    el('div', { class: 'field' }, [
      el('div', { class: 'field-label' }, [el('span', { text: '标题' })]),
      titleInput
    ]),
    el('div', { class: 'field' }, [
      el('div', { class: 'field-label' }, [el('span', { text: '来源 URL' }), el('span', { class: 'hint', text: '可留空' })]),
      urlInput
    ]),
    el('div', { class: 'field' }, [
      el('div', { class: 'field-label' }, [el('span', { text: '正文' }), charCount]),
      bodyInput
    ]),
    el('div', { class: 'field' }, [
      el('div', { class: 'field-label' }, [el('span', { text: '补充标签' }), el('span', { class: 'hint', text: '入库方向：' + direction })]),
      tagInput
    ]),
    importButton
  ]);

  openModal({
    title: fallback ? '粘贴文本并导入' : '导入当前网页',
    subtitle: '正文会写入统一阅读集合，可在推荐阅读与阅读历史中找到。',
    body: content,
    wide: true,
    actions: [{ label: '取消', value: null }],
    onMount: (modal, close) => {
      importButton.addEventListener('click', async () => {
        const text = bodyInput.value.trim();
        if (text.length < 40) {
          toast('正文至少需要 40 个字符', { type: 'warn' });
          return;
        }
        const payload = {
          title: titleInput.value.trim() || '未命名网页',
          url: urlInput.value.trim(),
          body: text,
          direction,
          tags: normalizeTagsInput(tagInput.value)
        };
        setBusy(importButton, true, '导入中…');
        try {
          const created = await api.reading.import(payload);
          toast('已导入阅读集合', { type: 'success' });
          emitDataChanged({ type: 'reading-imported', item: created });
          if (onImported) onImported(created);
          close('imported');
        } catch (error) {
          toast(error.message || '导入失败', { type: 'error' });
        } finally {
          setBusy(importButton, false);
        }
      });
    }
  });
}
