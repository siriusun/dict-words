const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { translationSource, schedule, scheduleAll, createStudy, migrateStudy } = require('../lexi.user.js');
const source = fs.readFileSync(require.resolve('../lexi.user.js'), 'utf8');

// Exercise the userscript's actual UI callbacks without a browser or user GM data.
function setup(phonetic = '/test/', phoneticSource = 'youdao') {
  let shadow;
  let clockNow = Date.UTC(2026, 10, 13, 9);
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clockNow])); }
    static now() { return clockNow; }
  }
  const timers = new Map();
  let timerId = 0;
  class Element {
    constructor(tag = 'div') {
      this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {};
      this.className = ''; this.textContent = ''; this.style = {}; this.scrollTop = 0;
      this.scrollLeft = 0; this.scrollHeight = this.clientHeight = 100;
      this.scrollWidth = this.clientWidth = 100; this.css = {};
      this.classList = { toggle: (name, active) => {
        const classes = new Set(this.className.split(' ').filter(Boolean));
        active ? classes.add(name) : classes.delete(name);
        this.className = [...classes].join(' ');
      } };
    }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children = []; this.textContent = ''; this.append(...nodes); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, listener, options) { this.listeners[type] = { listener, options }; }
    attachShadow() { return shadow = new Element('shadow'); }
    get tagName() { return this.tag.toUpperCase(); }
    getClientRects() { return [{}]; }
    focus() { shadow.activeElement = this; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    querySelectorAll(selector) {
      const matches = node => selector.split(',').some(part => part.startsWith('.')
        ? node.className.split(' ').includes(part.slice(1))
        : part === '[tabindex="0"]' ? node.tabIndex === 0 : node.tag === part);
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const document = new Element('document');
  document.documentElement = new Element('html');
  document.createElement = tag => new Element(tag);
  document.createTextNode = text => { const node = new Element('#text'); node.textContent = text; return node; };
  document.activeElement = new Element('button');
  const window = new Element('window');
  const prefix = 'lexi:v1:';
  const storage = new Map();
  const menus = new Map();
  for (const word of ['alpha', 'beta']) {
    const entry = { word, fetchedAt: clockNow, phonetic, ...(phonetic && phoneticSource ? { phoneticSource } : {}),
      audio: '', sourceUrl: '', license: { name: '', url: '' },
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: word, example: '' }] }], translation: '中文' };
    entry.translationSource = translationSource(entry);
    storage.set(prefix + 'word:' + word, entry);
  }
  const events = ['alpha', 'beta', 'alpha'].map((word, index) => ({ word, id: 'history-event-' + index, at: index + 1 }));
  for (const event of events) storage.set(prefix + 'event:' + event.id, event);
  storage.set(prefix + 'study:alpha', { word: 'alpha', addedAt: clockNow - 5 * 86400000,
    updatedAt: clockNow - 3 * 86400000, dueAt: clockNow - 86400000, stage: 2, reviews: 3,
    lastReviewedAt: clockNow - 3 * 86400000, lastGrade: 'good' });
  let uuid = 0;
  const context = {
    window, document, Element, Date: ClockDate, TextEncoder, URL, crypto: { randomUUID: () => 'test-uuid-' + ++uuid },
    confirm: () => true,
    GM_info: { script: { version: source.match(/^\/\/ @version\s+(\S+)/m)[1] } },
    getComputedStyle: node => ({ overflowY: 'visible', overflowX: 'visible', ...node.css }),
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: clockNow + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    GM_getValue: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
    GM_setValue: (key, value) => storage.set(key, value),
    GM_deleteValue: key => storage.delete(key), GM_listValues: () => [...storage.keys()],
    GM_addValueChangeListener: () => {}, GM_registerMenuCommand: (label, callback) => menus.set(label, callback),
    GM_xmlhttpRequest: () => { throw new Error('Unexpected network request'); }
  };
  vm.runInNewContext(source, context);
  menus.get('打开 Lexi 学习中心')();
  const click = async node => {
    assert.ok(node, 'UI control exists');
    node.listeners.click.listener();
    await new Promise(setImmediate);
  };
  const advance = milliseconds => {
    clockNow += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= clockNow && timers.has(id)) { timers.delete(id); timer.callback(); }
    }
  };
  return { shadow, storage, events, context, Element, click, prefix, advance, timers };
}

const findButton = (shadow, label) => shadow.querySelectorAll('button').find(node => node.textContent.startsWith(label));
const openReview = async app => {
  await app.click(app.shadow.querySelectorAll('.tab')[2]);
  await app.click(findButton(app.shadow, '开始复习'));
};

