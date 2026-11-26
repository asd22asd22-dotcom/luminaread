import type {
  AnnotationItem,
  AppSettings,
  ArticleFull,
  ArticleSummary,
  ClickedWord,
  CustomNote,
  DictLookupResult,
  DictSearchItem,
  HighlightColor,
  McpConfigResponse,
  ReviewCard,
  StatsResponse,
  UnifiedNote,
} from './types';

const DB_NAME = 'luminaread_mobile_v1';
const DB_VERSION = 1;

const DEFAULT_SETTINGS: AppSettings = {
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

const IRREGULAR_VERBS: Record<string, string> = {
  was: 'be', were: 'be', been: 'be', am: 'be', is: 'be', are: 'be',
  had: 'have', has: 'have', having: 'have',
  did: 'do', does: 'do', done: 'do', doing: 'do',
  went: 'go', goes: 'go', gone: 'go',
  became: 'become', becomes: 'become',
  began: 'begin', begun: 'begin',
  broke: 'break', broken: 'break',
  brought: 'bring', built: 'build', bought: 'buy', caught: 'catch',
  chose: 'choose', chosen: 'choose', came: 'come',
  dealt: 'deal', drew: 'draw', drawn: 'draw',
  driven: 'drive', drove: 'drive', ate: 'eat', eaten: 'eat',
  fell: 'fall', fallen: 'fall', felt: 'feel', fought: 'fight',
  found: 'find', flew: 'fly', flown: 'fly',
  forgot: 'forget', forgotten: 'forget',
  gave: 'give', given: 'give', grew: 'grow', grown: 'grow',
  held: 'hold', kept: 'keep', knew: 'know', known: 'know',
  led: 'lead', left: 'leave', lost: 'lose', made: 'make', meant: 'mean',
  met: 'meet', paid: 'pay', ran: 'run', rose: 'rise', risen: 'rise',
  said: 'say', saw: 'see', seen: 'see', sold: 'sell', sent: 'send',
  shook: 'shake', shaken: 'shake', showed: 'show', shown: 'show',
  sat: 'sit', slept: 'sleep', spoke: 'speak', spoken: 'speak',
  spent: 'spend', stood: 'stand', taught: 'teach', told: 'tell',
  thought: 'think', took: 'take', taken: 'take',
  understood: 'understand', woke: 'wake', woken: 'wake',
  wore: 'wear', worn: 'wear', won: 'win', wrote: 'write', written: 'write',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
  earlier: 'early', earliest: 'early', easier: 'easy', easiest: 'easy',
  happier: 'happy', happiest: 'happy', children: 'child', men: 'man',
  women: 'woman', people: 'person', lives: 'life', leaves: 'leaf',
};

type CompactDict = Record<string, [string, string, string, string[]]>;

let _dbPromise: Promise<IDBDatabase> | null = null;
let _seedPromise: Promise<void> | null = null;
let _dictPromise: Promise<CompactDict> | null = null;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeToken(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, '')
    .toLowerCase();
}

function getCandidateLemmas(rawWord: string): string[] {
  const clean = normalizeToken(rawWord);
  if (!clean) return [];
  const c: string[] = [clean];
  if (clean.endsWith("'s") || clean.endsWith("’s")) c.push(clean.slice(0, -2));
  if (IRREGULAR_VERBS[clean]) c.push(IRREGULAR_VERBS[clean]);
  if (clean.endsWith('ies') && clean.length > 4) c.push(clean.slice(0, -3) + 'y');
  if (clean.endsWith('ves') && clean.length > 4) {
    c.push(clean.slice(0, -3) + 'f', clean.slice(0, -3) + 'fe');
  }
  if (clean.endsWith('es') && clean.length > 3) c.push(clean.slice(0, -2), clean.slice(0, -1));
  if (clean.endsWith('s') && !clean.endsWith('ss') && clean.length > 3) c.push(clean.slice(0, -1));
  if (clean.endsWith('ied') && clean.length > 4) c.push(clean.slice(0, -3) + 'y');
  if (clean.endsWith('ed') && clean.length > 4) {
    const stem = clean.slice(0, -2);
    c.push(stem, stem + 'e');
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) c.push(stem.slice(0, -1));
  }
  if (clean.endsWith('ing') && clean.length > 5) {
    const stem = clean.slice(0, -3);
    c.push(stem, stem + 'e');
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) c.push(stem.slice(0, -1));
  }
  if (clean.endsWith('ier') && clean.length > 4) c.push(clean.slice(0, -3) + 'y');
  if (clean.endsWith('er') && clean.length > 4) c.push(clean.slice(0, -2), clean.slice(0, -1));
  if (clean.endsWith('ily') && clean.length > 4) c.push(clean.slice(0, -3) + 'y');
  if (clean.endsWith('ly') && clean.length > 4) c.push(clean.slice(0, -2));
  return [...new Set(c.filter(Boolean))];
}

function extractShortMeaning(fullMeaning: string): string {
  if (!fullMeaning) return '';
  const first =
    String(fullMeaning)
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('[')) || String(fullMeaning).trim();
  let stripped = first
    .replace(/^(?:(?:adj|adv|vt|vi|v|n|prep|conj|pron|art|num|a|ad|phr)\.(?:\s*\/\s*(?:adj|adv|vt|vi|v|n)\.)*\s*)+/i, '')
    .replace(/（[^）]*）|\([^)]*\)|\[[^\]]*\]/g, '')
    .trim();
  if (!stripped) stripped = first;
  const parts = stripped.split(/[；;，,]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return stripped.slice(0, 10);
  if (parts[0].length <= 4 && parts[1] && parts[0].length + parts[1].length + 1 <= 10) {
    return `${parts[0]}；${parts[1]}`;
  }
  return parts[0].slice(0, 10);
}

