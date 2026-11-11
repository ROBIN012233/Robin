'use strict';

const crypto = require('crypto');
const { getDb } = require('./index');
const { normalizeTags } = require('./contents');

const KINDS = {
  translation: {
    table: 'translation_records',
    searchColumns: ['title', 'source_text'],
    excerptExpr: 'substr(source_text, 1, 220)'
  },
  reading: {
    table: 'reading_history',
    searchColumns: ['title', 'source', 'body'],
    excerptExpr: 'substr(body, 1, 220)'
  },
  writing: {
    table: 'writing_reviews',
    searchColumns: ['title', 'original_text'],
    excerptExpr: 'substr(original_text, 1, 220)'
  },
  dictionary: {
    table: 'dictionary_history',
    searchColumns: ['word'],
    excerptExpr: 'payload_json'
  }
};

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeKind(kind) {
  const key = String(kind || '');
  if (!KINDS[key]) throw new Error('记录类型无效');
  return key;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (m) => '\\' + m);
}

function listRecords(kind, options = {}) {
  const key = normalizeKind(kind);
  const meta = KINDS[key];
  const search = String(options.search || '').trim();
  const tags = normalizeTags(options.tags);
  const sort = ['newest', 'oldest', 'title', 'tagCount'].includes(options.sort) ? options.sort : 'newest';
  const where = [];
  const params = [];

  if (search) {
    const like = `%${escapeLike(search)}%`;
    where.push(`(${meta.searchColumns.map((col) => `r.${col} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
    meta.searchColumns.forEach(() => params.push(like));
  }
  if (['translation', 'reading'].includes(key) && tags.length) {
    where.push(`(
      SELECT COUNT(DISTINCT j.value) FROM json_each(r.tags_json) j
      WHERE j.value IN (${tags.map(() => '?').join(',')})
    ) = ?`);
    params.push(...tags, tags.length);
  }
  if (key === 'reading' && options.direction) {
    where.push('r.direction = ?');
    params.push(options.direction);
  }

  const order = {
    newest: 'r.created_at DESC, r.rowid DESC',
    oldest: 'r.created_at ASC, r.rowid ASC',
    title: 'r.title COLLATE NOCASE ASC, r.created_at DESC',
    tagCount: 'tag_count DESC, r.created_at DESC'
  }[sort];

  const isTagged = ['translation', 'reading'].includes(key);
  const tagCountExpr = isTagged ? 'json_array_length(r.tags_json)' : '0';

  const rows = getDb().prepare(`
    SELECT r.*, ${meta.excerptExpr} AS excerpt, ${tagCountExpr} AS tag_count
    FROM ${meta.table} r
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${order}
  `).all(...params);

  return rows.map((row) => ({
    ...row,
    tags: parseJson(row.tags_json, []),
    tag_count: row.tag_count || 0
  }));
}

function getRecord(kind, id) {
  const key = normalizeKind(kind);
  const row = getDb().prepare(`SELECT * FROM ${KINDS[key].table} WHERE id = ?`).get(id);
  if (!row) return null;
  const out = { ...row };
  if (row.tags_json) out.tags = parseJson(row.tags_json, []);
  if (row.segments_json) out.segments = parseJson(row.segments_json, []);
  if (row.outline_json) out.outline = parseJson(row.outline_json, []);
  if (row.terms_json) out.terms = parseJson(row.terms_json, []);
  if (row.result_json) out.result = parseJson(row.result_json, {});
  if (row.payload_json) out.payload = parseJson(row.payload_json, {});
  return out;
}

function deleteRecord(kind, id) {
  const key = normalizeKind(kind);
  return getDb().prepare(`DELETE FROM ${KINDS[key].table} WHERE id = ?`).run(id).changes > 0;
}

function clearRecords(kind) {
  const key = normalizeKind(kind);
  return getDb().prepare(`DELETE FROM ${KINDS[key].table}`).run().changes;
}

function recordTagCounts(kind) {
  const key = normalizeKind(kind);
  if (!['translation', 'reading'].includes(key)) return [];
  const table = KINDS[key].table;
  return getDb().prepare(`
    SELECT j.value AS tag, COUNT(*) AS count
    FROM ${table} r, json_each(r.tags_json) j
    GROUP BY j.value ORDER BY count DESC, j.value COLLATE NOCASE ASC
  `).all();
}

function saveTranslation(record) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO translation_records
      (id, title, source_text, segments_json, outline_json, terms_json, tags_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    record.title,
    record.sourceText,
    JSON.stringify(record.segments),
    JSON.stringify(record.outline),
    JSON.stringify(record.terms),
    JSON.stringify(normalizeTags(record.tags)),
    now,
    now
  );
  return getRecord('translation', id);
}

function saveReadingHistory(record) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO reading_history
      (id, title, source, source_url, direction, body, word_count, tags_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    record.title,
    record.source || '',
    record.sourceUrl || null,
    record.direction || 'exam',
    record.body,
    0,
    JSON.stringify(normalizeTags(record.tags)),
    now
  );
  return getRecord('reading', id);
}

function incrementReadingWords(id) {
  getDb().prepare('UPDATE reading_history SET word_count = word_count + 1 WHERE id = ?').run(id);
  return getRecord('reading', id);
}

function saveWritingReview(record) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO writing_reviews
        (id, title, topic, original_text, result_json, offline, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      record.title,
      record.topic,
      record.originalText,
      JSON.stringify(record.result),
      record.offline ? 1 : 0,
      now
    );
    db.prepare(`
      DELETE FROM writing_reviews WHERE id NOT IN (
        SELECT id FROM writing_reviews ORDER BY created_at DESC LIMIT 10
      )
    `).run();
  });
  tx();
  return getRecord('writing', id);
}

function addDictionaryHistory(word, payload) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('INSERT INTO dictionary_history (id, word, payload_json, created_at) VALUES (?, ?, ?, ?)')
      .run(id, word, JSON.stringify(payload), now);
    db.prepare(`
      DELETE FROM dictionary_history WHERE id NOT IN (
        SELECT id FROM dictionary_history ORDER BY created_at DESC LIMIT 20
      )
    `).run();
  })();
  return getRecord('dictionary', id);
}

function counts() {
  const db = getDb();
  return {
    translation: db.prepare('SELECT COUNT(*) AS c FROM translation_records').get().c,
    reading: db.prepare('SELECT COUNT(*) AS c FROM reading_history').get().c,
    writing: db.prepare('SELECT COUNT(*) AS c FROM writing_reviews').get().c,
    dictionary: db.prepare('SELECT COUNT(*) AS c FROM dictionary_history').get().c
  };
}

module.exports = {
  listRecords,
  getRecord,
  deleteRecord,
  clearRecords,
  recordTagCounts,
  saveTranslation,
  saveReadingHistory,
  incrementReadingWords,
  saveWritingReview,
  addDictionaryHistory,
  counts
};
