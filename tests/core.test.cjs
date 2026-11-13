const assert = require('node:assert/strict');
const test = require('node:test');
const { normalize, schedule, csv, dictionary, validateBackup, mergeBackup, ordered, audioUrl, translationSource, translationChunks, youdaoPhonetic } = require('../lexi.user.js');
const now = Date.UTC(2026, 10, 12);
const DAY = 86400000;
const word = dictionary([{ phonetics: [{ text: '/test/', audio: 'https://api.dictionaryapi.dev/media/test.mp3' }],
  meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A test.', example: 'One example.' }] }],
  sourceUrls: ['https://en.wiktionary.org/wiki/test'], license: { name: 'CC BY-SA', url: 'https://creativecommons.org/licenses/by-sa/4.0/' } }], 'test', now);
const study = { word: 'test', addedAt: now, updatedAt: now, dueAt: now, stage: 0, reviews: 0, lastReviewedAt: 0, lastGrade: '' };
const event = { word: 'test', id: '12345678-1234-4123-8123-123456789012', at: now };
const backup = () => structuredClone({ schemaVersion: 1, words: [word], history: [event], book: [study] });

test('only a single English word is queried; punctuation and contractions survive', () => {
  for (const [input, expected] of [['“Serendipity,”', 'serendipity'], ['DON’T', "don't"], ['mother-in-law', 'mother-in-law'], ['(hello)', 'hello'], ["'test'", 'test']]) assert.equal(normalize(input), expected);
  for (const input of ['hello world', 'abc123', '你好', '', 'a--b', '-test', 'x'.repeat(65), null, '<script>']) assert.equal(normalize(input), '');
});
test('review moves through intervals, caps at 60 days, and resets on forgetting', () => {
  let state = study;
  for (const days of [1, 3, 7, 14, 30, 60, 60]) {
    state = schedule(state, 'good', now);
    assert.equal(state.dueAt, now + days * DAY);
  }
  assert.equal(state.reviews, 7);
  assert.equal(schedule(state, 'hard', now).stage, 6);
  assert.equal(schedule(state, 'hard', now).dueAt, now + DAY);
  const forgotten = schedule(state, 'again', now);
  assert.equal(forgotten.stage, 0);
  assert.equal(forgotten.dueAt, now + 600000);
  assert.equal(schedule(forgotten, 'good', now).dueAt, now + DAY);
  assert.throws(() => schedule(state, 'unknown', now));
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
  assert.deepEqual(result.book[0], study);
  assert.equal(result.history[0].word, 'test');
});
test('invalid versions, dangling references, duplicates and invalid progress fail before import', () => {
  const cases = [
    data => { data.schemaVersion = 2; },
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