test('review hides answers until recalled, previews four schedules and persists a grade only once', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const original = structuredClone(storage.get(prefix + 'study:alpha'));
  await openReview(app);
  assert.equal(shadow.querySelector('.review-answer'), null);
  assert.equal(findButton(shadow, '记得 ·'), undefined);
  await click(findButton(shadow, '显示释义'));
  assert.ok(shadow.querySelector('.review-answer').querySelector('.sense'));
  for (const [grade, label] of [['again', '忘记'], ['hard', '困难'], ['good', '记得'], ['easy', '轻松']]) {
    const expected = schedule(original, grade, context.Date.now());
    const action = findButton(shadow, label + ' ·');
    assert.ok(action);
    assert.ok(action.title.includes('下次复习：'));
    assert.ok(expected.dueAt > context.Date.now());
  }
  const action = findButton(shadow, '记得 ·');
  await Promise.all([click(action), click(action)]);
  const saved = storage.get(prefix + 'study:alpha');
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), schedule(original, 'good', context.Date.now()));
  assert.ok(shadow.querySelector('.review').querySelector('h2').textContent.includes('本轮已完成'));
  await click(findButton(shadow, '返回复习概览'));
  assert.deepEqual(shadow.querySelectorAll('.stat').map(node => node.querySelector('strong').textContent), ['0', '0', '1', '1']);
  assert.equal(shadow.querySelector('.review-plan').querySelector('.term').textContent, 'alpha');
});

test('each feedback button saves its displayed FSRS interval', async () => {
  for (const [grade, label] of [['again', '忘记'], ['hard', '困难'], ['good', '记得'], ['easy', '轻松']]) {
    const app = setup();
    const { storage, prefix, context, shadow, click } = app;
    const before = structuredClone(storage.get(prefix + 'study:alpha'));
    const expected = schedule(before, grade, context.Date.now());
    await openReview(app);
    await click(findButton(shadow, '显示释义'));
    const action = findButton(shadow, label + ' ·');
    assert.equal(action.textContent, `${label} · ${expected.dueAt - context.Date.now() < 86400000
      ? Math.ceil((expected.dueAt - context.Date.now()) / 60000) + ' 分钟'
      : Math.round((expected.dueAt - context.Date.now()) / 86400000) + ' 天'}`);
    await click(action);
    assert.deepEqual(JSON.parse(JSON.stringify(storage.get(prefix + 'study:alpha'))), expected);
  }
});

test('empty review overview lists the next review and automatically notices when it becomes due', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click, advance } = app;
  const future = schedule(storage.get(prefix + 'study:alpha'), 'again', context.Date.now());
  storage.set(prefix + 'study:alpha', future);
  await click(shadow.querySelectorAll('.tab')[2]);
  assert.equal(findButton(shadow, '开始复习'), undefined);
  assert.ok(shadow.querySelector('.review').querySelector('p').textContent.startsWith('下次复习：'));
  assert.equal(shadow.querySelector('.review-plan').querySelector('.term').textContent, 'alpha');
  advance(future.dueAt - context.Date.now());
  assert.ok(findButton(shadow, '开始复习'));
  assert.equal(shadow.querySelectorAll('.stat')[0].querySelector('strong').textContent, '1');
  await click(findButton(shadow, '开始复习'));
  assert.equal(shadow.querySelector('.review').querySelector('.word').textContent, 'alpha');
  assert.ok(shadow.querySelector('.review').querySelector('.muted').textContent.includes('重新学习'));
});

test('review storage failure preserves the answer and the original progress for retry', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const original = storage.get(prefix + 'study:alpha');
  await openReview(app);
  await click(findButton(shadow, '显示释义'));
  const write = context.GM_setValue;
  context.GM_setValue = () => { throw new Error('Storage unavailable'); };
  await click(findButton(shadow, '记得 ·'));
  assert.equal(storage.get(prefix + 'study:alpha'), original);
  assert.ok(shadow.querySelector('.review-answer'));
  assert.equal(shadow.querySelector('.toast').textContent, 'Storage unavailable');
  context.GM_setValue = write;
  await click(findButton(shadow, '记得 ·'));
  assert.equal(storage.get(prefix + 'study:alpha').reviews, original.reviews + 1);
});

test('a grade cannot overwrite progress already saved in another tab or resurrect an unstarred word', async () => {
  for (const removed of [false, true]) {
    const app = setup();
    const { shadow, storage, prefix, context, click } = app;
    await openReview(app);
    await click(findButton(shadow, '显示释义'));
    const action = findButton(shadow, '记得 ·');
    const updated = schedule(storage.get(prefix + 'study:alpha'), 'easy', context.Date.now());
    if (removed) storage.delete(prefix + 'study:alpha');
    else storage.set(prefix + 'study:alpha', updated);
    await click(action);
    assert.equal(storage.get(prefix + 'study:alpha'), removed ? undefined : updated);
    assert.equal(shadow.querySelector('.toast').textContent, '该词已在其他页面更新，已跳过');
  }
});

test('skipping a stale revealed card does not expose the next word answer', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  storage.set(prefix + 'study:beta', { ...storage.get(prefix + 'study:alpha'), word: 'beta' });
  await openReview(app);
  const first = shadow.querySelector('.review').querySelector('.word').textContent;
  const second = first === 'alpha' ? 'beta' : 'alpha';
  await click(findButton(shadow, '显示释义'));
  storage.set(prefix + 'study:' + first, schedule(storage.get(prefix + 'study:' + first), 'good', context.Date.now()));
  context.window.listeners.focus.listener();
  assert.equal(shadow.querySelector('.review').querySelector('.word').textContent, second);
  assert.equal(shadow.querySelector('.review-answer'), null);
  assert.ok(findButton(shadow, '显示释义'));
});

