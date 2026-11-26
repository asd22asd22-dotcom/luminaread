import path from 'node:path';
import fs from 'node:fs';
import { getDb, DEFAULT_ARTICLES_DIR, safeJsonParse } from '../server/db.js';
import { syncDirectory } from '../server/importer.js';

const db = getDb();
const dir = process.argv[2] || DEFAULT_ARTICLES_DIR;

const result = syncDirectory(db, dir);
console.log('Sync complete:', JSON.stringify(result, null, 2));

const rows = db
  .prepare("SELECT * FROM articles WHERE source_path != ''")
  .all()
  .filter((row) => {
    const relative = path.relative(dir, row.source_path);
    return relative && relative !== '..' && !relative.startsWith('..' + path.sep)
      && !path.isAbsolute(relative) && fs.existsSync(row.source_path);
  });
let incomplete = 0;
for (const r of rows) {
  const vocab = safeJsonParse(r.vocabulary_json, []);
  const sentences = safeJsonParse(r.sentences_json, []);
  const quizzes = safeJsonParse(r.quizzes_json, []);
  if (!r.body || vocab.length === 0 || sentences.length === 0 || !r.translation || quizzes.length === 0) {
    incomplete += 1;
    console.log(
      `[WARN] Incomplete parse #${r.id} (stage ${r.stage}) ${r.title}: body=${!!r.body}, vocab=${vocab.length}, sent=${sentences.length}, trans=${!!r.translation}, quiz=${quizzes.length}`
    );
  }
}
console.log(`Verified ${rows.length} articles in DB. Incomplete parses: ${incomplete}`);
if (incomplete > 0 || result.errors.length > 0) {
  process.exitCode = 1;
}
