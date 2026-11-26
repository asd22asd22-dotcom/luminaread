import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DEFAULT_ARTICLES_DIR } from './db.js';
import { parseStructuredMarkdown, inferStageFromPath } from './parser.js';
import { extractShortMeaning, normalizeToken } from './dictionary.js';

export function seedVocabIntoCache(db, vocabulary = []) {
  const stmt = db.prepare(`
    INSERT INTO dictionary_cache (word_key, phonetic, short_meaning, full_meaning, source, updated_at)
    VALUES (?, ?, ?, ?, 'vocab', datetime('now'))
    ON CONFLICT(word_key) DO UPDATE SET
      phonetic = CASE WHEN excluded.phonetic != '' THEN excluded.phonetic ELSE dictionary_cache.phonetic END,
      short_meaning = CASE WHEN dictionary_cache.source = 'vocab' OR dictionary_cache.short_meaning = '' THEN excluded.short_meaning ELSE dictionary_cache.short_meaning END,
      full_meaning = CASE WHEN dictionary_cache.source = 'vocab' OR dictionary_cache.full_meaning = '' THEN excluded.full_meaning ELSE dictionary_cache.full_meaning END,
      updated_at = datetime('now')
  `);

  for (const item of vocabulary) {
    if (!item?.word || !item?.meaning) continue;
    const key = normalizeToken(item.word);
    if (!key || item.word.trim().includes(' ')) continue;
    const full = item.pos ? `${item.pos} ${item.meaning}`.trim() : item.meaning;
    const short = extractShortMeaning(item.meaning);
    stmt.run(key, item.phonetic || '', short, full);
  }
}

export function upsertArticleRecord(db, data) {
  const vocabJson = JSON.stringify(data.vocabulary || []);
  const sentencesJson = JSON.stringify(data.sentences || []);
  const quizzesJson = JSON.stringify(data.quizzes || []);
  const glossaryJson =
    data.word_glossary !== undefined
      ? JSON.stringify(data.word_glossary || {})
      : null;

  const existing = db
    .prepare('SELECT id, word_glossary_json FROM articles WHERE slug = ?')
    .get(data.slug);

  if (existing) {
    db.prepare(`
      UPDATE articles SET
        stage = ?,
        stage_label = ?,
        order_num = ?,
        title = ?,
        difficulty = ?,
        word_count = ?,
        estimated_minutes = ?,
        body = ?,
        vocabulary_json = ?,
        sentences_json = ?,
        translation = ?,
        quizzes_json = ?,
        word_glossary_json = COALESCE(?, word_glossary_json),
        enrichment_status = ?,
        source_path = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      data.stage ?? 4,
      data.stage_label || '自定义导入',
      data.order_num ?? 0,
      data.title,
      data.difficulty || '',
      data.word_count ?? 0,
      data.estimated_minutes ?? 25,
      data.body,
      vocabJson,
      sentencesJson,
      data.translation || '',
      quizzesJson,
      glossaryJson,
      data.enrichment_status || 'complete',
      data.source_path || '',
      existing.id
    );
    seedVocabIntoCache(db, data.vocabulary || []);
    return db.prepare('SELECT * FROM articles WHERE id = ?').get(existing.id);
  }

  const info = db
    .prepare(`
      INSERT INTO articles (
        slug, stage, stage_label, order_num, title, difficulty,
        word_count, estimated_minutes, body, vocabulary_json,
        sentences_json, translation, quizzes_json, word_glossary_json,
        enrichment_status, source_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      data.slug,
      data.stage ?? 4,
      data.stage_label || '自定义导入',
      data.order_num ?? 0,
      data.title,
      data.difficulty || '',
      data.word_count ?? 0,
      data.estimated_minutes ?? 25,
      data.body,
      vocabJson,
      sentencesJson,
      data.translation || '',
      quizzesJson,
      glossaryJson || '{}',
      data.enrichment_status || 'complete',
      data.source_path || ''
    );

  seedVocabIntoCache(db, data.vocabulary || []);
  return db.prepare('SELECT * FROM articles WHERE id = ?').get(info.lastInsertRowid);
}

export function importRawArticle(db, { title, body, stage = 4, difficulty = '' }) {
  const cleanBody = String(body || '').replace(/\r\n/g, '\n').trim();
  const wordMatches = cleanBody.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g);
  const wordCount = wordMatches ? wordMatches.length : 0;
  const stageLabel =
    stage === 1
      ? '第一阶段 · 打底适应期'
      : stage === 2
      ? '第二阶段 · 过渡衔接期'
      : stage === 3
      ? '第三阶段 · 考研对标期'
      : '自定义导入';

  const slug = `raw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return upsertArticleRecord(db, {
    slug,
    stage: Number(stage) || 4,
    stage_label: stageLabel,
    order_num: 0,
    title: String(title || '').trim() || 'Untitled Custom Reading',
    difficulty: difficulty || `${stageLabel}（待 AI 拆解）`,
    word_count: wordCount,
    estimated_minutes: Math.max(10, Math.round(wordCount / 15)),
    body: cleanBody,
    vocabulary: [],
    sentences: [],
    translation: '',
    quizzes: [],
    enrichment_status: 'pending',
    source_path: '',
  });
}

function collectMarkdownFiles(dirPath) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(full));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith('.md') &&
      !entry.name.toLowerCase().startsWith('readme')
    ) {
      results.push(full);
    }
  }
  return results.sort();
}

export function syncDirectory(db, dirPath = DEFAULT_ARTICLES_DIR) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }
  const files = collectMarkdownFiles(path.resolve(dirPath));
  const findBySource = db.prepare("SELECT slug FROM articles WHERE source_path = ? AND source_path != ''");
  const findBySlug = db.prepare('SELECT source_path FROM articles WHERE slug = ?');
  const byStage = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const errors = [];
  let totalSynced = 0;

  db.exec('BEGIN');
  try {
    for (const filePath of files) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const inferred = inferStageFromPath(filePath);
        const parsed = parseStructuredMarkdown(raw, {
          stage: inferred.stage,
          stageLabel: inferred.stageLabel,
          sourcePath: filePath,
        });
        if (!parsed.body) throw new Error('无法识别正文板块，请使用英文正文或 Body 标题');

        const existing = findBySource.get(filePath);
        const slugOwner = findBySlug.get(parsed.slug);
        if (existing) {
          parsed.slug = existing.slug;
        } else if (slugOwner && (
          !slugOwner.source_path || path.resolve(slugOwner.source_path) !== filePath
        )) {
          const sourceHash = createHash('sha256').update(filePath).digest('hex');
          parsed.slug += '-' + sourceHash;
        }

        upsertArticleRecord(db, parsed);
        byStage[parsed.stage] = (byStage[parsed.stage] || 0) + 1;
        totalSynced += 1;
      } catch (err) {
        errors.push({ filePath, error: err.message });
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { dirPath, totalSynced, byStage, errors };
}