test('round limit keeps all remaining due words available and today counts distinct words', async () => {
  const app = setup();
  const { shadow, storage, prefix, click } = app;
  for (let i = 0; i < 20; i++) {
    const word = 'extra' + String.fromCharCode(97 + i);
    storage.set(prefix + 'word:' + word, { ...storage.get(prefix + 'word:alpha'), word });
    storage.set(prefix + 'study:' + word, { ...storage.get(prefix + 'study:alpha'), word });
  }
  await openReview(app);
  for (let i = 0; i < 20; i++) {
    await click(findButton(shadow, '显示释义'));
    await click(findButton(shadow, '记得 ·'));
  }
  assert.ok(shadow.querySelector('.review').querySelector('p').textContent.includes('还有 1 张待学'));
  await click(findButton(shadow, '继续下一轮'));
  await click(findButton(shadow, '显示释义'));
  await click(findButton(shadow, '记得 ·'));
  await click(findButton(shadow, '返回复习概览'));
  assert.deepEqual(shadow.querySelectorAll('.stat').map(node => node.querySelector('strong').textContent), ['0', '0', '21', '21']);
  assert.equal(shadow.querySelector('.review-plan').querySelectorAll('.setting').length, 6);
});

test('overview resets today at the learning-day boundary and cancels its refresh when leaving or closing', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click, advance, timers } = app;
  storage.set(prefix + 'study:alpha', schedule(storage.get(prefix + 'study:alpha'), 'easy', context.Date.now()));
  await click(shadow.querySelectorAll('.tab')[2]);
  assert.equal(shadow.querySelectorAll('.stat')[2].querySelector('strong').textContent, '1');
  advance(86400000);
  assert.equal(shadow.querySelectorAll('.stat')[2].querySelector('strong').textContent, '0');
  await click(shadow.querySelectorAll('.tab')[1]);
  assert.equal(timers.size, 0);
  await click(shadow.querySelectorAll('.tab')[2]);
  assert.equal(timers.size, 1);
  await click(shadow.querySelectorAll('button').find(node => node.attributes['aria-label'] === '关闭学习中心'));
  assert.equal(timers.size, 0);
});

test('deleting one repeated history event preserves other events, cache and study progress', async () => {
  const { shadow, storage, events, click, prefix } = setup();
  const cache = storage.get(prefix + 'word:alpha');
  const study = storage.get(prefix + 'study:alpha');
  await click(shadow.querySelector('.item'));
  await click(shadow.querySelector('.history-delete'));
  assert.equal(storage.has(prefix + 'event:' + events[2].id), false);
  assert.ok(storage.has(prefix + 'event:' + events[0].id));
  assert.ok(storage.has(prefix + 'event:' + events[1].id));
  assert.equal(storage.get(prefix + 'word:alpha'), cache);
  assert.equal(storage.get(prefix + 'study:alpha'), study);
  assert.equal(shadow.querySelectorAll('.history-delete').length, 2);
  assert.ok(shadow.querySelector('.subheading').textContent.startsWith('2 次查询'));
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'beta');
  assert.equal(shadow.activeElement, shadow.querySelector('.history-delete'));
  await click(shadow.querySelector('.history-delete'));
  await click(shadow.querySelector('.history-delete'));
  assert.equal(shadow.querySelectorAll('.history-delete').length, 0);
  assert.ok(shadow.querySelector('.subheading').textContent.startsWith('0 次查询'));
  assert.equal(shadow.activeElement.attributes['aria-label'], '筛选已保存单词');
});

test('failed deletion leaves the event and shows the storage error', async () => {
  const { shadow, storage, context, click } = setup();
  const before = [...storage.entries()];
  context.GM_deleteValue = () => { throw new Error('Storage unavailable'); };
  await click(shadow.querySelector('.history-delete'));
  assert.deepEqual([...storage.entries()], before);
  assert.equal(shadow.querySelector('.toast').textContent, 'Storage unavailable');
});

test('Youdao replaces main dictionary phonetics once, merges concurrent translation, and is reused in review', async () => {
  const { shadow, storage, prefix, context, click } = setup('/main/', '');
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  assert.equal(shadow.querySelector('.phonetic').querySelector('span').textContent, '/main/');
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 1);
  const current = storage.get(prefix + 'word:alpha');
  storage.set(prefix + 'word:alpha', { ...current, translation: '刚更新的中文' });
  requests[0].onload({ status: 200, responseText: JSON.stringify({ simple: { word: [{ 'return-phrase': 'alpha', ukphone: 'ˈælfə' }] } }) });
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.phonetic').querySelector('span').textContent, '/ˈælfə/');
  assert.equal(storage.get(prefix + 'word:alpha').phoneticSource, 'youdao');
  assert.equal(storage.get(prefix + 'word:alpha').translation, '刚更新的中文');
  await openReview({ shadow, click });
  assert.equal(requests.length, 1);
});

