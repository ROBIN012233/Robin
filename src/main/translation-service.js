'use strict';

const contents = require('./db/contents');
const records = require('./db/records');
const { AIClient, normalizeError } = require('./ai-client');
const {
  splitParagraphs,
  buildChunks,
  groupByParagraph,
  buildOutline,
  excerpt,
  MAX_CHARS
} = require('./text');

const ai = new AIClient(() => {
  const { getRawSettings } = require('./config');
  return getRawSettings().ai.baseUrl;
});

const TERM_SYSTEM = `You extract terminology for a professional English-to-Chinese academic translation.
Return ONLY a JSON array. Each item must be:
{"en": "English term", "zh": "recommended Chinese term", "domain": "short subject area in Chinese"}
Rules:
- Extract only terms that need consistent translation: technical terms, names of methods, discipline-specific phrases.
- Keep 8 to 25 terms for a substantial passage. Do not include common words.
- Use the exact English form from the source.
- No markdown, no commentary.`;

const TRANSLATE_SYSTEM = `You are a meticulous professional translator working from English into Simplified Chinese.
Translate every numbered segment. Use the supplied glossary strictly. Preserve meaning, paragraph order and technical precision. Do not add explanations.
Return ONLY a JSON object:
{"items":[{"i": 0, "zh": "译文"}]}
Every input segment must appear exactly once, with the same integer i. No markdown fences.`;

const BACK_SYSTEM = `You are a bilingual editor. For each numbered Chinese paragraph, write a faithful English back-translation.
The purpose is verification: the English should reveal how the Chinese was understood, not improve the original.
Return ONLY a JSON object:
{"items":[{"p": 1, "en": "English back-translation"}]}
Each input paragraph must appear exactly once with the same integer p. No markdown.`;

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.terms)) return data.terms;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function cleanTerm(term) {
  const en = String(term?.en || term?.term || '').replace(/\s+/g, ' ').trim();
  const zh = String(term?.zh || term?.translation || '').replace(/\s+/g, ' ').trim();
  const domain = String(term?.domain || '通用').replace(/\s+/g, ' ').trim() || '通用';
  if (!en || !zh || en.length > 120 || zh.length > 120) return null;
  return { en, zh, domain: domain.slice(0, 40) };
}

function termKey(en) {
  return String(en).trim().toLowerCase();
}

function existingTerms() {
  return contents.listContents({ type: 'term', sort: 'title', includeHidden: true })
    .map((row) => ({ en: row.title, zh: row.body, domain: row.domain || '通用' }))
    .filter((term) => term.en && term.zh);
}

function buildGlossary(existing, extracted) {
  const map = new Map();
  for (const term of existing) {
    if (!map.has(termKey(term.en))) map.set(termKey(term.en), term);
  }
  for (const term of extracted) {
    if (!map.has(termKey(term.en))) map.set(termKey(term.en), term);
  }
  const all = [...map.values()];
  const selected = [];
  let size = 0;
  for (const term of all) {
    const cost = term.en.length + term.zh.length + 30;
    if (size + cost > 14000) break;
    selected.push(term);
    size += cost;
  }
  return selected;
}

async function extractTermsForChunks(chunks, emit) {
  const found = [];
  for (let i = 0; i < chunks.length; i += 1) {
    emit({ stage: 'terms', current: i + 1, total: chunks.length, message: `提取术语 ${i + 1}/${chunks.length}` });
    const payload = chunks[i].map((segment) => ({ i: segment.i, text: segment.text }));
    const { data } = await ai.json({
      system: TERM_SYSTEM,
      user: `Source segments:\n${JSON.stringify(payload)}`,
      temperature: 0.1,
      maxTokens: 1400
    });
    const terms = toArray(data).map(cleanTerm).filter(Boolean);
    found.push(...terms);
    if (found.length > 600) break;
  }
  const map = new Map();
  for (const term of found) {
    if (!map.has(termKey(term.en))) map.set(termKey(term.en), term);
  }
  return [...map.values()];
}

function saveExtractedTerms(terms, existingMap) {
  for (const term of terms) {
    if (existingMap.has(termKey(term.en))) {
      const row = existingMap.get(termKey(term.en));
      if (term.domain && !row.tags.includes(term.domain)) {
        contents.updateContent(row.id, { tags: [...row.tags, term.domain] });
      }
      continue;
    }
    const created = contents.createContent({
      type: 'term',
      title: term.en,
      body: term.zh,
      sourceType: 'ai',
      domain: term.domain || '通用',
      tags: ['翻译提取', term.domain || '通用'],
      meta: { extractedAt: new Date().toISOString() }
    });
    existingMap.set(termKey(term.en), created);
  }
}