function calculateSm2(item: { ease_factor?: number; interval_days?: number; repetitions?: number }, quality: number) {
  const q = [1, 2, 3, 4, 5].includes(Number(quality)) ? Number(quality) : 4;
  const prevEase = Number(item?.ease_factor ?? 2.5);
  const prevInterval = Number(item?.interval_days ?? 0);
  const prevReps = Number(item?.repetitions ?? 0);
  const ease_factor = Math.max(1.3, Math.round((prevEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))) * 100) / 100);
  const now = new Date();
  let repetitions = prevReps;
  let interval_days = prevInterval;
  let nextDate: Date;
  if (q < 3) {
    repetitions = 0;
    interval_days = 0;
    nextDate = new Date(now.getTime() + 10 * 60 * 1000);
  } else {
    repetitions = prevReps + 1;
    if (repetitions === 1) interval_days = q === 5 ? 3 : 1;
    else if (repetitions === 2) interval_days = q === 3 ? 4 : q === 5 ? 8 : 6;
    else interval_days = Math.max(1, Math.round(prevInterval * ease_factor * (q === 3 ? 0.8 : q === 5 ? 1.3 : 1)));
    nextDate = new Date(now.getTime() + interval_days * 86400 * 1000);
  }
  return {
    ease_factor,
    interval_days,
    repetitions,
    next_review_at: nextDate.toISOString(),
    last_reviewed_at: now.toISOString(),
  };
}

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('articles')) {
        const s = db.createObjectStore('articles', { keyPath: 'id', autoIncrement: true });
        s.createIndex('slug', 'slug', { unique: true });
      }
      if (!db.objectStoreNames.contains('clicked_words')) {
        const s = db.createObjectStore('clicked_words', { keyPath: 'id', autoIncrement: true });
        s.createIndex('article_id', 'article_id');
      }
      if (!db.objectStoreNames.contains('annotations')) {
        const s = db.createObjectStore('annotations', { keyPath: 'id', autoIncrement: true });
        s.createIndex('article_id', 'article_id');
      }
      if (!db.objectStoreNames.contains('custom_notes')) {
        db.createObjectStore('custom_notes', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('study_logs')) {
        db.createObjectStore('study_logs', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return idbReq(tx.objectStore(storeName).getAll());
}

async function getByKey<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return idbReq(tx.objectStore(storeName).get(key));
}

async function putItem<T>(storeName: string, item: T): Promise<IDBValidKey> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  return idbReq(tx.objectStore(storeName).put(item));
}

async function addItem<T>(storeName: string, item: T): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  return Number(await idbReq(tx.objectStore(storeName).add(item)));
}

async function deleteByKey(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  await idbReq(tx.objectStore(storeName).delete(key));
}