test('playback stays next to phonetics in history, book and review', async () => {
  const app = setup();
  for (const screen of ['history', 'book', 'review']) {
    if (screen === 'review') await openReview(app);
    else {
      await app.click(app.shadow.querySelectorAll('.tab')[screen === 'history' ? 0 : 1]);
      await app.click(app.shadow.querySelector('.item'));
    }
    const phonetic = app.shadow.querySelector('.phonetic');
    const play = findButton(app.shadow, '▷');
    assert.equal(phonetic.children[0].textContent, '/test/');
    assert.equal(phonetic.children[1], play);
    assert.equal(app.shadow.querySelectorAll('button').filter(node => node.textContent.startsWith('▷')).length, 1);
    await app.click(play);
    assert.equal(app.shadow.querySelector('.toast').textContent, '当前浏览器没有可用的朗读功能');
  }
});

test('Youdao failure keeps main phonetics and playback available with explicit retry', async () => {
  const { shadow, context, click } = setup('/main/', '');
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  requests[0].onerror();
  await new Promise(setImmediate);
  const phonetic = shadow.querySelector('.phonetic');
  assert.equal(phonetic.children[0].textContent, '/main/');
  assert.equal(phonetic.children[1].attributes['aria-label'], '播放单词发音');
  assert.ok(phonetic.querySelectorAll('span').some(node => node.textContent === '有道音标暂不可用'));
  assert.ok(phonetic.title.includes('网络连接失败'));
  await click(findButton(phonetic, '重试'));
  requests[1].onload({ status: 200, responseText: JSON.stringify({ simple: { word: [{ 'return-phrase': 'alpha', ukphone: 'ˈælfə' }] } }) });
  await new Promise(setImmediate);
  assert.equal(phonetic.children[0].textContent, '/ˈælfə/');
  assert.equal(findButton(phonetic, '重试'), undefined);
});

test('missing cached phonetics fill once, merge concurrent translation, and are reused in review', async () => {
  const { shadow, storage, prefix, context, click } = setup('');
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 1, 'rerender shares the pending pronunciation request');
  assert.equal(new URL(requests[0].url).hostname, 'dict.youdao.com');
  const current = storage.get(prefix + 'word:alpha');
  storage.set(prefix + 'word:alpha', { ...current, translation: '刚更新的中文' });
  requests[0].onload({ status: 200, responseText: JSON.stringify({ simple: { word: [{ 'return-phrase': 'alpha', ukphone: 'ˈælfə' }] } }) });
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.phonetic').querySelector('span').textContent, '/ˈælfə/');
  assert.equal(storage.get(prefix + 'word:alpha').phoneticSource, 'youdao');
  assert.equal(storage.get(prefix + 'word:alpha').translation, '刚更新的中文');
  assert.equal([...storage.keys()].filter(key => key.startsWith(prefix + 'event:')).length, 3);
  await click(shadow.querySelectorAll('.tab')[2]);
  await click(shadow.querySelectorAll('button').find(node => node.textContent === '开始复习'));
  assert.equal(shadow.querySelector('.phonetic').querySelector('span').textContent, '/ˈælfə/');
  assert.equal(requests.length, 1, 'review reuses the saved phonetic');
});

test('failed phonetics can be retried, and a late response cannot recreate a deleted word', async () => {
  const { shadow, storage, prefix, context, click } = setup('');
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 1);
  requests[0].onerror();
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.phonetic').querySelector('span').textContent, '音标暂不可用');
  await click(findButton(shadow.querySelector('.phonetic'), '重试'));
  assert.equal(requests.length, 2);
  storage.delete(prefix + 'word:alpha');
  requests[1].onload({ status: 200, responseText: JSON.stringify({ simple: { word: [{ 'return-phrase': 'alpha', ukphone: 'ˈælfə' }] } }) });
  await new Promise(setImmediate);
  assert.equal(storage.has(prefix + 'word:alpha'), false);
  assert.equal(shadow.querySelector('.phonetic').querySelector('span').textContent, '音标暂不可用');
});

test('definition refresh preserves preferred Youdao phonetics even when the main dictionary supplies its own', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  const query = shadow.querySelector('.search');
  query.querySelector('input').value = 'alpha';
  const entry = storage.get(prefix + 'word:alpha');
  storage.set(prefix + 'word:alpha', { ...entry, fetchedAt: 1, phoneticSource: 'youdao' });
  await click(query.querySelector('button'));
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).hostname, 'api.dictionaryapi.dev');
  requests[0].onload({ status: 200, responseText: JSON.stringify([{ meanings: entry.meanings }]) });
  await new Promise(setImmediate);
  assert.equal(storage.get(prefix + 'word:alpha').phonetic, '/test/');
  assert.equal(storage.get(prefix + 'word:alpha').phoneticSource, 'youdao');
  assert.equal(requests.length, 1);
  storage.set(prefix + 'word:alpha', { ...storage.get(prefix + 'word:alpha'), fetchedAt: 1 });
  await click(query.querySelector('button'));
  requests[1].onload({ status: 200, responseText: JSON.stringify([{ meanings: entry.meanings, phonetic: '/fresh/' }]) });
  await new Promise(setImmediate);
  assert.equal(storage.get(prefix + 'word:alpha').phonetic, '/test/');
  assert.equal(storage.get(prefix + 'word:alpha').phoneticSource, 'youdao');
  assert.equal(requests.length, 2, 'definition refresh reuses saved Youdao phonetics');
});

