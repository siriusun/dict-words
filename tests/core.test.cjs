const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { normalize, schedule, migrateStudy, reviewInterval, csv, dictionary, validateBackup, mergeBackup, ordered, audioUrl, translationSource, translationChunks, youdaoPhonetic } = require('../lexi.user.js');
const now = Date.UTC(2026, 10, 12);
const DAY = 86400000;
const word = dictionary([{ phonetics: [{ text: '/test/', audio: 'https://api.dictionaryapi.dev/media/test.mp3' }],
  meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A test.', example: 'One example.' }] }],
  sourceUrls: ['https://en.wiktionary.org/wiki/test'], license: { name: 'CC BY-SA', url: 'https://creativecommons.org/licenses/by-sa/4.0/' } }], 'test', now);
const study = { word: 'test', addedAt: now, updatedAt: now, dueAt: now, stage: 0, reviews: 0, lastReviewedAt: 0, lastGrade: '' };
const event = { word: 'test', id: '12345678-1234-4123-8123-123456789012', at: now };
const backup = () => structuredClone({ schemaVersion: 1, words: [word], history: [event], book: [study] });

test('vendored FSRS matches the pinned upstream bundle after whitespace normalization', () => {
  const source = fs.readFileSync(require.resolve('../lexi.user.js'), 'utf8');
  const start = source.indexOf('(function (global, factory) {');
  const end = source.indexOf('    // END VENDORED TS-FSRS 5.4.2');
  assert.ok(start > 0 && end > start);
  const bundle = source.slice(start, end).replace(/\r\n/g, '\n').replace(/[\t ]+$/gm, '').trim();
  assert.equal(createHash('sha256').update(bundle).digest('hex'),
    'd67b02ba6a7a3d82d08885876b691cc8615d3dfdfdf4de0e6865a8d8990de09c');
});

