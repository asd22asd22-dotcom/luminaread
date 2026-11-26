import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DUE_REVIEW_SQL, REVIEW_TIME_SQL, getDb, recordStudyActivity, safeJsonParse } from '../server/db.js';
import { parseStructuredMarkdown } from '../server/parser.js';
import { upsertArticleRecord, seedVocabIntoCache } from '../server/importer.js';
import { calculateSm2 } from '../server/sm2.js';
import { translateText } from '../server/dictionary.js';

const db = getDb();

const server = new McpServer({
  name: 'luminaread',
  version: '1.0.0',
});

function jsonResult(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

// 1. list_articles
server.tool(
  'list_articles',
  '列出 LuminaRead 书库中的英文精读文章，支持按阶段、阅读状态、待AI拆解状态或关键词过滤。',
  {
    stage: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe('难度阶段：1=打底适应期，2=过渡衔接期，3=考研对标期，4=自定义导入'),
    read_status: z
      .enum(['unread', 'reading', 'completed'])
      .optional()
      .describe('阅读状态'),
    enrichment_status: z
      .enum(['complete', 'pending'])
      .optional()
      .describe('拆解状态：pending 表示仅导入了纯英文原文，等待 AI 补全 6 板块精读框架'),
    search: z.string().optional().describe('按标题或正文关键词检索'),
    limit: z.number().int().min(1).max(200).optional().describe('返回数量上限，默认 50'),
  },
  async ({ stage, read_status, enrichment_status, search, limit = 50 }) => {
    const conditions = [];
    const params = [];
    if (stage !== undefined) {
      conditions.push('a.stage = ?');
      params.push(stage);
    }
    if (read_status) {
      conditions.push('a.read_status = ?');
      params.push(read_status);
    }
    if (enrichment_status) {
      conditions.push('a.enrichment_status = ?');
      params.push(enrichment_status);
    }
    if (search && search.trim()) {
      conditions.push('(a.title LIKE ? OR a.body LIKE ?)');
      const like = `%${search.trim()}%`;
      params.push(like, like);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(`
        SELECT a.id, a.slug, a.stage, a.stage_label, a.order_num, a.title, a.difficulty,
               a.word_count, a.estimated_minutes, a.enrichment_status, a.read_status, a.quiz_score,
               (SELECT COUNT(*) FROM clicked_words cw WHERE cw.article_id = a.id) AS clicked_words_count,
               (SELECT COUNT(*) FROM annotations an WHERE an.article_id = a.id) AS annotations_count
        FROM articles a
        ${where}
        ORDER BY a.stage ASC, a.order_num ASC, a.id ASC
        LIMIT ?
      `)
      .all(...params, limit);

    return jsonResult({ count: rows.length, articles: rows });
  }
);

// 2. get_article
server.tool(
  'get_article',
  '获取指定文章的完整 6 板块精读内容，以及用户在该文章中点击的生词和划词标注。',
  {
    article_id: z.number().int().describe('文章 ID'),
  },
  async ({ article_id }) => {
    const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(article_id);
    if (!row) return errorResult(`Article ${article_id} not found.`);

    const clickedWords = db
      .prepare('SELECT * FROM clicked_words WHERE article_id = ? ORDER BY paragraph_index, token_index')
      .all(article_id);
    const annotations = db
      .prepare('SELECT * FROM annotations WHERE article_id = ? ORDER BY paragraph_index, start_offset')
      .all(article_id);
    const customNotes = db
      .prepare('SELECT * FROM custom_notes WHERE article_id = ? ORDER BY updated_at DESC, id DESC')
      .all(article_id);

    return jsonResult({
      article: {
        id: row.id,
        slug: row.slug,
        stage: row.stage,
        stage_label: row.stage_label,
        title: row.title,
        difficulty: row.difficulty,
        word_count: row.word_count,
        estimated_minutes: row.estimated_minutes,
        enrichment_status: row.enrichment_status,
        read_status: row.read_status,
        body: row.body,
        vocabulary: safeJsonParse(row.vocabulary_json, []),
        sentences: safeJsonParse(row.sentences_json, []),
        translation: row.translation,
        quizzes: safeJsonParse(row.quizzes_json, []),
        word_glossary: safeJsonParse(row.word_glossary_json, {}),
      },
      clickedWords,
      annotations,
      customNotes,
    });
  }
);

const VocabSchema = z.object({
  word: z.string(),
  phonetic: z.string().optional().default(''),
  pos: z.string().optional().default(''),
  meaning: z.string(),
});

const SentenceSchema = z.object({
  label: z.string().optional(),
  quote: z.string(),
  main_clause: z.string().describe('句子主干及中文翻译'),
  grammar: z.string().describe('考研/语法拆解，如定语从句、非谓语、倒装等'),
});

const QuizSchema = z.object({
  question: z.string(),
  options: z.array(
    z.object({
      key: z.enum(['A', 'B', 'C', 'D']),
      text: z.string(),
    })
  ),
  answer: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string(),
});

const GlossaryEntrySchema = z.object({
  short: z.string().describe('简洁中文释义（2~8个字，用于点词时直接显示在单词正下方）'),
  full: z.string().optional().describe('完整语境释义'),
  phonetic: z.string().optional(),
  pos: z.string().optional(),
});

// 3. import_structured_article
server.tool(
  'import_structured_article',
  '按照 LuminaRead 考研 6 板块学习框架（正文、核心词汇、长难句拆解、参考译文、阅读自测、逐词语境词汇表）导入一篇新英文文章。',
  {
    title: z.string().describe('文章标题（可中英双语）'),
    stage: z
      .number()
      .int()
      .min(1)
      .max(4)
      .default(2)
      .describe('难度阶段：1=打底适应期，2=过渡衔接期，3=考研对标期，4=自定义'),
    difficulty: z.string().optional().describe('难度标签，例如“第三阶段 ⭐⭐⭐⭐⭐（考研英语一/二真题对标）”'),
    estimated_minutes: z.number().int().min(5).max(120).optional().default(30),
    body: z.string().describe('纯英文正文，段落之间用空行(\\n\\n)分隔'),
    vocabulary: z.array(VocabSchema).describe('6~12 个核心词汇或短语'),
    sentences: z.array(SentenceSchema).describe('2~3 个长难句/句型拆解'),
    translation: z.string().describe('分段对齐的流畅中文参考译文'),
    quizzes: z.array(QuizSchema).describe('2~4 道阅读理解自测选择题（含解析）'),
    word_glossary: z
      .record(GlossaryEntrySchema)
      .optional()
      .describe('可选：额外重点单词的语境词典映射（小写原形 -> {short, full, phonetic, pos}），让用户点词时优先显示最贴合本文的释义'),
  },
  async ({
    title,
    stage,
    difficulty,
    estimated_minutes,
    body,
    vocabulary,
    sentences,
    translation,
    quizzes,
    word_glossary,
  }) => {
    const cleanBody = body.replace(/\r\n/g, '\n').trim();
    const wc = (cleanBody.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
    const stageLabel =
      stage === 1
        ? '第一阶段 · 打底适应期'
        : stage === 2
        ? '第二阶段 · 过渡衔接期'
        : stage === 3
        ? '第三阶段 · 考研对标期'
        : '自定义导入';

    const saved = upsertArticleRecord(db, {
      slug: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      stage,
      stage_label: stageLabel,
      order_num: 0,
      title,
      difficulty: difficulty || stageLabel,
      word_count: wc,
      estimated_minutes,
      body: cleanBody,
      vocabulary,
      sentences: sentences.map((s, idx) => ({
        label: s.label || `难句 ${idx + 1}`,
        quote: s.quote,
        main_clause: s.main_clause,
        grammar: s.grammar,
        notes: [],
      })),
      translation,
      quizzes,
      word_glossary: word_glossary || {},
      enrichment_status: 'complete',
      source_path: 'mcp',
    });

    return jsonResult({
      message: '文章已按 6 板块标准学习框架成功导入 LuminaRead！',
      article_id: saved.id,
      title: saved.title,
      stage: saved.stage,
      word_count: saved.word_count,
    });
  }
);

// 4. import_markdown_article
server.tool(
  'import_markdown_article',
  '直接导入符合 6 板块格式的 Markdown 文本（含 ## 英文正文、## 核心词汇、## 长难句拆解/句型点拨、## 参考译文、## 阅读自测）。',
  {
    markdown: z.string().describe('完整的 6 板块 Markdown 内容'),
    stage: z.number().int().min(1).max(4).optional().describe('可选覆盖阶段（1/2/3/4）'),
  },
  async ({ markdown, stage }) => {
    const parsed = parseStructuredMarkdown(markdown, { stage });
    if (!parsed.body) {
      return errorResult('未能识别 ## 英文正文 内容，请检查 Markdown 标题格式。');
    }
    const saved = upsertArticleRecord(db, parsed);
    return jsonResult({
      message: 'Markdown 文章已成功解析入库。',
      article_id: saved.id,
      title: saved.title,
      stage: saved.stage,
      vocab_count: parsed.vocabulary.length,
      sentences_count: parsed.sentences.length,
      quizzes_count: parsed.quizzes.length,
    });
  }
);

// 5. list_pending_enrichment
server.tool(
  'list_pending_enrichment',
  '查询所有仅粘贴了纯英文原文、等待 AI 助手拆解补全 6 板块内容（词汇、长难句、译文、阅读题）的文章。',
  {},
  async () => {
    const rows = db
      .prepare(`
        SELECT id, title, stage, stage_label, difficulty, word_count, body, created_at
        FROM articles
        WHERE enrichment_status = 'pending'
        ORDER BY created_at DESC
      `)
      .all();
    return jsonResult({ count: rows.length, pending_articles: rows });
  }
);

// 6. enrich_article
server.tool(
  'enrich_article',
  '为指定的纯英文文章（或已有文章）补全/更新核心词汇、长难句拆解、参考译文、阅读自测题及语境词汇表，并将状态置为 complete。',
  {
    article_id: z.number().int(),
    stage: z.number().int().min(1).max(4).optional(),
    difficulty: z.string().optional(),
    vocabulary: z.array(VocabSchema),
    sentences: z.array(SentenceSchema),
    translation: z.string(),
    quizzes: z.array(QuizSchema),
    word_glossary: z.record(GlossaryEntrySchema).optional(),
  },
  async ({
    article_id,
    stage,
    difficulty,
    vocabulary,
    sentences,
    translation,
    quizzes,
    word_glossary,
  }) => {
    const existing = db.prepare('SELECT * FROM articles WHERE id = ?').get(article_id);
    if (!existing) return errorResult(`Article ${article_id} not found.`);

    const nextStage = stage ?? existing.stage;
    const nextStageLabel =
      nextStage === 1
        ? '第一阶段 · 打底适应期'
        : nextStage === 2
        ? '第二阶段 · 过渡衔接期'
        : nextStage === 3
        ? '第三阶段 · 考研对标期'
        : '自定义导入';

    const existingGlossary = safeJsonParse(existing.word_glossary_json, {});
    const mergedGlossary = { ...existingGlossary, ...(word_glossary || {}) };

    db.prepare(`
      UPDATE articles SET
        stage = ?,
        stage_label = ?,
        difficulty = COALESCE(?, difficulty),
        vocabulary_json = ?,
        sentences_json = ?,
        translation = ?,
        quizzes_json = ?,
        word_glossary_json = ?,
        enrichment_status = 'complete',
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nextStage,
      nextStageLabel,
      difficulty ?? null,
      JSON.stringify(vocabulary),
      JSON.stringify(
        sentences.map((s, idx) => ({
          label: s.label || `难句 ${idx + 1}`,
          quote: s.quote,
          main_clause: s.main_clause,
          grammar: s.grammar,
          notes: [],
        }))
      ),
      translation,
      JSON.stringify(quizzes),
      JSON.stringify(mergedGlossary),
      article_id
    );

    seedVocabIntoCache(db, vocabulary);

    return jsonResult({
      message: `文章 #${article_id}（${existing.title}）已完成 6 板块精读拆解！`,
      article_id,
      vocab_count: vocabulary.length,
      sentences_count: sentences.length,
      quizzes_count: quizzes.length,
    });
  }
);

// 7. upsert_word_glossary
server.tool(
  'upsert_word_glossary',
  '为文章补充逐词语境释义词典（word_glossary），用户点击文章中的对应单词时将优先展示这里最贴合语境的中文意思。',
  {
    article_id: z.number().int(),
    entries: z.record(GlossaryEntrySchema),
  },
  async ({ article_id, entries }) => {
    const existing = db.prepare('SELECT id, word_glossary_json FROM articles WHERE id = ?').get(article_id);
    if (!existing) return errorResult(`Article ${article_id} not found.`);

    const current = safeJsonParse(existing.word_glossary_json, {});
    const normalized = {};
    for (const [k, v] of Object.entries(entries)) {
      normalized[k.trim().toLowerCase()] = v;
    }
    const merged = { ...current, ...normalized };

    db.prepare(
      "UPDATE articles SET word_glossary_json = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(merged), article_id);

    return jsonResult({
      message: `已更新文章 #${article_id} 的 ${Object.keys(normalized).length} 条语境词条。`,
      total_entries: Object.keys(merged).length,
    });
  }
);

// 8. list_learning_notes
server.tool(
  'list_learning_notes',
  '查询用户的阅读生词与标注笔记（包含在文章中点击查义的单词、划词标注的短语和长难句）。',
  {
    type: z.enum(['all', 'word', 'phrase', 'sentence', 'custom']).optional().default('all'),
    status: z.enum(['all', 'learning', 'mastered']).optional().default('all'),
    article_id: z.number().int().optional(),
    limit: z.number().int().min(1).max(200).optional().default(50),
  },
  async ({ type, status, article_id, limit }) => {
    const notes = [];

    if (type === 'all' || type === 'word') {
      const words = db
        .prepare(`
          SELECT cw.*, a.title AS article_title, a.stage AS article_stage
          FROM clicked_words cw
          JOIN articles a ON a.id = cw.article_id
          ORDER BY cw.updated_at DESC
        `)
        .all();
      for (const w of words) {
        if (status !== 'all' && w.review_status !== status) continue;
        if (article_id && w.article_id !== article_id) continue;
        notes.push({
          item_type: 'word',
          item_id: w.id,
          article_id: w.article_id,
          article_title: w.article_title,
          stage: w.article_stage,
          word: w.word,
          phonetic: w.phonetic,
          short_meaning: w.short_meaning,
          full_meaning: w.full_meaning,
          context_sentence: w.context_sentence,
          note: w.note,
          review_status: w.review_status,
          repetitions: w.repetitions,
          next_review_at: w.next_review_at,
        });
      }
    }

    if (['all', 'word', 'phrase', 'sentence'].includes(type)) {
      const annos = db
        .prepare(`
          SELECT an.*, a.title AS article_title, a.stage AS article_stage
          FROM annotations an
          JOIN articles a ON a.id = an.article_id
          ORDER BY an.updated_at DESC
        `)
        .all();
      for (const an of annos) {
        if (type !== 'all' && an.type !== type) continue;
        if (status !== 'all' && an.review_status !== status) continue;
        if (article_id && an.article_id !== article_id) continue;
        notes.push({
          item_type: 'annotation',
          annotation_type: an.type,
          item_id: an.id,
          article_id: an.article_id,
          article_title: an.article_title,
          stage: an.article_stage,
          selected_text: an.selected_text,
          translation: an.translation,
          note: an.note,
          color: an.color,
          review_status: an.review_status,
          repetitions: an.repetitions,
          next_review_at: an.next_review_at,
        });
      }
    }

    if (type === 'all' || type === 'custom') {
      const customRows = db
        .prepare(`
          SELECT cn.*, a.title AS article_title, a.stage AS article_stage
          FROM custom_notes cn
          LEFT JOIN articles a ON a.id = cn.article_id
          ORDER BY cn.updated_at DESC
        `)
        .all();
      for (const cn of customRows) {
        if (status !== 'all' && cn.review_status !== status) continue;
        if (article_id && cn.article_id !== article_id) continue;
        notes.push({
          item_type: 'custom',
          item_id: cn.id,
          article_id: cn.article_id,
          article_title: cn.article_title || '独立笔记',
          stage: cn.article_stage || 0,
          title: cn.title,
          category: cn.category,
          content: cn.content,
          color: cn.color,
          include_in_review: Boolean(cn.include_in_review),
          review_status: cn.review_status,
          repetitions: cn.repetitions,
          next_review_at: cn.next_review_at,
        });
      }
    }

    return jsonResult({ count: Math.min(notes.length, limit), notes: notes.slice(0, limit) });
  }
);

// 9. get_review_queue
server.tool(
  'get_review_queue',
  '拉取用户当前到期的间隔重复复习条目（生词 + 标注短语/句子 + 加入复习的自建笔记），可用于 AI 互动抽查背诵或造句练习。',
  {
    limit: z.number().int().min(1).max(100).optional().default(20),
  },
  async ({ limit }) => {
    const words = db
      .prepare(`
        SELECT cw.*, a.title AS article_title, ${REVIEW_TIME_SQL} AS review_time
        FROM clicked_words cw
        JOIN articles a ON a.id = cw.article_id
        WHERE cw.review_status = 'learning' AND ${DUE_REVIEW_SQL}
        ORDER BY review_time ASC
        LIMIT ?
      `)
      .all(limit);

    const annos = db
      .prepare(`
        SELECT an.*, a.title AS article_title, ${REVIEW_TIME_SQL} AS review_time
        FROM annotations an
        JOIN articles a ON a.id = an.article_id
        WHERE an.review_status = 'learning' AND ${DUE_REVIEW_SQL}
        ORDER BY review_time ASC
        LIMIT ?
      `)
      .all(limit);

    const customRows = db
      .prepare(`
        SELECT cn.*, a.title AS article_title, ${REVIEW_TIME_SQL} AS review_time
        FROM custom_notes cn
        LEFT JOIN articles a ON a.id = cn.article_id
        WHERE cn.include_in_review = 1 AND cn.review_status = 'learning' AND ${DUE_REVIEW_SQL}
        ORDER BY review_time ASC
        LIMIT ?
      `)
      .all(limit);

    const queue = [
      ...words.map((w) => ({
        item_type: 'word',
        item_id: w.id,
        text: w.word,
        phonetic: w.phonetic,
        meaning: w.full_meaning || w.short_meaning,
        context: w.context_sentence,
        note: w.note,
        article_title: w.article_title,
        next_review_at: w.next_review_at,
        reviewTime: w.review_time,
      })),
      ...annos.map((a) => ({
        item_type: 'annotation',
        item_id: a.id,
        annotation_type: a.type,
        text: a.selected_text,
        meaning: a.translation,
        note: a.note,
        article_title: a.article_title,
        next_review_at: a.next_review_at,
        reviewTime: a.review_time,
      })),
      ...customRows.map((cn) => ({
        item_type: 'custom',
        item_id: cn.id,
        text: cn.title,
        category: cn.category,
        meaning: cn.content,
        note: cn.content,
        article_title: cn.article_title || '独立笔记',
        next_review_at: cn.next_review_at,
        reviewTime: cn.review_time,
      })),
    ].sort((a, b) => a.reviewTime - b.reviewTime)
      .slice(0, limit)
      .map(({ reviewTime, ...card }) => card);

    return jsonResult({ due_count: queue.length, queue });
  }
);

// 10. record_review
server.tool(
  'record_review',
  '在 AI 抽查用户词汇/句子/笔记记忆情况后，按 SM-2 记忆曲线更新下次复习时间。',
  {
    item_type: z.enum(['word', 'annotation', 'custom']),
    item_id: z.number().int(),
    quality: z
      .number()
      .int()
      .min(1)
      .max(5)
      .describe('1=完全不会重来, 3=模糊记起, 4=正常认识, 5=秒记熟练'),
    mark_mastered: z.boolean().optional().default(false),
  },
  async ({ item_type, item_id, quality, mark_mastered }) => {
    const table =
      item_type === 'word'
        ? 'clicked_words'
        : item_type === 'annotation'
        ? 'annotations'
        : 'custom_notes';
    const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(item_id);
    if (!item) return errorResult(`Review item ${item_type}#${item_id} not found.`);

    const sm2 = calculateSm2(item, quality);
    const status = mark_mastered ? 'mastered' : item.review_status;

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
      status,
      item_id
    );

    recordStudyActivity(db, { reviewsDone: 1 });
    return jsonResult({
      message: '复习进度已更新。',
      item_type,
      item_id,
      review_status: status,
      ...sm2,
    });
  }
);

// 11. add_annotation
server.tool(
  'add_annotation',
  '为文章段落中的指定短语或长难句自动定位偏移量并添加高亮笔记（适合 AI 精讲时帮学生标出重点句和考点笔记）。',
  {
    article_id: z.number().int(),
    type: z.enum(['phrase', 'sentence', 'word']).default('sentence'),
    paragraph_index: z.number().int().min(0).describe('段落索引，从 0 开始'),
    selected_text: z.string().trim().min(1).describe('需要高亮的原文片段'),
    translation: z.string().optional().default(''),
    note: z.string().optional().default(''),
    color: z.enum(['cyan', 'violet', 'amber', 'rose']).optional().default('violet'),
  },
  async ({ article_id, type, paragraph_index, selected_text, translation, note, color }) => {
    const article = db.prepare('SELECT id, body FROM articles WHERE id = ?').get(article_id);
    if (!article) return errorResult(`Article ${article_id} not found.`);

    const paragraphs = article.body.split(/\n{2,}/).filter(Boolean);
    const para = paragraphs[paragraph_index];
    if (para === undefined) {
      return errorResult(`Paragraph index ${paragraph_index} out of range (total ${paragraphs.length}).`);
    }

    const startOffset = para.indexOf(selected_text);
    if (startOffset < 0) return errorResult('所选文字未出现在指定段落中。');
    const endOffset = startOffset + selected_text.length;

    let finalTranslation = translation;
    if (!finalTranslation) {
      const tr = await translateText(db, selected_text);
      finalTranslation = tr.translation || '';
    }

    const info = db
      .prepare(`
        INSERT INTO annotations (
          article_id, type, paragraph_index, start_offset, end_offset,
          selected_text, translation, note, color, review_status, next_review_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'learning', ?)
      `)
      .run(
        article_id,
        type,
        paragraph_index,
        startOffset,
        endOffset,
        selected_text,
        finalTranslation,
        note,
        color,
        new Date().toISOString()
      );

    return jsonResult({
      message: '重点标注已添加到文章与复习笔记库。',
      annotation_id: info.lastInsertRowid,
      matched_in_paragraph: true,
    });
  }
);

// 12. create_custom_note
server.tool(
  'create_custom_note',
  '为用户创建一条结构化的自由学习笔记（语法总结、易混词辨析、写作素材、错题反思等），可关联指定文章或设为独立笔记，并可选加入 SM-2 复习队列。',
  {
    title: z.string().trim().min(1).describe('笔记标题'),
    content: z.string().default('').describe('笔记正文内容（支持多行）'),
    article_id: z.number().int().optional().describe('可选关联文章 ID'),
    category: z.string().optional().default('随手笔记').describe('分类标签，如：语法总结、词汇辨析、错题反思、写作素材'),
    color: z.enum(['cyan', 'violet', 'amber', 'rose']).optional().default('amber'),
    include_in_review: z.boolean().optional().default(false).describe('是否加入 SM-2 间隔复习闪卡'),
  },
  async ({ title, content, article_id, category, color, include_in_review }) => {
    if (article_id !== undefined) {
      const exists = db.prepare('SELECT id FROM articles WHERE id = ?').get(article_id);
      if (!exists) return errorResult(`Article ${article_id} not found.`);
    }

    const info = db
      .prepare(`
        INSERT INTO custom_notes (
          article_id, title, content, category, color,
          include_in_review, review_status, next_review_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'learning', ?)
      `)
      .run(
        article_id ?? null,
        title,
        content,
        category || '随手笔记',
        color,
        include_in_review ? 1 : 0,
        new Date().toISOString()
      );

    return jsonResult({
      message: '自建学习笔记已创建。',
      custom_note_id: info.lastInsertRowid,
      article_id: article_id ?? null,
    });
  }
);

// 13. get_study_stats
server.tool(
  'get_study_stats',
  '获取用户当前的学习统计数据（各阶段完成率、高频点击生词、待复习数量、最近学习记录）。',
  {},
  async () => {
    const stages = db
      .prepare(`
        SELECT stage, MAX(stage_label) AS stage_label, COUNT(*) AS total,
               SUM(CASE WHEN read_status = 'completed' THEN 1 ELSE 0 END) AS completed
        FROM articles
        GROUP BY stage
        ORDER BY stage ASC
      `)
      .all();

    const wordTotals = db
      .prepare(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN review_status = 'learning' THEN 1 ELSE 0 END) AS learning,
               SUM(CASE WHEN review_status = 'mastered' THEN 1 ELSE 0 END) AS mastered
        FROM clicked_words
      `)
      .get();

    const topWeakWords = db
      .prepare(`
        SELECT word, short_meaning, click_count, review_status
        FROM clicked_words
        ORDER BY click_count DESC, updated_at DESC
        LIMIT 15
      `)
      .all();

    return jsonResult({
      stages,
      words: wordTotals,
      top_weak_words: topWeakWords,
    });
  }
);

// Resources
server.resource(
  'framework-guide',
  'luminaread://guide/framework',
  {
    description: 'LuminaRead 考研分级精读 6 板块导入规范与阶段标准',
    mimeType: 'text/markdown',
  },
  async () => ({
    contents: [
      {
        uri: 'luminaread://guide/framework',
        mimeType: 'text/markdown',
        text: `# LuminaRead 6板块精读导入规范

导入新文章时，推荐使用工具 \`import_structured_article\`（或针对 \`pending\` 原文调用 \`enrich_article\`）：

1. **阶段划分 (stage)**
   - \`1\`：打底适应期（CEFR A2–B1，180–260 词，日常与科普主题，简单句与基础从句）
   - \`2\`：过渡衔接期（CEFR B1+–B2 / 四级水平，280–360 词，外刊叙事，定语/状语从句与被动语态）
   - \`3\`：考研对标期（CEFR B2+–C1 / 考研英一英二难度，380–450 词，《经济学人》/《科学美国人》思辨风格）
2. **核心词汇 (vocabulary)**：6~12 个高频词/熟词僻义，包含 \`word\`, \`phonetic\`, \`pos\`, \`meaning\`。
3. **长难句拆解 (sentences)**：2~3 句原文重点句，包含 \`quote\`, \`main_clause\`（主干）, \`grammar\`（语法结构解析）。
4. **参考译文 (translation)**：分段对齐的流畅中文翻译。
5. **阅读自测 (quizzes)**：2~4 道仿考研设问四选一选择题，含 \`answer\` 和 \`explanation\`。
6. **语境词典 (word_glossary)**（可选）：为文中易混词提供最贴合语境的 2~8 字简明释义 \`short\`，用户点词即可直接显示在单词正下方。`,
      },
    ],
  })
);

server.resource(
  'stats-overview',
  'luminaread://stats/overview',
  {
    description: '实时学习统计 JSON 概览',
    mimeType: 'application/json',
  },
  async () => {
    const articles = db.prepare('SELECT COUNT(*) AS cnt FROM articles').get();
    const words = db.prepare('SELECT COUNT(*) AS cnt FROM clicked_words').get();
    const annotations = db.prepare('SELECT COUNT(*) AS cnt FROM annotations').get();
    return {
      contents: [
        {
          uri: 'luminaread://stats/overview',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              articles_count: articles?.cnt ?? 0,
              clicked_words_count: words?.cnt ?? 0,
              annotations_count: annotations?.cnt ?? 0,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('LuminaRead MCP Server fatal error:', err);
  process.exit(1);
});