test('deleting an unselected filtered event preserves selection and scroll positions', async () => {
  const { shadow, storage, events, prefix, click } = setup();
  const search = shadow.querySelector('.library-list').querySelector('input');
  search.value = 'alpha';
  search.listeners.input.listener();
  await click(shadow.querySelector('.item'));
  shadow.querySelector('.list').scrollTop = 60;
  shadow.querySelector('.detail-pane').scrollTop = 120;
  await click(shadow.querySelectorAll('.history-delete')[1]);
  assert.ok(storage.has(prefix + 'event:' + events[2].id));
  assert.equal(storage.has(prefix + 'event:' + events[0].id), false);
  assert.equal(shadow.querySelector('.library-list').querySelector('input').value, 'alpha');
  assert.equal(shadow.querySelectorAll('.history-delete').length, 1);
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'alpha');
  assert.equal(shadow.querySelector('.list').scrollTop, 60);
  assert.equal(shadow.querySelector('.detail-pane').scrollTop, 120);
});

test('modal and lookup card contain wheel events, while internal scrolling and zoom remain native', () => {
  const { shadow, Element } = setup();
  for (const selector of ['.overlay', '.popover']) {
    const surface = shadow.querySelector(selector);
    const handler = surface.listeners.wheel;
    assert.ok(handler, selector + ' guards wheel events');
    assert.equal(handler.options.passive, false);
    const pane = new Element();
    pane.css = { overflowY: 'auto', overflowX: 'auto' };
    const background = new Element();
    background.css = { overflowY: 'auto', overflowX: 'auto' };
    background.scrollHeight = background.scrollWidth = 2000;
    const fire = (deltaY, deltaX = 0, ctrlKey = false) => {
      const event = { deltaY, deltaX, ctrlKey, currentTarget: surface, blocked: false, stopped: false,
        composedPath: () => [pane, surface, background],
        preventDefault() { this.blocked = true; }, stopPropagation() { this.stopped = true; } };
      handler.listener(event);
      assert.equal(event.stopped, true);
      return event.blocked;
    };
    assert.equal(fire(100), true, 'short content cannot scroll the page');
    pane.scrollHeight = 500;
    assert.equal(fire(100), false, 'native scrolling works inside a tall pane');
    assert.equal(fire(-100), true, 'upper boundary is contained');
    pane.scrollTop = 400;
    assert.equal(fire(100), true, 'lower boundary is contained');
    assert.equal(fire(-100), false);
    assert.equal(fire(0, 100), true, 'horizontal wheel cannot leak either');
    pane.scrollWidth = 500;
    assert.equal(fire(0, 100), false);
    pane.scrollLeft = 400;
    assert.equal(fire(0, 100), true);
    assert.equal(fire(100, 0, true), false, 'Ctrl+wheel browser zoom remains available');
    pane.css = { overflowY: 'visible', overflowX: 'visible' };
    assert.equal(fire(-100), true, 'non-scroll regions cannot scroll the page');
  }
});

test('auto-book setting controls whether looked-up words enter vocabulary book without resetting existing progress', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  const alphaProgress = structuredClone(storage.get(prefix + 'study:alpha'));
  for (const word of ['gamma', 'delta']) {
    const entry = { ...storage.get(prefix + 'word:alpha'), word,
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: word, example: '' }] }] };
    entry.translationSource = translationSource(entry);
    storage.set(prefix + 'word:' + word, entry);
  }
  await click(shadow.querySelectorAll('.tab')[3]);
  const settingRow = shadow.querySelectorAll('.setting').find(row => row.querySelector('span')?.textContent === '查词直接进入生词本');
  assert.ok(settingRow);
  const checkbox = settingRow.querySelector('input');
  assert.equal(checkbox.checked, false);

  const query = shadow.querySelector('.search');
  query.querySelector('input').value = 'gamma';
  await click(query.querySelector('button'));
  assert.equal(storage.has(prefix + 'study:gamma'), false);
  assert.equal(shadow.querySelector('.list-star').textContent, '☆');
  assert.equal(shadow.querySelector('.list-star').attributes['aria-pressed'], 'false');

  await click(shadow.querySelectorAll('.tab')[3]);
  const toggle = shadow.querySelectorAll('.setting').find(row => row.querySelector('span')?.textContent === '查词直接进入生词本').querySelector('input');
  toggle.checked = true;
  toggle.listeners.change.listener();
  assert.equal(storage.get(prefix + 'settings').autoBook, true);

  query.querySelector('input').value = 'delta';
  await click(query.querySelector('button'));
  assert.equal(storage.get(prefix + 'study:delta')?.fsrs.state, 0);
  assert.equal(shadow.querySelector('.list-star').textContent, '★');
  assert.equal(shadow.querySelector('.list-star').attributes['aria-pressed'], 'true');

  query.querySelector('input').value = 'alpha';
  await click(query.querySelector('button'));
  assert.deepEqual(storage.get(prefix + 'study:alpha'), alphaProgress);
});