test('only a single English word is queried; punctuation and contractions survive', () => {
  for (const [input, expected] of [['“Serendipity,”', 'serendipity'], ['DON’T', "don't"], ['mother-in-law', 'mother-in-law'], ['(hello)', 'hello'], ["'test'", 'test']]) assert.equal(normalize(input), expected);
  for (const input of ['hello world', 'abc123', '你好', '', 'a--b', '-test', 'x'.repeat(65), null, '<script>']) assert.equal(normalize(input), '');
});
test('FSRS uses Anki learning steps and four grades without permanently retiring a word', () => {
  const results = ['again', 'hard', 'good', 'easy'].map(grade => schedule(study, grade, now));
  assert.deepEqual(results.slice(0, 3).map(item => item.dueAt - now), [60000, 360000, 600000]);
  assert.deepEqual(results.map(item => item.fsrs.state), [1, 1, 1, 2]);
  assert.ok(results[3].dueAt > now + DAY);
  assert.equal(results[2].fsrs.learning_steps, 1);
  const graduate = schedule(results[2], 'good', results[2].dueAt);
  assert.equal(graduate.fsrs.state, 2);
  assert.ok(graduate.fsrs.scheduled_days >= 1);
  let state = graduate;
  for (let i = 0; i < 12; i++) {
    const reviewedAt = state.dueAt;
    state = schedule(state, 'good', reviewedAt);
    assert.ok(state.dueAt > reviewedAt && state.dueAt <= reviewedAt + 365 * DAY);
  }
  assert.equal(state.fsrs.scheduled_days, 365);
  for (const grade of ['hard', 'good', 'easy']) {
    assert.equal(schedule(state, grade, state.dueAt).fsrs.scheduled_days, 365);
  }
  assert.equal(state.reviews, 14);
  assert.throws(() => schedule(state, 'unknown', state.dueAt), /未知复习反馈/);
  assert.throws(() => schedule(state, '__proto__', state.dueAt), /未知复习反馈/);
  assert.throws(() => schedule(state, 'good', NaN));
});
test('FSRS adapts to recall difficulty and puts forgotten review cards into relearning', () => {
  let state = schedule(study, 'good', now);
  state = schedule(state, 'good', state.dueAt);
  state = schedule(state, 'good', state.dueAt);
  const [hard, good, easy] = ['hard', 'good', 'easy'].map(grade => schedule(state, grade, state.dueAt));
  assert.ok(hard.dueAt < good.dueAt && good.dueAt < easy.dueAt);
  assert.ok(hard.fsrs.difficulty > good.fsrs.difficulty && good.fsrs.difficulty > easy.fsrs.difficulty);
  const forgotten = schedule(state, 'again', state.dueAt);
  assert.equal(forgotten.fsrs.state, 3);
  assert.equal(forgotten.fsrs.lapses, 1);
  assert.equal(forgotten.dueAt, state.dueAt + 600000);
  assert.ok(forgotten.fsrs.stability < state.fsrs.stability);
  const relearned = schedule(forgotten, 'good', forgotten.dueAt);
  assert.equal(relearned.fsrs.state, 2);
  assert.ok(relearned.fsrs.scheduled_days < good.fsrs.scheduled_days);
  assert.equal(relearned.fsrs.lapses, 1);
  const late = schedule(state, 'good', state.dueAt + 30 * DAY);
  assert.equal(late.fsrs.state, 2);
  assert.ok(late.dueAt > late.lastReviewedAt);
  assert.ok(late.fsrs.scheduled_days >= good.fsrs.scheduled_days);
});
test('legacy migration preserves due dates and counts and does not fabricate review history', () => {
  for (const [index, interval] of [1, 3, 7, 14, 30, 60].entries()) {
    const old = { ...study, stage: index + 1, reviews: index + 2, lastReviewedAt: now,
      lastGrade: 'good', dueAt: now + interval * DAY };
    const original = structuredClone(old);
    const migrated = migrateStudy(old);
    assert.deepEqual(old, original);
    assert.equal(migrated.dueAt, old.dueAt);
    assert.equal(migrated.updatedAt, old.updatedAt);
    assert.equal(migrated.fsrs.stability, interval);
    assert.equal(migrated.fsrs.difficulty, 5);
    assert.equal(migrated.fsrs.state, 2);
    assert.equal(migrated.fsrs.reps, old.reviews);
    assert.equal(schedule(migrated, 'good', old.dueAt).reviews, old.reviews + 1);
    assert.deepEqual(migrateStudy(JSON.parse(JSON.stringify(migrated))), migrated);
  }
  const forgotten = migrateStudy({ ...study, reviews: 3, lastReviewedAt: now, lastGrade: 'again', dueAt: now + 600000 });
  assert.equal(forgotten.fsrs.state, 3);
  assert.ok(forgotten.fsrs.stability > 0);
});
test('FSRS memory and numeric timestamps survive JSON backup, import and subsequent learning', () => {
  const data = validateBackup(backup());
  assert.equal(data.schemaVersion, 2);
  let state = data.book[0];
  for (const grade of ['good', 'good', 'hard', 'easy', 'again', 'hard', 'again', 'good', 'easy']) {
    state = schedule(state, grade, state.dueAt);
    data.book[0] = state;
    const restored = validateBackup(JSON.parse(JSON.stringify(data))).book[0];
    assert.deepEqual(restored, state);
    assert.equal(typeof restored.fsrs.due, 'number');
    assert.equal(typeof restored.fsrs.last_review, 'number');
    assert.deepEqual(schedule(restored, 'good', restored.dueAt), schedule(state, 'good', state.dueAt));
  }
});
test('invalid or inconsistent FSRS backups fail before import', () => {
  const data = validateBackup(backup());
  data.book[0] = schedule(data.book[0], 'easy', now);
  const cases = [
    item => { delete item.fsrs; }, item => { item.fsrs = null; },
    item => { item.fsrs.due++; }, item => { item.fsrs.reps++; },
    item => { item.fsrs.last_review++; }, item => { item.fsrs.state = '2'; },
    item => { item.fsrs.state = 4; }, item => { item.fsrs.stability = NaN; },
    item => { item.fsrs.stability = 0; }, item => { item.fsrs.difficulty = 11; },
    item => { item.fsrs.elapsed_days = -1; }, item => { item.fsrs.scheduled_days = 36501; },
    item => { item.fsrs.learning_steps = 3; }, item => { item.fsrs.lapses = item.reviews + 1; },
    item => { item.lastGrade = ''; }
  ];
  for (const mutate of cases) {
    const invalid = structuredClone(data);
    mutate(invalid.book[0]);
    assert.throws(() => validateBackup(invalid), /备份格式无效/);
  }
  const fresh = validateBackup(backup());
  fresh.book[0].fsrs.state = 2;
  assert.throws(() => validateBackup(fresh));
});
test('review interval labels match the persisted schedule', () => {
  assert.equal(reviewInterval(60000), '1 分钟');
  assert.equal(reviewInterval(360000), '6 分钟');
  assert.equal(reviewInterval(600000), '10 分钟');
  assert.equal(reviewInterval(DAY), '1 天');
  assert.equal(reviewInterval(365 * DAY), '365 天');
});
test('dictionary normalizes missing fields and rejects malformed/no-result responses', () => {
  assert.equal(word.word, 'test');
  assert.equal(word.meanings[0].definitions[0].definition, 'A test.');
  assert.equal(dictionary([{ meanings: [{ definitions: [{ definition: 'Only definition.' }] }] }], 'test', now).audio, '');
  for (const input of [null, {}, [], [null], [{ meanings: [] }], [{ meanings: [{ definitions: [null] }] }]]) assert.throws(() => dictionary(input, 'test', now));
  assert.equal(audioUrl('javascript:alert(1)'), '');
  assert.equal(audioUrl('https://api.dictionaryapi.dev.evil.example/a.mp3'), '');
  assert.equal(audioUrl('https://user:secret@api.dictionaryapi.dev/a.mp3'), '');
  assert.equal(audioUrl('//ssl.gstatic.com/dictionary/test.mp3'), 'https://ssl.gstatic.com/dictionary/test.mp3');
});

