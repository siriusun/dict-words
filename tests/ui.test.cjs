const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { translationSource } = require('../lexi.user.js');
const source = fs.readFileSync(require.resolve('../lexi.user.js'), 'utf8');

// Exercise the userscript's actual UI callbacks without a browser or user GM data.
function setup(phonetic = '/test/') {
  let shadow;
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
    const entry = { word, fetchedAt: Date.now(), phonetic, audio: '', sourceUrl: '', license: { name: '', url: '' },
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: word, example: '' }] }], translation: '中文' };
    entry.translationSource = translationSource(entry);
    storage.set(prefix + 'word:' + word, entry);
  }
  const events = ['alpha', 'beta', 'alpha'].map((word, index) => ({ word, id: 'history-event-' + index, at: index + 1 }));
  for (const event of events) storage.set(prefix + 'event:' + event.id, event);
  storage.set(prefix + 'study:alpha', { word: 'alpha', addedAt: 1, dueAt: 1, stage: 2, reviews: 3 });
  const context = {
    window, document, Element, TextEncoder, URL, crypto: { randomUUID: () => 'test-revision' },
    GM_info: { script: { version: source.match(/^\/\/ @version\s+(\S+)/m)[1] } },
    getComputedStyle: node => ({ overflowY: 'visible', overflowX: 'visible', ...node.css }),
    setTimeout: () => 0, clearTimeout: () => {},
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
  return { shadow, storage, events, context, Element, click, prefix };
}

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
