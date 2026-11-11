'use strict';

const records = require('./db/records');
const { getEssaySamples } = require('./db/seed');
const { AIClient, normalizeError } = require('./ai-client');
const { countWords } = require('./text');

const ai = new AIClient(() => {
  const { getRawSettings } = require('./config');
  return getRawSettings().ai.baseUrl;
});

const TOPIC_WORDS = {
  education: ['school', 'student', 'learn', 'teacher', 'university', 'class', 'education', 'study'],
  technology: ['technology', 'digital', 'phone', 'online', 'algorithm', 'computer', 'internet', 'ai'],
  environment: ['environment', 'climate', 'waste', 'river', 'green', 'pollution', 'energy', 'city'],
  society: ['neighbour', 'neighbor', 'community', 'society', 'public', 'social', 'city', 'people'],
  culture: ['culture', 'tradition', 'language', 'food', 'festival', 'heritage', 'recipe', 'local'],
  growth: ['habit', 'myself', 'growth', 'learn', 'slow', 'practice', 'failure', 'personal']
};

const REVIEW_SYSTEM = `You are an experienced English writing examiner and editor for Chinese university students (CET-4/CET-6 level).
Evaluate the essay on three dimensions: grammar, structure and wording.
Every comment MUST quote an exact fragment from the student's essay. Be specific and practical.
Then provide a model essay on the same topic and a paragraph-by-paragraph commentary on that model.
Finally compare the student's essay with the model in at least three concrete ways; each comparison MUST quote both texts.

Return ONLY JSON with this exact shape:
{
  "grammar": [{"quote":"...", "comment":"...", "suggestion":"..."}],
  "structure": [{"quote":"...", "comment":"...", "suggestion":"..."}],
  "wording": [{"quote":"...", "comment":"...", "suggestion":"..."}],
  "sample": {
    "essay": "model essay, 170-220 words",
    "review": [
      {"paragraph": 1, "structure": "...", "highlights": ["..."], "transferable": ["..."]}
    ]
  },
  "comparison": [
    {"aspect": "...", "userQuote": "...", "sampleQuote": "...", "comment": "..."}
  ]
}
Rules:
- 2 to 4 items per dimension.
- Use Simplified Chinese for comments; keep English quotes exactly as written.
- Model essay must be original, coherent and appropriate to the prompt.
- Review each model paragraph; name transferable sentence patterns.
- At least 3 comparisons, each with both quotes. No markdown fences.`;

function splitSentences(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?]+[.!?]+["')\]]?/g);
  if (parts && parts.length) return parts.map((s) => s.trim()).filter(Boolean);
  return clean ? [clean] : [];
}

function shortQuote(text, max = 260) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? value.slice(0, max).trim() + '…' : value;
}

function normalizeFeedback(value, original) {
  const source = String(original).toLowerCase();
  const items = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of items) {
    const quote = String(item?.quote || item?.evidence || '').trim();
    const comment = String(item?.comment || item?.feedback || '').trim();
    const suggestion = String(item?.suggestion || item?.advice || '').trim();
    if (!quote || !comment) continue;
    if (!source.includes(quote.toLowerCase())) continue;
    out.push({ quote: shortQuote(quote), comment, suggestion });
    if (out.length >= 4) break;
  }
  return out;
}

function normalizeReview(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => ({
      paragraph: Number(item?.paragraph) || index + 1,
      structure: String(item?.structure || '').trim(),
      highlights: Array.isArray(item?.highlights) ? item.highlights.map(String).slice(0, 5) : [],
      transferable: Array.isArray(item?.transferable) ? item.transferable.map(String).slice(0, 5) : []
    }))
    .filter((item) => item.structure || item.highlights.length || item.transferable.length);
}

function pickTopic(topic, text) {
  const samples = getEssaySamples();
  if (topic && samples[topic]) return topic;
  const lower = String(text || '').toLowerCase();
  let best = 'education';
  let bestScore = 0;
  for (const [key, words] of Object.entries(TOPIC_WORDS)) {
    const score = words.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
    if (score > bestScore) { best = key; bestScore = score; }
  }
  return best;
}

function fallbackSample(topic) {
  const samples = getEssaySamples();
  const item = samples[topic] || samples.education;
  return {
    topic,
    label: item.label,
    title: item.title,
    essay: item.essay,
    review: item.review
  };
}

