import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import path from 'node:path';
import {
  getDb,
  getActiveDbPath,
  getTodayDateStr,
  getSettings,
  saveSettings,
  PROJECT_ROOT,
  DEFAULT_ARTICLES_DIR,
  DUE_REVIEW_SQL,
  REVIEW_TIME_SQL,
  recordStudyActivity,
  safeJsonParse,
} from './db.js';
import { parseStructuredMarkdown } from './parser.js';
import {
  lookupWord,
  lookupWordOfflineOnly,
  searchOfflineDictionary,
  translateText,
  normalizeToken,
} from './dictionary.js';
import { calculateSm2 } from './sm2.js';
import { upsertArticleRecord, importRawArticle, syncDirectory } from './importer.js';

function formatArticleSummary(row) {
  return {
    id: row.id,
    slug: row.slug,
    stage: row.stage,
    stage_label: row.stage_label,
    order_num: row.order_num,
    title: row.title,
    difficulty: row.difficulty,
    word_count: row.word_count,
    estimated_minutes: row.estimated_minutes,
    enrichment_status: row.enrichment_status,
    read_status: row.read_status,
    quiz_score: row.quiz_score,
    reading_seconds: row.reading_seconds,
    clicked_words_count: row.clicked_words_count ?? 0,
    annotations_count: row.annotations_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function formatArticleFull(row) {
  return {
    ...formatArticleSummary(row),
    body: row.body,
    vocabulary: safeJsonParse(row.vocabulary_json, []),
    sentences: safeJsonParse(row.sentences_json, []),
    translation: row.translation,
    quizzes: safeJsonParse(row.quizzes_json, []),
    word_glossary: safeJsonParse(row.word_glossary_json, {}),
    quiz_answers: safeJsonParse(row.quiz_answers_json, {}),
    source_path: row.source_path,
  };
}

export function initializeDatabase(db) {
  try {
    const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM articles').get();
    if ((countRow?.cnt ?? 0) === 0 && fs.existsSync(DEFAULT_ARTICLES_DIR)) {
      syncDirectory(db, DEFAULT_ARTICLES_DIR);
    }
  } catch (err) {
    console.error('Auto-seed warning:', err.message);
  }

  try {
    const missingWords = db
      .prepare("SELECT id, article_id, word FROM clicked_words WHERE short_meaning = '' OR short_meaning = '暂未收录'")
      .all();
    if (missingWords.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE clicked_words SET
          lemma = ?, phonetic = ?, short_meaning = ?, full_meaning = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      let repaired = 0;
      for (const row of missingWords) {
        const hit = lookupWordOfflineOnly(db, row.word, row.article_id);
        if (hit && hit.short_meaning && hit.short_meaning !== '暂未收录') {
          updateStmt.run(
            hit.lemma || row.word,
            hit.phonetic || '',
            hit.short_meaning,
            hit.full_meaning || hit.short_meaning,
            row.id
          );
          repaired += 1;
        }
      }
      if (repaired > 0) {
        console.log(`Repaired ${repaired}/${missingWords.length} previously unfound clicked words.`);
      }
    }
  } catch (err) {
    console.error('Auto-repair clicked_words warning:', err.message);
  }
}

export function createApp({ db, getServerPort = () => 3456 }) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '16mb' }));

  let appVersion = '1.1.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    if (pkg?.version) appVersion = pkg.version;
  } catch {
    // fallback
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'luminaread-api', version: appVersion });
  });

  app.get('/api/version', (_req, res) => {
    res.json({
      version: appVersion,
      platform: process.versions.electron ? 'windows-desktop' : 'web',
    });
  });

  app.get('/api/network/info', (_req, res) => {
    const port = getServerPort();
    const nets = os.networkInterfaces();
    const urls = [];
    for (const ifaces of Object.values(nets)) {
      for (const info of ifaces || []) {
        if (info.family === 'IPv4' && !info.internal) {
          urls.push(`http://${info.address}:${port}`);
        }
      }
    }
    res.json({ port, urls });
  });

  app.get('/api/articles/export-all', (_req, res) => {
    const rows = db.prepare('SELECT * FROM articles ORDER BY stage ASC, order_num ASC, id ASC').all();
    res.json({ articles: rows.map(formatArticleFull) });
  });

  app.get('/api/settings', (_req, res) => {
    res.json({ settings: getSettings(db) });
  });

  app.patch('/api/settings', (req, res) => {
    const next = saveSettings(db, req.body || {});
    res.json({ settings: next });
  });

  app.get('/api/stats', (_req, res) => {
    const stages = db
      .prepare(`
        SELECT
          stage,
          MAX(stage_label) AS stage_label,
          COUNT(*) AS total,
          SUM(CASE WHEN read_status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN read_status = 'reading' THEN 1 ELSE 0 END) AS reading
        FROM articles
        GROUP BY stage
        ORDER BY stage ASC
      `)
      .all();

    const totals = db
      .prepare(`
        SELECT
          COUNT(*) AS total_articles,
          SUM(CASE WHEN read_status = 'completed' THEN 1 ELSE 0 END) AS completed_articles,
          SUM(CASE WHEN enrichment_status = 'pending' THEN 1 ELSE 0 END) AS pending_enrichment,
          SUM(reading_seconds) AS total_reading_seconds
        FROM articles
      `)
      .get();

    const wordsStats = db
      .prepare(`
        SELECT
          COUNT(*) AS total_words,
          SUM(CASE WHEN review_status = 'learning' THEN 1 ELSE 0 END) AS learning_words,
          SUM(CASE WHEN review_status = 'mastered' THEN 1 ELSE 0 END) AS mastered_words,
          SUM(CASE WHEN review_status = 'learning' AND ${DUE_REVIEW_SQL} THEN 1 ELSE 0 END) AS due_words
        FROM clicked_words
      `)
      .get();

    const annoStats = db
      .prepare(`
        SELECT
          COUNT(*) AS total_annotations,
          SUM(CASE WHEN review_status = 'learning' AND ${DUE_REVIEW_SQL} THEN 1 ELSE 0 END) AS due_annotations
        FROM annotations
      `)
      .get();

    const customNoteStats = db
      .prepare(`
        SELECT
          COUNT(*) AS total_custom_notes,
          SUM(CASE WHEN include_in_review = 1 AND review_status = 'learning' AND ${DUE_REVIEW_SQL} THEN 1 ELSE 0 END) AS due_custom_notes
        FROM custom_notes
      `)
      .get();

    const recentLogs = db
      .prepare('SELECT * FROM study_logs ORDER BY date DESC LIMIT 14')
      .all();

    const todayStr = getTodayDateStr();
    const todayLog = db
      .prepare('SELECT * FROM study_logs WHERE date = ?')
      .get(todayStr) || {
      date: todayStr,
      articles_read: 0,
      words_clicked: 0,
      reviews_done: 0,
      reading_seconds: 0,
    };

    let streakDays = 0;
    const logDates = new Set(
      db
        .prepare(
          'SELECT date FROM study_logs WHERE articles_read > 0 OR words_clicked > 0 OR reviews_done > 0 OR reading_seconds > 60'
        )
        .all()
        .map((r) => r.date)
    );
    const cursor = new Date();
    for (let i = 0; i < 365; i += 1) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const ds = `${y}-${m}-${d}`;
      if (logDates.has(ds)) {
        streakDays += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else if (i === 0) {
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    const recentArticle = db
      .prepare(`
        SELECT a.*,
          (SELECT COUNT(*) FROM clicked_words cw WHERE cw.article_id = a.id) AS clicked_words_count,
          (SELECT COUNT(*) FROM annotations an WHERE an.article_id = a.id) AS annotations_count
        FROM articles a
        ORDER BY
          CASE WHEN a.read_status = 'reading' THEN 0 WHEN a.read_status = 'unread' THEN 1 ELSE 2 END,
          a.updated_at DESC,
          a.stage ASC,
          a.order_num ASC
        LIMIT 1
      `)
      .get();

    res.json({
      stages,
      totals: {
        total_articles: totals?.total_articles ?? 0,
        completed_articles: totals?.completed_articles ?? 0,
        pending_enrichment: totals?.pending_enrichment ?? 0,
        total_reading_seconds: totals?.total_reading_seconds ?? 0,
        total_words: wordsStats?.total_words ?? 0,
        learning_words: wordsStats?.learning_words ?? 0,
        mastered_words: wordsStats?.mastered_words ?? 0,
        total_annotations: annoStats?.total_annotations ?? 0,
        total_custom_notes: customNoteStats?.total_custom_notes ?? 0,
        due_reviews:
          (wordsStats?.due_words ?? 0) +
          (annoStats?.due_annotations ?? 0) +
          (customNoteStats?.due_custom_notes ?? 0),
        streak_days: streakDays,
      },
      today: todayLog,
      settings: getSettings(db),
      recent_logs: recentLogs.reverse(),
      recommended_article: recentArticle ? formatArticleSummary(recentArticle) : null,
    });
  });

  app.get('/api/articles', (req, res) => {
    const { stage, status, enrichment, q } = req.query;
    const conditions = [];
    const params = [];

    if (stage && stage !== 'all') {
      conditions.push('a.stage = ?');
      params.push(Number(stage));
    }
    if (status && status !== 'all') {
      conditions.push('a.read_status = ?');
      params.push(String(status));
    }
    if (enrichment && enrichment !== 'all') {
      conditions.push('a.enrichment_status = ?');
      params.push(String(enrichment));
    }
    if (q && String(q).trim()) {
      conditions.push('(a.title LIKE ? OR a.body LIKE ? OR a.difficulty LIKE ?)');
      const like = `%${String(q).trim()}%`;
      params.push(like, like, like);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(`
        SELECT a.*,
          (SELECT COUNT(*) FROM clicked_words cw WHERE cw.article_id = a.id) AS clicked_words_count,
          (SELECT COUNT(*) FROM annotations an WHERE an.article_id = a.id) AS annotations_count
        FROM articles a
        ${whereClause}
        ORDER BY a.stage ASC, a.order_num ASC, a.id ASC
      `)
      .all(...params);

    res.json({ articles: rows.map(formatArticleSummary) });
  });

  app.get('/api/articles/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db
      .prepare(`
        SELECT a.*,
          (SELECT COUNT(*) FROM clicked_words cw WHERE cw.article_id = a.id) AS clicked_words_count,
          (SELECT COUNT(*) FROM annotations an WHERE an.article_id = a.id) AS annotations_count
        FROM articles a
        WHERE a.id = ?
      `)
      .get(id);

    if (!row) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const clickedWords = db
      .prepare(
        'SELECT * FROM clicked_words WHERE article_id = ? ORDER BY paragraph_index ASC, token_index ASC'
      )
      .all(id);
    const annotations = db
      .prepare(
        'SELECT * FROM annotations WHERE article_id = ? ORDER BY paragraph_index ASC, start_offset ASC'
      )
      .all(id);
    const customNotes = db
      .prepare('SELECT * FROM custom_notes WHERE article_id = ? ORDER BY updated_at DESC, id DESC')
      .all(id);

    res.json({
      article: formatArticleFull(row),
      clickedWords,
      annotations,
      customNotes,
    });
  });

  app.patch('/api/articles/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const { read_status, quiz_score, quiz_answers, add_seconds } = req.body || {};
    const nextStatus = read_status || existing.read_status;
    const nextScore = quiz_score !== undefined ? quiz_score : existing.quiz_score;
    const nextAnswers =
      quiz_answers !== undefined
        ? JSON.stringify(quiz_answers)
        : existing.quiz_answers_json;
    const deltaSeconds = Number(add_seconds) > 0 ? Math.min(600, Math.round(Number(add_seconds))) : 0;

    db.prepare(`
      UPDATE articles SET
        read_status = ?,
        quiz_score = ?,
        quiz_answers_json = ?,
        reading_seconds = reading_seconds + ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStatus, nextScore, nextAnswers, deltaSeconds, id);

    if (nextStatus === 'completed' && existing.read_status !== 'completed') {
      recordStudyActivity(db, { articlesRead: 1, readingSeconds: deltaSeconds });
    } else if (deltaSeconds > 0) {
      recordStudyActivity(db, { readingSeconds: deltaSeconds });
    }

    const updated = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    res.json({ article: formatArticleFull(updated) });
  });

  app.delete('/api/articles/:id', (req, res) => {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM articles WHERE id = ?').run(id);
    res.json({ deleted: info.changes > 0 });
  });

  app.post('/api/articles/import-markdown', (req, res) => {
    const { markdown, stage } = req.body || {};
    if (!markdown || !String(markdown).trim()) {
      return res.status(400).json({ error: 'Markdown content is required' });
    }
    const parsed = parseStructuredMarkdown(String(markdown), {
      stage: stage ? Number(stage) : undefined,
    });
    if (!parsed.body) {
      return res.status(400).json({ error: '无法识别 ## 英文正文 板块，请检查格式或改用“导入纯英文原文”' });
    }
    const saved = upsertArticleRecord(db, parsed);
    res.json({ article: formatArticleFull(saved) });
  });

  app.post('/api/articles/import-raw', (req, res) => {
    const { title, body, stage, difficulty } = req.body || {};
    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: 'English body text is required' });
    }
    const saved = importRawArticle(db, { title, body, stage, difficulty });
    res.json({ article: formatArticleFull(saved) });
  });

  app.post('/api/articles/sync-folder', (req, res) => {
    const dirPath = req.body?.dirPath || DEFAULT_ARTICLES_DIR;
    try {
      const result = syncDirectory(db, dirPath);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/dictionary/lookup', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const articleId = req.query.articleId ? Number(req.query.articleId) : null;
    if (!q) return res.status(400).json({ error: 'Missing query parameter q' });
    const result = await lookupWord(db, q, articleId);
    res.json(result);
  });

  app.get('/api/dictionary/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Number(req.query.limit || 12);
    if (!q) return res.json({ exact: null, suggestions: [] });
    const suggestions = searchOfflineDictionary(db, q, limit);
    const exact = await lookupWord(db, q, null);
    res.json({ exact, suggestions });
  });

  app.post('/api/dictionary/translate', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Missing text' });
    const result = await translateText(db, text);
    res.json(result);
  });

  app.post('/api/words/click', async (req, res) => {
    const {
      articleId,
      paragraphIndex,
      tokenIndex,
      word,
      contextSentence = '',
      forceShow = false,
    } = req.body || {};

    const artId = Number(articleId);
    const pIdx = Number(paragraphIndex);
    const tIdx = Number(tokenIndex);
    if (
      !Number.isSafeInteger(artId) || artId < 1 ||
      !Number.isSafeInteger(pIdx) || pIdx < 0 ||
      !Number.isSafeInteger(tIdx) || tIdx < 0 ||
      paragraphIndex == null || tokenIndex == null ||
      typeof word !== 'string' || !word.trim()
    ) {
      return res.status(400).json({ error: 'Invalid word coordinates or text' });
    }

    const findArticle = db.prepare('SELECT id FROM articles WHERE id = ?');
    if (!findArticle.get(artId)) return res.status(404).json({ error: 'Article not found' });

    const findWord = db.prepare(
      'SELECT * FROM clicked_words WHERE article_id = ? AND paragraph_index = ? AND token_index = ?'
    );
    const initial = findWord.get(artId, pIdx, tIdx);
    const needsLookup = !initial?.short_meaning || initial.short_meaning === '暂未收录';
    const lookup = needsLookup ? await lookupWord(db, word, artId) : initial;
    const cleanWord = normalizeToken(word) || word.trim();

    db.exec('BEGIN IMMEDIATE');
    let result;
    try {
      if (findArticle.get(artId)) {
        const existing = findWord.get(artId, pIdx, tIdx);
        if (existing) {
          const refreshMeaning =
            (!existing.short_meaning || existing.short_meaning === '暂未收录') &&
            lookup?.short_meaning &&
            lookup.short_meaning !== '暂未收录';
          db.prepare(`
            UPDATE clicked_words SET
              is_visible_inline = CASE WHEN ? THEN 1 ELSE 1 - is_visible_inline END,
              click_count = click_count + 1,
              phonetic = ?, short_meaning = ?, full_meaning = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `).run(
            forceShow || refreshMeaning ? 1 : 0,
            refreshMeaning ? lookup.phonetic || existing.phonetic : existing.phonetic,
            refreshMeaning ? lookup.short_meaning : existing.short_meaning,
            refreshMeaning ? lookup.full_meaning || lookup.short_meaning : existing.full_meaning,
            existing.id
          );
        } else {
          db.prepare(`
            INSERT INTO clicked_words (
              article_id, paragraph_index, token_index, word, lemma,
              phonetic, short_meaning, full_meaning, context_sentence,
              is_visible_inline, review_status, next_review_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'learning', ?)
          `).run(
            artId,
            pIdx,
            tIdx,
            cleanWord,
            lookup?.lemma || cleanWord,
            lookup?.phonetic || '',
            lookup?.short_meaning || '暂未收录',
            lookup?.full_meaning || lookup?.short_meaning || '',
            String(contextSentence ?? ''),
            new Date().toISOString()
          );
          db.prepare(
            "UPDATE articles SET read_status = CASE WHEN read_status = 'unread' THEN 'reading' ELSE read_status END, updated_at = datetime('now') WHERE id = ?"
          ).run(artId);
          recordStudyActivity(db, { wordsClicked: 1 });
        }
        result = { clickedWord: findWord.get(artId, pIdx, tIdx), created: !existing };
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    if (!result) return res.status(404).json({ error: 'Article not found' });
    res.json(result);
  });

  app.patch('/api/words/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM clicked_words WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Word note not found' });

    const { note, short_meaning, full_meaning, review_status, is_visible_inline } = req.body || {};
    db.prepare(`
      UPDATE clicked_words SET
        note = COALESCE(?, note),
        short_meaning = COALESCE(?, short_meaning),
        full_meaning = COALESCE(?, full_meaning),
        review_status = COALESCE(?, review_status),
        is_visible_inline = COALESCE(?, is_visible_inline),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      note !== undefined ? note : null,
      short_meaning !== undefined ? short_meaning : null,
      full_meaning !== undefined ? full_meaning : null,
      review_status !== undefined ? review_status : null,
      is_visible_inline !== undefined ? (is_visible_inline ? 1 : 0) : null,
      id
    );

    const updated = db.prepare('SELECT * FROM clicked_words WHERE id = ?').get(id);
    res.json({ clickedWord: updated });
  });

  app.delete('/api/words/:id', (req, res) => {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM clicked_words WHERE id = ?').run(id);
    res.json({ deleted: info.changes > 0 });
  });

  app.post('/api/annotations', async (req, res) => {
    const {
      articleId,
      type = 'phrase',
      paragraphIndex,
      startOffset = 0,
      endOffset = 0,
      selectedText,
      translation = '',
      note = '',
      color = 'cyan',
    } = req.body || {};

    if (!articleId || paragraphIndex === undefined || !selectedText) {
      return res.status(400).json({ error: 'Missing required annotation fields' });
    }

    let finalTranslation = String(translation || '').trim();
    if (!finalTranslation && selectedText.trim().length <= 320) {
      const tr = await translateText(db, selectedText);
      finalTranslation = tr.translation || '';
    }

    const nowIso = new Date().toISOString();
    const info = db
      .prepare(`
        INSERT INTO annotations (
          article_id, type, paragraph_index, start_offset, end_offset,
          selected_text, translation, note, color, review_status, next_review_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'learning', ?)
      `)
      .run(
        Number(articleId),
        type,
        Number(paragraphIndex),
        Number(startOffset),
        Number(endOffset),
        String(selectedText).trim(),
        finalTranslation,
        String(note || ''),
        color,
        nowIso
      );

    const created = db
      .prepare('SELECT * FROM annotations WHERE id = ?')
      .get(info.lastInsertRowid);
    res.json({ annotation: created });
  });

  app.patch('/api/annotations/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM annotations WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Annotation not found' });

    const { note, translation, color, review_status } = req.body || {};
    db.prepare(`
      UPDATE annotations SET
        note = COALESCE(?, note),
        translation = COALESCE(?, translation),
        color = COALESCE(?, color),
        review_status = COALESCE(?, review_status),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      note !== undefined ? note : null,
      translation !== undefined ? translation : null,
      color !== undefined ? color : null,
      review_status !== undefined ? review_status : null,
      id
    );

    const updated = db.prepare('SELECT * FROM annotations WHERE id = ?').get(id);
    res.json({ annotation: updated });
  });

  app.delete('/api/annotations/:id', (req, res) => {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM annotations WHERE id = ?').run(id);
    res.json({ deleted: info.changes > 0 });
  });

  app.post('/api/custom-notes', (req, res) => {
    const {
      articleId = null,
      title = '',
      content = '',
      category = '随手笔记',
      color = 'amber',
      includeInReview = false,
    } = req.body || {};

    const cleanTitle = String(title || '').trim();
    const cleanContent = String(content || '').trim();
    if (!cleanTitle && !cleanContent) {
      return res.status(400).json({ error: '笔记标题或正文不能同时为空' });
    }

    let linkedArticleId = null;
    if (articleId !== null && articleId !== undefined && articleId !== '') {
      const parsedId = Number(articleId);
      if (!Number.isSafeInteger(parsedId) || parsedId < 1) {
        return res.status(400).json({ error: 'Invalid articleId' });
      }
      const art = db.prepare('SELECT id FROM articles WHERE id = ?').get(parsedId);
      if (!art) return res.status(404).json({ error: 'Article not found' });
      linkedArticleId = parsedId;
    }

    const validColor = ['cyan', 'violet', 'amber', 'rose'].includes(color) ? color : 'amber';
    const finalTitle = cleanTitle || cleanContent.slice(0, 36);
    const finalCategory = String(category || '随手笔记').trim() || '随手笔记';
    const nowIso = new Date().toISOString();

    const info = db
      .prepare(`
        INSERT INTO custom_notes (
          article_id, title, content, category, color,
          include_in_review, review_status, next_review_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'learning', ?)
      `)
      .run(
        linkedArticleId,
        finalTitle,
        cleanContent,
        finalCategory,
        validColor,
        includeInReview ? 1 : 0,
        nowIso
      );

    const created = db.prepare('SELECT * FROM custom_notes WHERE id = ?').get(info.lastInsertRowid);
    res.json({ customNote: created });
  });

  app.patch('/api/custom-notes/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM custom_notes WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Custom note not found' });

    const { title, content, category, color, includeInReview, include_in_review, review_status } =
      req.body || {};
    const nextTitle = title !== undefined ? String(title).trim() : existing.title;
    const nextContent = content !== undefined ? String(content) : existing.content;
    if (!nextTitle && !nextContent.trim()) {
      return res.status(400).json({ error: '笔记标题和正文不能同时为空' });
    }
    const rawInclude = includeInReview !== undefined ? includeInReview : include_in_review;
    const nextColor =
      color !== undefined && ['cyan', 'violet', 'amber', 'rose'].includes(color)
        ? color
        : null;

    db.prepare(`
      UPDATE custom_notes SET
        title = ?,
        content = ?,
        category = COALESCE(?, category),
        color = COALESCE(?, color),
        include_in_review = COALESCE(?, include_in_review),
        review_status = COALESCE(?, review_status),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nextTitle || nextContent.trim().slice(0, 36),
      nextContent,
      category !== undefined ? String(category).trim() || '随手笔记' : null,
      nextColor,
      rawInclude !== undefined ? (rawInclude ? 1 : 0) : null,
      review_status !== undefined ? review_status : null,
      id
    );

    const updated = db.prepare('SELECT * FROM custom_notes WHERE id = ?').get(id);
    res.json({ customNote: updated });
  });

  app.delete('/api/custom-notes/:id', (req, res) => {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM custom_notes WHERE id = ?').run(id);
    res.json({ deleted: info.changes > 0 });
  });

  app.get('/api/notes', (req, res) => {
    const { type = 'all', status = 'all', color = 'all', stage = 'all', articleId, q } = req.query;
    const items = [];

    if (type === 'all' || type === 'word') {
      const words = db
        .prepare(`
          SELECT cw.*, a.title AS article_title, a.stage AS article_stage
          FROM clicked_words cw
          JOIN articles a ON a.id = cw.article_id
          ORDER BY cw.updated_at DESC, cw.id DESC
        `)
        .all();
      for (const w of words) {
        items.push({
          uid: `word-${w.id}`,
          itemType: 'word',
          id: w.id,
          article_id: w.article_id,
          article_title: w.article_title,
          article_stage: w.article_stage,
          paragraph_index: w.paragraph_index,
          type: 'word',
          title: w.word,
          phonetic: w.phonetic,
          short_meaning: w.short_meaning,
          meaning: w.full_meaning || w.short_meaning,
          context: w.context_sentence,
          note: w.note,
          color: 'cyan',
          review_status: w.review_status,
          repetitions: w.repetitions,
          interval_days: w.interval_days,
          next_review_at: w.next_review_at,
          created_at: w.created_at,
          updated_at: w.updated_at,
        });
      }
    }

    if (['all', 'word', 'phrase', 'sentence'].includes(type)) {
      const annos = db
        .prepare(`
          SELECT an.*, a.title AS article_title, a.stage AS article_stage
          FROM annotations an
          JOIN articles a ON a.id = an.article_id
          ORDER BY an.updated_at DESC, an.id DESC
        `)
        .all();
      for (const an of annos) {
        if (type !== 'all' && an.type !== type) continue;
        items.push({
          uid: `anno-${an.id}`,
          itemType: 'annotation',
          id: an.id,
          article_id: an.article_id,
          article_title: an.article_title,
          article_stage: an.article_stage,
          paragraph_index: an.paragraph_index,
          type: an.type,
          title: an.selected_text,
          phonetic: '',
          short_meaning: an.translation,
          meaning: an.translation,
          context: an.selected_text,
          note: an.note,
          color: an.color,
          review_status: an.review_status,
          repetitions: an.repetitions,
          interval_days: an.interval_days,
          next_review_at: an.next_review_at,
          created_at: an.created_at,
          updated_at: an.updated_at,
        });
      }
    }

    if (type === 'all' || type === 'custom') {
      const customRows = db
        .prepare(`
          SELECT cn.*, a.title AS article_title, a.stage AS article_stage
          FROM custom_notes cn
          LEFT JOIN articles a ON a.id = cn.article_id
          ORDER BY cn.updated_at DESC, cn.id DESC
        `)
        .all();
      for (const cn of customRows) {
        items.push({
          uid: `custom-${cn.id}`,
          itemType: 'custom',
          id: cn.id,
          article_id: cn.article_id,
          article_title: cn.article_title || '独立笔记',
          article_stage: cn.article_stage || 0,
          paragraph_index: 0,
          type: 'custom',
          title: cn.title,
          phonetic: '',
          short_meaning: cn.category,
          meaning: cn.content,
          context: '',
          note: cn.content,
          color: cn.color,
          include_in_review: Boolean(cn.include_in_review),
          review_status: cn.review_status,
          repetitions: cn.repetitions,
          interval_days: cn.interval_days,
          next_review_at: cn.next_review_at,
          created_at: cn.created_at,
          updated_at: cn.updated_at,
        });
      }
    }

    const filtered = items
      .filter((item) => {
        if (status !== 'all' && item.review_status !== status) return false;
        if (color !== 'all' && item.color !== color) return false;
        if (stage !== 'all' && item.article_stage !== Number(stage)) return false;
        if (articleId && item.article_id !== Number(articleId)) return false;
        if (q && String(q).trim()) {
          const needle = String(q).trim().toLowerCase();
          const hay = `${item.title} ${item.meaning} ${item.note} ${item.context} ${item.article_title}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

    res.json({ notes: filtered });
  });

  app.get('/api/review/queue', (req, res) => {
    const includeAll = req.query.includeAll === '1';
    const filterType = req.query.type || 'all';
    const cards = [];

    if (filterType === 'all' || filterType === 'word') {
      const words = db
        .prepare(`
          SELECT cw.*, a.title AS article_title, a.stage AS article_stage,
            ${REVIEW_TIME_SQL} AS review_time, ${DUE_REVIEW_SQL} AS is_due
          FROM clicked_words cw
          JOIN articles a ON a.id = cw.article_id
          WHERE cw.review_status = 'learning'
        `)
        .all();

      for (const w of words) {
        const isDue = Boolean(w.is_due);
        if (!includeAll && !isDue) continue;
        cards.push({
          uid: `word-${w.id}`,
          itemType: 'word',
          id: w.id,
          cardType: 'word',
          front: w.word,
          phonetic: w.phonetic,
          short_meaning: w.short_meaning,
          back: w.full_meaning || w.short_meaning,
          context: w.context_sentence,
          note: w.note,
          article_id: w.article_id,
          article_title: w.article_title,
          article_stage: w.article_stage,
          paragraph_index: w.paragraph_index,
          ease_factor: w.ease_factor,
          interval_days: w.interval_days,
          repetitions: w.repetitions,
          next_review_at: w.next_review_at,
          reviewTime: w.review_time,
          isDue,
        });
      }
    }

    if (filterType === 'all' || filterType === 'annotation') {
      const annos = db
        .prepare(`
          SELECT an.*, a.title AS article_title, a.stage AS article_stage,
            ${REVIEW_TIME_SQL} AS review_time, ${DUE_REVIEW_SQL} AS is_due
          FROM annotations an
          JOIN articles a ON a.id = an.article_id
          WHERE an.review_status = 'learning'
        `)
        .all();

      for (const an of annos) {
        const isDue = Boolean(an.is_due);
        if (!includeAll && !isDue) continue;
        cards.push({
          uid: `anno-${an.id}`,
          itemType: 'annotation',
          id: an.id,
          cardType: an.type,
          front: an.selected_text,
          phonetic: '',
          short_meaning: an.translation,
          back: an.translation,
          context: an.selected_text,
          note: an.note,
          color: an.color,
          article_id: an.article_id,
          article_title: an.article_title,
          article_stage: an.article_stage,
          paragraph_index: an.paragraph_index,
          ease_factor: an.ease_factor,
          interval_days: an.interval_days,
          repetitions: an.repetitions,
          next_review_at: an.next_review_at,
          reviewTime: an.review_time,
          isDue,
        });
      }
    }

    if (filterType === 'all' || filterType === 'custom') {
      const customRows = db
        .prepare(`
          SELECT cn.*, a.title AS article_title, a.stage AS article_stage,
            ${REVIEW_TIME_SQL} AS review_time, ${DUE_REVIEW_SQL} AS is_due
          FROM custom_notes cn
          LEFT JOIN articles a ON a.id = cn.article_id
          WHERE cn.include_in_review = 1 AND cn.review_status = 'learning'
        `)
        .all();

      for (const cn of customRows) {
        const isDue = Boolean(cn.is_due);
        if (!includeAll && !isDue) continue;
        cards.push({
          uid: `custom-${cn.id}`,
          itemType: 'custom',
          id: cn.id,
          cardType: 'custom',
          front: cn.title,
          phonetic: '',
          short_meaning: cn.category,
          back: cn.content,
          context: '',
          note: '',
          color: cn.color,
          article_id: cn.article_id,
          article_title: cn.article_title || '独立笔记',
          article_stage: cn.article_stage || 0,
          paragraph_index: 0,
          ease_factor: cn.ease_factor,
          interval_days: cn.interval_days,
          repetitions: cn.repetitions,
          next_review_at: cn.next_review_at,
          reviewTime: cn.review_time,
          isDue,
        });
      }
    }

    cards.sort((a, b) => a.reviewTime - b.reviewTime);
    res.json({ queue: cards.map(({ reviewTime, ...card }) => card) });
  });

  app.post('/api/review/submit', (req, res) => {
    const { itemType, itemId, quality = 4, markMastered = false } = req.body || {};
    const id = Number(itemId);
    if (!['word', 'annotation', 'custom'].includes(itemType) || !id) {
      return res.status(400).json({ error: 'Invalid itemType or itemId' });
    }

    const table =
      itemType === 'word'
        ? 'clicked_words'
        : itemType === 'annotation'
        ? 'annotations'
        : 'custom_notes';
    const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!item) return res.status(404).json({ error: 'Review item not found' });

    const sm2 = calculateSm2(item, quality);
    const nextStatus = markMastered ? 'mastered' : item.review_status;

    db.prepare(`
      UPDATE ${table} SET
        ease_factor = ?,
        interval_days = ?,
        repetitions = ?,
        next_review_at = ?,
        last_reviewed_at = ?,
        review_status = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      sm2.ease_factor,
      sm2.interval_days,
      sm2.repetitions,
      sm2.next_review_at,
      sm2.last_reviewed_at,
      nextStatus,
      id
    );

    recordStudyActivity(db, { reviewsDone: 1 });
    const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    res.json({ item: updated, sm2 });
  });

  // Portable JSON backup export & restore
  app.get('/api/backup/export', (_req, res) => {
    const snapshot = {
      version: 1,
      exported_at: new Date().toISOString(),
      settings: getSettings(db),
      custom_notes: db.prepare('SELECT * FROM custom_notes').all(),
      study_logs: db.prepare('SELECT * FROM study_logs').all(),
      article_progress: db
        .prepare(
          "SELECT slug, read_status, quiz_score, quiz_answers_json, reading_seconds FROM articles WHERE read_status != 'unread' OR quiz_score IS NOT NULL OR reading_seconds > 0"
        )
        .all(),
      clicked_words: db
        .prepare(
          'SELECT cw.*, a.slug AS article_slug FROM clicked_words cw JOIN articles a ON a.id = cw.article_id'
        )
        .all(),
      annotations: db
        .prepare(
          'SELECT an.*, a.slug AS article_slug FROM annotations an JOIN articles a ON a.id = an.article_id'
        )
        .all(),
    };
    res.json(snapshot);
  });

  app.post('/api/backup/import', (req, res) => {
    const data = req.body || {};
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Invalid backup payload' });
    }
    let restored = 0;
    db.exec('BEGIN');
    try {
      if (data.settings && typeof data.settings === 'object') {
        saveSettings(db, data.settings);
      }

      const findArticleBySlug = db.prepare('SELECT id FROM articles WHERE slug = ?');

      if (Array.isArray(data.article_progress)) {
        const upArt = db.prepare(
          'UPDATE articles SET read_status = ?, quiz_score = ?, quiz_answers_json = ?, reading_seconds = MAX(reading_seconds, ?) WHERE slug = ?'
        );
        for (const ap of data.article_progress) {
          if (!ap?.slug) continue;
          upArt.run(
            ap.read_status || 'unread',
            ap.quiz_score ?? null,
            ap.quiz_answers_json || '{}',
            ap.reading_seconds || 0,
            ap.slug
          );
          restored += 1;
        }
      }

      if (Array.isArray(data.study_logs)) {
        const upLog = db.prepare(`
          INSERT INTO study_logs (date, articles_read, words_clicked, reviews_done, reading_seconds)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(date) DO UPDATE SET
            articles_read = MAX(articles_read, excluded.articles_read),
            words_clicked = MAX(words_clicked, excluded.words_clicked),
            reviews_done = MAX(reviews_done, excluded.reviews_done),
            reading_seconds = MAX(reading_seconds, excluded.reading_seconds)
        `);
        for (const l of data.study_logs) {
          if (!l?.date) continue;
          upLog.run(l.date, l.articles_read || 0, l.words_clicked || 0, l.reviews_done || 0, l.reading_seconds || 0);
        }
      }

      if (Array.isArray(data.clicked_words)) {
        const upWord = db.prepare(`
          INSERT OR IGNORE INTO clicked_words (
            article_id, paragraph_index, token_index, word, lemma, phonetic,
            short_meaning, full_meaning, context_sentence, note, is_visible_inline,
            review_status, click_count, ease_factor, interval_days, repetitions,
            next_review_at, last_reviewed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const w of data.clicked_words) {
          const art = w?.article_slug ? findArticleBySlug.get(w.article_slug) : null;
          if (!art) continue;
          upWord.run(
            art.id,
            w.paragraph_index ?? 0,
            w.token_index ?? 0,
            w.word,
            w.lemma || w.word,
            w.phonetic || '',
            w.short_meaning || '',
            w.full_meaning || '',
            w.context_sentence || '',
            w.note || '',
            w.is_visible_inline ?? 1,
            w.review_status || 'learning',
            w.click_count ?? 1,
            w.ease_factor ?? 2.5,
            w.interval_days ?? 0,
            w.repetitions ?? 0,
            w.next_review_at || new Date().toISOString(),
            w.last_reviewed_at || null
          );
          restored += 1;
        }
      }

      if (Array.isArray(data.custom_notes)) {
        const findCustom = db.prepare(
          'SELECT id FROM custom_notes WHERE title = ? AND content = ?'
        );
        const insCustom = db.prepare(`
          INSERT INTO custom_notes (
            article_id, title, content, category, color, include_in_review,
            review_status, ease_factor, interval_days, repetitions, next_review_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const cn of data.custom_notes) {
          if (!cn?.title && !cn?.content) continue;
          if (findCustom.get(cn.title || '', cn.content || '')) continue;
          insCustom.run(
            cn.article_id ?? null,
            cn.title || '学习笔记',
            cn.content || '',
            cn.category || '随手笔记',
            cn.color || 'amber',
            cn.include_in_review ?? 0,
            cn.review_status || 'learning',
            cn.ease_factor ?? 2.5,
            cn.interval_days ?? 0,
            cn.repetitions ?? 0,
            cn.next_review_at || new Date().toISOString()
          );
          restored += 1;
        }
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: err.message });
    }
    res.json({ ok: true, restored });
  });

  app.get('/api/mcp/config', (_req, res) => {
    const mcpScriptPath = path.join(PROJECT_ROOT, 'mcp', 'index.js');
    const activeDbPath = getActiveDbPath();
    const isElectronExe =
      Boolean(process.versions.electron) &&
      path.basename(process.execPath).toLowerCase() !== 'electron.exe';

    const pendingCount =
      db
        .prepare("SELECT COUNT(*) AS cnt FROM articles WHERE enrichment_status = 'pending'")
        .get()?.cnt ?? 0;

    const serverEntry = isElectronExe
      ? {
          command: process.execPath,
          args: [mcpScriptPath],
          env: {
            ELECTRON_RUN_AS_NODE: '1',
            LUMINAREAD_DB_PATH: activeDbPath,
          },
        }
      : {
          command: process.execPath,
          args: [mcpScriptPath],
          env: {
            LUMINAREAD_DB_PATH: activeDbPath,
          },
        };

    const configObject = {
      mcpServers: {
        luminaread: serverEntry,
      },
    };

    res.json({
      nodePath: process.execPath,
      mcpScriptPath,
      defaultArticlesDir: DEFAULT_ARTICLES_DIR,
      pendingEnrichmentCount: pendingCount,
      configJson: JSON.stringify(configObject, null, 2),
      tools: [
        { name: 'list_articles', desc: '按阶段/阅读状态/待拆解状态检索文章列表' },
        { name: 'get_article', desc: '读取文章正文、词汇、长难句、译文、自测及我的标注' },
        { name: 'import_structured_article', desc: '按考研6板块标准框架直接导入新文章' },
        { name: 'import_markdown_article', desc: '直接解析完整6板块 Markdown 并入库' },
        { name: 'list_pending_enrichment', desc: '获取所有刚导入但尚未拆解的纯英文原文' },
        { name: 'enrich_article', desc: '为纯英文原文补全核心词汇、长难句、译文和阅读自测' },
        { name: 'upsert_word_glossary', desc: '为文章批量写入语境精确释义（点词即见最贴合上下文的译文）' },
        { name: 'list_learning_notes', desc: '读取我点击过的生词与高亮的短语/长难句笔记' },
        { name: 'get_review_queue', desc: '拉取今日到期复习卡片' },
        { name: 'record_review', desc: 'AI 抽查问答后更新 SM-2 记忆曲线间隔' },
        { name: 'add_annotation', desc: '由 AI 老师自动定位段落偏移量并添加重点句标注' },
        { name: 'create_custom_note', desc: '创建一条自由学习笔记（可关联文章或设为独立笔记）' },
        { name: 'get_study_stats', desc: '获取我的学习进度、连续天数和薄弱词汇总' },
      ],
    });
  });

  const updateDirCandidates = [
    path.join(PROJECT_ROOT, 'release', 'updates'),
    path.join(path.dirname(process.execPath), 'updates'),
    path.resolve(path.dirname(process.execPath), '..', 'updates'),
  ];
  app.use('/updates', (req, res, next) => {
    const activeUpdatesDir = updateDirCandidates.find((dir) => fs.existsSync(dir));
    if (!activeUpdatesDir) return next();
    return express.static(activeUpdatesDir)(req, res, next);
  });

  const webDistDir = path.join(PROJECT_ROOT, 'web', 'dist');
  if (fs.existsSync(webDistDir)) {
    app.use(express.static(webDistDir));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/updates')) return next();
      res.sendFile(path.join(webDistDir, 'index.html'));
    });
  }

  return app;
}

export async function startServer({
  port = Number(process.env.PORT || 3456),
  host = '127.0.0.1',
  dbPath,
  allowPortFallback = false,
  openBrowser = false,
} = {}) {
  const db = getDb(dbPath);
  initializeDatabase(db);
  let activePort = port;
  const app = createApp({ db, getServerPort: () => activePort });

  const listenOn = (targetPort) =>
    new Promise((resolve, reject) => {
      const server = app.listen(targetPort, host);
      server.once('listening', () => resolve(server));
      server.once('error', (err) => reject(err));
    });

  let server;
  try {
    server = await listenOn(port);
  } catch (err) {
    if (allowPortFallback && err.code === 'EADDRINUSE' && port !== 0) {
      server = await listenOn(0);
    } else {
      throw err;
    }
  }

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  activePort = actualPort;
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`;
  console.log('LuminaRead server running at ' + url);

  if (openBrowser && process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, (openError) => {
      if (openError) console.error('Open the browser at ' + url);
    });
  }

  return { server, app, db, port: actualPort, url, dbPath: getActiveDbPath() };
}
