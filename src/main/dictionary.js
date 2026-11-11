'use strict';

const records = require('./db/records');

function normalizeWord(value) {
  return String(value || '').trim().toLowerCase();
}

function pickPhonetic(entry) {
  if (entry.phonetic) return entry.phonetic;
  const withText = (entry.phonetics || []).find((p) => p && p.text);
  return withText ? withText.text : '';
}

function pickAudio(entry) {
  const withAudio = (entry.phonetics || []).find((p) => p && p.audio);
  return withAudio ? withAudio.audio : '';
}

function summarize(entry) {
  const meanings = (entry.meanings || []).slice(0, 4).map((meaning) => ({
    partOfSpeech: meaning.partOfSpeech || '',
    definitions: (meaning.definitions || []).slice(0, 4).map((def) => ({
      definition: def.definition || '',
      example: def.example || ''
    }))
  })).filter((meaning) => meaning.definitions.length);
  return {
    word: entry.word,
    phonetic: pickPhonetic(entry),
    audio: pickAudio(entry),
    meanings,
    source: 'dictionaryapi.dev',
    sourceUrl: `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(entry.word)}`
  };
}

function textForWord(payload) {
  const lines = [];
  if (payload.phonetic) lines.push(payload.phonetic);
  for (const meaning of payload.meanings) {
    for (const def of meaning.definitions) {
      lines.push(`${meaning.partOfSpeech ? meaning.partOfSpeech + '. ' : ''}${def.definition}`);
      if (def.example) lines.push(`例：${def.example}`);
      if (lines.length > 8) return lines.join('\n');
    }
  }
  return lines.join('\n');
}

async function lookup(rawWord) {
  const word = normalizeWord(rawWord);
  if (!/^[a-z][a-z' -]{0,60}$/.test(word)) {
    return { ok: false, error: { code: 'BAD_WORD', message: '请输入一个英文单词' } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'LumenEnglish/1.0' }
    });
    if (response.status === 404) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `词典中未找到 “${word}”` } };
    }
    if (!response.ok) {
      return { ok: false, error: { code: 'DICT_HTTP', message: `词典接口返回 ${response.status}` } };
    }
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) {
      return { ok: false, error: { code: 'NOT_FOUND', message: '词典未返回释义' } };
    }
    const payload = summarize(data[0]);
    records.addDictionaryHistory(payload.word || word, payload);
    return { ok: true, payload, plainText: textForWord(payload) };
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? '词典接口请求超时'
      : '词典接口暂时不可用，请检查网络后重试';
    return { ok: false, error: { code: 'DICT_UNAVAILABLE', message } };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { lookup, textForWord };
