'use strict';

const crypto = require('crypto');
const { getDb } = require('./index');
const { restoreBuiltins } = require('./index');

const TYPES = new Set(['reading', 'word', 'practice', 'term', 'essay']);
const SOURCE_TYPES = new Set(['builtin', 'web', 'ai', 'user']);
const SORTS = new Set(['newest', 'oldest', 'title', 'tagCount', 'source']);

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags
    .map((tag) => String(tag || '').trim().replace(/\s+/g, ' '))
    .filter((tag) => tag && tag.length <= 40))]
    .slice(0, 40);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapRow(row) {
  if (!row) return null;
  const { tags_json, ...rest } = row;
  return {
    ...rest,
    hidden: Boolean(rest.hidden),
    meta: parseJson(rest.meta, {}),
    tags: parseJson(tags_json, [])
  };
}

function getContent(id) {
  const row = getDb().prepare(`
    SELECT c.*, COALESCE((SELECT json_group_array(tag) FROM content_tags WHERE content_id = c.id), '[]') AS tags_json
    FROM contents c WHERE c.id = ?
  `).get(id);
  return mapRow(row);
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (m) => '\\' + m);
}

function listContents(options = {}) {
  const type = String(options.type || '');
  if (!TYPES.has(type)) throw new Error('内容类型无效');
  const domain = options.domain ? String(options.domain) : null;
  const search = String(options.search || '').trim();
  const tags = normalizeTags(options.tags);
  const sort = SORTS.has(options.sort) ? options.sort : 'newest';
  const includeHidden = Boolean(options.includeHidden);

  const where = ['c.type = ?'];
  const params = [type];

  if (!includeHidden) where.push('c.hidden = 0');
  if (domain) {
    where.push('c.domain = ?');
    params.push(domain);
  }

  if (search) {
    if (/[\u3400-\u9fff]/.test(search)) {
      const like = `%${escapeLike(search)}%`;
      where.push("(c.title LIKE ? ESCAPE '\\' OR c.body LIKE ? ESCAPE '\\')");
      params.push(like, like);
    } else {
      const tokens = search.split(/\s+/)
        .map((token) => token.replace(/["']/g, '').trim())
        .filter(Boolean)
        .slice(0, 12);
      if (tokens.length) {
        const fts = tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' AND ');
        where.push('c.rowid IN (SELECT rowid FROM contents_fts WHERE contents_fts MATCH ?)');
        params.push(fts);
      } else {
        const like = `%${escapeLike(search)}%`;
        where.push("(c.title LIKE ? ESCAPE '\\' OR c.body LIKE ? ESCAPE '\\')");
        params.push(like, like);
      }
    }
  }

  if (tags.length) {
    where.push(`c.id IN (
      SELECT content_id FROM content_tags
      WHERE tag IN (${tags.map(() => '?').join(',')})
      GROUP BY content_id HAVING COUNT(DISTINCT tag) = ?
    )`);
    params.push(...tags, tags.length);
  }

  const order = {
    newest: 'c.created_at DESC, c.rowid DESC',
    oldest: 'c.created_at ASC, c.rowid ASC',
    title: 'c.title COLLATE NOCASE ASC, c.created_at DESC',
    tagCount: 'tag_count DESC, c.title COLLATE NOCASE ASC',
    source: 'c.source_type ASC, c.created_at DESC'
  }[sort];

  const rows = getDb().prepare(`
    SELECT c.*,
      COALESCE((SELECT json_group_array(tag) FROM content_tags WHERE content_id = c.id), '[]') AS tags_json,
      (SELECT COUNT(*) FROM content_tags WHERE content_id = c.id) AS tag_count
    FROM contents c
    WHERE ${where.join(' AND ')}
    ORDER BY ${order}
  `).all(...params);

  return rows.map(mapRow);
}

function tagCounts({ type, domain } = {}) {
  const where = ['c.hidden = 0'];
  const params = [];
  if (type) {
    if (!TYPES.has(type)) throw new Error('内容类型无效');
    where.push('c.type = ?');
    params.push(type);
  }
  if (domain) {
    where.push('c.domain = ?');
    params.push(domain);
  }
  const sql = `
    SELECT t.tag AS tag, COUNT(*) AS count
    FROM content_tags t
    JOIN contents c ON c.id = t.content_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY t.tag
    ORDER BY count DESC, t.tag COLLATE NOCASE ASC
  `;
  return getDb().prepare(sql).all(...params);
}

function validateContentInput(input, { partial = false } = {}) {
  const out = {};
  if (!partial || input.type !== undefined) {
    if (!TYPES.has(input.type)) throw new Error('内容类型无效');
    out.type = input.type;
  }
  if (!partial || input.title !== undefined) {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('标题不能为空');
    out.title = title.slice(0, 300);
  }
  if (!partial || input.body !== undefined) out.body = String(input.body || '');
  if (input.sourceType !== undefined || input.source_type !== undefined) {
    const sourceType = input.sourceType || input.source_type;
    if (!SOURCE_TYPES.has(sourceType)) throw new Error('来源类型无效');
    out.sourceType = sourceType;
  }
  if (input.sourceUrl !== undefined || input.source_url !== undefined) {
    out.sourceUrl = input.sourceUrl || input.source_url || null;
  }
  if (input.domain !== undefined) out.domain = String(input.domain || '').slice(0, 80);
  if (input.meta !== undefined) {
    if (!input.meta || typeof input.meta !== 'object' || Array.isArray(input.meta)) {
      throw new Error('meta 必须是对象');
    }
    out.meta = input.meta;
  }
  if (input.hidden !== undefined) out.hidden = input.hidden ? 1 : 0;
  return out;
}

function createContent(input) {
  const data = validateContentInput(input);
  const id = input.id && /^[a-zA-Z0-9:_-]{1,100}$/.test(input.id) ? input.id : crypto.randomUUID();
  const now = new Date().toISOString();
  const tags = normalizeTags(input.tags);
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO contents (id, type, title, body, source_type, source_url, domain, meta, hidden, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.type, data.title, data.body || '', data.sourceType || 'user',
      data.sourceUrl || null, data.domain || '', JSON.stringify(data.meta || {}),
      data.hidden || 0, now, now
    );
    const stmt = db.prepare('INSERT OR IGNORE INTO content_tags (content_id, tag) VALUES (?, ?)');
    for (const tag of tags) stmt.run(id, tag);
  });
  tx();
  return getContent(id);
}

