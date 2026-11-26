import { safeJsonParse } from './db.js';

const IRREGULAR_VERBS = {
  was: 'be', were: 'be', been: 'be', am: 'be', is: 'be', are: 'be',
  had: 'have', has: 'have', having: 'have',
  did: 'do', does: 'do', done: 'do', doing: 'do',
  went: 'go', goes: 'go', gone: 'go',
  became: 'become', becomes: 'become',
  began: 'begin', begun: 'begin',
  broke: 'break', broken: 'break',
  brought: 'bring', built: 'build',
  bought: 'buy', caught: 'catch',
  chose: 'choose', chosen: 'choose',
  came: 'come', cost: 'cost', cut: 'cut',
  dealt: 'deal', drew: 'draw', drawn: 'draw',
  driven: 'drive', drove: 'drive',
  ate: 'eat', eaten: 'eat',
  fell: 'fall', fallen: 'fall',
  felt: 'feel', fought: 'fight',
  found: 'find', flew: 'fly', flown: 'fly',
  forgot: 'forget', forgotten: 'forget',
  forgave: 'forgive', forgiven: 'forgive',
  gave: 'give', given: 'give',
  grew: 'grow', grown: 'grow',
  held: 'hold', kept: 'keep',
  knew: 'know', known: 'know',
  led: 'lead', left: 'leave', lent: 'lend',
  lost: 'lose', made: 'make', meant: 'mean',
  met: 'meet', paid: 'pay', put: 'put',
  ran: 'run', rose: 'rise', risen: 'rise',
  said: 'say', saw: 'see', seen: 'see',
  sold: 'sell', sent: 'send', set: 'set',
  shook: 'shake', shaken: 'shake',
  showed: 'show', shown: 'show',
  sat: 'sit', slept: 'sleep',
  spoke: 'speak', spoken: 'speak',
  spent: 'spend', stood: 'stand',
  stole: 'steal', stolen: 'steal',
  taught: 'teach', told: 'tell',
  thought: 'think', threw: 'throw', thrown: 'throw',
  took: 'take', taken: 'take',
  understood: 'understand',
  woke: 'wake', woken: 'wake',
  wore: 'wear', worn: 'wear',
  won: 'win', wrote: 'write', written: 'write',
  better: 'good', best: 'good',
  worse: 'bad', worst: 'bad',
  further: 'far', farthest: 'far',
  earlier: 'early', earliest: 'early',
  easier: 'easy', easiest: 'easy',
  happier: 'happy', happiest: 'happy',
  children: 'child', men: 'man', women: 'woman',
  people: 'person', teeth: 'tooth', feet: 'foot',
  mice: 'mouse', lives: 'life', leaves: 'leaf',
};

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Connection: 'close',
};

async function fetchJsonWithRetry(url, timeoutMs = 4500, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: FETCH_HEADERS,
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // retry on transient network reset
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 220 * (attempt + 1)));
    }
  }
  return null;
}

export function normalizeToken(raw) {
  return String(raw || '')
    .trim()
    .replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, '')
    .toLowerCase();
}

