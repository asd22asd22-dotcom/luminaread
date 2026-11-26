import { getDb } from '../server/db.js';
import { lookupWordOfflineOnly } from '../server/dictionary.js';

const db = getDb();

const missing = db
  .prepare("SELECT id, article_id, word, short_meaning FROM clicked_words WHERE short_meaning = '' OR short_meaning = '暂未收录'")
  .all();
console.log('Existing missing clicked_words:', missing);

const sampleWords = [
  'even',
  'quiet',
  'often',
  'shapes',
  'complicated',
  'strict',
  'you',
  'waking',
  'earlier',
  'stretch',
  'decisions',
  'evangelist',
  'caprice',
  'counterfactual',
  'unalloyed',
];
for (const w of sampleWords) {
  const res = lookupWordOfflineOnly(db, w, 1);
  console.log(`  ${w} -> ${res ? `${res.short_meaning} ${res.phonetic} [${res.source}]` : 'MISS'}`);
}

const articles = db.prepare('SELECT id, body FROM articles').all();
const seen = new Set();
const missed = [];

for (const a of articles) {
  const tokens = a.body.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
  for (const tok of tokens) {
    const k = tok.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const hit = lookupWordOfflineOnly(db, tok, a.id);
    if (!hit) missed.push(tok);
  }
}

const pct = (((seen.size - missed.length) / seen.size) * 100).toFixed(2);
console.log(`Unique words across ${articles.length} articles: ${seen.size}, offline hits: ${seen.size - missed.length} (${pct}%), misses: ${missed.length}`);
if (missed.length > 0) {
  console.log('Sample misses:', missed.slice(0, 50));
}