async function ensureSeeded(): Promise<void> {
  if (_seedPromise) return _seedPromise;
  _seedPromise = (async () => {
    const existing = await getAll<ArticleFull>('articles');
    if (existing.length > 0) return;
    try {
      const res = await fetch('/seed-articles.json');
      if (!res.ok) return;
      const seedArticles = (await res.json()) as Array<Partial<ArticleFull>>;
      const db = await openDb();
      const tx = db.transaction('articles', 'readwrite');
      const store = tx.objectStore('articles');
      const ts = nowIso();
      for (const a of seedArticles) {
        store.add({
          slug: a.slug,
          stage: a.stage ?? 1,
          stage_label: a.stage_label ?? '第一阶段 · 打底适应期',
          order_num: a.order_num ?? 0,
          title: a.title ?? 'Untitled',
          difficulty: a.difficulty ?? '',
          word_count: a.word_count ?? 0,
          estimated_minutes: a.estimated_minutes ?? 25,
          body: a.body ?? '',
          vocabulary: a.vocabulary ?? [],
          sentences: a.sentences ?? [],
          translation: a.translation ?? '',
          quizzes: a.quizzes ?? [],
          word_glossary: a.word_glossary ?? {},
          enrichment_status: a.enrichment_status ?? 'complete',
          source_path: 'mobile-seed',
          read_status: 'unread',
          quiz_score: null,
          quiz_answers: {},
          reading_seconds: 0,
          created_at: ts,
          updated_at: ts,
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Ignore seed fetch failure
    }
  })();
  return _seedPromise;
}

async function loadCompactDict(): Promise<CompactDict> {
  if (_dictPromise) return _dictPromise;
  _dictPromise = (async () => {
    try {
      const res = await fetch('/compact-dict.json');
      if (!res.ok) return {};
      return (await res.json()) as CompactDict;
    } catch {
      return {};
    }
  })();
  return _dictPromise;
}

async function recordActivity(deltas: {
  articlesRead?: number;
  wordsClicked?: number;
  reviewsDone?: number;
  readingSeconds?: number;
}) {
  const date = todayStr();
  const prev = (await getByKey<{
    date: string;
    articles_read: number;
    words_clicked: number;
    reviews_done: number;
    reading_seconds: number;
  }>('study_logs', date)) || {
    date,
    articles_read: 0,
    words_clicked: 0,
    reviews_done: 0,
    reading_seconds: 0,
  };
  await putItem('study_logs', {
    date,
    articles_read: prev.articles_read + (deltas.articlesRead || 0),
    words_clicked: prev.words_clicked + (deltas.wordsClicked || 0),
    reviews_done: prev.reviews_done + (deltas.reviewsDone || 0),
    reading_seconds: prev.reading_seconds + (deltas.readingSeconds || 0),
  });
}

function parseMarkdownClient(markdown: string, stageOverride?: number) {
  const norm = markdown.replace(/\r\n/g, '\n');
  const lines = norm.split('\n');
  const headerLines: string[] = [];
  const sections: Record<string, string> = {};
  let curr: string | null = null;
  let buf: string[] = [];
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (curr) sections[curr] = buf.join('\n').trim();
      curr = m[1].trim();
      buf = [];
    } else if (!curr) headerLines.push(line);
    else buf.push(line);
  }
  if (curr) sections[curr] = buf.join('\n').trim();

  const header = headerLines.join('\n');
  const titleMatch = header.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/^\d+\s*[|.、．]\s*/, '').trim() : '导入文章';
  const body = (sections['英文正文'] || sections['Body'] || '')
    .replace(/\n\s*---+\s*$/g, '')
    .trim();
  const wordCount = (body.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
  const stage = stageOverride || 4;
  const stageLabel =
    stage === 1
      ? '第一阶段 · 打底适应期'
      : stage === 2
      ? '第二阶段 · 过渡衔接期'
      : stage === 3
      ? '第三阶段 · 考研对标期'
      : '自定义导入';

  return {
    slug: `mobile-md-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stage,
    stage_label: stageLabel,
    order_num: 0,
    title,
    difficulty: stageLabel,
    word_count: wordCount,
    estimated_minutes: Math.max(10, Math.round(wordCount / 15)),
    body,
    vocabulary: [],
    sentences: [],
    translation: (sections['参考译文'] || '').replace(/\n\s*---+\s*$/g, '').trim(),
    quizzes: [],
    word_glossary: {},
    enrichment_status: 'complete' as const,
  };
}

export const localEngine = {
  async getSettings(): Promise<{ settings: AppSettings }> {
    const rows = await getAll<{ key: string; value: unknown }>('settings');
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
    }
    return { settings: merged as unknown as AppSettings };
  },

  async updateSettings(patch: Partial<AppSettings>): Promise<{ settings: AppSettings }> {
    for (const [k, v] of Object.entries(patch)) {
      if (k in DEFAULT_SETTINGS && v !== undefined) {
        await putItem('settings', { key: k, value: v });
      }
    }
    return this.getSettings();
  },

  async getStats(): Promise<StatsResponse> {
    await ensureSeeded();
    const [articles, words, annos, customs, logs, settingsRes] = await Promise.all([
      getAll<ArticleFull>('articles'),
      getAll<ClickedWord>('clicked_words'),
      getAll<AnnotationItem>('annotations'),
      getAll<CustomNote>('custom_notes'),
      getAll<{ date: string; articles_read: number; words_clicked: number; reviews_done: number; reading_seconds: number }>('study_logs'),
      this.getSettings(),
    ]);

    const stageMap = new Map<number, { stage: number; stage_label: string; total: number; completed: number; reading: number }>();
    let completedArticles = 0;
    let pendingEnrichment = 0;
    let totalReadingSec = 0;

    for (const a of articles) {
      totalReadingSec += a.reading_seconds || 0;
      if (a.read_status === 'completed') completedArticles += 1;
      if (a.enrichment_status === 'pending') pendingEnrichment += 1;
      const st = stageMap.get(a.stage) || {
        stage: a.stage,
        stage_label: a.stage_label,
        total: 0,
        completed: 0,
        reading: 0,
      };
      st.total += 1;
      if (a.read_status === 'completed') st.completed += 1;
      if (a.read_status === 'reading') st.reading += 1;
      stageMap.set(a.stage, st);
    }

    const nowMs = Date.now();
    const isDue = (dt?: string) => !dt || new Date(dt).getTime() <= nowMs;
    const dueWords = words.filter((w) => w.review_status === 'learning' && isDue(w.next_review_at)).length;
    const dueAnnos = annos.filter((a) => a.review_status === 'learning' && isDue(a.next_review_at)).length;
    const dueCustom = customs.filter((c) => c.include_in_review === 1 && c.review_status === 'learning' && isDue(c.next_review_at)).length;

    const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    const today = logs.find((l) => l.date === todayStr()) || {
      date: todayStr(),
      articles_read: 0,
      words_clicked: 0,
      reviews_done: 0,
      reading_seconds: 0,
    };

    const activeDates = new Set(
      logs.filter((l) => l.articles_read > 0 || l.words_clicked > 0 || l.reviews_done > 0 || l.reading_seconds > 60).map((l) => l.date)
    );
    let streakDays = 0;
    const cur = new Date();
    for (let i = 0; i < 365; i += 1) {
      const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      if (activeDates.has(ds)) {
        streakDays += 1;
        cur.setDate(cur.getDate() - 1);
      } else if (i === 0) {
        cur.setDate(cur.getDate() - 1);
      } else break;
    }

    const rec =
      [...articles].sort((a, b) => {
        const rank = (s: string) => (s === 'reading' ? 0 : s === 'unread' ? 1 : 2);
        return rank(a.read_status) - rank(b.read_status) || a.stage - b.stage || a.order_num - b.order_num;
      })[0] || null;

    return {
      stages: [...stageMap.values()].sort((a, b) => a.stage - b.stage),
      totals: {
        total_articles: articles.length,
        completed_articles: completedArticles,
        pending_enrichment: pendingEnrichment,
        total_reading_seconds: totalReadingSec,
        total_words: words.length,
        learning_words: words.filter((w) => w.review_status === 'learning').length,
        mastered_words: words.filter((w) => w.review_status === 'mastered').length,
        total_annotations: annos.length,
        total_custom_notes: customs.length,
        due_reviews: dueWords + dueAnnos + dueCustom,
        streak_days: streakDays,
      },
      today,
      settings: settingsRes.settings,
      recent_logs: sortedLogs,
      recommended_article: rec,
    };
  },

  async listArticles(params: { stage?: string | number; status?: string; enrichment?: string; q?: string } = {}) {
    await ensureSeeded();
    const [articles, words, annos] = await Promise.all([
      getAll<ArticleFull>('articles'),
      getAll<ClickedWord>('clicked_words'),
      getAll<AnnotationItem>('annotations'),
    ]);

    const wordCounts = new Map<number, number>();
    const annoCounts = new Map<number, number>();
    words.forEach((w) => wordCounts.set(w.article_id, (wordCounts.get(w.article_id) || 0) + 1));
    annos.forEach((a) => annoCounts.set(a.article_id, (annoCounts.get(a.article_id) || 0) + 1));

    const filtered = articles
      .filter((a) => {
        if (params.stage && params.stage !== 'all' && a.stage !== Number(params.stage)) return false;
        if (params.status && params.status !== 'all' && a.read_status !== params.status) return false;
        if (params.enrichment && params.enrichment !== 'all' && a.enrichment_status !== params.enrichment) return false;
        if (params.q && params.q.trim()) {
          const n = params.q.trim().toLowerCase();
          if (!`${a.title} ${a.body} ${a.difficulty}`.toLowerCase().includes(n)) return false;
        }
        return true;
      })
      .sort((a, b) => a.stage - b.stage || a.order_num - b.order_num || a.id - b.id)
      .map((a): ArticleSummary => ({
        id: a.id,
        slug: a.slug,
        stage: a.stage,
        stage_label: a.stage_label,
        order_num: a.order_num,
        title: a.title,
        difficulty: a.difficulty,
        word_count: a.word_count,
        estimated_minutes: a.estimated_minutes,
        enrichment_status: a.enrichment_status,
        read_status: a.read_status,
        quiz_score: a.quiz_score,
        reading_seconds: a.reading_seconds,
        clicked_words_count: wordCounts.get(a.id) || 0,
        annotations_count: annoCounts.get(a.id) || 0,
        created_at: a.created_at,
        updated_at: a.updated_at,
      }));

    return { articles: filtered };
  },

  async getArticle(id: number) {
    await ensureSeeded();
    const article = await getByKey<ArticleFull>('articles', id);
    if (!article) throw new Error('Article not found');
    const [allWords, allAnnos, allCustom] = await Promise.all([
      getAll<ClickedWord>('clicked_words'),
      getAll<AnnotationItem>('annotations'),
      getAll<CustomNote>('custom_notes'),
    ]);
    return {
      article,
      clickedWords: allWords.filter((w) => w.article_id === id).sort((a, b) => a.paragraph_index - b.paragraph_index || a.token_index - b.token_index),
      annotations: allAnnos.filter((a) => a.article_id === id).sort((a, b) => a.paragraph_index - b.paragraph_index || a.start_offset - b.start_offset),
      customNotes: allCustom.filter((c) => c.article_id === id).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    };
  },

  async updateArticle(
    id: number,
    payload: { read_status?: 'unread' | 'reading' | 'completed'; quiz_score?: number; quiz_answers?: Record<string, string>; add_seconds?: number }
  ) {
    const art = await getByKey<ArticleFull>('articles', id);
    if (!art) throw new Error('Article not found');
    const prevStatus = art.read_status;
    const nextStatus = payload.read_status || art.read_status;
    const deltaSec = payload.add_seconds && payload.add_seconds > 0 ? Math.min(600, Math.round(payload.add_seconds)) : 0;

    const updated: ArticleFull = {
      ...art,
      read_status: nextStatus,
      quiz_score: payload.quiz_score !== undefined ? payload.quiz_score : art.quiz_score,
      quiz_answers: payload.quiz_answers !== undefined ? payload.quiz_answers : art.quiz_answers,
      reading_seconds: (art.reading_seconds || 0) + deltaSec,
      updated_at: nowIso(),
    };
    await putItem('articles', updated);

    if (nextStatus === 'completed' && prevStatus !== 'completed') {
      await recordActivity({ articlesRead: 1, readingSeconds: deltaSec });
    } else if (deltaSec > 0) {
      await recordActivity({ readingSeconds: deltaSec });
    }
    return { article: updated };
  },

  async deleteArticle(id: number) {
    await deleteByKey('articles', id);
    return { deleted: true };
  },

  async importMarkdown(markdown: string, stage?: number) {
    const parsed = parseMarkdownClient(markdown, stage);
    if (!parsed.body) throw new Error('无法识别 ## 英文正文 板块');
    const ts = nowIso();
    const record: Omit<ArticleFull, 'id'> = {
      ...parsed,
      source_path: 'mobile-import',
      read_status: 'unread',
      quiz_score: null,
      quiz_answers: {},
      reading_seconds: 0,
      clicked_words_count: 0,
      annotations_count: 0,
      created_at: ts,
      updated_at: ts,
    };
    const id = await addItem('articles', record);
    return { article: { ...record, id } as ArticleFull };
  },

  async importRaw(payload: { title: string; body: string; stage: number; difficulty?: string }) {
    const cleanBody = payload.body.replace(/\r\n/g, '\n').trim();
    const wc = (cleanBody.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
    const stageLabel =
      payload.stage === 1
        ? '第一阶段 · 打底适应期'
        : payload.stage === 2
        ? '第二阶段 · 过渡衔接期'
        : payload.stage === 3
        ? '第三阶段 · 考研对标期'
        : '自定义导入';
    const ts = nowIso();
    const record: Omit<ArticleFull, 'id'> = {
      slug: `mobile-raw-${Date.now()}`,
      stage: payload.stage || 4,
      stage_label: stageLabel,
      order_num: 0,
      title: payload.title || '自定义英文阅读',
      difficulty: payload.difficulty || stageLabel,
      word_count: wc,
      estimated_minutes: Math.max(10, Math.round(wc / 15)),
      body: cleanBody,
      vocabulary: [],
      sentences: [],
      translation: '',
      quizzes: [],
      word_glossary: {},
      enrichment_status: 'pending',
      source_path: 'mobile-raw',
      read_status: 'unread',
      quiz_score: null,
      quiz_answers: {},
      reading_seconds: 0,
      clicked_words_count: 0,
      annotations_count: 0,
      created_at: ts,
      updated_at: ts,
    };
    const id = await addItem('articles', record);
    return { article: { ...record, id } as ArticleFull };
  },

  async lookupWord(q: string, articleId?: number): Promise<DictLookupResult> {
    const clean = normalizeToken(q);
    if (!clean) {
      return { word: q, lemma: '', phonetic: '', short_meaning: '未识别词', full_meaning: '', tags: [], source: 'none' };
    }
    const candidates = getCandidateLemmas(clean);

    if (articleId) {
      const art = await getByKey<ArticleFull>('articles', articleId);
      if (art) {
        for (const cand of candidates) {
          const g = art.word_glossary?.[cand];
          if (g) {
            return {
              word: clean,
              lemma: cand,
              phonetic: g.phonetic || '',
              short_meaning: g.short || extractShortMeaning(g.full || ''),
              full_meaning: g.full || g.short || '',
              tags: [],
              source: 'article_glossary',
            };
          }
          const v = art.vocabulary?.find((item) => normalizeToken(item.word) === cand);
          if (v) {
            return {
              word: clean,
              lemma: cand,
              phonetic: v.phonetic || '',
              short_meaning: extractShortMeaning(v.meaning),
              full_meaning: v.pos ? `${v.pos} ${v.meaning}` : v.meaning,
              tags: [],
              source: 'article_vocab',
            };
          }
        }
      }
    }

    const dict = await loadCompactDict();
    for (const cand of candidates) {
      const entry = dict[cand];
      if (entry) {
        return {
          word: clean,
          lemma: cand,
          phonetic: entry[0],
          short_meaning: entry[1],
          full_meaning: entry[2],
          tags: entry[3] || [],
          source: 'compact_offline',
        };
      }
    }

    // Online fallback when phone has network
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|zh-CN`);
      if (res.ok) {
        const j = await res.json();
        const tr = j?.responseData?.translatedText?.trim();
        if (tr && tr.toLowerCase() !== clean) {
          return {
            word: clean,
            lemma: candidates[0] || clean,
            phonetic: '',
            short_meaning: extractShortMeaning(tr),
            full_meaning: tr,
            tags: [],
            source: 'mymemory',
          };
        }
      }
    } catch {
      // Offline
    }

    return {
      word: clean,
      lemma: candidates[0] || clean,
      phonetic: '',
      short_meaning: '暂未收录',
      full_meaning: '离线词库暂未收录，可点击编辑自定义释义',
      tags: [],
      source: 'fallback',
    };
  },

  async searchDictionary(q: string, limit = 12): Promise<{ exact: DictLookupResult | null; suggestions: DictSearchItem[] }> {
    const clean = q.trim().toLowerCase();
    if (!clean) return { exact: null, suggestions: [] };
    const dict = await loadCompactDict();
    const matches: DictSearchItem[] = [];
    for (const [word, entry] of Object.entries(dict)) {
      if (word.startsWith(clean)) {
        matches.push({ word, phonetic: entry[0], short_meaning: entry[1], full_meaning: entry[2], tags: entry[3] || [] });
        if (matches.length >= 40) break;
      }
    }
    matches.sort((a, b) => (a.word === clean ? -1 : b.word === clean ? 1 : a.word.length - b.word.length));
    const exact = await this.lookupWord(clean);
    return { exact, suggestions: matches.slice(0, limit) };
  },

  async translateText(text: string) {
    const clean = text.trim();
    if (!clean) return { text: '', translation: '', source: 'none' };
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|zh-CN`);
      if (res.ok) {
        const j = await res.json();
        const tr = j?.responseData?.translatedText?.trim() || '';
        return { text: clean, translation: tr, source: 'mymemory' };
      }
    } catch {
      // Offline
    }
    return { text: clean, translation: '', source: 'offline' };
  },

  async clickWord(payload: {
    articleId: number;
    paragraphIndex: number;
    tokenIndex: number;
    word: string;
    contextSentence: string;
    forceShow?: boolean;
  }) {
    const all = await getAll<ClickedWord>('clicked_words');
    const existing = all.find(
      (w) => w.article_id === payload.articleId && w.paragraph_index === payload.paragraphIndex && w.token_index === payload.tokenIndex
    );

    if (existing) {
      const wasMissing = !existing.short_meaning || existing.short_meaning === '暂未收录';
      let fresh: DictLookupResult | null = null;
      if (wasMissing) fresh = await this.lookupWord(payload.word, payload.articleId);
      const updated: ClickedWord = {
        ...existing,
        is_visible_inline: payload.forceShow || wasMissing ? 1 : existing.is_visible_inline ? 0 : 1,
        click_count: (existing.click_count || 1) + 1,
        phonetic: fresh?.phonetic || existing.phonetic,
        short_meaning: fresh && fresh.short_meaning !== '暂未收录' ? fresh.short_meaning : existing.short_meaning,
        full_meaning: fresh && fresh.short_meaning !== '暂未收录' ? fresh.full_meaning : existing.full_meaning,
        updated_at: nowIso(),
      };
      await putItem('clicked_words', updated);
      return { clickedWord: updated, created: false };
    }

    const lookup = await this.lookupWord(payload.word, payload.articleId);
    const ts = nowIso();
    const record: Omit<ClickedWord, 'id'> = {
      article_id: payload.articleId,
      paragraph_index: payload.paragraphIndex,
      token_index: payload.tokenIndex,
      word: normalizeToken(payload.word) || payload.word.trim(),
      lemma: lookup.lemma || payload.word,
      phonetic: lookup.phonetic || '',
      short_meaning: lookup.short_meaning || '暂未收录',
      full_meaning: lookup.full_meaning || lookup.short_meaning || '',
      context_sentence: payload.contextSentence || '',
      note: '',
      is_visible_inline: 1,
      review_status: 'learning',
      click_count: 1,
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      next_review_at: ts,
      last_reviewed_at: null,
      created_at: ts,
      updated_at: ts,
    };
    const id = await addItem('clicked_words', record);
    await recordActivity({ wordsClicked: 1 });
    return { clickedWord: { ...record, id } as ClickedWord, created: true };
  },

  async updateWord(id: number, payload: Partial<Pick<ClickedWord, 'note' | 'short_meaning' | 'full_meaning' | 'review_status'>> & { is_visible_inline?: boolean }) {
    const existing = await getByKey<ClickedWord>('clicked_words', id);
    if (!existing) throw new Error('Word not found');
    const updated: ClickedWord = {
      ...existing,
      ...payload,
      is_visible_inline: payload.is_visible_inline !== undefined ? (payload.is_visible_inline ? 1 : 0) : existing.is_visible_inline,
      updated_at: nowIso(),
    };
    await putItem('clicked_words', updated);
    return { clickedWord: updated };
  },

  async deleteWord(id: number) {
    await deleteByKey('clicked_words', id);
    return { deleted: true };
  },

  async createAnnotation(payload: {
    articleId: number;
    type: 'phrase' | 'sentence' | 'word';
    paragraphIndex: number;
    startOffset: number;
    endOffset: number;
    selectedText: string;
    translation?: string;
    note?: string;
    color?: HighlightColor;
  }) {
    let tr = (payload.translation || '').trim();
    if (!tr) tr = (await this.translateText(payload.selectedText)).translation;
    const ts = nowIso();
    const record: Omit<AnnotationItem, 'id'> = {
      article_id: payload.articleId,
      type: payload.type,
      paragraph_index: payload.paragraphIndex,
      start_offset: payload.startOffset,
      end_offset: payload.endOffset,
      selected_text: payload.selectedText.trim(),
      translation: tr,
      note: payload.note || '',
      color: payload.color || 'cyan',
      review_status: 'learning',
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      next_review_at: ts,
      last_reviewed_at: null,
      created_at: ts,
      updated_at: ts,
    };
    const id = await addItem('annotations', record);
    return { annotation: { ...record, id } as AnnotationItem };
  },

  async updateAnnotation(id: number, payload: Partial<Pick<AnnotationItem, 'note' | 'translation' | 'color' | 'review_status'>>) {
    const existing = await getByKey<AnnotationItem>('annotations', id);
    if (!existing) throw new Error('Annotation not found');
    const updated: AnnotationItem = { ...existing, ...payload, updated_at: nowIso() };
    await putItem('annotations', updated);
    return { annotation: updated };
  },

  async deleteAnnotation(id: number) {
    await deleteByKey('annotations', id);
    return { deleted: true };
  },

  async createCustomNote(payload: {
    articleId?: number | null;
    title: string;
    content: string;
    category?: string;
    color?: HighlightColor;
    includeInReview?: boolean;
  }) {
    const ts = nowIso();
    const record: Omit<CustomNote, 'id'> = {
      article_id: payload.articleId ?? null,
      title: payload.title.trim() || payload.content.trim().slice(0, 36),
      content: payload.content.trim(),
      category: payload.category || '随手笔记',
      color: payload.color || 'amber',
      include_in_review: payload.includeInReview ? 1 : 0,
      review_status: 'learning',
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      next_review_at: ts,
      last_reviewed_at: null,
      created_at: ts,
      updated_at: ts,
    };
    const id = await addItem('custom_notes', record);
    return { customNote: { ...record, id } as CustomNote };
  },

  async updateCustomNote(
    id: number,
    payload: Partial<Pick<CustomNote, 'title' | 'content' | 'category' | 'color' | 'review_status'>> & { includeInReview?: boolean }
  ) {
    const existing = await getByKey<CustomNote>('custom_notes', id);
    if (!existing) throw new Error('Custom note not found');
    const updated: CustomNote = {
      ...existing,
      title: payload.title !== undefined ? payload.title : existing.title,
      content: payload.content !== undefined ? payload.content : existing.content,
      category: payload.category !== undefined ? payload.category : existing.category,
      color: payload.color !== undefined ? payload.color : existing.color,
      review_status: payload.review_status !== undefined ? payload.review_status : existing.review_status,
      include_in_review: payload.includeInReview !== undefined ? (payload.includeInReview ? 1 : 0) : existing.include_in_review,
      updated_at: nowIso(),
    };
    await putItem('custom_notes', updated);
    return { customNote: updated };
  },

  async deleteCustomNote(id: number) {
    await deleteByKey('custom_notes', id);
    return { deleted: true };
  },

  async listNotes(params: { type?: string; status?: string; color?: string; stage?: string; articleId?: number; q?: string } = {}) {
    await ensureSeeded();
    const [articles, words, annos, customs] = await Promise.all([
      getAll<ArticleFull>('articles'),
      getAll<ClickedWord>('clicked_words'),
      getAll<AnnotationItem>('annotations'),
      getAll<CustomNote>('custom_notes'),
    ]);
    const artMap = new Map(articles.map((a) => [a.id, a]));
    const items: UnifiedNote[] = [];

    if (!params.type || params.type === 'all' || params.type === 'word') {
      for (const w of words) {
        const a = artMap.get(w.article_id);
        items.push({
          uid: `word-${w.id}`,
          itemType: 'word',
          id: w.id,
          article_id: w.article_id,
          article_title: a?.title || '',
          article_stage: a?.stage || 0,
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

    if (!params.type || ['all', 'phrase', 'sentence'].includes(params.type)) {
      for (const an of annos) {
        if (params.type && params.type !== 'all' && an.type !== params.type) continue;
        const a = artMap.get(an.article_id);
        items.push({
          uid: `anno-${an.id}`,
          itemType: 'annotation',
          id: an.id,
          article_id: an.article_id,
          article_title: a?.title || '',
          article_stage: a?.stage || 0,
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

    if (!params.type || params.type === 'all' || params.type === 'custom') {
      for (const cn of customs) {
        const a = cn.article_id ? artMap.get(cn.article_id) : undefined;
        items.push({
          uid: `custom-${cn.id}`,
          itemType: 'custom',
          id: cn.id,
          article_id: cn.article_id,
          article_title: a?.title || '独立笔记',
          article_stage: a?.stage || 0,
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
        if (params.status && params.status !== 'all' && item.review_status !== params.status) return false;
        if (params.color && params.color !== 'all' && item.color !== params.color) return false;
        if (params.stage && params.stage !== 'all' && item.article_stage !== Number(params.stage)) return false;
        if (params.articleId && item.article_id !== Number(params.articleId)) return false;
        if (params.q && params.q.trim()) {
          const n = params.q.trim().toLowerCase();
          if (!`${item.title} ${item.meaning} ${item.note} ${item.context} ${item.article_title}`.toLowerCase().includes(n)) return false;
        }
        return true;
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    return { notes: filtered };
  },

  async getReviewQueue(params: { includeAll?: boolean; type?: string } = {}) {
    await ensureSeeded();
    const [articles, words, annos, customs] = await Promise.all([
      getAll<ArticleFull>('articles'),
      getAll<ClickedWord>('clicked_words'),
      getAll<AnnotationItem>('annotations'),
      getAll<CustomNote>('custom_notes'),
    ]);
    const artMap = new Map(articles.map((a) => [a.id, a]));
    const nowMs = Date.now();
    const cards: ReviewCard[] = [];

    if (!params.type || params.type === 'all' || params.type === 'word') {
      for (const w of words) {
        if (w.review_status !== 'learning') continue;
        const isDue = !w.next_review_at || new Date(w.next_review_at).getTime() <= nowMs;
        if (!params.includeAll && !isDue) continue;
        const a = artMap.get(w.article_id);
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
          article_title: a?.title || '',
          article_stage: a?.stage || 0,
          paragraph_index: w.paragraph_index,
          ease_factor: w.ease_factor,
          interval_days: w.interval_days,
          repetitions: w.repetitions,
          next_review_at: w.next_review_at,
          isDue,
        });
      }
    }

    if (!params.type || params.type === 'all' || params.type === 'annotation') {
      for (const an of annos) {
        if (an.review_status !== 'learning') continue;
        const isDue = !an.next_review_at || new Date(an.next_review_at).getTime() <= nowMs;
        if (!params.includeAll && !isDue) continue;
        const a = artMap.get(an.article_id);
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
          article_title: a?.title || '',
          article_stage: a?.stage || 0,
          paragraph_index: an.paragraph_index,
          ease_factor: an.ease_factor,
          interval_days: an.interval_days,
          repetitions: an.repetitions,
          next_review_at: an.next_review_at,
          isDue,
        });
      }
    }

    if (!params.type || params.type === 'all' || params.type === 'custom') {
      for (const cn of customs) {
        if (cn.include_in_review !== 1 || cn.review_status !== 'learning') continue;
        const isDue = !cn.next_review_at || new Date(cn.next_review_at).getTime() <= nowMs;
        if (!params.includeAll && !isDue) continue;
        const a = cn.article_id ? artMap.get(cn.article_id) : undefined;
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
          article_title: a?.title || '独立笔记',
          article_stage: a?.stage || 0,
          paragraph_index: 0,
          ease_factor: cn.ease_factor,
          interval_days: cn.interval_days,
          repetitions: cn.repetitions,
          next_review_at: cn.next_review_at,
          isDue,
        });
      }
    }

    cards.sort((a, b) => new Date(a.next_review_at).getTime() - new Date(b.next_review_at).getTime());
    return { queue: cards };
  },

  async submitReview(payload: { itemType: 'word' | 'annotation' | 'custom'; itemId: number; quality: number; markMastered?: boolean }) {
    const store = payload.itemType === 'word' ? 'clicked_words' : payload.itemType === 'annotation' ? 'annotations' : 'custom_notes';
    const item = await getByKey<ClickedWord | AnnotationItem | CustomNote>(store, payload.itemId);
    if (!item) throw new Error('Review item not found');
    const sm2 = calculateSm2(item, payload.quality);
    const updated = {
      ...item,
      ...sm2,
      review_status: payload.markMastered ? 'mastered' : item.review_status,
      updated_at: nowIso(),
    };
    await putItem(store, updated);
    await recordActivity({ reviewsDone: 1 });
    return { item: updated, sm2 };
  },

  async exportBackup(): Promise<Record<string, unknown>> {
    await ensureSeeded();
    const [settingsRes, articles, words, annos, customs, logs] = await Promise.all([
      this.getSettings(),
      getAll<ArticleFull>('articles'),
      getAll<ClickedWord>('clicked_words'),
      getAll<AnnotationItem>('annotations'),
      getAll<CustomNote>('custom_notes'),
      getAll('study_logs'),
    ]);
    const artMap = new Map(articles.map((a) => [a.id, a]));
    return {
      version: 1,
      exported_at: nowIso(),
      settings: settingsRes.settings,
      custom_notes: customs,
      study_logs: logs,
      article_progress: articles
        .filter((a) => a.read_status !== 'unread' || a.quiz_score !== null || a.reading_seconds > 0)
        .map((a) => ({
          slug: a.slug,
          read_status: a.read_status,
          quiz_score: a.quiz_score,
          quiz_answers_json: JSON.stringify(a.quiz_answers || {}),
          reading_seconds: a.reading_seconds || 0,
        })),
      clicked_words: words.map((w) => ({ ...w, article_slug: artMap.get(w.article_id)?.slug || '' })),
      annotations: annos.map((an) => ({ ...an, article_slug: artMap.get(an.article_id)?.slug || '' })),
    };
  },

  async importBackup(data: Record<string, unknown>) {
    await ensureSeeded();
    let restored = 0;
    if (data.settings && typeof data.settings === 'object') {
      await this.updateSettings(data.settings as Partial<AppSettings>);
    }
    const articles = await getAll<ArticleFull>('articles');
    const bySlug = new Map(articles.map((a) => [a.slug, a]));

    if (Array.isArray(data.article_progress)) {
      for (const ap of data.article_progress as Array<Record<string, unknown>>) {
        const art = typeof ap.slug === 'string' ? bySlug.get(ap.slug) : undefined;
        if (!art) continue;
        await putItem('articles', {
          ...art,
          read_status: (ap.read_status as ArticleFull['read_status']) || art.read_status,
          quiz_score: (ap.quiz_score as number | null) ?? art.quiz_score,
          reading_seconds: Math.max(art.reading_seconds || 0, Number(ap.reading_seconds || 0)),
        });
        restored += 1;
      }
    }

    if (Array.isArray(data.custom_notes)) {
      const existingCustom = await getAll<CustomNote>('custom_notes');
      for (const cn of data.custom_notes as Array<Partial<CustomNote>>) {
        const dup = existingCustom.find((e) => e.title === cn.title && e.content === cn.content);
        if (dup) continue;
        await addItem('custom_notes', {
          article_id: null,
          title: cn.title || '学习笔记',
          content: cn.content || '',
          category: cn.category || '随手笔记',
          color: cn.color || 'amber',
          include_in_review: cn.include_in_review ?? 0,
          review_status: cn.review_status || 'learning',
          ease_factor: cn.ease_factor ?? 2.5,
          interval_days: cn.interval_days ?? 0,
          repetitions: cn.repetitions ?? 0,
          next_review_at: cn.next_review_at || nowIso(),
          last_reviewed_at: null,
          created_at: cn.created_at || nowIso(),
          updated_at: cn.updated_at || nowIso(),
        });
        restored += 1;
      }
    }

    if (Array.isArray(data.clicked_words)) {
      const existingWords = await getAll<ClickedWord>('clicked_words');
      for (const w of data.clicked_words as Array<Partial<ClickedWord> & { article_slug?: string }>) {
        const art = w.article_slug ? bySlug.get(w.article_slug) : undefined;
        if (!art) continue;
        const dup = existingWords.find(
          (ew) => ew.article_id === art.id && ew.paragraph_index === w.paragraph_index && ew.token_index === w.token_index
        );
        if (dup) continue;
        await addItem('clicked_words', {
          ...w,
          id: undefined,
          article_id: art.id,
        });
        restored += 1;
      }
    }

    return { ok: true, restored };
  },

  async syncWithDesktopServer(serverUrl: string) {
    const base = serverUrl.trim().replace(/\/+$/, '');
    if (!base) throw new Error('请输入电脑端局域网地址');
    await ensureSeeded();

    // 1. Pull new articles from PC
    const expRes = await fetch(`${base}/api/articles/export-all`);
    if (!expRes.ok) throw new Error(`连接电脑端失败 (${expRes.status})`);
    const { articles: remoteArticles } = (await expRes.json()) as { articles: ArticleFull[] };
    const localArticles = await getAll<ArticleFull>('articles');
    const localSlugs = new Set(localArticles.map((a) => a.slug));
    let importedArticles = 0;

    for (const ra of remoteArticles || []) {
      if (!localSlugs.has(ra.slug)) {
        const copy = { ...ra } as Record<string, unknown>;
        delete copy.id;
        await addItem('articles', copy);
        importedArticles += 1;
      }
    }

    // 2. Pull PC progress/notes backup into phone
    const pcBackupRes = await fetch(`${base}/api/backup/export`);
    let mergedFromPc = 0;
    if (pcBackupRes.ok) {
      const pcBackup = await pcBackupRes.json();
      const imp = await this.importBackup(pcBackup);
      mergedFromPc = imp.restored;
    }

    // 3. Push phone progress/notes up to PC
    const mobileBackup = await this.exportBackup();
    const pushRes = await fetch(`${base}/api/backup/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mobileBackup),
    });
    const pushed = pushRes.ok ? (await pushRes.json()).restored || 0 : 0;

    return { importedArticles, mergedFromPc, pushedToPc: pushed };
  },

  async getMcpConfig(): Promise<McpConfigResponse> {
    return {
      nodePath: 'Android Offline Engine',
      mcpScriptPath: '仅桌面版支持本地 MCP Server',
      defaultArticlesDir: '',
      pendingEnrichmentCount: 0,
      configJson: '// 请在 Windows 桌面版「连接 AI Agent (MCP)」中复制配置',
      tools: [],
    };
  },
};
