'use strict';

const fs = require('fs');
const path = require('path');

const SEED_DIR = path.join(__dirname, '..', 'seed');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, name), 'utf8'));
}

const BASE_TIME = Date.UTC(2025, 0, 6, 8, 0, 0);

function isoAt(offsetMinutes) {
  return new Date(BASE_TIME + offsetMinutes * 60000).toISOString();
}

function uniqueTags(tags) {
  return [...new Set((tags || []).map((t) => String(t).trim()).filter(Boolean))];
}

function insertContent(db, row, tags) {
  const now = row.updatedAt || row.createdAt;
  db.prepare(`
    INSERT INTO contents
      (id, type, title, body, source_type, source_url, domain, meta, hidden, created_at, updated_at)
    VALUES
      (@id, @type, @title, @body, @sourceType, @sourceUrl, @domain, @meta, @hidden, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      body = excluded.body,
      source_type = excluded.source_type,
      source_url = excluded.source_url,
      domain = excluded.domain,
      meta = excluded.meta,
      hidden = excluded.hidden,
      updated_at = excluded.updated_at
  `).run({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body || '',
    sourceType: row.sourceType || 'builtin',
    sourceUrl: row.sourceUrl || null,
    domain: row.domain || '',
    meta: JSON.stringify(row.meta || {}),
    hidden: 0,
    createdAt: row.createdAt || now,
    updatedAt: now
  });
  db.prepare('DELETE FROM content_tags WHERE content_id = ?').run(row.id);
  const insertTag = db.prepare('INSERT OR IGNORE INTO content_tags (content_id, tag) VALUES (?, ?)');
  for (const tag of uniqueTags(tags)) insertTag.run(row.id, tag);
}

function seedAll(db, { restore = false } = {}) {
  const reading = readJson('reading.json');
  const practice = readJson('practice.json');
  const essays = readJson('essay-samples.json');

  const run = db.transaction(() => {
    reading.forEach((item, index) => {
      insertContent(db, {
        id: item.id,
        type: 'reading',
        title: item.title,
        body: item.body || '',
        sourceType: 'builtin',
        sourceUrl: item.url || null,
        domain: item.direction,
        meta: {
          direction: item.direction,
          difficulty: item.difficulty,
          loadMode: item.loadMode,
          source: item.source,
          summary: item.summary || '',
          url: item.url || null
        },
        createdAt: isoAt(index),
        updatedAt: isoAt(index)
      }, ['内置', item.direction === 'exam' ? '考试' : item.direction === 'daily' ? '日常' : '科研', item.difficulty, ...(item.tags || [])]);
    });

    practice.forEach((item, index) => {
      const meta = {
        prompt: item.prompt,
        requirements: item.requirements || [],
        essayTopic: item.essayTopic || null,
        metaNote: item.metaNote || '',
        questions: item.questions || [],
        reference: item.reference || '',
        scoringPoints: item.scoringPoints || []
      };
      insertContent(db, {
        id: item.id,
        type: 'practice',
        title: item.title,
        body: item.domain === 'reading' ? item.body : item.body,
        sourceType: 'builtin',
        sourceUrl: null,
        domain: item.domain,
        meta,
        createdAt: isoAt(1000 + index),
        updatedAt: isoAt(1000 + index)
      }, ['内置', ...(item.tags || [])]);
    });

    Object.entries(essays).forEach(([topic, item], index) => {
      insertContent(db, {
        id: `essay-${topic}`,
        type: 'essay',
        title: item.title,
        body: item.essay,
        sourceType: 'builtin',
        sourceUrl: null,
        domain: topic,
        meta: {
          topic,
          label: item.label,
          review: item.review
        },
        createdAt: isoAt(2000 + index),
        updatedAt: isoAt(2000 + index)
      }, ['内置', '范文', item.label]);
    });

    db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('seed_version', '1');
    if (restore) {
      db.prepare("UPDATE contents SET hidden = 0 WHERE source_type = 'builtin'").run();
    }
    // External-content FTS is rebuilt explicitly after bulk writes.
    db.prepare("INSERT INTO contents_fts(contents_fts) VALUES('rebuild')").run();
  });

  run();
}

function getEssaySamples() {
  return readJson('essay-samples.json');
}

module.exports = { seedAll, getEssaySamples };