test('list star buttons toggle collection in history and vocabulary book while detail pane omits star button', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  await click(shadow.querySelector('.item'));
  assert.equal(shadow.querySelector('.detail-pane').querySelectorAll('button')
    .some(node => node.textContent.includes('收藏')), false);
  assert.deepEqual(shadow.querySelectorAll('.list-star').map(node => node.textContent), ['★', '☆', '★']);

  shadow.querySelector('.list').scrollTop = 50;
  shadow.querySelector('.detail-pane').scrollTop = 90;
  await click(shadow.querySelectorAll('.list-star')[1]);
  assert.equal(storage.has(prefix + 'study:beta'), true);
  assert.deepEqual(shadow.querySelectorAll('.list-star').map(node => node.textContent), ['★', '★', '★']);
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'alpha');
  assert.equal(shadow.querySelector('.list').scrollTop, 50);
  assert.equal(shadow.querySelector('.detail-pane').scrollTop, 90);

  context.confirm = () => false;
  await click(shadow.querySelectorAll('.list-star')[0]);
  assert.equal(storage.has(prefix + 'study:alpha'), true);

  context.confirm = () => true;
  await click(shadow.querySelectorAll('.list-star')[0]);
  assert.equal(storage.has(prefix + 'study:alpha'), false);
  assert.deepEqual(shadow.querySelectorAll('.list-star').map(node => node.textContent), ['☆', '★', '☆']);
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'alpha');

  await click(shadow.querySelectorAll('.tab')[1]);
  assert.ok(shadow.querySelector('.subheading').textContent.startsWith('1 个词'));
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word'), null);
  assert.deepEqual(shadow.querySelectorAll('.list-star').map(node => node.textContent), ['★']);
  await click(shadow.querySelector('.item'));
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'beta');
  assert.equal(shadow.querySelector('.detail-pane').querySelectorAll('button')
    .some(node => node.textContent.includes('收藏')), false);
  await click(shadow.querySelector('.list-star'));
  assert.equal(storage.has(prefix + 'study:beta'), false);
  assert.ok(shadow.querySelector('.subheading').textContent.startsWith('0 个词'));
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word'), null);
  assert.equal(shadow.activeElement.attributes['aria-label'], '筛选已保存单词');
});

const DAY = 86400000;
const json = value => JSON.parse(JSON.stringify(value));
const textOf = node => [node.textContent, ...node.children.map(textOf)].join('');
const currentWord = shadow => shadow.querySelector('.review').querySelector('.word')?.textContent;
const addWord = (app, word, study) => {
  app.storage.set(app.prefix + 'word:' + word, { ...app.storage.get(app.prefix + 'word:alpha'), word });
  if (study) app.storage.set(app.prefix + 'study:' + word, { ...study, word });
};
const useSettings = (app, value) => {
  app.storage.set(app.prefix + 'settings', value);
  app.context.window.listeners.focus.listener();
};
const press = (app, key, target = { tagName: 'DIV' }, extra = {}) => {
  app.shadow.listeners.keydown.listener({ key, composedPath: () => [target], preventDefault() {}, stopPropagation() {}, ...extra });
  return new Promise(setImmediate);
};
const answerWith = async (app, label) => {
  await app.click(findButton(app.shadow, '显示'));
  await app.click(findButton(app.shadow, label + ' ·'));
};

test('learning steps return within the same round, waiting for due cards before showing them early', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, advance } = app;
  addWord(app, 'gamma', createStudy('gamma', context.Date.now() - 1000));
  storage.set(prefix + 'study:beta', createStudy('beta', context.Date.now() - 2000));
  await openReview(app);
  assert.equal(currentWord(shadow), 'alpha');
  await answerWith(app, '记得');
  assert.equal(currentWord(shadow), 'beta');
  await answerWith(app, '忘记');
  assert.equal(currentWord(shadow), 'gamma');
  advance(60000);
  await answerWith(app, '记得');
  assert.equal(currentWord(shadow), 'beta');
  assert.ok(shadow.querySelector('.review').querySelector('.muted').textContent.includes('学习中'));
  await answerWith(app, '记得');
  assert.equal(currentWord(shadow), 'gamma');
  await answerWith(app, '记得');
  assert.equal(currentWord(shadow), 'beta');
  await answerWith(app, '记得');
  assert.ok(shadow.querySelector('.review').querySelector('h2').textContent.includes('本轮已完成'));
  for (const word of ['beta', 'gamma']) assert.equal(storage.get(prefix + 'study:' + word).fsrs.state, 2);
  assert.deepEqual(json(storage.get(prefix + 'study:beta').log.map(entry => entry.rating)), [1, 3, 3]);
});

