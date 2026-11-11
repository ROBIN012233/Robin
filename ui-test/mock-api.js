/* UI-test-only mock of the preload bridge. Never loaded by the packaged app. */
(() => {
  const now = Date.now();
  const iso = (offsetMinutes = 0) => new Date(now - offsetMinutes * 60000).toISOString();
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let idCounter = 1;
  const uid = (prefix) => `${prefix}-${idCounter++}`;
  let progressListener = null;
  let settings = {
    appearance: {
      effectsEnabled: true,
      tier: 'high',
      background: { type: 'gradient', gradient: 'aurora', color: '#6f8cff', image: null, imageUrl: null },
      customIcon: null,
      customIconUrl: null
    },
    ai: { baseUrl: 'http://127.0.0.1:9655' },
    updates: { auto: true, lastCheckAt: null, lastResult: null, lastVersion: null },
    sorts: {},
    reading: { direction: 'exam' }
  };

  let contents = [];
  const translationRecords = [];
  const readingHistory = [];
  const writingRecords = [];
  const dictionaryHistory = [];
  let reviewWords = [];

  function tagCounts(rows) {
    const map = new Map();
    for (const row of rows) {
      for (const tag of row.tags || []) map.set(tag, (map.get(tag) || 0) + 1);
    }
    return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }

  function sortRows(rows, sort) {
    const copy = rows.slice();
    if (sort === 'oldest') return copy.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (sort === 'title') return copy.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    if (sort === 'tagCount') return copy.sort((a, b) => (b.tags?.length || 0) - (a.tags?.length || 0));
    if (sort === 'source') return copy.sort((a, b) => String(a.source_type).localeCompare(String(b.source_type)));
    return copy.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  function filterContents(options = {}) {
    let rows = contents.filter((row) => row.type === options.type);
    if (options.domain) rows = rows.filter((row) => row.domain === options.domain);
    if (!options.includeHidden) rows = rows.filter((row) => !row.hidden);
    if (options.search) {
      const q = String(options.search).toLowerCase();
      rows = rows.filter((row) =>
        row.title.toLowerCase().includes(q) ||
        row.body.toLowerCase().includes(q) ||
        (row.meta?.prompt || '').toLowerCase().includes(q)
      );
    }
    if (options.tags?.length) {
      rows = rows.filter((row) => options.tags.every((tag) => (row.tags || []).includes(tag)));
    }
    rows = sortRows(rows, options.sort).map((row) => ({ ...row, tags: row.tags || [] }));
    return rows;
  }

  function makeWord(word, body, origin = '词典') {
    return {
      id: uid('word'),
      type: 'word',
      title: word,
      body,
      source_type: 'web',
      source_url: null,
      domain: 'vocabulary',
      meta: { mastered: false, origin, phonetic: '/ˈtest/', addedAt: iso(), examples: [] },
      hidden: false,
      tags: [origin],
      created_at: iso(),
      updated_at: iso()
    };
  }

  function addWordRaw(word, body, origin = '词典') {
    const item = makeWord(word, body, origin);
    contents.push(item);
    return item;
  }
  const ready = Promise.all([
    fetch('/src/main/seed/reading.json').then((r) => r.json()),
    fetch('/src/main/seed/practice.json').then((r) => r.json()),
    fetch('/src/main/seed/essay-samples.json').then((r) => r.json())
  ]).then(([reading, practice, essays]) => {
    reading.forEach((item, index) => {
      contents.push({
        id: item.id,
        type: 'reading',
        title: item.title,
        body: item.body || '',
        source_type: 'builtin',
        source_url: item.url || null,
        domain: item.direction,
        meta: {
          direction: item.direction,
          difficulty: item.difficulty,
          loadMode: item.loadMode,
          source: item.source,
          summary: item.summary || '',
          url: item.url || null
        },
        hidden: false,
        tags: ['内置', item.direction === 'exam' ? '考试' : item.direction === 'daily' ? '日常' : '科研', item.difficulty, ...(item.tags || [])],
        created_at: iso(5000 - index),
        updated_at: iso(5000 - index)
      });
    });
    practice.forEach((item, index) => {
      contents.push({
        id: item.id,
        type: 'practice',
        title: item.title,
        body: item.body || '',
        source_type: 'builtin',
        source_url: null,
        domain: item.domain,
        meta: {
          prompt: item.prompt,
          requirements: item.requirements || [],
          essayTopic: item.essayTopic || null,
          metaNote: item.metaNote || '',
          questions: item.questions || [],
          reference: item.reference || '',
          scoringPoints: item.scoringPoints || []
        },
        hidden: false,
        tags: ['内置', ...(item.tags || [])],
        created_at: iso(4000 - index),
        updated_at: iso(4000 - index)
      });
    });
    Object.entries(essays).forEach(([topic, item], index) => {
      contents.push({
        id: `essay-${topic}`,
        type: 'essay',
        title: item.title,
        body: item.essay,
        source_type: 'builtin',
        source_url: null,
        domain: topic,
        meta: { topic, label: item.label, review: item.review },
        hidden: false,
        tags: ['内置', '范文', item.label],
        created_at: iso(3000 - index),
        updated_at: iso(3000 - index)
      });
    });

    contents.push(makeWord('resilient', 'able to recover quickly; 有韧性的'));
    contents.push(makeWord('threshold', 'the level at which something starts; 阈值'));
    contents.push(makeWord('coherent', 'clear and logical; 连贯的'));
    reviewWords = contents.filter((row) => row.type === 'word').map((row) => ({
      ...row,
      stage: 1,
      due_at: iso(10),
      word_count: 0
    }));

    for (let i = 0; i < 140; i += 1) {
      translationRecords.push({
        id: `tr-${i}`,
        title: `Mock translation ${i + 1}`,
        source_text: `Source passage ${i + 1}. This is a test of the virtual scrolling translation history.`,
        segments_json: JSON.stringify([{ p: 1, source: 'Source passage', zh: '示例译文。', back: 'Source passage.' }]),
        outline_json: JSON.stringify([{ id: 'p-1', p: 1, level: 2, kind: 'paragraph', title: '第 1 段' }]),
        terms_json: '[]',
        tags_json: JSON.stringify(['翻译', '测试']),
        created_at: iso(i * 10),
        updated_at: iso(i * 10)
      });
    }
  });

  function publicRecord(row) {
    return {
      ...row,
      segments: row.segments_json ? JSON.parse(row.segments_json) : undefined,
      outline: row.outline_json ? JSON.parse(row.outline_json) : undefined,
      terms: row.terms_json ? JSON.parse(row.terms_json) : undefined,
      tags: row.tags_json ? JSON.parse(row.tags_json) : [],
      result: row.result_json ? JSON.parse(row.result_json) : undefined
    };
  }

  function listRecords(kind, options = {}) {
    let rows = kind === 'translation' ? translationRecords : kind === 'reading' ? readingHistory : kind === 'writing' ? writingRecords : dictionaryHistory;
    if (kind === 'reading' && options.direction) rows = rows.filter((row) => row.direction === options.direction);
    if (options.search) {
      const q = options.search.toLowerCase();
      rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
    }
    if (options.tags?.length) rows = rows.filter((row) => options.tags.every((tag) => JSON.parse(row.tags_json || '[]').includes(tag)));
    rows = rows.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return rows.map((row) => {
      const decoded = publicRecord(row);
      return {
        ...decoded,
        excerpt: String(decoded.source_text || decoded.body || decoded.original_text || decoded.word || '').slice(0, 220),
        word_count: decoded.word_count || 0,
        offline: Boolean(decoded.offline)
      };
    });
  }

  const api = {
    app: {
      info: async () => ({
        name: 'Lumen English',
        version: '1.0.0',
        electron: '44.7.0',
        chrome: '146',
        node: '24',
        platform: 'win32',
        arch: 'x64',
        isPackaged: false,
        dbPath: 'C:\\Users\\Test\\AppData\\Roaming\\Lumen English\\lumen-english.db'
      })
    },
    settings: {
      get: async () => { await ready; return JSON.parse(JSON.stringify(settings)); },
      update: async (patch) => {
        await ready;
        if (patch.sorts) settings.sorts = { ...settings.sorts, ...patch.sorts };
        if (patch.reading) settings.reading = { ...settings.reading, ...patch.reading };
        if (patch.updates) settings.updates = { ...settings.updates, ...patch.updates };
        if (patch.ai) settings.ai = { ...settings.ai, ...patch.ai };
        if (patch.appearance) {
          settings.appearance = {
            ...settings.appearance,
            ...patch.appearance,
            background: { ...settings.appearance.background, ...(patch.appearance.background || {}) }
          };
        }
        return JSON.parse(JSON.stringify(settings));
      },
      chooseBackground: async () => ({ canceled: true }),
      clearBackground: async () => {
        settings.appearance.background = { type: 'gradient', gradient: 'aurora', color: '#6f8cff', image: null, imageUrl: null };
        return JSON.parse(JSON.stringify(settings));
      },
      chooseIcon: async () => ({ canceled: true }),
      clearIcon: async () => {
        settings.appearance.customIcon = null;
        settings.appearance.customIconUrl = null;
        return JSON.parse(JSON.stringify(settings));
      }
    },
    contents: {
      list: async (options) => { await ready; return filterContents(options); },
      get: async (id) => { await ready; return contents.find((row) => row.id === id) || null; },
      create: async (input) => {
        await ready;
        const item = { id: uid('c'), source_type: 'user', source_url: null, hidden: false, tags: [], meta: {}, created_at: iso(), updated_at: iso(), ...input };
        contents.push(item);
        return item;
      },
      update: async (id, patch) => {
        const index = contents.findIndex((row) => row.id === id);
        if (index < 0) throw new Error('内容不存在');
        contents[index] = { ...contents[index], ...patch };
        return contents[index];
      },
      remove: async (id) => {
        contents = contents.filter((row) => row.id !== id);
        return true;
      },
      setHidden: async (id, hidden) => {
        const row = contents.find((item) => item.id === id);
        if (row) row.hidden = hidden;
        return true;
      },
      tagCounts: async (options = {}) => {
        await ready;
        return tagCounts(contents.filter((row) => row.type === options.type && (!options.domain || row.domain === options.domain)));
      },
      counts: async () => {
        await ready;
        const count = (type) => contents.filter((row) => row.type === type).length;
        return {
          reading: count('reading'), word: count('word'), practice: count('practice'), term: count('term'), essay: count('essay'),
          hiddenBuiltin: contents.filter((row) => row.source_type === 'builtin' && row.hidden).length,
          readingByDirection: { exam: 10, daily: 10, research: 10 },
          due: reviewWords.length,
          history: {},
          translations: translationRecords.length,
          readingHistory: readingHistory.length,
          writingReviews: writingRecords.length
        };
      },
      restoreBuiltins: async () => ({}),
      clearWords: async () => {
        contents = contents.filter((row) => row.type !== 'word');
        reviewWords = [];
        return {};
      }
    },
    records: {
      list: async (kind, options) => { await ready; return listRecords(kind, options); },
      get: async (kind, id) => {
        await ready;
        const [row] = listRecords(kind).filter((item) => item.id === id);
        return row ? publicRecord(row) : null;
      },
      remove: async (kind, id) => {
        const list = kind === 'translation' ? translationRecords : kind === 'reading' ? readingHistory : kind === 'writing' ? writingRecords : dictionaryHistory;
        const index = list.findIndex((row) => row.id === id);
        if (index >= 0) list.splice(index, 1);
        return true;
      },
      clear: async (kind) => {
        if (kind === 'translation') translationRecords.length = 0;
        if (kind === 'reading') readingHistory.length = 0;
        if (kind === 'writing') writingRecords.length = 0;
        if (kind === 'dictionary') dictionaryHistory.length = 0;
        return true;
      },
      tagCounts: async (kind) => {
        await ready;
        const rows = listRecords(kind);
        return tagCounts(rows);
      },
      incrementReadingWords: async (id) => {
        const row = readingHistory.find((item) => item.id === id);
        if (row) row.word_count = (row.word_count || 0) + 1;
        return row;
      },
      counts: async () => ({
        translation: translationRecords.length,
        reading: readingHistory.length,
        writing: writingRecords.length,
        dictionary: dictionaryHistory.length
      })
    },
    translation: {
      run: async ({ title, text, tags }) => {
        await ready;
        progressListener?.({ stage: 'terms', current: 1, total: 2, message: '提取术语 1/2' });
        await delay(120);
        progressListener?.({ stage: 'translate', current: 1, total: 2, message: '翻译正文 1/2' });
        await delay(180);
        progressListener?.({ stage: 'back', current: 1, total: 1, message: '回译校验 1/1' });
        await delay(120);
        progressListener?.({ stage: 'outline', current: 1, total: 1, message: '生成大纲' });
        const paragraphs = text.split(/\n\s*\n+/).filter(Boolean);
        const segments = paragraphs.map((paragraph, index) => ({
          p: index + 1,
          source: paragraph,
          zh: `【示例译文 ${index + 1}】${paragraph.slice(0, 80)}`,
          back: paragraph
        }));
        const record = {
          id: uid('tr'),
          title: title || paragraphs[0]?.slice(0, 40) || '示例翻译',
          source_text: text,
          segments_json: JSON.stringify(segments),
          outline_json: JSON.stringify(segments.map((s) => ({ id: `p-${s.p}`, p: s.p, level: 2, kind: 'paragraph', title: `第 ${s.p} 段 · ${s.source.slice(0, 30)}` }))),
          terms_json: JSON.stringify([{ en: 'attention', zh: '注意力', domain: '计算机' }, { en: 'transformer', zh: '变换器', domain: '计算机' }]),
          tags_json: JSON.stringify(['翻译', ...(tags || []), '计算机']),
          created_at: iso(),
          updated_at: iso()
        };
        translationRecords.unshift(record);
        progressListener?.({ stage: 'done', current: 1, total: 1, message: '翻译完成' });
        return { ok: true, record: publicRecord(record) };
      },
      onProgress: (callback) => { progressListener = callback; return () => { progressListener = null; }; }
    },
    writing: {
      review: async ({ text, topic, prompt }) => {
        await ready;
        const samples = await fetch('/src/main/seed/essay-samples.json').then((r) => r.json());
        const sample = samples[topic] || samples.education;
        const quote = text.split(/\s+/).slice(0, 8).join(' ');
        const record = {
          id: uid('wr'),
          title: prompt?.split(/[.?!]/)[0] || '示例作文批改',
          topic,
          original_text: text,
          offline: 0,
          created_at: iso(),
          result_json: JSON.stringify({
            offline: false,
            feedback: {
              grammar: [{ quote, comment: '主谓一致总体清楚，但这一处时态与前文不一致。', suggestion: '统一使用一般现在时。' }],
              structure: [{ quote, comment: '开头直接进入观点，建议补一个更明确的问题句。', suggestion: '用“Most… Yet…”式反差引入。' }],
              wording: [{ quote, comment: '动词较笼统，可以换成更具体的表达。', suggestion: '用 protect / sustain 等具体动词。' }]
            },
            sample: { topic, label: sample.label, title: sample.title, essay: sample.essay, review: sample.review },
            comparison: [
              { aspect: '开篇方式', userQuote: quote, sampleQuote: sample.essay.split('.')[0] + '.', comment: '范文用普遍判断制造反差，你的开头更像直接陈述。' },
              { aspect: '句间衔接', userQuote: quote, sampleQuote: sample.essay.split('.')[1] + '.', comment: '范文用 yet / once 等连接词标示逻辑转折。' },
              { aspect: '收束方式', userQuote: quote, sampleQuote: sample.essay.split('.').slice(-2).join('.') + '.', comment: '范文结尾回到可执行判断，而不是重复开头。' }
            ]
          })
        };
        writingRecords.unshift(record);
        return { ok: true, offline: false, error: null, record: publicRecord(record) };
      }
    },
    dictionary: {
      lookup: async (word) => {
        await ready;
        await delay(180);
        const payload = {
          word,
          phonetic: '/ˈtest/',
          audio: '',
          meanings: [
            { partOfSpeech: 'adjective', definitions: [{ definition: 'A mock dictionary definition for UI verification.', example: 'This is a mock example sentence.' }] },
            { partOfSpeech: 'noun', definitions: [{ definition: 'Another mock sense of the word.', example: '' }] }
          ],
          source: 'dictionaryapi.dev',
          sourceUrl: 'https://api.dictionaryapi.dev'
        };
        dictionaryHistory.unshift({ id: uid('dict'), word, payload_json: JSON.stringify(payload), created_at: iso() });
        return { ok: true, payload };
      },
      history: async () => listRecords('dictionary')
    },
    words: {
      add: async (payload) => {
        await ready;
        const existing = contents.find((row) => row.type === 'word' && row.title.toLowerCase() === payload.word.toLowerCase());
        if (existing) return { created: false, word: existing };
        const item = makeWord(payload.word, payload.meaning, payload.origin || '词典');
        item.meta = { ...payload, mastered: false, addedAt: iso() };
        contents.push(item);
        reviewWords.push({ ...item, stage: 0, due_at: iso(0), word_count: 0 });
        return { created: true, word: item };
      },
      setMastered: async (id, mastered) => {
        const row = contents.find((item) => item.id === id);
        row.meta = { ...row.meta, mastered };
        reviewWords = reviewWords.filter((item) => item.id !== id);
        return row;
      }
    },
    review: {
      list: async () => reviewWords.map((row) => ({ ...row })),
      grade: async (id, remembered) => {
        reviewWords = reviewWords.filter((row) => row.id !== id);
        return { nextDue: iso(-1440), stage: remembered ? 2 : 0, mastered: false };
      }
    },
    reading: {
      saveHistory: async (payload) => {
        await ready;
        const row = {
          id: uid('rh'),
          title: payload.title,
          source: payload.source,
          source_url: payload.sourceUrl,
          direction: payload.direction,
          body: payload.body,
          word_count: 0,
          tags_json: JSON.stringify([payload.direction === 'exam' ? '考试' : '日常']),
          created_at: iso()
        };
        readingHistory.unshift(row);
        return publicRecord(row);
      },
      import: async (payload) => {
        await ready;
        const row = {
          id: uid('ri'), type: 'reading', title: payload.title, body: payload.body,
          source_type: 'web', source_url: payload.url, domain: payload.direction,
          meta: { loadMode: 'text', summary: payload.body.slice(0, 100), source: 'mock' },
          hidden: false, tags: ['网页导入', ...(payload.tags || [])], created_at: iso(), updated_at: iso()
        };
        contents.push(row);
        return row;
      },
      readabilitySource: async () => 'function Readability(){};'
    },
    batch: {
      start: async () => ({ state: 'running', total: 1, completed: 0, succeeded: 0, failed: 0, active: 0, jobs: [] }),
      pause: async () => ({ state: 'paused', total: 0, completed: 0, succeeded: 0, failed: 0, active: 0, jobs: [] }),
      resume: async () => ({ state: 'running', total: 0, completed: 0, succeeded: 0, failed: 0, active: 0, jobs: [] }),
      cancel: async () => ({ state: 'cancelled', total: 0, completed: 0, succeeded: 0, failed: 0, active: 0, jobs: [] }),
      retry: async () => ({ state: 'done', total: 0, completed: 0, succeeded: 0, failed: 0, active: 0, jobs: [] }),
      retryAll: async () => ({ state: 'done', total: 0, completed: 0, succeeded: 0, failed: 0, active: 0, jobs: [] }),
      state: async () => ({ state: 'idle', total: 0, completed: 0, succeeded: 0, failed: 0, active: 0, jobs: [] }),
      onProgress: () => () => {}
    },
    ai: {
      test: async () => { await delay(200); return { ok: false, message: '接口未连接：mock 环境', latency: 200 }; }
    },
    updates: {
      check: async () => ({ ok: false, reason: 'development' }),
      state: async () => ({
        type: 'dev', message: '开发模式不执行自动更新，安装包版本可用', auto: true,
        lastCheckAt: iso(10), lastResult: '开发模式', currentVersion: '1.0.0', isPackaged: false
      }),
      installOnQuit: async () => ({ ok: true, message: '已设置：退出应用时安装' }),
      onStatus: () => () => {}
    },
    data: {
      exportWords: async () => ({ canceled: true })
    }
  };

  window.api = api;
})();