export function getCandidateLemmas(rawWord) {
  const clean = normalizeToken(rawWord);
  if (!clean) return [];
  const candidates = [clean];

  if (clean.endsWith("'s") || clean.endsWith("’s")) {
    candidates.push(clean.slice(0, -2));
  }
  if (IRREGULAR_VERBS[clean]) {
    candidates.push(IRREGULAR_VERBS[clean]);
  }
  if (clean.endsWith('ies') && clean.length > 4) {
    candidates.push(clean.slice(0, -3) + 'y');
  }
  if (clean.endsWith('ves') && clean.length > 4) {
    candidates.push(clean.slice(0, -3) + 'f');
    candidates.push(clean.slice(0, -3) + 'fe');
  }
  if (clean.endsWith('es') && clean.length > 3) {
    candidates.push(clean.slice(0, -2));
    candidates.push(clean.slice(0, -1));
  }
  if (clean.endsWith('s') && !clean.endsWith('ss') && clean.length > 3) {
    candidates.push(clean.slice(0, -1));
  }
  if (clean.endsWith('ied') && clean.length > 4) {
    candidates.push(clean.slice(0, -3) + 'y');
  }
  if (clean.endsWith('ed') && clean.length > 4) {
    const stem = clean.slice(0, -2);
    candidates.push(stem);
    candidates.push(stem + 'e');
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      candidates.push(stem.slice(0, -1));
    }
  }
  if (clean.endsWith('ing') && clean.length > 5) {
    const stem = clean.slice(0, -3);
    candidates.push(stem);
    candidates.push(stem + 'e');
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      candidates.push(stem.slice(0, -1));
    }
  }
  if (clean.endsWith('ier') && clean.length > 4) {
    candidates.push(clean.slice(0, -3) + 'y');
  }
  if (clean.endsWith('iest') && clean.length > 5) {
    candidates.push(clean.slice(0, -4) + 'y');
  }
  if (clean.endsWith('er') && clean.length > 4) {
    candidates.push(clean.slice(0, -2));
    candidates.push(clean.slice(0, -1));
  }
  if (clean.endsWith('est') && clean.length > 5) {
    candidates.push(clean.slice(0, -3));
    candidates.push(clean.slice(0, -2));
  }
  if (clean.endsWith('ily') && clean.length > 4) {
    candidates.push(clean.slice(0, -3) + 'y');
  }
  if (clean.endsWith('ly') && clean.length > 4) {
    candidates.push(clean.slice(0, -2));
  }
  if (clean.includes('-')) {
    const stripped = clean.replace(/-/g, '');
    if (stripped !== clean) candidates.push(stripped);
  }

  return [...new Set(candidates.filter(Boolean))];
}