test('daily new-word limit caps rounds and explains when today\'s new words are used up', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  addWord(app, 'gamma', createStudy('gamma', context.Date.now() - 1000));
  storage.set(prefix + 'study:beta', createStudy('beta', context.Date.now() - 2000));
  useSettings(app, { newPerDay: 1 });
  await click(shadow.querySelectorAll('.tab')[2]);
  const stats = () => shadow.querySelectorAll('.stat').map(node => node.querySelector('strong').textContent);
  assert.deepEqual(stats(), ['1', '1', '0', '3']);
  assert.ok(textOf(shadow.querySelector('.review')).includes('本轮 2 张：复习 1 · 新词 1'));
  await click(findButton(shadow, '开始复习'));
  await answerWith(app, '记得');
  assert.equal(currentWord(shadow), 'beta');
  await answerWith(app, '轻松');
  assert.ok(textOf(shadow.querySelector('.review')).includes('本轮已完成'));
  await click(findButton(shadow, '返回复习概览'));
  assert.deepEqual(stats(), ['0', '0', '2', '3']);
  assert.ok(textOf(shadow.querySelector('.review')).includes('今日新词上限 1 个已用完，还有 1 个新词'));
  assert.equal(findButton(shadow, '开始复习'), undefined);
});

test('overview reports true recent retention and flags leeches on the overview and the card', async () => {
  const app = setup();
  const { shadow, storage, prefix, click } = app;
  const alpha = migrateStudy(storage.get(prefix + 'study:alpha'));
  storage.set(prefix + 'study:alpha', { ...alpha, reviews: 9, fsrs: { ...alpha.fsrs, reps: 9, lapses: 8 } });
  await click(shadow.querySelectorAll('.tab')[2]);
  const insight = () => textOf(shadow.querySelector('.review-insight'));
  assert.ok(insight().includes('这里会显示近 30 天的真实记得率'));
  assert.ok(insight().includes('难记词 1 个') && insight().includes('alpha'));
  await click(findButton(shadow, '开始复习'));
  assert.ok(textOf(shadow.querySelector('.review')).includes('难记词：已忘记 8 次'));
  await answerWith(app, '记得');
  await click(findButton(shadow, '返回复习概览'));
  assert.ok(insight().includes('近 30 天长期复习记得率 100%（1 次），目标 90%'));
  assert.ok(app.storage.get(prefix + 'study:alpha').log[0].state === 2);
});

test('saving uses the displayed preview, and a preview older than 10 minutes is recomputed first', async () => {
  for (const wait of [30000, 11 * 60000]) {
    const app = setup();
    const { shadow, storage, prefix, context, click, advance } = app;
    const original = structuredClone(storage.get(prefix + 'study:alpha'));
    await openReview(app);
    const shownAt = context.Date.now();
    await click(findButton(shadow, '显示释义'));
    advance(wait);
    await click(findButton(shadow, '记得 ·'));
    if (wait < 600000) {
      assert.deepEqual(json(storage.get(prefix + 'study:alpha')), scheduleAll(original, shownAt).good);
      continue;
    }
    assert.deepEqual(storage.get(prefix + 'study:alpha'), original);
    assert.ok(shadow.querySelector('.toast').textContent.includes('超过 10 分钟'));
    await click(findButton(shadow, '记得 ·'));
    assert.deepEqual(json(storage.get(prefix + 'study:alpha')), schedule(original, 'good', shownAt + wait));
  }
});

test('saved reading context appears on the card with the word highlighted', async () => {
  const app = setup();
  const { shadow, storage, prefix } = app;
  storage.set(prefix + 'event:context-event-1', { word: 'alpha', id: 'context-event-1', at: 10,
    context: 'We met. The Alpha wolf led the pack. Then', title: '', sourceUrl: '' });
  await openReview(app);
  const line = shadow.querySelector('.context-line');
  assert.equal(textOf(line), 'The Alpha wolf led the pack.');
  assert.equal(line.querySelector('mark').textContent, 'Alpha');
});