test('phonetics use valid text across all dictionary entries, including later root fields', () => {
  const meanings = word.meanings;
  assert.equal(dictionary([{ meanings, phonetics: [{ text: true }, { text: '  ' }, { text: '/valid/' }] }], 'test', now).phonetic, '/valid/');
  assert.equal(dictionary([{ meanings }, { phonetic: ' /later/ ' }], 'test', now).phonetic, '/later/');
});

test('supplemental phonetics match the exact word and support both verified response shapes', () => {
  assert.equal(youdaoPhonetic({ simple: { word: [{ 'return-phrase': 'musculature', ukphone: 'ˈmʌskjələtʃə(r)', usphone: 'ˈmʌskjələtʃər' }] } }, 'musculature'), '/ˈmʌskjələtʃə(r)/');
  assert.equal(youdaoPhonetic({ ec: { word: [{ 'return-phrase': { l: { i: 'etched' } }, usphone: 'etʃt' }] } }, 'etched'), '/etʃt/');
  for (const raw of [null, {}, { simple: { word: {} } },
    { simple: { word: [{ 'return-phrase': 'etch', ukphone: 'etʃ' }] } },
    { simple: { word: [{ 'return-phrase': 'etched', ukphone: true, usphone: ' ' }] } },
    { simple: { word: [{ 'return-phrase': 'etched', ukphone: 'x'.repeat(149) }] } }]) {
    assert.throws(() => youdaoPhonetic(raw, 'etched'));
  }
});

