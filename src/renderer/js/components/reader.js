import { el, icon, countWords, directionLabel, hostname } from '../utils.js';
import { toast, emptyState } from '../ui.js';
import { openImportDialog } from './import-dialog.js';
import api from '../api.js';

function dictionaryPlainText(payload) {
  const lines = [];
  if (payload?.phonetic) lines.push(payload.phonetic);
  for (const meaning of payload?.meanings || []) {
    for (const definition of meaning.definitions || []) {
      lines.push(`${meaning.partOfSpeech ? meaning.partOfSpeech + '. ' : ''}${definition.definition}`);
      if (definition.example) lines.push(`例：${definition.example}`);
    }
  }
  return lines.join('\n');
}

function splitSentences(text) {
  const parts = String(text || '').match(/[^.!?]+[.!?]+["')\]]?|[^.!?]+$/g);
  return parts ? parts.map((part) => part.trim()).filter(Boolean) : [String(text || '')];
}

export function createReader({
  title,
  source = '',
  sourceUrl = '',
  direction = 'exam',
  body = '',
  historyId = null,
  initialWordCount = 0,
  onBack,
  backLabel = '返回列表'
}) {
  const root = el('div', { class: 'reader-page' });
  const popover = document.getElementById('word-popover');
  const addedWords = new Set();
  let popoverToken = 0;
  let longSentenceMode = direction === 'research';
  let speaking = false;
  let destroyed = false;
  let wordCount = Number(initialWordCount) || 0;
  let fullText = String(body || '');

  const countEl = el('span', { text: `${wordCount} 个生词` });
  const articleBody = el('div', { class: 'reader-body' });
  const speechButton = el('button', { class: 'btn sm', type: 'button' }, [icon('play'), el('span', { text: '朗读全文' })]);
  const stopButton = el('button', { class: 'btn sm ghost', type: 'button' }, [icon('pause'), el('span', { text: '停止' })]);
  const longToggle = el('button', { class: `btn sm ${longSentenceMode ? 'soft' : ''}`.trim(), type: 'button' }, [icon('spark'), el('span', { text: '高亮长难句' })]);

  async function addWord(word, payload, trigger) {
    if (!payload) return;
    const plain = dictionaryPlainText(payload);
    const examples = (payload.meanings || [])
      .flatMap((m) => (m.definitions || []).map((d) => d.example).filter(Boolean))
      .slice(0, 5);
    try {
      trigger.disabled = true;
      trigger.textContent = '加入中…';
      const result = await api.words.add({
        word,
        meaning: plain,
        phonetic: payload.phonetic || '',
        examples,
        meanings: payload.meanings || [],
        origin: '阅读',
        tags: ['阅读'],
        sourceUrl
      });
      if (result.created) {
        addedWords.add(word.toLowerCase());
        wordCount += 1;
        countEl.textContent = `${wordCount} 个生词`;
        if (historyId) {
          try { await api.records.incrementReadingWords(historyId); } catch { /* ignore */ }
        }
        toast(`已把 “${word}” 加入生词本`, { type: 'success' });
      } else {
        toast(`“${word}” 已在生词本中`, { type: 'warn' });
      }
      trigger.textContent = '已加入生词本';
      trigger.disabled = true;
    } catch (error) {
      trigger.disabled = false;
      trigger.textContent = '加入生词本';
      toast(error.message || '加入失败', { type: 'error' });
    }
  }

  async function addTerm(word, payload, trigger) {
    if (!payload) return;
    const meaning = payload.meanings?.[0]?.definitions?.[0]?.definition || '';
    if (!meaning) {
      toast('该词条没有可用于术语库的释义', { type: 'warn' });
      return;
    }
    try {
      trigger.disabled = true;
      const existing = await api.contents.list({ type: 'term', search: word, sort: 'title', includeHidden: true });
      if (existing.some((item) => item.title.toLowerCase() === word.toLowerCase())) {
        toast('术语库中已有该词', { type: 'warn' });
        trigger.textContent = '已在术语库';
        return;
      }
      await api.contents.create({
        type: 'term',
        title: word,
        body: meaning,
        sourceType: 'user',
        domain: '科研',
        tags: ['阅读', '科研'],
        meta: { addedFrom: '阅读', sourceUrl }
      });
      trigger.textContent = '已加入术语库';
      toast(`“${word}” 已加入术语库`, { type: 'success' });
    } catch (error) {
      trigger.disabled = false;
      trigger.textContent = '加入术语库';
      toast(error.message || '操作失败', { type: 'error' });
    }
  }

  function hidePopover() {
    popoverToken += 1;
    popover.hidden = true;
    popover.innerHTML = '';
  }

  function positionPopover(anchor) {
    const rect = anchor.getBoundingClientRect();
    const width = 320;
    const left = Math.min(window.innerWidth - width - 16, Math.max(12, rect.left - 20));
    const estimatedHeight = 300;
    let top = rect.bottom + 10;
    if (top + estimatedHeight > window.innerHeight - 12) top = Math.max(12, rect.top - estimatedHeight - 10);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  async function openWord(word, anchor) {
    if (!word) return;
    const token = ++popoverToken;
    positionPopover(anchor);
    popover.hidden = false;
    popover.innerHTML = '';
    const loading = el('div', { class: 'loading-block' }, [el('span', { class: 'spinner' }), el('span', { text: `正在查询 “${word}”…` })]);
    popover.appendChild(loading);
    document.querySelectorAll('.word-token.active').forEach((node) => node.classList.remove('active'));
    anchor.classList.add('active');

    let response;
    try {
      response = await api.dictionary.lookup(word);
    } catch (error) {
      response = { ok: false, error: { message: error.message || '查询失败' } };
    }
    if (token !== popoverToken || destroyed) return;

    popover.innerHTML = '';
    const close = el('button', {
      class: 'btn ghost icon-only sm pop-close', type: 'button', title: '关闭', onclick: hidePopover
    }, icon('close'));
    if (!response.ok) {
      popover.append(close,
        el('div', { class: 'pop-word', text: word }),
        el('div', { class: 'pop-meaning', text: response.error?.message || '词典接口暂不可用' }),
        el('div', { class: 'pop-actions' }, [
          el('button', { class: 'btn sm', type: 'button', text: '重新查询', onclick: () => openWord(word, anchor) })
        ])
      );
      return;
    }
    const payload = response.payload;
    const meaningWrap = el('div', { class: 'pop-meaning' });
    const firstMeanings = (payload.meanings || []).slice(0, 3);
    if (!firstMeanings.length) meaningWrap.textContent = '词典未返回释义。';
    for (const meaning of firstMeanings) {
      meaningWrap.appendChild(el('div', { style: { marginBottom: '7px' } }, [
        el('span', { class: 'pos', text: meaning.partOfSpeech || '释义', style: { display: 'block', marginBottom: '2px' } }),
        el('span', { text: meaning.definitions?.[0]?.definition || '' }),
        meaning.definitions?.[0]?.example
          ? el('span', { class: 'tiny faint', style: { display: 'block', marginTop: '2px', fontStyle: 'italic' }, text: `例：${meaning.definitions[0].example}` })
          : null
      ]));
    }
    const addBtn = el('button', { class: 'btn sm primary', type: 'button' }, [icon('plus'), el('span', { text: addedWords.has(word.toLowerCase()) ? '已加入生词本' : '加入生词本' })]);
    addBtn.disabled = addedWords.has(word.toLowerCase());
    addBtn.addEventListener('click', () => addWord(word, payload, addBtn));
    const actions = [addBtn];
    if (direction === 'research') {
      const termBtn = el('button', { class: 'btn sm', type: 'button' }, [icon('book'), el('span', { text: '加入术语库' })]);
      termBtn.addEventListener('click', () => addTerm(word, payload, termBtn));
      actions.push(termBtn);
    }
    popover.append(
      close,
      el('div', { class: 'pop-word', text: payload.word || word }),
      el('div', { class: 'pop-phonetic', text: payload.phonetic || '—' }),
      meaningWrap,
      el('div', { class: 'pop-actions' }, actions)
    );
  }

  function tokenize(text) {
    const fragment = document.createDocumentFragment();
    const regex = /([A-Za-z][A-Za-z'’-]*)/g;
    let last = 0;
    let match;
    while ((match = regex.exec(text))) {
      if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
      const word = match[0];
      const span = el('span', { class: 'word-token', text: word });
      span.addEventListener('click', (event) => {
        event.stopPropagation();
        openWord(word.toLowerCase().replace(/['’]s$/, ''), span);
      });
      fragment.appendChild(span);
      last = match.index + match[0].length;
    }
    if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
    return fragment;
  }

  function buildParagraph(text, index) {
    const p = el('p', { class: 'reader-paragraph', id: `read-p-${index}` });
    const speak = el('button', {
      class: 'para-speak', type: 'button', title: '朗读这一段', onclick: () => speakText(text)
    }, icon('play'));
    p.appendChild(speak);
    if (direction === 'research') {
      for (const sentence of splitSentences(text)) {
        const span = el('span', { class: countWords(sentence) >= 25 ? 'long-sentence' : '' });
        span.appendChild(tokenize(sentence));
        if (!/[.!?]["')\]]?\s*$/.test(sentence)) span.appendChild(document.createTextNode(' '));
        p.appendChild(span);
      }
    } else {
      p.appendChild(tokenize(text));
    }
    return p;
  }

  function renderBody() {
    articleBody.innerHTML = '';
    let paragraphs = String(body || '').split(/\n\s*\n+/).map((item) => item.trim()).filter(Boolean);
    if (paragraphs.length === 1) {
      const lines = paragraphs[0].split(/\n+/).map((item) => item.trim()).filter(Boolean);
      if (lines.length > 1) paragraphs = lines;
    }
    fullText = paragraphs.join('\n\n');
    if (!paragraphs.length) {
      articleBody.appendChild(emptyState({ iconName: 'book', title: '没有可显示的正文', sub: '请返回后重新提取或粘贴文本。' }));
      return;
    }
    paragraphs.forEach((paragraph, index) => articleBody.appendChild(buildParagraph(paragraph, index + 1)));
  }

  function updateLongSentence() {
    for (const node of articleBody.querySelectorAll('.long-sentence')) {
      node.style.background = longSentenceMode ? '' : 'transparent';
    }
    longToggle.classList.toggle('soft', longSentenceMode);
  }

  function speakText(text) {
    if (!('speechSynthesis' in window)) {
      toast('当前环境不支持 Web Speech API', { type: 'warn' });
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text || '').slice(0, 12000));
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => { speaking = true; updateSpeechButtons(); };
    utterance.onend = () => { speaking = false; updateSpeechButtons(); };
    utterance.onerror = () => { speaking = false; updateSpeechButtons(); };
    window.speechSynthesis.speak(utterance);
  }

  function updateSpeechButtons() {
    const label = speechButton.querySelector('span');
    if (label) label.textContent = speaking ? '正在朗读' : '朗读全文';
  }

  speechButton.addEventListener('click', () => speakText(fullText));
  stopButton.addEventListener('click', () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speaking = false;
    updateSpeechButtons();
  });
  longToggle.addEventListener('click', () => {
    longSentenceMode = !longSentenceMode;
    updateLongSentence();
  });

  const sourceText = source || hostname(sourceUrl) || '本地文本';
  const meta = el('div', { class: 'reader-meta' }, [
    el('span', { class: 'badge accent', text: directionLabel(direction) }),
    el('span', { class: 'badge', text: sourceText }),
    el('span', { class: 'badge', text: `${countWords(body)} words` }),
    el('span', { class: 'meta-dot' }),
    countEl
  ]);

  const head = el('div', { class: 'reader-top' }, [
    el('div', { class: 'grow' }, [
      el('h3', { class: 'reader-title', text: title || '未命名阅读' }),
      meta
    ]),
    el('div', { class: 'actions' }, [
      el('button', {
        class: 'btn sm', type: 'button', title: '把当前正文导入阅读集合',
        onclick: () => openImportDialog({ title, url: sourceUrl, body, direction })
      }, [icon('plus'), el('span', { text: '导入' })]),
      el('button', { class: 'btn sm', type: 'button', onclick: () => onBack && onBack() }, [icon('back'), el('span', { text: backLabel })])
    ])
  ]);

  const tools = el('div', { class: 'reader-tools' }, [
    speechButton,
    stopButton,
    direction === 'research' ? longToggle : null,
    direction === 'daily'
      ? el('span', { class: 'tiny faint', text: '日常方向：点击单词查词，点段首按钮朗读。' })
      : null
  ]);

  if (direction === 'research') {
    root.appendChild(el('div', { class: 'reader-annotation' }, [
      icon('spark'),
      el('span', { text: '科研方向：长难句已标记；查词结果可直接加入术语库。' })
    ]));
  }

  root.append(head, tools, articleBody);
  if (direction === 'exam') {
    root.appendChild(el('div', { class: 'exam-placeholder' }, [
      el('strong', { text: '题目模式 · 预留区' }),
      el('span', { text: '考试方向的题目模式尚未启用。本篇阅读仍可查词、朗读并记录生词。' })
    ]));
  }

  renderBody();
  updateLongSentence();

  const onDocumentClick = (event) => {
    if (popover.hidden) return;
    if (popover.contains(event.target) || event.target.closest('.word-token')) return;
    hidePopover();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') hidePopover();
  };
  document.addEventListener('mousedown', onDocumentClick);
  document.addEventListener('keydown', onKey);

  const destroy = () => {
    destroyed = true;
    popoverToken += 1;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    document.removeEventListener('mousedown', onDocumentClick);
    document.removeEventListener('keydown', onKey);
    if (!popover.hidden) hidePopover();
  };

  return {
    el: root,
    destroy,
    onHide: () => {
      hidePopover();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      speaking = false;
      updateSpeechButtons();
    }
  };
}