function updateContent(id, input) {
  const existing = getContent(id);
  if (!existing) throw new Error('内容不存在');
  const data = validateContentInput(input, { partial: true });
  const fields = [];
  const values = [];
  const columns = {
    type: 'type', title: 'title', body: 'body', sourceType: 'source_type',
    sourceUrl: 'source_url', domain: 'domain', hidden: 'hidden'
  };
  for (const [key, column] of Object.entries(columns)) {
    if (data[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(data[key]);
    }
  }
  if (data.meta !== undefined) {
    fields.push('meta = ?');
    values.push(JSON.stringify(data.meta));
  }
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE contents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    if (Array.isArray(input.tags)) {
      db.prepare('DELETE FROM content_tags WHERE content_id = ?').run(id);
      const stmt = db.prepare('INSERT OR IGNORE INTO content_tags (content_id, tag) VALUES (?, ?)');
      for (const tag of normalizeTags(input.tags)) stmt.run(id, tag);
    }
  });
  tx();
  return getContent(id);
}

function deleteContent(id) {
  return getDb().prepare('DELETE FROM contents WHERE id = ?').run(id).changes > 0;
}

function setHidden(id, hidden) {
  return getDb().prepare('UPDATE contents SET hidden = ?, updated_at = ? WHERE id = ?')
    .run(hidden ? 1 : 0, new Date().toISOString(), id).changes > 0;
}

function clearType(type) {
  if (!TYPES.has(type)) throw new Error('内容类型无效');
  return getDb().prepare('DELETE FROM contents WHERE type = ?').run(type).changes;
}

function counts() {
  const db = getDb();
  const byType = Object.fromEntries((db.prepare('SELECT type, COUNT(*) AS count FROM contents GROUP BY type').all())
    .map((row) => [row.type, row.count]));
  const readingByDirection = Object.fromEntries((db.prepare("SELECT domain, COUNT(*) AS count FROM contents WHERE type = 'reading' GROUP BY domain").all())
    .map((row) => [row.domain, row.count]));
  const hiddenBuiltin = db.prepare("SELECT COUNT(*) AS count FROM contents WHERE source_type = 'builtin' AND hidden = 1").get().count;
  const due = db.prepare("SELECT COUNT(*) AS count FROM word_reviews WHERE due_at <= ?").get(new Date().toISOString()).count;
  const history = {
    translations: db.prepare('SELECT COUNT(*) AS count FROM translation_records').get().count,
    reading: db.prepare('SELECT COUNT(*) AS count FROM reading_history').get().count,
    writing: db.prepare('SELECT COUNT(*) AS count FROM writing_reviews').get().count,
    dictionary: db.prepare('SELECT COUNT(*) AS count FROM dictionary_history').get().count
  };
  return {
    reading: byType.reading || 0,
    word: byType.word || 0,
    practice: byType.practice || 0,
    term: byType.term || 0,
    essay: byType.essay || 0,
    readingByDirection,
    hiddenBuiltin,
    due,
    history,
    translations: history.translations,
    readingHistory: history.reading,
    writingReviews: history.writing
  };
}

function restoreBuiltinPresets() {
  restoreBuiltins();
  return counts();
}

module.exports = {
  TYPES,
  SORTS,
  normalizeTags,
  listContents,
  getContent,
  createContent,
  updateContent,
  deleteContent,
  setHidden,
  tagCounts,
  clearType,
  counts,
  restoreBuiltinPresets
};