async function translateChunk(chunk, glossary, emit, index, total) {
  emit({ stage: 'translate', current: index + 1, total, message: `翻译正文 ${index + 1}/${total}` });
  const segments = chunk.map((segment) => ({ i: segment.i, p: segment.p, text: segment.text }));
  const { data } = await ai.json({
    system: TRANSLATE_SYSTEM,
    user: `Glossary (must be followed):\n${JSON.stringify(glossary)}\n\nSegments:\n${JSON.stringify(segments)}`,
    temperature: 0.2,
    maxTokens: 4000
  });
  const items = toArray(data);
  const byId = new Map();
  for (const item of items) {
    const id = Number(item?.i ?? item?.id);
    const zh = String(item?.zh ?? item?.translation ?? '').trim();
    if (Number.isInteger(id) && zh) byId.set(id, zh);
  }
  return chunk.map((segment) => {
    const zh = byId.get(segment.i);
    if (!zh) {
      throw new Error(`译文段落不完整（第 ${segment.p} 段）`);
    }
    return { i: segment.i, p: segment.p, zh };
  });
}

async function backTranslateParagraphs(paragraphs, emit) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const para of paragraphs) {
    const cost = para.text.length + 60;
    if (size + cost > MAX_CHARS && current.length) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(para);
    size += cost;
  }
  if (current.length) chunks.push(current);

  const result = [];
  for (let i = 0; i < chunks.length; i += 1) {
    emit({ stage: 'back', current: i + 1, total: chunks.length, message: `回译校验 ${i + 1}/${chunks.length}` });
    const payload = chunks[i].map((para) => ({ p: para.p, zh: para.text }));
    const { data } = await ai.json({
      system: BACK_SYSTEM,
      user: `Chinese paragraphs:\n${JSON.stringify(payload)}`,
      temperature: 0.2,
      maxTokens: 4000
    });
    const items = toArray(data);
    const byP = new Map();
    for (const item of items) {
      const p = Number(item?.p ?? item?.id);
      const en = String(item?.en ?? item?.text ?? item?.translation ?? '').trim();
      if (Number.isInteger(p) && en) byP.set(p, en);
    }
    for (const para of chunks[i]) {
      const en = byP.get(para.p);
      if (!en) throw new Error(`回译段落不完整（第 ${para.p} 段）`);
      result.push({ p: para.p, en });
    }
  }
  return result;
}

async function runTranslation({ title, text, tags = [] }, emit = () => {}) {
  try {
    const source = String(text || '').trim();
    if (source.length < 20) throw new Error('原文过短，无法翻译');
    const paragraphs = splitParagraphs(source);
    if (!paragraphs.length) throw new Error('没有可翻译的段落');

    emit({ stage: 'prepare', current: 0, total: 1, message: '准备术语表' });
    const { chunks } = buildChunks(paragraphs, MAX_CHARS);
    const extracted = await extractTermsForChunks(chunks, emit);

    const existing = existingTerms();
    const existingMap = new Map(contents.listContents({ type: 'term', includeHidden: true })
      .map((row) => [termKey(row.title), row]));
    saveExtractedTerms(extracted, existingMap);
    const glossary = buildGlossary(existing, extracted);

    emit({ stage: 'translate', current: 0, total: chunks.length, message: '开始翻译正文' });
    const translated = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const part = await translateChunk(chunks[i], glossary, emit, i, chunks.length);
      translated.push(...part);
    }

    const translatedParagraphs = groupByParagraph(translated, 'zh');
    const back = await backTranslateParagraphs(translatedParagraphs, emit);
    const backByP = new Map(back.map((item) => [item.p, item.en]));
    const translatedByP = new Map(translatedParagraphs.map((item) => [item.p, item.text]));

    emit({ stage: 'outline', current: 1, total: 1, message: '生成大纲' });
    const outline = buildOutline(paragraphs, translatedByP);

    const segments = [];
    for (const para of paragraphs) {
      segments.push({
        p: para.p,
        source: para.text,
        zh: translatedByP.get(para.p) || '',
        back: backByP.get(para.p) || ''
      });
    }

    const cleanTags = [...new Set([
      '翻译',
      ...(Array.isArray(tags) ? tags : []),
      ...glossary.map((term) => term.domain).filter(Boolean)
    ])].slice(0, 12);

    const recordTitle = String(title || '').trim() ||
      excerpt(paragraphs[0].text, 48) || '未命名翻译';

    const record = records.saveTranslation({
      title: recordTitle,
      sourceText: source,
      segments,
      outline,
      terms: glossary,
      tags: cleanTags
    });

    emit({ stage: 'done', current: 1, total: 1, message: '翻译完成' });
    return { ok: true, record };
  } catch (error) {
    const normalized = normalizeError(error);
    emit({ stage: 'error', current: 0, total: 1, message: normalized.message });
    return {
      ok: false,
      error: {
        code: normalized.code || 'TRANSLATION_FAILED',
        message: normalized.message || '翻译失败'
      }
    };
  }
}

module.exports = { runTranslation, ai };