export function extractShortMeaning(fullMeaning) {
  if (!fullMeaning) return '';
  const firstLine =
    String(fullMeaning)
      .replace(/\\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('[')) || String(fullMeaning).trim();

  let stripped = firstLine
    .replace(
      /^(?:(?:adj|adv|vt|vi|v|n|prep|conj|pron|art|num|int|interj|aux|abbr|pl|a|ad|det|phr)\.(?:\s*\/\s*(?:adj|adv|vt|vi|v|n|prep|conj|pron|a|ad)\.)*\s*)+/i,
      ''
    )
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .trim();

  if (!stripped) stripped = firstLine;

  const parts = stripped
    .split(/[；;，,]/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return stripped.slice(0, 10);
  if (parts[0].length <= 4 && parts[1] && parts[0].length + parts[1].length + 1 <= 10) {
    return `${parts[0]}；${parts[1]}`;
  }
  return parts[0].length > 10 ? parts[0].slice(0, 10) : parts[0];
}

function lookupInArticle(db, candidates, articleId) {
  if (!articleId) return null;
  const row = db
    .prepare('SELECT vocabulary_json, word_glossary_json FROM articles WHERE id = ?')
    .get(articleId);
  if (!row) return null;

  const glossary = safeJsonParse(row.word_glossary_json, {});
  for (const cand of candidates) {
    const entry = glossary[cand] || glossary[cand.toLowerCase()];
    if (entry) {
      const fullMeaning = entry.full || entry.short || '';
      const shortMeaning = entry.short || extractShortMeaning(fullMeaning);
      return {
        lemma: cand,
        phonetic: entry.phonetic || '',
        short_meaning: shortMeaning,
        full_meaning: entry.pos ? `${entry.pos} ${fullMeaning}`.trim() : fullMeaning,
        source: 'article_glossary',
      };
    }
  }

  const vocab = safeJsonParse(row.vocabulary_json, []);
  for (const cand of candidates) {
    const found = vocab.find((v) => {
      const vw = normalizeToken(v.word);
      return vw === cand || getCandidateLemmas(vw).includes(cand);
    });
    if (found) {
      const full = found.pos ? `${found.pos} ${found.meaning}`.trim() : found.meaning;
      return {
        lemma: normalizeToken(found.word) || cand,
        phonetic: found.phonetic || '',
        short_meaning: extractShortMeaning(found.meaning),
        full_meaning: full,
        source: 'article_vocab',
      };
    }
  }

  return null;
}

function lookupInCache(db, candidates) {
  const stmt = db.prepare(
    'SELECT word_key, phonetic, short_meaning, full_meaning, source FROM dictionary_cache WHERE word_key = ?'
  );
  for (const cand of candidates) {
    const row = stmt.get(cand);
    if (row && row.short_meaning && row.short_meaning !== '暂未收录') {
      return {
        lemma: row.word_key,
        phonetic: row.phonetic,
        short_meaning: row.short_meaning,
        full_meaning: row.full_meaning,
        source: row.source || 'cache',
      };
    }
  }
  return null;
}

const EXAM_TAG_MAP = {
  ky: '考研',
  cet6: '六级',
  cet4: '四级',
  ielts: '雅思',
  toefl: '托福',
  gre: 'GRE',
  gk: '高考',
  zk: '中考',
};

export function parseExamTags(tagStr) {
  if (!tagStr) return [];
  const seen = new Set();
  const out = [];
  for (const raw of String(tagStr).split(/\s+/)) {
    const label = EXAM_TAG_MAP[raw.trim().toLowerCase()];
    if (label && !seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

function lookupTagsForCandidates(db, candidates) {
  let stmt;
  try {
    stmt = db.prepare('SELECT tag FROM offline_dictionary WHERE word = ?');
  } catch {
    return [];
  }
  for (const cand of candidates) {
    const row = stmt.get(cand);
    if (row?.tag) return parseExamTags(row.tag);
  }
  return [];
}

function lookupInOfflineDict(db, candidates) {
  let stmt;
  try {
    stmt = db.prepare(
      'SELECT word, phonetic, short_meaning, full_meaning, tag, exchange FROM offline_dictionary WHERE word = ?'
    );
  } catch {
    return null;
  }

  for (const cand of candidates) {
    const row = stmt.get(cand);
    if (row && row.short_meaning) {
      let lemma = row.word;
      if (row.exchange && row.exchange.startsWith('0:')) {
        lemma = row.exchange.slice(2).split('/')[0] || row.word;
      }
      return {
        lemma,
        phonetic: row.phonetic || '',
        short_meaning: row.short_meaning,
        full_meaning: row.full_meaning || row.short_meaning,
        tags: parseExamTags(row.tag),
        source: 'ecdict_offline',
      };
    }
  }
  return null;
}

export function searchOfflineDictionary(db, query, limit = 12) {
  const clean = String(query || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z'\-\s]/g, '');
  if (!clean) return [];

  const safeLimit = Math.max(1, Math.min(30, Number(limit) || 12));
  try {
    const rows = db
      .prepare(`
        SELECT word, phonetic, short_meaning, full_meaning, tag
        FROM offline_dictionary
        WHERE word LIKE ?
        ORDER BY
          CASE WHEN word = ? THEN 0 WHEN tag LIKE '%ky%' THEN 1 WHEN tag != '' THEN 2 ELSE 3 END,
          length(word) ASC,
          word ASC
        LIMIT ?
      `)
      .all(`${clean}%`, clean, safeLimit);

    return rows.map((r) => ({
      word: r.word,
      phonetic: r.phonetic || '',
      short_meaning: r.short_meaning,
      full_meaning: r.full_meaning || r.short_meaning,
      tags: parseExamTags(r.tag),
    }));
  } catch {
    return [];
  }
}

async function fetchFromYoudao(query) {
  const data = await fetchJsonWithRetry(
    `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(query)}`,
    4500,
    2
  );
  const ecWord = data?.ec?.word?.[0];
  if (ecWord) {
    const rawPhone = ecWord.usphone || ecWord.ukphone || ecWord.phone || '';
    const phonetic = rawPhone ? `/${rawPhone.replace(/^\/|\/$/g, '')}/` : '';
    const senses = (ecWord.trs || [])
      .map((t) => t?.tr?.[0]?.l?.i?.[0])
      .filter(Boolean);
    if (senses.length > 0) {
      const full_meaning = senses.join('；');
      return {
        lemma: query,
        phonetic,
        short_meaning: extractShortMeaning(senses[0]),
        full_meaning,
        source: 'youdao',
      };
    }
  }

  const data2 = await fetchJsonWithRetry(
    `https://dict.youdao.com/suggest?num=3&doctype=json&q=${encodeURIComponent(query)}`,
    4000,
    2
  );
  const entries = data2?.data?.entries || [];
  const exact = entries.find(
    (e) => e?.explain && e?.entry?.toLowerCase() === query.toLowerCase()
  );
  if (exact) {
    return {
      lemma: query,
      phonetic: '',
      short_meaning: extractShortMeaning(exact.explain),
      full_meaning: exact.explain,
      source: 'youdao_suggest',
    };
  }

  return null;
}

async function fetchFromGoogleGtx(query) {
  const data = await fetchJsonWithRetry(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&dt=bd&q=${encodeURIComponent(query)}`,
    4500,
    1
  );
  if (!Array.isArray(data)) return null;

  const dictEntries = Array.isArray(data[1]) ? data[1] : [];
  if (dictEntries.length > 0) {
    const senses = dictEntries
      .slice(0, 3)
      .map((item) => {
        const pos = item?.[0] ? `${item[0]}. ` : '';
        const words = Array.isArray(item?.[1]) ? item[1].slice(0, 4).join('，') : '';
        return words ? `${pos}${words}` : '';
      })
      .filter(Boolean);
    if (senses.length > 0) {
      return {
        lemma: query,
        phonetic: '',
        short_meaning: extractShortMeaning(senses[0]),
        full_meaning: senses.join('；'),
        source: 'google_gtx',
      };
    }
  }

  const translated = Array.isArray(data[0])
    ? data[0].map((seg) => seg?.[0] || '').join('').trim()
    : '';
  if (translated && translated.toLowerCase() !== query.toLowerCase()) {
    return {
      lemma: query,
      phonetic: '',
      short_meaning: extractShortMeaning(translated),
      full_meaning: translated,
      source: 'google_gtx',
    };
  }
  return null;
}

async function fetchFromMyMemory(query) {
  const data = await fetchJsonWithRetry(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=en|zh-CN`,
    4500,
    1
  );
  const translated = data?.responseData?.translatedText?.trim();
  if (translated && translated.toLowerCase() !== query.toLowerCase()) {
    return {
      lemma: query,
      phonetic: '',
      short_meaning: extractShortMeaning(translated),
      full_meaning: translated,
      source: 'mymemory',
    };
  }
  return null;
}

function saveToCache(db, key, entry) {
  if (!key || !entry?.short_meaning || entry.short_meaning === '暂未收录') return;
  db.prepare(`
    INSERT INTO dictionary_cache (word_key, phonetic, short_meaning, full_meaning, source, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(word_key) DO UPDATE SET
      phonetic = CASE WHEN excluded.phonetic != '' THEN excluded.phonetic ELSE dictionary_cache.phonetic END,
      short_meaning = excluded.short_meaning,
      full_meaning = excluded.full_meaning,
      source = excluded.source,
      updated_at = datetime('now')
  `).run(
    key,
    entry.phonetic || '',
    entry.short_meaning,
    entry.full_meaning || entry.short_meaning,
    entry.source || 'youdao'
  );
}

export function lookupWordOfflineOnly(db, rawWord, articleId = null) {
  const clean = normalizeToken(rawWord);
  if (!clean) return null;
  const candidates = getCandidateLemmas(clean);

  const articleHit = lookupInArticle(db, candidates, articleId);
  if (articleHit) {
    return { word: clean, tags: lookupTagsForCandidates(db, candidates), ...articleHit };
  }

  const cacheHit = lookupInCache(db, candidates);
  if (cacheHit) {
    return { word: clean, tags: lookupTagsForCandidates(db, candidates), ...cacheHit };
  }

  const offlineHit = lookupInOfflineDict(db, candidates);
  if (offlineHit) return { word: clean, ...offlineHit };

  if (clean.includes('-')) {
    const parts = clean.split('-').filter(Boolean);
    if (parts.length === 2) {
      const p1 = lookupInOfflineDict(db, getCandidateLemmas(parts[0]));
      const p2 = lookupInOfflineDict(db, getCandidateLemmas(parts[1]));
      if (p1 && p2) {
        const s1 = p1.short_meaning.split('；')[0];
        const s2 = p2.short_meaning.split('；')[0];
        return {
          word: clean,
          lemma: clean,
          phonetic: '',
          short_meaning: `${s1}${s2}`.slice(0, 10),
          full_meaning: `${parts[0]}（${p1.short_meaning}）+ ${parts[1]}（${p2.short_meaning}）`,
          source: 'ecdict_compound',
        };
      }
    }
  }

  return null;
}

export async function lookupWord(db, rawWord, articleId = null) {
  const clean = normalizeToken(rawWord);
  if (!clean) {
    return {
      word: rawWord,
      lemma: '',
      phonetic: '',
      short_meaning: '未识别词',
      full_meaning: '未识别到有效英文单词',
      source: 'none',
    };
  }

  const localHit = lookupWordOfflineOnly(db, clean, articleId);
  if (localHit) {
    return localHit;
  }

  const candidates = getCandidateLemmas(clean);
  for (const cand of candidates.slice(0, 3)) {
    const onlineHit =
      (await fetchFromYoudao(cand)) ||
      (await fetchFromGoogleGtx(cand)) ||
      (await fetchFromMyMemory(cand));
    if (onlineHit) {
      saveToCache(db, cand, onlineHit);
      if (cand !== clean) {
        saveToCache(db, clean, onlineHit);
      }
      return { word: clean, ...onlineHit };
    }
  }

  return {
    word: clean,
    lemma: candidates[0] || clean,
    phonetic: '',
    short_meaning: '暂未收录',
    full_meaning: '离线或未查到释义，可点击编辑自定义中文释义',
    source: 'fallback',
  };
}

export async function translateText(db, text) {
  const clean = String(text || '').trim();
  if (!clean) return { text: '', translation: '', source: 'none' };

  if (/^[A-Za-z'-]+$/.test(clean)) {
    const res = await lookupWord(db, clean, null);
    return {
      text: clean,
      translation: res.full_meaning || res.short_meaning,
      source: res.source,
    };
  }

  const cacheKey = `phrase:${clean.toLowerCase()}`;
  const cached = db
    .prepare('SELECT full_meaning, source FROM dictionary_cache WHERE word_key = ?')
    .get(cacheKey);
  if (cached?.full_meaning) {
    return { text: clean, translation: cached.full_meaning, source: cached.source };
  }

  const offlinePhrase = lookupInOfflineDict(db, [clean.toLowerCase()]);
  if (offlinePhrase?.full_meaning) {
    return {
      text: clean,
      translation: offlinePhrase.full_meaning,
      source: offlinePhrase.source,
    };
  }

  const gtx = await fetchFromGoogleGtx(clean);
  if (gtx?.full_meaning) {
    saveToCache(db, cacheKey, {
      phonetic: '',
      short_meaning: gtx.full_meaning.slice(0, 20),
      full_meaning: gtx.full_meaning,
      source: 'google_gtx',
    });
    return { text: clean, translation: gtx.full_meaning, source: 'google_gtx' };
  }

  const mm = await fetchFromMyMemory(clean);
  if (mm?.full_meaning) {
    saveToCache(db, cacheKey, {
      phonetic: '',
      short_meaning: mm.full_meaning.slice(0, 20),
      full_meaning: mm.full_meaning,
      source: 'mymemory',
    });
    return { text: clean, translation: mm.full_meaning, source: 'mymemory' };
  }

  return {
    text: clean,
    translation: '',
    source: 'offline',
  };
}