test('keyboard reveals and grades the focused card, and undo restores progress and the card', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  storage.set(prefix + 'study:beta', { ...storage.get(prefix + 'study:alpha'), word: 'beta' });
  await openReview(app);
  const first = currentWord(shadow);
  const before = json(storage.get(prefix + 'study:' + first));
  assert.equal(shadow.activeElement, findButton(shadow, '显示释义'));
  await press(app, ' ');
  assert.ok(shadow.querySelector('.review-answer'));
  assert.equal(shadow.activeElement, findButton(shadow, '记得 ·'));
  await press(app, 'r');
  assert.equal(shadow.querySelector('.toast').textContent, '当前浏览器没有可用的朗读功能');
  await press(app, '1', { tagName: 'INPUT' });
  assert.equal(storage.get(prefix + 'study:' + first).lastGrade, 'good');
  await press(app, '2');
  assert.equal(storage.get(prefix + 'study:' + first).lastGrade, 'hard');
  assert.notEqual(currentWord(shadow), first);
  await press(app, 'z', undefined, { ctrlKey: true });
  assert.deepEqual(json(storage.get(prefix + 'study:' + first)), before);
  assert.equal(currentWord(shadow), first);
  assert.equal(shadow.querySelector('.review-answer'), null);
  assert.equal(shadow.querySelector('.toast').textContent, `已撤销 ${first} 的评分`);
  await press(app, 'Enter');
  await press(app, '3');
  storage.set(prefix + 'study:' + first, schedule(storage.get(prefix + 'study:' + first), 'easy', context.Date.now() + 1000));
  const elsewhere = storage.get(prefix + 'study:' + first);
  await click(findButton(shadow, '撤销上一次'));
  assert.equal(storage.get(prefix + 'study:' + first), elsewhere);
  assert.equal(shadow.querySelector('.toast').textContent, '该词已在其他页面更新，无法撤销');
});

test('the answer side fills a missing Chinese translation', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  const { translation, translationSource: source, ...entry } = storage.get(prefix + 'word:alpha');
  storage.set(prefix + 'word:alpha', entry);
  await openReview(app);
  assert.equal(requests.length, 0);
  await click(findButton(shadow, '显示释义'));
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.startsWith('https://api.mymemory.translated.net/'));
  requests[0].onload({ status: 200, responseText: JSON.stringify({ responseStatus: 200, responseData: { translatedText: '阿尔法' } }) });
  await new Promise(setImmediate);
  assert.equal(storage.get(prefix + 'word:alpha').translation, '阿尔法');
  assert.ok(textOf(shadow.querySelector('.review-answer')).includes('阿尔法'));
});

test('optional reverse cards start after the meaning card graduates and keep separate progress', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  storage.set(prefix + 'study:alpha', schedule(storage.get(prefix + 'study:alpha'), 'easy', context.Date.now() - DAY));
  const meaning = storage.get(prefix + 'study:alpha');
  await click(shadow.querySelectorAll('.tab')[2]);
  assert.equal(findButton(shadow, '开始复习'), undefined);
  useSettings(app, { reverse: true });
  assert.equal(shadow.querySelectorAll('.stat')[1].querySelector('strong').textContent, '1');
  await click(findButton(shadow, '开始复习'));
  const card = shadow.querySelector('.review');
  assert.equal(currentWord(shadow), undefined);
  assert.ok(card.querySelector('.muted').textContent.includes('反向'));
  assert.equal(card.querySelector('.recall-prompt').querySelector('.translation-copy').textContent, '中文');
  const spelling = card.querySelector('.spelling');
  assert.equal(shadow.activeElement, spelling);
  spelling.value = 'Alpha';
  spelling.listeners.input.listener();
  spelling.listeners.keydown.listener({ key: 'Enter', preventDefault() {} });
  await new Promise(setImmediate);
  assert.ok(textOf(shadow.querySelector('.review')).includes('✓ 拼写正确'));
  assert.equal(currentWord(shadow), 'alpha');
  await click(findButton(shadow, '记得 ·'));
  assert.equal(storage.get(prefix + 'recall:alpha').fsrs.state, 1);
  assert.equal(storage.get(prefix + 'study:alpha'), meaning);
  await answerWith(app, '记得');
  assert.equal(storage.get(prefix + 'recall:alpha').fsrs.state, 2);
  await click(shadow.querySelectorAll('.tab')[1]);
  await click(shadow.querySelector('.list-star'));
  assert.equal(storage.has(prefix + 'study:alpha'), false);
  assert.equal(storage.has(prefix + 'recall:alpha'), false);
});

test('review settings validate and persist the new-word limit and target retention used by previews', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  await click(shadow.querySelectorAll('.tab')[3]);
  const limit = shadow.querySelector('.number');
  limit.value = '500';
  limit.listeners.change.listener();
  assert.equal(storage.get(prefix + 'settings'), undefined);
  assert.equal(limit.value, '20');
  limit.value = '5';
  limit.listeners.change.listener();
  const select = shadow.querySelectorAll('select')[0];
  select.value = '0.95';
  select.listeners.change.listener();
  assert.equal(storage.get(prefix + 'settings').newPerDay, 5);
  assert.equal(storage.get(prefix + 'settings').retention, 0.95);
  const original = structuredClone(storage.get(prefix + 'study:alpha'));
  await openReview(app);
  await click(findButton(shadow, '显示释义'));
  await click(findButton(shadow, '记得 ·'));
  const saved = json(storage.get(prefix + 'study:alpha'));
  assert.deepEqual(saved, schedule(original, 'good', context.Date.now(), 0.95));
  assert.ok(saved.dueAt < schedule(original, 'good', context.Date.now()).dueAt);
});