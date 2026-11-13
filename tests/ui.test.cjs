const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { translationSource, schedule } = require('../lexi.user.js');
const source = fs.readFileSync(require.resolve('../lexi.user.js'), 'utf8');

// Exercise the userscript's actual UI callbacks without a browser or user GM data.
function setup(phonetic = '/test/') {
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
  document.activeElement = new Element('button');
  const window = new Element('window');
  const prefix = 'lexi:v1:';
  const storage = new Map();
  const menus = new Map();
  for (const word of ['alpha', 'beta']) {
    const entry = { word, fetchedAt: clockNow, phonetic, audio: '', sourceUrl: '', license: { name: '', url: '' },
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: word, example: '' }] }], translation: '中文' };
    entry.translationSource = translationSource(entry);
    storage.set(prefix + 'word:' + word, entry);
  }
  const events = ['alpha', 'beta', 'alpha'].map((word, index) => ({ word, id: 'history-event-' + index, at: index + 1 }));
  for (const event of events) storage.set(prefix + 'event:' + event.id, event);
  storage.set(prefix + 'study:alpha', { word: 'alpha', addedAt: clockNow - 5 * 86400000,
    updatedAt: clockNow - 3 * 86400000, dueAt: clockNow - 86400000, stage: 2, reviews: 3,
    lastReviewedAt: clockNow - 3 * 86400000, lastGrade: 'good' });
  const context = {
    window, document, Element, Date: ClockDate, TextEncoder, URL, crypto: { randomUUID: () => 'test-revision' },
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
  assert.deepEqual(shadow.querySelectorAll('.stat').map(node => node.querySelector('strong').textContent), ['0', '1', '1']);
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
  await click(findButton(shadow, '显示释义'));
  storage.set(prefix + 'study:alpha', schedule(storage.get(prefix + 'study:alpha'), 'good', context.Date.now()));
  context.window.listeners.focus.listener();
  assert.equal(shadow.querySelector('.review').querySelector('.word').textContent, 'beta');
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
  assert.ok(shadow.querySelector('.review').querySelector('p').textContent.includes('还有 1 个到期词'));
  await click(findButton(shadow, '继续复习到期词'));
  await click(findButton(shadow, '显示释义'));
  await click(findButton(shadow, '记得 ·'));
  await click(findButton(shadow, '返回复习概览'));
  assert.deepEqual(shadow.querySelectorAll('.stat').map(node => node.querySelector('strong').textContent), ['0', '21', '21']);
  assert.equal(shadow.querySelector('.review-plan').querySelectorAll('.setting').length, 6);
});

test('overview resets today across midnight and cancels its refresh when leaving or closing', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click, advance, timers } = app;
  storage.set(prefix + 'study:alpha', schedule(storage.get(prefix + 'study:alpha'), 'easy', context.Date.now()));
  await click(shadow.querySelectorAll('.tab')[2]);
  assert.equal(shadow.querySelectorAll('.stat')[1].querySelector('strong').textContent, '1');
  advance(86400000);
  assert.equal(shadow.querySelectorAll('.stat')[1].querySelector('strong').textContent, '0');
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
  await click(shadow.querySelector('.phonetic').querySelector('button'));
  assert.equal(requests.length, 2);
  storage.delete(prefix + 'word:alpha');
  requests[1].onload({ status: 200, responseText: JSON.stringify({ simple: { word: [{ 'return-phrase': 'alpha', ukphone: 'ˈælfə' }] } }) });
  await new Promise(setImmediate);
  assert.equal(storage.has(prefix + 'word:alpha'), false);
  assert.equal(shadow.querySelector('.phonetic').querySelector('span').textContent, '音标暂不可用');
});

test('definition refresh preserves supplemental phonetics until the main dictionary supplies its own', async () => {
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
  assert.equal(storage.get(prefix + 'word:alpha').phonetic, '/fresh/');
  assert.equal(storage.get(prefix + 'word:alpha').phoneticSource, undefined);
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
