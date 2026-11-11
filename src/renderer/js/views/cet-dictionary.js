import { el, icon, setBusy } from '../utils.js';
import { pageHeader, toast, emptyState, notice } from '../ui.js';
import api from '../api.js';

function plainMeaning(payload) {
  const lines = [];
  for (const meaning of payload?.meanings || []) {
    for (const definition of meaning.definitions || []) {
      lines.push(`${meaning.partOfSpeech ? meaning.partOfSpeech + '. ' : ''}${definition.definition}`);
    }
  }
  return lines.join('\n');
}

export function createDictionaryView() {
  const page = el('div', { class: 'module-page' });
  const input = el('input', { class: 'input', placeholder: '输入英文单词，例如 resilient', attrs: { spellcheck: 'false' } });
  const searchButton = el('button', { class: 'btn primary', type: 'button' }, [icon('search'), el('span', { text: '查词' })]);
  const resultZone = el('div', { class: 'dict-result' });
  const historyZone = el('div', { class: 'history-chips' });
  let busy = false;

  const wrap = el('div', { class: 'dictionary-wrap' }, [
    pageHeader({
      kicker: 'DICTIONARY',
      title: '词典查词',
      sub: '调用外部词典接口，展示音标、释义与例句；可一键加入生词本。最近 20 次查询会保留。'
    }),
    el('div', { class: 'dict-search' }, [input, searchButton]),
    el('div', { class: 'tiny faint', style: { marginTop: '8px' }, text: '查询结果来自 dictionaryapi.dev；接口不可用时只显示明确错误，不会影响其他内置内容。' }),
    resultZone,
    el('div', { class: 'section-title', style: { marginTop: '26px' }, text: '最近查询' }),
    historyZone
  ]);
  page.appendChild(wrap);

  async function addToWordbook(payload, button) {
    try {
      setBusy(button, true, '加入中…');
      const result = await api.words.add({
        word: payload.word,
        meaning: plainMeaning(payload),
        phonetic: payload.phonetic,
        examples: (payload.meanings || []).flatMap((m) => (m.definitions || []).map((d) => d.example).filter(Boolean)).slice(0, 5),
        meanings: payload.meanings,
        origin: '词典',
        tags: ['词典'],
        sourceUrl: payload.sourceUrl
      });
      if (result.created) {
        toast(`已把 “${payload.word}” 加入生词本`, { type: 'success' });
        setBusy(button, false);
        button.textContent = '已加入生词本';
        button.disabled = true;
      } else {
        toast('该单词已在生词本中', { type: 'warn' });
        setBusy(button, false);
        button.textContent = '已在生词本';
        button.disabled = true;
      }
    } catch (error) {
      setBusy(button, false);
      toast(error.message || '加入失败', { type: 'error' });
    }
  }

  function renderResult(response, word) {
    resultZone.innerHTML = '';
    if (!response.ok) {
      const error = response.error || {};
      resultZone.appendChild(el('div', { class: 'panel' }, [
        notice(error.message || '词典接口暂不可用', 'bad'),
        el('div', { class: 'actions', style: { marginTop: '12px' } }, [
          el('button', { class: 'btn sm', type: 'button', text: '重试', onclick: () => lookup(word) })
        ])
      ]));
      return;
    }
    const payload = response.payload;
    const card = el('div', { class: 'panel' }, [
      el('div', { class: 'dict-word-line' }, [
        el('div', { class: 'dict-word', text: payload.word }),
        payload.phonetic ? el('div', { class: 'dict-phonetic', text: payload.phonetic }) : null,
        el('span', { class: 'badge', text: payload.source })
      ])
    ]);
    if (!payload.meanings?.length) {
      card.appendChild(el('p', { class: 'muted', text: '词典未返回释义。' }));
    }
    for (const meaning of payload.meanings || []) {
      const block = el('div', { class: 'meaning-block' }, [
        el('div', { class: 'pos', text: meaning.partOfSpeech || 'definition' })
      ]);
      for (const definition of meaning.definitions || []) {
        block.appendChild(el('div', { class: 'definition' }, [
          el('span', { text: definition.definition }),
          definition.example ? el('span', { class: 'example', text: `例：${definition.example}` }) : null
        ]));
      }
      card.appendChild(block);
    }
    const addButton = el('button', { class: 'btn primary', type: 'button' }, [icon('plus'), el('span', { text: '加入生词本' })]);
    addButton.addEventListener('click', () => addToWordbook(payload, addButton));
    card.appendChild(el('div', { class: 'actions', style: { marginTop: '18px' } }, [
      addButton,
      el('span', { class: 'tiny faint', text: '加入后按 1 / 2 / 4 / 7 / 15 天进入复习队列。' })
    ]));
    resultZone.appendChild(card);
  }

  async function lookup(wordValue = input.value) {
    const word = String(wordValue || '').trim();
    if (!word || busy) {
      if (!word) toast('请输入一个英文单词', { type: 'warn' });
      return;
    }
    busy = true;
    input.value = word;
    setBusy(searchButton, true, '查询中…');
    resultZone.innerHTML = '';
    resultZone.appendChild(el('div', { class: 'loading-block' }, [
      el('span', { class: 'spinner lg' }),
      el('span', { text: `正在查询 “${word}”…` })
    ]));
    try {
      const response = await api.dictionary.lookup(word);
      renderResult(response, word);
      loadHistory();
    } catch (error) {
      renderResult({ ok: false, error: { message: error.message || '查询失败' } }, word);
    } finally {
      busy = false;
      setBusy(searchButton, false);
    }
  }

  async function loadHistory() {
    try {
      const rows = await api.records.list('dictionary', { sort: 'newest' });
      historyZone.innerHTML = '';
      if (!rows.length) {
        historyZone.appendChild(el('span', { class: 'tiny faint', text: '还没有查询记录。' }));
        return;
      }
      for (const row of rows.slice(0, 20)) {
        const chip = el('button', { class: 'tag-chip', type: 'button', text: row.word });
        chip.addEventListener('click', () => lookup(row.word));
        historyZone.appendChild(chip);
      }
    } catch {
      historyZone.innerHTML = '';
    }
  }

  searchButton.addEventListener('click', () => lookup());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') lookup();
  });

  resultZone.appendChild(emptyState({
    iconName: 'book',
    title: '查一个词，顺手放进生词本',
    sub: '输入单词后按 Enter。词典结果加载失败时会显示原因，不影响其他页面。'
  }));
  loadHistory();
  return { el: page, onShow: loadHistory };
}
