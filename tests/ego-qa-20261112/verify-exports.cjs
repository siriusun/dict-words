const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateBackup } = require('../../lexi.user.js');
const root = path.resolve(__dirname, '../../artifacts/ego-qa-20261112');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'backup.json'), 'utf8'));
const data = validateBackup(raw);
const afterMerge = validateBackup(JSON.parse(fs.readFileSync(path.join(root, 'backup-after-merge.json'), 'utf8')));
const canonical = value => ({ ...value, words: [...value.words].sort((a, b) => a.word.localeCompare(b.word)), book: [...value.book].sort((a, b) => a.word.localeCompare(b.word)) });
assert.deepEqual(canonical(afterMerge), canonical(data), 'Importing the same backup must preserve every word, history event and review record');
assert.equal(data.history.length, 4);
assert.deepEqual(data.history.map(item => item.word), ['serendipity', 'serendipity', 'curiosity', 'practice']);
assert.equal(data.words.find(item => item.word === 'serendipity').translation.length > 0, true);
const book = new Map(data.book.map(item => [item.word, item]));
for (const [word, grade, stage, delay] of [['serendipity', 'good', 1, 86400000], ['curiosity', 'again', 0, 600000], ['practice', 'hard', 0, 86400000]]) {
  const record = book.get(word);
  assert.equal(record.lastGrade, grade);
  assert.equal(record.stage, stage);
  assert.equal(record.dueAt - record.lastReviewedAt, delay);
  assert.equal(record.reviews, 1);
}
for (const filename of ['history.csv', 'book.csv']) {
  const body = fs.readFileSync(path.join(root, filename), 'utf8');
  assert.ok(body.startsWith('\uFEFF'));
  assert.ok(body.includes('serendipity'));
  assert.ok(body.includes('一系列'));
}
console.log('Actual browser exports passed: history order, translation cache, all 3 review schedules, idempotent import, JSON validation and 2 CSV files.');