test('supplemental phonetics survive backup/import and a newer definition without phonetics', () => {
  const data = backup();
  Object.assign(data.words[0], { phonetic: '/test/', phoneticSource: 'youdao' });
  const current = validateBackup(data);
  assert.equal(current.words[0].phoneticSource, 'youdao');
  const incoming = backup();
  incoming.words[0].phonetic = '';
  incoming.words[0].fetchedAt++;
  const merged = mergeBackup(current, validateBackup(incoming));
  assert.equal(merged.words[0].phonetic, '/test/');
  assert.equal(merged.words[0].phoneticSource, 'youdao');
  incoming.words[0].phonetic = '/fresh/';
  const refreshed = mergeBackup(current, validateBackup(incoming));
  assert.equal(refreshed.words[0].phonetic, '/fresh/');
  assert.equal(refreshed.words[0].phoneticSource, undefined);
  data.words[0].phoneticSource = 'unknown';
  assert.throws(() => validateBackup(data));
});
test('backup roundtrips all persistent learning data without executing imported strings', () => {
  const data = backup();
  data.words[0].translation = '<img src=x onerror=alert(1)> 测试';
  data.words[0].translatedAt = now;
  const result = validateBackup(JSON.parse(JSON.stringify(data)));
  assert.equal(result.words[0].translation, data.words[0].translation);
  assert.deepEqual(result.book[0], migrateStudy(study));
  assert.equal(result.history[0].word, 'test');
});
test('invalid versions, dangling references, duplicates and invalid progress fail before import', () => {
  const cases = [
    data => { data.schemaVersion = 3; },
    data => { data.history[0].word = 'missing'; },
    data => { data.book[0].stage = -1; },
    data => { data.book[0].reviews = '1'; },
    data => { data.words[0].word = '__proto__'; },
    data => { data.history.push(data.history[0]); },
    data => { data.words[0].meanings[0].definitions[0].definition = ''; },
    data => { data.history[0].id = '../../settings'; },
    data => { data.words[0].fetchedAt = Infinity; },
    data => { data.book[0].dueAt = 9e15; },
    data => { data.words[0].translation = '测试'; }
  ];
  for (const mutate of cases) { const data = backup(); mutate(data); assert.throws(() => validateBackup(data)); }
});
test('merging is idempotent and preserves newer learning progress', () => {
  const original = validateBackup(backup());
  const incoming = validateBackup(backup());
  incoming.book[0] = schedule(incoming.book[0], 'good', now + 1000);
  const merged = mergeBackup(original, incoming);
  assert.equal(merged.history.length, 1);
  assert.equal(merged.book[0].stage, 1);
  assert.deepEqual(mergeBackup(merged, incoming), merged);
  const older = mergeBackup(merged, original);
  assert.equal(older.book[0].stage, 1);
  incoming.history[0].at++;
  assert.throws(() => mergeBackup(original, incoming), /冲突/);
});
test('history preserves repeated words in chronological order with deterministic ties', () => {
  const events = [{ ...event, id: 'b', at: now + 1 }, { ...event, id: 'a' }, { ...event, id: 'c', at: now + 1 }];
  assert.deepEqual(ordered(events, true).map(item => item.id), ['a', 'b', 'c']);
  assert.deepEqual(ordered(events).map(item => item.id), ['c', 'b', 'a']);
  assert.equal(events[0].id, 'b');
});
test('a refreshed definition never inherits a translation for a different definition', () => {
  const original = validateBackup(backup());
  original.words[0].translation = '旧释义';
  original.words[0].translatedAt = now;
  const incoming = validateBackup(backup());
  incoming.words[0].fetchedAt = now + 1000;
  incoming.words[0].meanings[0].definitions[0].definition = 'An updated definition.';
  const merged = mergeBackup(original, incoming);
  assert.equal(merged.words[0].translation, undefined);
  assert.equal(merged.words[0].meanings[0].definitions[0].definition, 'An updated definition.');
});
test('CSV quotes commas, line breaks and quotes, and neutralizes formulas', () => {
  const result = csv([['中文', 'a,b', '"quoted"', 'line\nnext'], ['=1+1', '  @SUM(A1)', '-2', '\tformula']]);
  assert.ok(result.startsWith('\uFEFF"中文","a,b","""quoted""","line\nnext"\r\n'));
  assert.ok(result.includes('"\'=1+1"'));
  assert.ok(result.includes('"\'  @SUM(A1)"'));
  assert.ok(result.includes('"\'-2"'));
  assert.ok(result.includes('"\'\tformula"'));
});
test('multi-sense translation keeps numbering and splits UTF-8 without losing text', () => {
  const entry = structuredClone(word);
  entry.meanings[0].definitions = Array.from({ length: 3 }, (_, i) => ({ definition: 'A long definition. '.repeat(25) + i, example: '' }));
  entry.meanings.push({ partOfSpeech: 'verb', definitions: Array.from({ length: 3 }, (_, i) => ({ definition: 'Another meaning ' + i, example: '' })) });
  const source = translationSource(entry);
  assert.ok(source.includes('1. noun:') && source.includes('6. verb:'));
  const unicode = source + '\n' + '汉字🙂'.repeat(300);
  const chunks = translationChunks(unicode);
  assert.equal(chunks.join(''), unicode);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => Buffer.byteLength(chunk, 'utf8') <= 480));
});
test('rich translations survive backups and invalidate when a later definition changes', () => {
  const data = backup();
  data.words[0].meanings[0].definitions.push({ definition: 'A second sense.', example: '' });
  Object.assign(data.words[0], { translation: '1. 中文第一义\n2. 中文第二义', translatedAt: now, translationSource: translationSource(data.words[0]) });
  const current = validateBackup(data);
  assert.equal(current.words[0].translationSource, data.words[0].translationSource);
  assert.equal(current.words[0].translation, data.words[0].translation);
  const incoming = structuredClone(current);
  incoming.words[0].fetchedAt++;
  incoming.words[0].meanings[0].definitions[1].definition = 'An updated second sense.';
  delete incoming.words[0].translation;
  delete incoming.words[0].translatedAt;
  delete incoming.words[0].translationSource;
  assert.equal(mergeBackup(current, incoming).words[0].translation, undefined);
  data.words[0].translationSource = 123;
  assert.throws(() => validateBackup(data));
});
