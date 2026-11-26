import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');

export function resolveDbPath() {
  if (process.env.LUMINAREAD_DB_PATH) {
    return path.resolve(process.env.LUMINAREAD_DB_PATH);
  }
  const exeDir = path.dirname(process.execPath);
  const exeName = path.basename(process.execPath).toLowerCase();
  if (
    process.versions.electron &&
    exeName !== 'electron.exe' &&
    exeName !== 'node.exe' &&
    fs.existsSync(path.join(exeDir, 'data'))
  ) {
    return path.join(exeDir, 'data', 'luminaread.db');
  }
  return path.join(DATA_DIR, 'luminaread.db');
}

export const DB_PATH = resolveDbPath();
export const DEFAULT_ARTICLES_DIR = 'D:\\DeskBox\\Administrator\\分类集\\英文文章';

export const DEFAULT_APP_SETTINGS = {
  kaoyan_exam_date: '2026-12-20',
  daily_article_goal: 1,
  daily_review_goal: 20,
  daily_minutes_goal: 30,
  reader_font_size: 19,
  reader_line_height: 2.55,
  reader_font_family: 'serif',
  auto_play_word_audio: false,
  update_feed_url: '',
  auto_check_updates: true,
  lan_server_url: '',
};

export const REVIEW_TIME_SQL = 'COALESCE(julianday(next_review_at), 0)';
export const DUE_REVIEW_SQL = `${REVIEW_TIME_SQL} <= julianday('now')`;

let _dbInstance = null;

export function getTodayDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      stage INTEGER NOT NULL DEFAULT 1,
      stage_label TEXT NOT NULL DEFAULT '第一阶段',
      order_num INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      estimated_minutes INTEGER NOT NULL DEFAULT 25,
      body TEXT NOT NULL,
      vocabulary_json TEXT NOT NULL DEFAULT '[]',
      sentences_json TEXT NOT NULL DEFAULT '[]',
      translation TEXT NOT NULL DEFAULT '',
      quizzes_json TEXT NOT NULL DEFAULT '[]',
      word_glossary_json TEXT NOT NULL DEFAULT '{}',
      enrichment_status TEXT NOT NULL DEFAULT 'complete',
      source_path TEXT NOT NULL DEFAULT '',
      read_status TEXT NOT NULL DEFAULT 'unread',
      quiz_score INTEGER,
      quiz_answers_json TEXT NOT NULL DEFAULT '{}',
      reading_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_articles_stage ON articles(stage, order_num, id);
    CREATE INDEX IF NOT EXISTS idx_articles_enrichment ON articles(enrichment_status);

    CREATE TABLE IF NOT EXISTS clicked_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      paragraph_index INTEGER NOT NULL,
      token_index INTEGER NOT NULL,
      word TEXT NOT NULL,
      lemma TEXT NOT NULL DEFAULT '',
      phonetic TEXT NOT NULL DEFAULT '',
      short_meaning TEXT NOT NULL DEFAULT '',
      full_meaning TEXT NOT NULL DEFAULT '',
      context_sentence TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      is_visible_inline INTEGER NOT NULL DEFAULT 1,
      review_status TEXT NOT NULL DEFAULT 'learning',
      click_count INTEGER NOT NULL DEFAULT 1,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days INTEGER NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      next_review_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
      UNIQUE(article_id, paragraph_index, token_index)
    );

    CREATE INDEX IF NOT EXISTS idx_clicked_words_article ON clicked_words(article_id, paragraph_index, token_index);
    CREATE INDEX IF NOT EXISTS idx_clicked_words_review ON clicked_words(review_status, next_review_at);

    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'phrase',
      paragraph_index INTEGER NOT NULL,
      start_offset INTEGER NOT NULL DEFAULT 0,
      end_offset INTEGER NOT NULL DEFAULT 0,
      selected_text TEXT NOT NULL,
      translation TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'cyan',
      review_status TEXT NOT NULL DEFAULT 'learning',
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days INTEGER NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      next_review_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_annotations_article ON annotations(article_id, paragraph_index);
    CREATE INDEX IF NOT EXISTS idx_annotations_review ON annotations(review_status, next_review_at);

    CREATE TABLE IF NOT EXISTS dictionary_cache (
      word_key TEXT PRIMARY KEY,
      phonetic TEXT NOT NULL DEFAULT '',
      short_meaning TEXT NOT NULL DEFAULT '',
      full_meaning TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'youdao',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS offline_dictionary (
      word TEXT PRIMARY KEY,
      phonetic TEXT NOT NULL DEFAULT '',
      short_meaning TEXT NOT NULL DEFAULT '',
      full_meaning TEXT NOT NULL DEFAULT '',
      tag TEXT NOT NULL DEFAULT '',
      exchange TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS study_logs (
      date TEXT PRIMARY KEY,
      articles_read INTEGER NOT NULL DEFAULT 0,
      words_clicked INTEGER NOT NULL DEFAULT 0,
      reviews_done INTEGER NOT NULL DEFAULT 0,
      reading_seconds INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS custom_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '随手笔记',
      color TEXT NOT NULL DEFAULT 'amber',
      include_in_review INTEGER NOT NULL DEFAULT 0,
      review_status TEXT NOT NULL DEFAULT 'learning',
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days INTEGER NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      next_review_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_custom_notes_article ON custom_notes(article_id);
    CREATE INDEX IF NOT EXISTS idx_custom_notes_review ON custom_notes(include_in_review, review_status, next_review_at);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

let _activeDbPath = DB_PATH;

export function getActiveDbPath() {
  return _activeDbPath;
}

export function getDb(customPath = resolveDbPath()) {
  if (_dbInstance && customPath === _activeDbPath) {
    return _dbInstance;
  }
  const dir = path.dirname(customPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(customPath);
  ensureSchema(db);
  _activeDbPath = customPath;
  _dbInstance = db;
  return db;
}

export function checkpointDb(db = getDb()) {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const merged = { ...DEFAULT_APP_SETTINGS };
  for (const row of rows) {
    if (!(row.key in DEFAULT_APP_SETTINGS)) continue;
    try {
      merged[row.key] = JSON.parse(row.value);
    } catch {
      merged[row.key] = row.value;
    }
  }
  return merged;
}

export function saveSettings(db, patch = {}) {
  const stmt = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `);
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_APP_SETTINGS) || v === undefined) continue;
    stmt.run(k, JSON.stringify(v));
  }
  return getSettings(db);
}

export function recordStudyActivity(
  db,
  { articlesRead = 0, wordsClicked = 0, reviewsDone = 0, readingSeconds = 0 } = {},
  dateStr = getTodayDateStr()
) {
  const stmt = db.prepare(`
    INSERT INTO study_logs (date, articles_read, words_clicked, reviews_done, reading_seconds)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      articles_read = articles_read + excluded.articles_read,
      words_clicked = words_clicked + excluded.words_clicked,
      reviews_done = reviews_done + excluded.reviews_done,
      reading_seconds = reading_seconds + excluded.reading_seconds
  `);
  stmt.run(dateStr, articlesRead, wordsClicked, reviewsDone, readingSeconds);
}

export function safeJsonParse(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
