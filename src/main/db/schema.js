'use strict';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('reading','word','practice','term','essay')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'builtin' CHECK (source_type IN ('builtin','web','ai','user')),
  source_url TEXT,
  domain TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contents_type_domain ON contents(type, domain);
CREATE INDEX IF NOT EXISTS idx_contents_created ON contents(created_at);
CREATE INDEX IF NOT EXISTS idx_contents_title ON contents(title COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS content_tags (
  content_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (content_id, tag),
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_content_tags_tag ON content_tags(tag);

CREATE VIRTUAL TABLE IF NOT EXISTS contents_fts USING fts5(
  title,
  body,
  content='contents',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS contents_ai AFTER INSERT ON contents BEGIN
  INSERT INTO contents_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS contents_ad AFTER DELETE ON contents BEGIN
  INSERT INTO contents_fts(contents_fts, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS contents_au AFTER UPDATE ON contents BEGIN
  INSERT INTO contents_fts(contents_fts, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
  INSERT INTO contents_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TABLE IF NOT EXISTS translation_records (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_text TEXT NOT NULL,
  segments_json TEXT NOT NULL,
  outline_json TEXT NOT NULL,
  terms_json TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_translation_created ON translation_records(created_at);

CREATE TABLE IF NOT EXISTS reading_history (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  direction TEXT NOT NULL DEFAULT 'exam',
  body TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reading_history_created ON reading_history(created_at);

CREATE TABLE IF NOT EXISTS writing_reviews (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'education',
  original_text TEXT NOT NULL,
  result_json TEXT NOT NULL,
  offline INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_writing_reviews_created ON writing_reviews(created_at);

CREATE TABLE IF NOT EXISTS dictionary_history (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dictionary_created ON dictionary_history(created_at);

CREATE TABLE IF NOT EXISTS word_reviews (
  content_id TEXT PRIMARY KEY,
  stage INTEGER NOT NULL DEFAULT 0,
  due_at TEXT NOT NULL,
  last_reviewed_at TEXT,
  correct_count INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_word_reviews_due ON word_reviews(due_at);
`;

module.exports = { SCHEMA };
