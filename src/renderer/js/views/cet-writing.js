import { el, icon, countWords, formatDate, setBusy, onDataChanged } from '../utils.js';
import { pageHeader, toast, emptyState, notice } from '../ui.js';
import { renderWritingResult } from '../components/writing-result.js';
import api from '../api.js';
import { state } from '../state.js';

const TOPICS = [
  ['education', '教育'],
  ['technology', '科技'],
  ['environment', '环境'],
  ['society', '社会'],
  ['culture', '文化'],
  ['growth', '个人成长']
];

export function createWritingView() {
  const page = el('div', { class: 'module-page' });
  const textarea = el('textarea', {
    class: 'textarea',
    placeholder: 'Paste or write your English essay here…'
  });
  const topicSelect = el('select', { class: 'select' });
  for (const [value, label] of TOPICS) {
    topicSelect.appendChild(el('option', { value, text: label }));
  }
  const wordCount = el('span', { class: 'word-count', text: '0 words' });
  const submitButton = el('button', { class: 'btn primary', type: 'button' }, [icon('spark'), el('span', { text: '开始批改' })]);
  const resultZone = el('div');
  const recentZone = el('div', { class: 'recent-list' });
  const recentEmpty = el('p', { class: 'tiny faint', text: '还没有批改记录。' });
  const promptHint = el('div', { class: 'tiny faint', text: '可手动粘贴作文，或从“对点练习”的写作题提交后自动带入。' });
  let currentPrompt = '';
  let running = false;

  textarea.addEventListener('input', () => {
    wordCount.textContent = `${countWords(textarea.value)} words`;
  });

  async function loadRecent() {
    try {
      const rows = await api.records.list('writing', { sort: 'newest' });
      recentZone.innerHTML = '';
      if (!rows.length) {
        recentZone.appendChild(recentEmpty);
        return;
      }
      for (const row of rows.slice(0, 10)) {
        const button = el('button', { class: 'recent-item', type: 'button' }, [
          el('span', { class: 'ellipsis', style: { display: 'block' }, text: row.title }),
          el('span', { class: 'date', text: `${formatDate(row.created_at)}${row.offline ? ' · 离线范文' : ''}` })
        ]);
        button.addEventListener('click', () => openRecord(row.id));
        recentZone.appendChild(button);
      }
    } catch (error) {
      recentZone.innerHTML = '';
      recentZone.appendChild(el('span', { class: 'tiny faint', text: error.message }));
    }
  }

  function renderRecord(record) {
    resultZone.innerHTML = '';
    resultZone.appendChild(el('div', { class: 'section-title', text: '批改结果' }));
    const meta = el('div', { class: 'row-wrap', style: { marginBottom: '12px' } }, [
      el('span', { class: 'badge', text: formatDate(record.created_at) }),
      el('span', { class: 'badge accent', text: TOPICS.find(([value]) => value === record.topic)?.[1] || record.topic }),
      record.offline ? el('span', { class: 'badge warn', text: '内置范文案例' }) : el('span', { class: 'badge good', text: 'AI 批改' })
    ]);
    resultZone.appendChild(meta);
    resultZone.appendChild(renderWritingResult({
      ...(record.result || {}),
      offline: Boolean(record.result?.offline ?? record.offline),
      error: record.result?.error || null
    }));
  }

  async function openRecord(id) {
    try {
      const record = await api.records.get('writing', id);
      if (!record) throw new Error('记录不存在');
      textarea.value = record.original_text || '';
      wordCount.textContent = `${countWords(textarea.value)} words`;
      topicSelect.value = record.topic || 'education';
      renderRecord(record);
      resultZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      toast(error.message || '读取记录失败', { type: 'error' });
    }
  }

  async function submit() {
    if (running) return;
    const text = textarea.value.trim();
    if (countWords(text) < 30) {
      toast('作文至少需要 30 个英文词', { type: 'warn' });
      textarea.focus();
      return;
    }
    running = true;
    setBusy(submitButton, true, '批改中…');
    resultZone.innerHTML = '';
    resultZone.appendChild(el('div', { class: 'loading-block' }, [
      el('span', { class: 'spinner lg' }),
      el('span', { text: '正在从语法、结构、用词三个维度批改，并生成范文与对照分析…' })
    ]));
    try {
      const response = await api.writing.review({
        text,
        topic: topicSelect.value,
        prompt: currentPrompt || `Write an essay on the topic of ${topicSelect.value}.`
      });
      if (!response.ok) {
        resultZone.innerHTML = '';
        resultZone.appendChild(notice(response.error?.message || '批改失败', 'bad'));
        toast(response.error?.message || '批改失败', { type: 'error' });
        return;
      }
      renderRecord(response.record);
      loadRecent();
      requestAnimationFrame(() => {
        resultZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      if (response.offline) {
        toast('接口未连接：已展示内置范文案例，语法/结构/用词反馈暂不可用', { type: 'warn', duration: 6000 });
      } else {
        toast('批改完成，已保存最近 10 条记录', { type: 'success' });
      }
    } catch (error) {
      resultZone.innerHTML = '';
      resultZone.appendChild(notice(error.message || '批改失败', 'bad'));
      toast(error.message || '批改失败', { type: 'error' });
    } finally {
      running = false;
      setBusy(submitButton, false);
    }
  }

  submitButton.addEventListener('click', submit);

  const composer = el('div', { class: 'panel writing-input-card' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('div', { class: 'panel-title', text: '作文批改' }),
        el('div', { class: 'panel-sub', text: '每条反馈必须引用你的原文片段；结果下方固定展示参考范文、逐段点评与对照分析。' })
      ]),
      el('span', { class: 'badge accent', text: '30s timeout · 1 retry' })
    ]),
    textarea,
    el('div', { class: 'answer-tools' }, [
      el('div', { class: 'row-wrap' }, [
        el('span', { class: 'tiny faint', text: '话题' }),
        topicSelect,
        wordCount
      ]),
      el('div', { class: 'actions' }, [submitButton])
    ]),
    promptHint
  ]);

  const recentPanel = el('div', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('div', { class: 'panel-title', text: '最近批改' }),
        el('div', { class: 'panel-sub', text: '最多保留 10 条' })
      ])
    ]),
    recentZone
  ]);

  const top = el('div', { class: 'writing-top' }, [composer, recentPanel]);
  page.append(
    pageHeader({
      kicker: 'WRITING · FEEDBACK',
      title: '写作批改',
      sub: '语法、结构、用词三维度反馈，每条引用原文；范文、点评与 3 条以上对照分析固定展示。'
    }),
    top,
    resultZone
  );

  const listener = onDataChanged((event) => {
    if (!event.detail?.type || String(event.detail.type).startsWith('writing')) loadRecent();
  });
  page._cleanup = () => listener();
  loadRecent();

  return {
    el: page,
    onShow: () => {
      loadRecent();
      const pending = state.pendingWriting;
      if (pending) {
        state.pendingWriting = null;
        textarea.value = pending.text || '';
        wordCount.textContent = `${countWords(textarea.value)} words`;
        topicSelect.value = pending.topic || 'education';
        currentPrompt = pending.prompt || '';
        promptHint.textContent = currentPrompt ? `题目：${currentPrompt}` : '可手动粘贴作文，或从“对点练习”的写作题提交后自动带入。';
        page.scrollTop = 0;
        if (pending.autoSubmit) setTimeout(() => submit(), 120);
      }
    }
  };
}
