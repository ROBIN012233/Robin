'use strict';

const { getDb } = require('./index');
const contents = require('./contents');

const INTERVALS = [1, 2, 4, 7, 15];

function addDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function findWord(word) {
  const row = getDb().prepare(`
    SELECT c.*, COALESCE((SELECT json_group_array(tag) FROM content_tags WHERE content_id = c.id), '[]') AS tags_json
    FROM contents c
    WHERE c.type = 'word' AND lower(c.title) = lower(?)
    LIMIT 1
  `).get(String(word || '').trim());
  if (!row) return null;
  return { ...row, meta: JSON.parse(row.meta || '{}'), tags: JSON.parse(row.tags_json || '[]') };
}

function addWord(input) {
  const word = String(input.word || '').trim();
  if (!/^[A-Za-z][A-Za-z'’ -]{0,60}$/.test(word)) throw new Error('单词格式无效');
  const existing = findWord(word);
  if (existing) return { created: false, word: existing };

  const origin = input.origin === '阅读' ? '阅读' : '词典';
  const content = contents.createContent({
    type: 'word',
    title: word,
    body: String(input.meaning || '').slice(0, 4000),
    sourceType: origin === '阅读' ? 'web' : 'web',
    sourceUrl: input.sourceUrl || null,
    domain: 'vocabulary',
    tags: [origin, ...(Array.isArray(input.tags) ? input.tags : [])],
    meta: {
      phonetic: input.phonetic || '',
      examples: Array.isArray(input.examples) ? input.examples.slice(0, 8) : [],
      meanings: Array.isArray(input.meanings) ? input.meanings.slice(0, 8) : [],
      mastered: false,
      origin,
      addedAt: new Date().toISOString()
    }
  });

  getDb().prepare(`
    INSERT INTO word_reviews (content_id, stage, due_at, correct_count, lapses)
    VALUES (?, 0, ?, 0, 0)
  `).run(content.id, addDays(1));

  return { created: true, word: content };
}

function setMastered(id, mastered) {
  const content = contents.getContent(id);
  if (!content || content.type !== 'word') throw new Error('生词不存在');
  const meta = { ...content.meta, mastered: Boolean(mastered), masteredAt: mastered ? new Date().toISOString() : null };
  contents.updateContent(id, { meta });
  if (mastered) {
    getDb().prepare('DELETE FROM word_reviews WHERE content_id = ?').run(id);
  } else {
    getDb().prepare(`
      INSERT INTO word_reviews (content_id, stage, due_at, correct_count, lapses)
      VALUES (?, 0, ?, 0, 0)
      ON CONFLICT(content_id) DO UPDATE SET due_at = excluded.due_at, stage = 0
    `).run(id, addDays(1));
  }
  return contents.getContent(id);
}

function reviewList() {
  const rows = getDb().prepare(`
    SELECT c.*, w.stage, w.due_at, w.correct_count, w.lapses,
      COALESCE((SELECT json_group_array(tag) FROM content_tags WHERE content_id = c.id), '[]') AS tags_json
    FROM word_reviews w
    JOIN contents c ON c.id = w.content_id
    WHERE w.due_at <= ? AND c.hidden = 0
    ORDER BY w.due_at ASC, c.title COLLATE NOCASE ASC
  `).all(new Date().toISOString());
  return rows.map((row) => ({
    ...row,
    hidden: Boolean(row.hidden),
    meta: JSON.parse(row.meta || '{}'),
    tags: JSON.parse(row.tags_json || '[]')
  }));
}

function gradeReview(id, remembered) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM word_reviews WHERE content_id = ?').get(id);
  if (!row) throw new Error('复习记录不存在');
  const now = new Date().toISOString();
  if (!remembered) {
    db.prepare('UPDATE word_reviews SET stage = 0, due_at = ?, last_reviewed_at = ?, lapses = lapses + 1 WHERE content_id = ?')
      .run(addDays(1), now, id);
    return { nextDue: addDays(1), stage: 0, mastered: false };
  }

  const nextStage = row.stage + 1;
  db.prepare('UPDATE word_reviews SET stage = ?, due_at = ?, last_reviewed_at = ?, correct_count = correct_count + 1 WHERE content_id = ?')
    .run(nextStage, addDays(INTERVALS[Math.min(nextStage, INTERVALS.length - 1)]), now, id);

  if (nextStage > INTERVALS.length) {
    setMastered(id, true);
    return { nextDue: null, stage: nextStage, mastered: true };
  }
  return {
    nextDue: addDays(INTERVALS[Math.min(nextStage, INTERVALS.length - 1)]),
    stage: nextStage,
    mastered: false
  };
}

module.exports = { addWord, setMastered, reviewList, gradeReview, findWord, INTERVALS };
