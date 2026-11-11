'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { SCHEMA } = require('./schema');
const { seedAll } = require('./seed');

let db = null;
let dbPath = null;

function initialize() {
  if (db) return db;
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  dbPath = path.join(dir, 'lumen-english.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);

  const seeded = db.prepare("SELECT value FROM app_meta WHERE key = 'seed_version'").get();
  if (!seeded) seedAll(db, { restore: false });
  return db;
}

function getDb() {
  if (!db) throw new Error('数据库尚未初始化');
  return db;
}

function getPath() {
  return dbPath;
}

function close() {
  if (!db) return;
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
  try { db.close(); } catch { /* ignore */ }
  db = null;
}

function restoreBuiltins() {
  seedAll(getDb(), { restore: true });
}

module.exports = { initialize, getDb, getPath, close, restoreBuiltins };
