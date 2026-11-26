import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getDb } from '../server/db.js';
import { syncDirectory } from '../server/importer.js';
import { parseStructuredMarkdown } from '../server/parser.js';

const question = [
  '1. What did you read?',
  '- A. A newspaper',
  '- B. A book',
].join('\n');

const anotherQuestion = [
  '2. How was it?',
  '- A. Boring',
  '- B. Useful',
].join('\n');

function parseQuiz(section) {
  return parseStructuredMarkdown('# Test\n## Body\nI read a useful book.\n## 阅读自测\n' + section).quizzes;
}

test('a quiz with no valid answer has no answer key', () => {
  assert.equal(parseQuiz(question)[0].answer, '');
  assert.equal(parseQuiz(question + '\n### 答案\n1. D')[0].answer, '');
  assert.equal(parseQuiz(question + '\n### 答案\n2.\n答案：A')[0].answer, '');
});

test('quiz answers can be in a separate Markdown section', () => {
  const [item] = parseQuiz(question + '\n## 答案与解析\n1. **B** —— It was a book.');
  assert.equal(item.answer, 'B');
  assert.equal(item.explanation, 'It was a book.');
});

test('individual details blocks preserve later quiz questions', () => {
  const answer = '\n<details>\n<summary>点击查看解析（答案：B）</summary>\nExplanation\n</details>\n';
  const items = parseQuiz(question + answer + anotherQuestion + answer);
  assert.deepEqual(items.map((item) => item.answer), ['B', 'B']);
});

test('folder sync preserves distinct same-named articles and reading progress', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luminaread-sync-'));
  const db = getDb(':memory:');
  t.after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const first = path.join(dir, 'a', 'shared.md');
  const second = path.join(dir, 'b', 'shared.md');
  fs.mkdirSync(path.dirname(first));
  fs.mkdirSync(path.dirname(second));
  fs.writeFileSync(first, '# First\n## Body\nFirst passage.');
  assert.equal(syncDirectory(db, dir).totalSynced, 1);
  const { id } = db.prepare('SELECT id FROM articles').get();
  db.prepare("UPDATE articles SET read_status = 'completed' WHERE id = ?").run(id);

  fs.writeFileSync(first, '# First revised\n## Body\nFirst passage.');
  fs.writeFileSync(second, '# Second\n## Body\nSecond passage.');
  fs.writeFileSync(path.join(dir, 'misc.md'), '# Personal notes\nNo article body.');
  const result = syncDirectory(db, dir);
  assert.equal(result.totalSynced, 2);
  assert.equal(result.errors.length, 1);

  const rows = db.prepare('SELECT id, title, read_status FROM articles ORDER BY id').all();
  assert.deepEqual(rows.map((row) => [row.id, row.title, row.read_status]), [
    [id, 'First revised', 'completed'],
    [id + 1, 'Second', 'unread'],
  ]);
});