function localComparison(userText, sampleEssay) {
  const userSentences = splitSentences(userText);
  const sampleSentences = splitSentences(sampleEssay);
  if (!userSentences.length || !sampleSentences.length) return [];

  const firstUser = userSentences[0];
  const lastUser = userSentences[userSentences.length - 1];
  const longestUser = [...userSentences].sort((a, b) => b.length - a.length)[0];
  const firstSample = sampleSentences[0];
  const lastSample = sampleSentences[sampleSentences.length - 1];
  const longestSample = [...sampleSentences].sort((a, b) => b.length - a.length)[0];
  const connector = sampleSentences.find((s) => /\b(however|yet|instead|once|although|while|because|therefore|rather)\b/i.test(s)) || firstSample;
  const userConnector = userSentences.find((s) => /\b(however|but|because|so|therefore|although|while)\b/i.test(s)) || firstUser;

  return [
    {
      aspect: '开篇方式',
      userQuote: shortQuote(firstUser),
      sampleQuote: shortQuote(firstSample),
      comment: '你的开头直接进入陈述；范文先用一个普遍判断制造反差（“Most… Yet…”），再提出中心观点，读者更快知道文章要解决什么问题。'
    },
    {
      aspect: '句间衔接',
      userQuote: shortQuote(userConnector),
      sampleQuote: shortQuote(connector),
      comment: '范文用显性的逻辑连接词标示转折或因果，句与句之间的关系更清楚；你的这一句衔接主要依赖语义，读者需要自行补足关系。'
    },
    {
      aspect: '信息具体度',
      userQuote: shortQuote(longestUser),
      sampleQuote: shortQuote(longestSample),
      comment: `你的长句约 ${countWords(longestUser)} 词，范文长句约 ${countWords(longestSample)} 词。范文在长句中放入具体对象和动作，避免只停留在抽象评价。`
    },
    {
      aspect: '收束方式',
      userQuote: shortQuote(lastUser),
      sampleQuote: shortQuote(lastSample),
      comment: '范文结尾回到一个可检验的判断或行动，而不是重复开头；你的结尾可以再向前推一步，说明这个观点带来的后果或条件。'
    }
  ];
}

function ensureComparisons(comparisons, userText, sampleEssay) {
  const userLower = String(userText || '').toLowerCase();
  const sampleLower = String(sampleEssay || '').toLowerCase();
  const out = Array.isArray(comparisons) ? comparisons.filter((item) => {
    if (!item || !item.userQuote || !item.sampleQuote || !item.comment) return false;
    return userLower.includes(String(item.userQuote).toLowerCase()) &&
      sampleLower.includes(String(item.sampleQuote).toLowerCase());
  }).map((item) => ({
    aspect: String(item.aspect || '对照'),
    userQuote: shortQuote(item.userQuote),
    sampleQuote: shortQuote(item.sampleQuote),
    comment: String(item.comment)
  })) : [];

  const local = localComparison(userText, sampleEssay);
  for (const item of local) {
    if (out.length >= 3) break;
    if (!out.some((existing) => existing.aspect === item.aspect)) out.push(item);
  }
  return out.slice(0, 4);
}

function offlineResult(topic, text, errorMessage) {
  const sample = fallbackSample(topic);
  return {
    feedback: { grammar: [], structure: [], wording: [] },
    sample,
    comparison: ensureComparisons([], text, sample.essay),
    offline: true,
    error: {
      code: 'AI_UNREACHABLE',
      message: errorMessage || '接口未连接，已展示内置范文案例'
    }
  };
}

async function reviewWriting({ text, topic, prompt = '' }) {
  const original = String(text || '').trim();
  if (countWords(original) < 30) {
    return { ok: false, error: { code: 'TOO_SHORT', message: '作文至少需要 30 个英文词' } };
  }
  const selectedTopic = pickTopic(topic, original);
  const fallback = fallbackSample(selectedTopic);
  let aiData = null;
  let aiError = null;

  try {
    const { data } = await ai.json({
      system: REVIEW_SYSTEM,
      user: `Topic: ${fallback.label}\nPrompt: ${prompt || 'Write an essay on this topic.'}\n\nStudent essay:\n${original}`,
      temperature: 0.3,
      maxTokens: 3600
    });
    aiData = data;
  } catch (error) {
    aiError = normalizeError(error);
  }

  let result;
  if (aiData) {
    const feedback = {
      grammar: normalizeFeedback(aiData.grammar, original),
      structure: normalizeFeedback(aiData.structure, original),
      wording: normalizeFeedback(aiData.wording, original)
    };
    const sampleReview = normalizeReview(aiData?.sample?.review);
    const sampleEssay = String(aiData?.sample?.essay || '').trim();
    if (feedback.grammar.length && feedback.structure.length && feedback.wording.length &&
        sampleEssay.length > 120 && sampleReview.length) {
      const sample = {
        topic: selectedTopic,
        label: fallback.label,
        title: fallback.title,
        essay: sampleEssay,
        review: sampleReview
      };
      result = {
        feedback,
        sample,
        comparison: ensureComparisons(aiData.comparison, original, sampleEssay),
        offline: false,
        error: null
      };
    }
  }

  if (!result) {
    result = offlineResult(selectedTopic, original, aiError?.message);
  }

  const words = countWords(original);
  const title = (prompt ? prompt.split(/[.?!。！？]/)[0] : original.split(/\s+/).slice(0, 8).join(' ')).slice(0, 80) || '写作批改';
  const record = records.saveWritingReview({
    title,
    topic: selectedTopic,
    originalText: original,
    result: {
      feedback: result.feedback,
      sample: result.sample,
      comparison: result.comparison,
      offline: result.offline,
      error: result.error,
      wordCount: words
    },
    offline: result.offline
  });

  return { ok: true, offline: result.offline, error: result.error, record };
}

module.exports = { reviewWriting, ai };
