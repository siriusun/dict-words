const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { translationSource, schedule, scheduleAll, createStudy, migrateStudy } = require('../lexi.user.js');
const source = fs.readFileSync(require.resolve('../lexi.user.js'), 'utf8');

// Exercise the userscript's actual UI callbacks without a browser or user GM data.
function setup(phonetic = '/test/', phoneticSource = 'youdao', options = {}) {
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
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
      this.parent = null;
    }
    get isConnected() { return this.tag === 'html' || Boolean(this.parent?.isConnected); }
    get childNodes() { return this.children; }
    get parentElement() { return this.parent || null; }
    closest(selector) {
      if (selector.split(',').some(part => part.startsWith('.') ? this.className.split(' ').includes(part.slice(1))
        : part.startsWith('[contenteditable]') ? this.attributes.contenteditable && this.attributes.contenteditable !== 'false'
        : this.tag === part)) return this;
      return this.parent?.closest(selector) || null;
    }
    getBoundingClientRect() { return { left: 20, right: 120, top: 30, bottom: 70, width: 100, height: 40 }; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
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
        : part === '[tabindex="0"]' ? node.tabIndex === 0
        : /^\[[\w-]+\]$/.test(part) ? part.slice(1, -1) in node.attributes : node.tag === part);
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
  window.innerWidth = 1100; window.innerHeight = 800;
  window.getSelection = () => null;
  const prefix = 'lexi:v1:';
  const storage = new Map();
  const menus = new Map();
  const valueListeners = new Map();
  const alerts = [];
  for (const word of ['alpha', 'beta']) {
    const entry = { word, fetchedAt: clockNow, phonetic, ...(phonetic && phoneticSource ? { phoneticSource } : {}),
      wordForms: { base: word, forms: [] },
      audio: '', sourceUrl: '', license: { name: '', url: '' },
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: word, example: '' }] }],
      translation: '中文', translatedAt: clockNow, youdaoTranslation: '有道中文', youdaoTranslatedAt: clockNow };
    entry.translationSource = translationSource(entry);
    storage.set(prefix + 'word:' + word, entry);
  }
  const events = ['alpha', 'beta', 'alpha'].map((word, index) => ({ word, id: 'history-event-' + index, at: index + 1 }));
  for (const event of events) storage.set(prefix + 'event:' + event.id, event);
  storage.set(prefix + 'study:alpha', { word: 'alpha', addedAt: clockNow - 5 * 86400000,
    updatedAt: clockNow - 3 * 86400000, dueAt: clockNow - 86400000, stage: 2, reviews: 3,
    lastReviewedAt: clockNow - 3 * 86400000, lastGrade: 'good' });
  for (const rule of options.rules || []) {
    storage.set(prefix + 'disabled:' + rule.type + ':' + encodeURIComponent(rule.value), rule);
  }
  let uuid = 0;
  const context = {
    window, document, Element, Date: ClockDate, TextEncoder, URL, location: { href: options.url || 'https://docs.example.com/reading' },
    crypto: { randomUUID: () => 'test-uuid-' + ++uuid },
    confirm: () => true,
    alert: message => alerts.push(message),
    GM_info: { script: { version: source.match(/^\/\/ @version\s+(\S+)/m)[1] } },
    getComputedStyle: node => ({ overflowY: 'visible', overflowX: 'visible', ...node.css }),
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: clockNow + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    GM_getValue: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
    GM_setValue: (key, value) => storage.set(key, value),
    GM_deleteValue: key => storage.delete(key), GM_listValues: () => [...storage.keys()],
    GM_addValueChangeListener: (key, callback) => valueListeners.set(key, callback),
    GM_registerMenuCommand: (label, callback) => { menus.set(label, callback); return label; },
    GM_unregisterMenuCommand: id => menus.delete(id),
    GM_xmlhttpRequest: () => { throw new Error('Unexpected network request'); }
  };
  vm.runInNewContext(source, context);
  if (options.open !== false) (menus.get('打开 Lexi 学习中心') || menus.get('打开 Lexi 学习中心（手动）'))();
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
  return { get shadow() { return shadow; }, storage, events, context, Element, click, prefix, advance, timers, menus, valueListeners, alerts };
}

const findButton = (shadow, label) => shadow.querySelectorAll('button').find(node => node.textContent.startsWith(label));
const openReview = async app => {
  await app.click(app.shadow.querySelectorAll('.tab')[2]);
  await app.click(findButton(app.shadow, '开始复习'));
};

function selectWebsite(app, word) {
  const node = new app.Element('p');
  node.textContent = word;
  app.context.window.getSelection = () => ({
    isCollapsed: false, rangeCount: 1, anchorNode: { parentElement: node },
    toString: () => word, getRangeAt: () => ({ getBoundingClientRect: () => node.getBoundingClientRect() })
  });
  app.context.document.listeners.pointerup.listener({ button: 0, target: node, composedPath: () => [node] });
}

test('disabled startup mounts no UI; manual study stays disabled and the userscript menu can restore it', async () => {
  const rule = { type: 'domain', value: 'docs.example.com' };
  const app = setup('/test/', 'youdao', { rules: [rule], open: false });
  const { context, menus, storage, prefix } = app;
  assert.equal(app.shadow, undefined);
  assert.equal(context.document.documentElement.children.length, 0);
  assert.equal(context.document.listeners.pointerup, undefined);
  assert.ok(menus.has('解除此域名禁用'));
  await menus.get('打开 Lexi 学习中心（手动）')();
  assert.equal(app.shadow.querySelector('.launcher').hidden, true);
  assert.equal(app.shadow.querySelector('.overlay').hidden, false);
  const query = app.shadow.querySelector('.search');
  query.querySelector('input').value = 'beta';
  await app.click(query.querySelector('button'));
  assert.equal([...storage.keys()].filter(key => key.startsWith(prefix + 'event:')).length, 4);
  assert.equal(storage.has(prefix + 'disabled:domain:docs.example.com'), true);
  await app.click(app.shadow.querySelectorAll('button').find(node => node.attributes['aria-label'] === '关闭学习中心'));
  assert.equal(context.document.documentElement.children.length, 0);
  selectWebsite(app, 'alpha');
  app.advance(220);
  assert.equal([...storage.keys()].filter(key => key.startsWith(prefix + 'event:')).length, 4);
  await menus.get('解除此域名禁用')();
  assert.equal(context.document.documentElement.children.length, 1);
  assert.equal(app.shadow.querySelector('.launcher').hidden, false);
  assert.ok(menus.has('禁用此域名'));
});

test('quick page disable cancels pending selection and late dictionary responses without saving history', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const { context, storage, prefix, menus } = app;
  const requests = [];
  let aborted = 0;
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() { aborted++; } }; };
  selectWebsite(app, 'gamma');
  app.advance(220);
  assert.equal(requests.length, 1);
  assert.equal(app.shadow.querySelector('.popover').hidden, false);
  selectWebsite(app, 'beta');
  await app.click(findButton(app.shadow.querySelector('.scope-menu'), '禁用此页面'));
  app.advance(220);
  assert.equal(requests.length, 1);
  assert.ok(aborted > 0);
  requests[0].onload({ status: 200, responseText: JSON.stringify([{ word: 'gamma',
    meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A third letter.' }] }] }]) });
  await new Promise(setImmediate);
  assert.equal(storage.has(prefix + 'word:gamma'), false);
  assert.equal([...storage.keys()].filter(key => key.startsWith(prefix + 'event:')).length, 3);
  assert.equal(context.document.documentElement.children.length, 0);
  assert.equal(app.shadow.querySelector('.popover').hidden, true);
  assert.ok(menus.has('解除此页面禁用'));
  context.location.href = 'https://docs.example.com/another';
  app.advance(500);
  assert.equal(context.document.documentElement.children.length, 1);
  assert.equal(app.shadow.querySelector('.launcher').hidden, false);
});

test('domain confirmation and failed rule persistence keep the page enabled with an explicit error', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  app.context.confirm = () => false;
  await app.menus.get('禁用此域名')();
  assert.equal(app.storage.has(app.prefix + 'disabled:domain:docs.example.com'), false);
  const put = app.context.GM_setValue;
  app.context.GM_setValue = (key, value) => {
    if (key.startsWith(app.prefix + 'disabled:')) throw new Error('禁用规则保存失败');
    put(key, value);
  };
  await app.menus.get('禁用此页面')();
  assert.equal(app.context.document.documentElement.children.length, 1);
  assert.equal(app.shadow.querySelector('.launcher').hidden, false);
  assert.equal(app.shadow.querySelector('.toast').textContent, '禁用规则保存失败');
});

test('notification failures after successful disable remain visible even though the UI has detached', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const put = app.context.GM_setValue;
  app.context.GM_setValue = (key, value) => {
    if (key === app.prefix + 'scope-revision') throw new Error('跨标签页通知失败');
    put(key, value);
  };
  selectWebsite(app, 'alpha');
  app.advance(220);
  await app.click(findButton(app.shadow.querySelector('.scope-menu'), '禁用此页面'));
  assert.equal(app.context.document.documentElement.children.length, 0);
  assert.equal(app.storage.has(app.prefix + 'disabled:page:' + encodeURIComponent(app.context.location.href)), true);
  assert.deepEqual(app.alerts, ['跨标签页通知失败']);
});

test('disable stops active playback; clearing history keeps rules and deleting all data restores defaults', async () => {
  const rule = { type: 'domain', value: 'news.example.com' };
  const app = setup('/test/', 'youdao', { rules: [rule] });
  let paused = 0;
  app.context.Audio = class {
    play() { return Promise.resolve(); }
    pause() { paused++; }
  };
  app.storage.set(app.prefix + 'word:alpha', { ...app.storage.get(app.prefix + 'word:alpha'),
    audio: 'https://api.dictionaryapi.dev/media/alpha.mp3' });
  await app.click(app.shadow.querySelector('.item'));
  await app.click(app.shadow.querySelector('.phonetic').querySelector('button'));
  await app.menus.get('禁用此域名')();
  assert.equal(paused, 1);
  await app.menus.get('管理网页启用范围')();
  await app.click(findButton(app.shadow, '设置'));
  await app.click(findButton(app.shadow, '清空查词历史'));
  assert.equal(app.storage.has(app.prefix + 'disabled:domain:docs.example.com'), true);
  assert.equal(app.storage.has(app.prefix + 'disabled:domain:news.example.com'), true);
  app.context.prompt = () => '删除全部';
  await app.click(findButton(app.shadow, '删除全部 Lexi 数据'));
  assert.equal([...app.storage.keys()].filter(key => key.startsWith(app.prefix + 'disabled:')).length, 0);
  assert.equal(app.shadow.querySelector('.launcher').hidden, false);
  assert.equal(app.context.document.documentElement.children.length, 1);
});

test('remote scope updates combine page and domain bans, preserve other rules and restore only after both are removed', async () => {
  const page = { type: 'page', value: 'https://docs.example.com/reading' };
  const other = { type: 'page', value: 'https://other.example.com/article' };
  const app = setup('/test/', 'youdao', { rules: [other], open: false });
  const domainKey = app.prefix + 'disabled:domain:docs.example.com';
  app.storage.set(domainKey, { type: 'domain', value: 'docs.example.com' });
  app.storage.set(app.prefix + 'disabled:page:' + encodeURIComponent(page.value), page);
  const callback = app.valueListeners.get(app.prefix + 'scope-revision');
  callback('', '', 'remote', true);
  assert.equal(app.context.document.documentElement.children.length, 0);
  await app.menus.get('解除此域名禁用')();
  assert.equal(app.context.document.documentElement.children.length, 0);
  assert.ok(app.menus.has('解除此页面禁用'));
  await app.menus.get('解除此页面禁用')();
  assert.equal(app.shadow.querySelector('.launcher').hidden, false);
  assert.equal(app.storage.has(app.prefix + 'disabled:page:' + encodeURIComponent(other.value)), true);
  assert.equal(app.storage.has(app.prefix + 'study:alpha'), true);
  assert.equal(app.menus.size, 6, 'dynamic menu updates do not accumulate duplicate commands');
});

test('route changes disable before a delayed selection or response can write, even before the URL watcher runs', async () => {
  const app = setup('/test/', 'youdao', { rules: [{ type: 'page', value: 'https://docs.example.com/blocked' }], open: false });
  const requests = [];
  app.context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  selectWebsite(app, 'alpha');
  app.context.location.href = 'https://docs.example.com/blocked?share=1#heading';
  app.advance(220);
  assert.equal(app.context.document.documentElement.children.length, 0);
  assert.equal([...app.storage.keys()].filter(key => key.startsWith(app.prefix + 'event:')).length, 3);
  app.context.location.href = 'https://docs.example.com/reading';
  app.context.window.listeners.popstate.listener();
  selectWebsite(app, 'gamma');
  app.advance(220);
  app.context.location.href = 'https://docs.example.com/blocked';
  requests[0].onload({ status: 200, responseText: JSON.stringify([{ word: 'gamma',
    meanings: [{ definitions: [{ definition: 'Gamma.' }] }] }]) });
  await new Promise(setImmediate);
  assert.equal(app.storage.has(app.prefix + 'word:gamma'), false);
  assert.equal(app.context.document.documentElement.children.length, 0);
});

test('disable aborts all enrichment requests and prevents even already-resolved responses from updating caches', async () => {
  const app = setup();
  const key = app.prefix + 'word:alpha';
  const entry = { ...app.storage.get(key), phonetic: '' };
  for (const field of ['phoneticSource', 'wordForms', 'translation', 'translationSource', 'translatedAt', 'youdaoTranslation', 'youdaoTranslatedAt']) delete entry[field];
  app.storage.set(key, entry);
  const requests = [];
  let aborted = 0;
  app.context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() { aborted++; } }; };
  await app.click(app.shadow.querySelector('.item'));
  assert.equal(requests.length, 2, 'phonetics, forms and Chinese share Youdao, while MyMemory runs independently');
  requests.find(request => request.url.includes('mymemory')).onload({ status: 200,
    responseText: JSON.stringify({ responseStatus: 200, responseData: { translatedText: '迟到中文' } }) });
  await app.menus.get('禁用此页面')();
  const youdao = requests.find(request => request.url.includes('dict.youdao.com'));
  youdao.onload({ status: 200, responseText: JSON.stringify({ ec: { word: [{ 'return-phrase': { l: { i: 'alpha' } }, ukphone: 'new' }] } }) });
  await new Promise(setImmediate);
  assert.ok(aborted >= 1);
  assert.deepEqual(app.storage.get(key), entry);
  assert.equal(app.context.document.documentElement.children.length, 0);
});

test('standalone scope management searches and removes rules while settings retains separately confirmed imports', async () => {
  const other = { type: 'domain', value: 'news.example.com' };
  const app = setup('/test/', 'youdao', { rules: [other] });
  app.shadow.querySelector('.view').scrollTop = 300;
  await app.menus.get('管理网页启用范围')();
  assert.equal(app.shadow.querySelector('.view').scrollTop, 0);
  assert.equal(app.shadow.querySelector('.heading').textContent, '网页管理');
  assert.ok(app.shadow.querySelector('.scope-manager'));
  assert.equal(app.shadow.querySelectorAll('.tab').find(node => node.attributes['aria-current'] === 'page').textContent, '网页管理');
  const search = app.shadow.querySelector('.scope-filter');
  search.value = 'news';
  search.listeners.input.listener();
  assert.equal(app.shadow.querySelectorAll('.scope-rule').length, 1);
  await app.click(findButton(app.shadow.querySelector('.scope-rule'), '解除'));
  assert.equal(app.storage.has(app.prefix + 'disabled:domain:news.example.com'), false);
  await app.click(findButton(app.shadow, '设置'));
  assert.equal(app.shadow.querySelector('.scope-manager'), null);
  assert.equal(app.shadow.querySelector('.scope-filter'), null);
  const incoming = { schemaVersion: 3, words: [], history: [], book: [], recall: [],
    siteRules: [{ type: 'domain', value: 'docs.example.com' }] };
  const importBackup = async () => {
    const upload = app.shadow.querySelectorAll('input').find(node => node.type === 'file');
    upload.files = [{ size: 100, text: async () => JSON.stringify(incoming) }];
    upload.listeners.change.listener();
    await new Promise(setImmediate);
  };
  await importBackup();
  assert.equal(app.storage.has(app.prefix + 'disabled:domain:docs.example.com'), false);
  const restore = app.shadow.querySelectorAll('.setting').find(row => textOf(row).includes('导入时添加')).querySelector('input');
  restore.checked = true;
  app.context.confirm = message => !message.includes('同时添加备份');
  await importBackup();
  assert.equal(app.storage.has(app.prefix + 'disabled:domain:docs.example.com'), false);
  app.context.confirm = () => true;
  await importBackup();
  assert.equal(app.storage.has(app.prefix + 'disabled:domain:docs.example.com'), true);
  assert.equal(app.context.document.documentElement.children.length, 0);
});

test('compact scope lists paginate, clamp after last-page removal and retain the search across refresh and navigation', async () => {
  const rules = Array.from({ length: 102 }, (_, index) => {
    const host = 'site-' + String(index).padStart(3, '0') + '.example.com';
    return index % 2 ? { type: 'domain', value: host } : { type: 'page', value: 'https://' + host + '/article/' + 'long-path-'.repeat(30) };
  });
  const app = setup('/test/', 'youdao', { rules });
  await app.click(findButton(app.shadow, '网页管理'));
  assert.equal(app.shadow.querySelectorAll('.scope-rule').length, 50);
  assert.equal(app.shadow.querySelector('.scope-count').textContent, '102 / 102 条');
  const firstAddress = app.shadow.querySelector('.scope-rule').querySelector('.scope-address');
  assert.equal(firstAddress.title, rules[0].value);
  app.shadow.querySelector('.scope-rule-list').scrollTop = 100;
  await app.click(findButton(app.shadow, '下一页'));
  assert.equal(app.shadow.querySelector('.scope-rule-list').scrollTop, 0);
  await app.click(findButton(app.shadow, '下一页'));
  assert.equal(app.shadow.querySelectorAll('.scope-rule').length, 2);
  assert.equal(app.shadow.querySelector('.scope-pagination').querySelector('span').textContent, '3 / 3 页');
  await app.click(findButton(app.shadow.querySelector('.scope-rule'), '解除'));
  assert.equal(app.shadow.querySelectorAll('.scope-rule').length, 1);
  await app.click(findButton(app.shadow.querySelector('.scope-rule'), '解除'));
  assert.equal(app.shadow.querySelectorAll('.scope-rule').length, 50);
  assert.equal(app.shadow.querySelector('.scope-pagination').querySelector('span').textContent, '2 / 2 页');
  const search = app.shadow.querySelector('.scope-filter');
  search.value = 'site-01';
  search.listeners.input.listener();
  assert.equal(app.shadow.querySelectorAll('.scope-rule').length, 10);
  assert.equal(app.shadow.querySelector('.scope-pagination').querySelector('span').textContent, '1 / 1 页');
  await app.click(findButton(app.shadow.querySelector('.scope-rule'), '解除'));
  assert.equal(app.shadow.querySelector('.scope-filter').value, 'site-01');
  assert.equal(app.shadow.querySelectorAll('.scope-rule').length, 9);
  await app.click(findButton(app.shadow, '设置'));
  await app.click(findButton(app.shadow, '网页管理'));
  assert.equal(app.shadow.querySelector('.scope-filter').value, 'site-01');
  assert.equal(app.shadow.querySelector('.scope-count').textContent, '9 / 99 条');
});

test('rule limits reject new bans and oversized backup unions before any vocabulary is imported', async () => {
  const app = setup();
  await app.click(findButton(app.shadow, '设置'));
  for (let index = 0; index < 10000; index++) {
    const rule = { type: 'domain', value: 'site-' + index + '.example.com' };
    app.storage.set(app.prefix + 'disabled:domain:' + encodeURIComponent(rule.value), rule);
  }
  await app.menus.get('禁用此页面')();
  assert.ok(app.shadow.querySelector('.toast').textContent.includes('10,000'));
  assert.equal(app.storage.has(app.prefix + 'disabled:page:' + encodeURIComponent(app.context.location.href)), false);
  const restore = app.shadow.querySelectorAll('.setting').find(row => textOf(row).includes('导入时添加')).querySelector('input');
  restore.checked = true;
  const incoming = { schemaVersion: 3, words: [{ ...app.storage.get(app.prefix + 'word:beta'),
    word: 'gamma', wordForms: { base: 'gamma', forms: [] } }], history: [], book: [], recall: [],
    siteRules: [{ type: 'domain', value: 'another.example.com' }] };
  const upload = app.shadow.querySelectorAll('input').find(node => node.type === 'file');
  upload.files = [{ size: 100, text: async () => JSON.stringify(incoming) }];
  upload.listeners.change.listener();
  await new Promise(setImmediate);
  assert.ok(app.shadow.querySelector('.toast').textContent.includes('10,000'));
  assert.equal(app.storage.has(app.prefix + 'word:gamma'), false);
  assert.equal(app.storage.has(app.prefix + 'disabled:domain:another.example.com'), false);
});

function seedTook(app) {
  const entry = { ...app.storage.get(app.prefix + 'word:alpha'), word: 'took', phonetic: '/tʊk/',
    meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'simple past tense of take', example: '' }] }] };
  delete entry.wordForms;
  entry.translationSource = translationSource(entry);
  app.storage.set(app.prefix + 'word:took', entry);
  return entry;
}
const respondYoudao = async (request, word, extra = {}) => {
  request.onload({ status: 200, responseText: JSON.stringify({
    ec: { word: [{ 'return-phrase': { l: { i: word } }, ...extra }] }
  }) });
  await new Promise(setImmediate);
};
const takeForms = [
  { name: '复数', value: 'takes' }, { name: '第三人称单数', value: 'takes' },
  { name: '现在分词', value: 'taking' }, { name: '过去式', value: 'took' }, { name: '过去分词', value: 'taken' }
];

test('took keeps its definition and shows the full take paradigm with shared phonetics and persistent review reuse', async () => {
  const app = setup('/main/', '');
  const { shadow, storage, prefix, context, click } = app;
  seedTook(app);
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  const query = shadow.querySelector('.search');
  query.querySelector('input').value = 'took';
  await click(query.querySelector('button'));
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 1, 'phonetics, word forms and repeated views share the took request');
  assert.equal(new URL(requests[0].url).searchParams.get('q'), 'took');
  await respondYoudao(requests[0], 'took', { prototype: 'take', ukphone: 'tʊk' });
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url).searchParams.get('q'), 'take');
  storage.set(prefix + 'word:took', { ...storage.get(prefix + 'word:took'), translation: '刚更新的中文' });
  await respondYoudao(requests[1], 'take', { wfs: takeForms.map(wf => ({ wf })) });
  assert.equal(shadow.querySelector('.definition').textContent, 'simple past tense of take');
  const forms = shadow.querySelector('.word-forms');
  assert.deepEqual(forms.querySelectorAll('dt').map(node => node.textContent),
    ['原形', '复数', '第三人称单数', '现在分词', '过去式', '过去分词']);
  assert.deepEqual(forms.querySelectorAll('dd').map(node => node.textContent),
    ['take', 'takes', 'takes', 'taking', 'took（当前词）', 'taken']);
  assert.deepEqual(JSON.parse(JSON.stringify(storage.get(prefix + 'word:took').wordForms)), { base: 'take', forms: takeForms });
  assert.equal(storage.get(prefix + 'word:took').translation, '刚更新的中文');
  assert.equal(storage.get(prefix + 'word:took').phoneticSource, 'youdao');
  assert.equal(storage.has(prefix + 'word:take'), false, 'supplementing the root does not create another saved word');
  assert.equal([...storage.keys()].filter(key => key.startsWith(prefix + 'event:')).length, 4);
  storage.delete(prefix + 'study:alpha');
  storage.set(prefix + 'study:took', createStudy('took', context.Date.now()));
  await openReview(app);
  assert.equal(shadow.querySelector('.word-forms'), null, 'review does not leak forms before revealing the answer');
  await click(findButton(shadow, '显示释义'));
  assert.ok(shadow.querySelector('.review-answer').querySelector('.word-forms'));
  assert.equal(requests.length, 2, 'the answer reuses saved forms and phonetics');
});

test('legacy words supplement missing forms without history or study changes, retry failures and cache absence', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  delete storage.get(prefix + 'word:alpha').wordForms;
  const studyBefore = structuredClone(storage.get(prefix + 'study:alpha'));
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  requests[0].onerror();
  await new Promise(setImmediate);
  const forms = shadow.querySelector('.word-forms');
  assert.equal(shadow.querySelector('.definition').textContent, 'alpha');
  assert.ok(forms.querySelector('.notice').textContent.includes('网络连接失败'));
  await click(findButton(forms, '重试词形变化'));
  await respondYoudao(requests[1], 'alpha');
  assert.equal(forms.hidden, true, 'a successful response with no forms hides the section');
  assert.deepEqual(JSON.parse(JSON.stringify(storage.get(prefix + 'word:alpha').wordForms)), { base: 'alpha', forms: [] });
  await click(shadow.querySelectorAll('.tab')[1]);
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 2);
  assert.equal([...storage.keys()].filter(key => key.startsWith(prefix + 'event:')).length, 3);
  assert.deepEqual(storage.get(prefix + 'study:alpha'), studyBefore);
});

test('root lookup failures remain retryable and late form responses cannot restore a deleted word', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  seedTook(app);
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  const query = shadow.querySelector('.search');
  query.querySelector('input').value = 'took';
  await click(query.querySelector('button'));
  await respondYoudao(requests[0], 'took', { prototype: 'take' });
  requests[1].onerror();
  await new Promise(setImmediate);
  assert.equal(storage.get(prefix + 'word:took').wordForms, undefined, 'incomplete forms are not cached as success');
  const forms = shadow.querySelector('.word-forms');
  await click(findButton(forms, '重试词形变化'));
  await respondYoudao(requests[2], 'took', { prototype: 'take' });
  storage.delete(prefix + 'word:took');
  await respondYoudao(requests[3], 'take', { wfs: takeForms.map(wf => ({ wf })) });
  assert.equal(storage.has(prefix + 'word:took'), false);
  assert.ok(forms.querySelector('.notice').textContent.includes('词条已删除'));
  assert.ok(findButton(forms, '重试词形变化'));
});

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
  const backgroundTimers = timers.size;
  storage.set(prefix + 'study:alpha', schedule(storage.get(prefix + 'study:alpha'), 'easy', context.Date.now()));
  await click(shadow.querySelectorAll('.tab')[2]);
  assert.equal(shadow.querySelectorAll('.stat')[2].querySelector('strong').textContent, '1');
  advance(86400000);
  assert.equal(shadow.querySelectorAll('.stat')[2].querySelector('strong').textContent, '0');
  await click(shadow.querySelectorAll('.tab')[1]);
  assert.equal(timers.size, backgroundTimers);
  await click(shadow.querySelectorAll('.tab')[2]);
  assert.equal(timers.size, backgroundTimers + 1);
  await click(shadow.querySelectorAll('button').find(node => node.attributes['aria-label'] === '关闭学习中心'));
  assert.equal(timers.size, backgroundTimers);
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
  assert.equal(requests.length, 1, 'existing main IPA is kept without a third-party fallback request');
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

test('phonetic fallback fills plopped IPA when Youdao and the main dictionary have none', async () => {
  const { shadow, storage, prefix, context, click } = setup('');
  const entry = { ...storage.get(prefix + 'word:alpha'), word: 'plopped',
    wordForms: { base: 'plop', forms: [] } };
  storage.set(prefix + 'word:plopped', entry);
  storage.set(prefix + 'event:plopped-event', { id: 'plopped-event', word: 'plopped', at: context.Date.now() });
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  await respondYoudao(requests[0], 'plopped', { prototype: 'plop' });
  assert.equal(requests.length, 2, 'missing exact-word IPA must request the configured fallback, not use the root IPA');
  assert.equal(new URL(requests[1].url).hostname, 'api.datamuse.com');
  assert.equal(new URL(requests[1].url).searchParams.get('sp'), 'plopped');
  requests[1].onload({ status: 200, responseText: JSON.stringify([
    { word: 'plopped', tags: ['pron:P L AA1 P T ', 'ipa_pron:pɫˈɑpt'] }
  ]) });
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.phonetic').children[0].textContent, '/pɫˈɑpt/');
  assert.equal(storage.get(prefix + 'word:plopped').phoneticSource, 'datamuse');
  assert.ok(textOf(shadow.querySelector('.phonetic')).includes('Datamuse'));
  assert.ok(shadow.querySelector('.phonetic').title.includes('推测'));
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 2, 'the cached reference IPA avoids repeated requests');
});

for (const [label, fail] of [
  ['network errors', request => request.onerror()],
  ['HTTP 429', request => request.onload({ status: 429, responseText: '{}' })],
  ['timeouts', request => request.ontimeout()]
]) {
  test('phonetic fallback handles Youdao ' + label + ' without changing history or study progress', async () => {
    const { shadow, storage, prefix, context, click } = setup('');
    const before = structuredClone(storage.get(prefix + 'study:alpha'));
    const requests = [];
    context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
    await click(shadow.querySelector('.item'));
    fail(requests[0]);
    await new Promise(setImmediate);
    assert.equal(requests.length, 2);
    storage.set(prefix + 'word:alpha', { ...storage.get(prefix + 'word:alpha'), translation: '并发更新的中文' });
    requests[1].onload({ status: 200, responseText: JSON.stringify([{ word: 'alpha', tags: ['ipa_pron:ˈælfə'] }]) });
    await new Promise(setImmediate);
    assert.equal(storage.get(prefix + 'word:alpha').phonetic, '/ˈælfə/');
    assert.equal(storage.get(prefix + 'word:alpha').translation, '并发更新的中文');
    assert.deepEqual(storage.get(prefix + 'study:alpha'), before);
    assert.equal([...storage.keys()].filter(key => key.startsWith(prefix + 'event:')).length, 3);
  });
}

test('phonetic fallback setting saves independently, reports write errors and can disable additional requests', async () => {
  const { shadow, storage, prefix, context, click } = setup('');
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(findButton(shadow, '设置'));
  const select = shadow.querySelector('.phonetic-fallback');
  assert.ok(select);
  assert.equal(select.value, 'datamuse');
  select.value = 'none';
  select.listeners.change.listener();
  assert.equal(storage.get(prefix + 'settings').phoneticFallback, 'none');
  context.GM_setValue = () => { throw new Error('storage blocked'); };
  select.value = 'datamuse';
  select.listeners.change.listener();
  assert.equal(select.value, 'none');
  assert.ok(shadow.querySelector('.toast').textContent.includes('storage blocked'));
  context.GM_setValue = (key, value) => storage.set(key, value);
  await click(shadow.querySelectorAll('.tab')[0]);
  await click(shadow.querySelector('.item'));
  await respondYoudao(requests[0], 'alpha');
  assert.equal(requests.length, 1);
  assert.equal(shadow.querySelector('.phonetic').children[0].textContent, '音标暂不可用');
  assert.ok(findButton(shadow.querySelector('.phonetic'), '重试'));
});

test('phonetic fallback failures show both services and retry without saving a near-match IPA', async () => {
  const { shadow, storage, prefix, context, click } = setup('');
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  await respondYoudao(requests[0], 'alpha');
  requests[1].onload({ status: 200, responseText: JSON.stringify([{ word: 'other', tags: ['ipa_pron:ʌðə'] }]) });
  await new Promise(setImmediate);
  const phonetic = shadow.querySelector('.phonetic');
  assert.equal(storage.get(prefix + 'word:alpha').phonetic, '');
  assert.ok(phonetic.title.includes('有道：'));
  assert.ok(phonetic.title.includes('Datamuse：'));
  await click(findButton(phonetic, '重试'));
  await respondYoudao(requests[2], 'alpha', { ukphone: 'ˈælfə' });
  assert.equal(storage.get(prefix + 'word:alpha').phoneticSource, 'youdao');
  assert.equal(findButton(phonetic, '重试'), undefined);
  assert.equal(requests.length, 3, 'retry still prefers Youdao instead of forcing the previous fallback');
});

test('phonetic fallback shares pending requests and cannot restore deleted words or overwrite preferred IPA', async () => {
  for (const remove of [true, false]) {
    const { shadow, storage, prefix, context, click } = setup('');
    const requests = [];
    context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
    await click(shadow.querySelector('.item'));
    await click(shadow.querySelector('.item'));
    assert.equal(requests.length, 1);
    await respondYoudao(requests[0], 'alpha');
    assert.equal(requests.length, 2);
    if (remove) storage.delete(prefix + 'word:alpha');
    else storage.set(prefix + 'word:alpha', { ...storage.get(prefix + 'word:alpha'), phonetic: '/preferred/', phoneticSource: 'youdao' });
    requests[1].onload({ status: 200, responseText: JSON.stringify([{ word: 'alpha', tags: ['ipa_pron:ˈælfə'] }]) });
    await new Promise(setImmediate);
    if (remove) {
      assert.equal(storage.has(prefix + 'word:alpha'), false);
      assert.ok(shadow.querySelector('.phonetic').title.includes('词条已删除'));
    } else {
      assert.equal(storage.get(prefix + 'word:alpha').phonetic, '/preferred/');
      assert.equal(storage.get(prefix + 'word:alpha').phoneticSource, 'youdao');
    }
  }
});

test('failed phonetics can be retried, and a late response cannot recreate a deleted word', async () => {
  const { shadow, storage, prefix, context, click } = setup('');
  storage.set(prefix + 'settings', { phoneticFallback: 'none' });
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
  assert.deepEqual(storage.get(prefix + 'word:alpha').wordForms, entry.wordForms);
  assert.equal(requests.length, 1);
  storage.set(prefix + 'word:alpha', { ...storage.get(prefix + 'word:alpha'), fetchedAt: 1 });
  await click(query.querySelector('button'));
  requests[1].onload({ status: 200, responseText: JSON.stringify([{ meanings: entry.meanings, phonetic: '/fresh/' }]) });
  await new Promise(setImmediate);
  assert.equal(storage.get(prefix + 'word:alpha').phonetic, '/test/');
  assert.equal(storage.get(prefix + 'word:alpha').phoneticSource, 'youdao');
  assert.deepEqual(storage.get(prefix + 'word:alpha').wordForms, entry.wordForms);
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
  await click(findButton(shadow, '设置'));
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

  await click(findButton(shadow, '设置'));
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

function setSelection(app, range) {
  const selection = { rangeCount: 1, isCollapsed: Boolean(range.collapsed), getRangeAt: () => range,
    removeAllRanges() { this.rangeCount = 0; this.isCollapsed = true; } };
  app.context.window.getSelection = () => selection;
  return selection;
}
async function selectInside(app, node, raw, collapsed = false) {
  const range = { startContainer: node, endContainer: node, collapsed, toString: () => raw,
    getBoundingClientRect: () => node.getBoundingClientRect() };
  setSelection(app, range);
  assert.ok(app.shadow.listeners.pointerup, 'plugin handles its own selection');
  app.shadow.listeners.pointerup.listener({ button: 0 });
  app.advance(250);
  await new Promise(setImmediate);
}
const historyOf = app => [...app.storage.entries()].filter(([key]) => key.startsWith(app.prefix + 'event:')).map(([, event]) => event);

test('automatic internal lookup ignores the displayed word but still allows other words and earlier navigation words', async () => {
  const app = setup();
  const { shadow, click } = app;
  await click(shadow.querySelector('.item'));
  const pane = shadow.querySelector('.detail-pane');
  const original = pane.querySelector('article');
  pane.scrollTop = 75;
  for (const raw of ['alpha', ' ALPHA ']) {
    await selectInside(app, pane.querySelector('.definition'), raw);
    assert.ok(!pane.querySelector('.lookup-back'), 'selecting the current word must not open a child lookup');
    assert.equal(pane.querySelector('article'), original);
    assert.equal(pane.scrollTop, 75);
    assert.equal(historyOf(app).length, 3, 'selecting the current word must not add history');
  }
  await selectInside(app, pane.querySelector('.definition'), 'beta');
  const nested = pane.querySelector('article');
  await selectInside(app, pane.querySelector('.word'), 'BETA');
  assert.equal(pane.querySelector('article'), nested, 'compare against the displayed child, not the original word');
  assert.equal(findButton(pane, '← 返回 beta'), undefined);
  assert.equal(historyOf(app).length, 4);
  await selectInside(app, pane.querySelector('.definition'), 'alpha');
  assert.equal(pane.querySelector('.word').textContent, 'alpha', 'an earlier word remains a valid different-word lookup');
  assert.ok(findButton(pane, '← 返回 beta'));
  assert.equal(historyOf(app).length, 5);
});

test('same-word selection preserves take in history and book details without querying or changing favorites', async () => {
  for (const tab of [0, 1]) {
    const app = setup();
    const { shadow, storage, prefix, click } = app;
    addWord(app, 'take');
    storage.set(prefix + 'study:take', createStudy('take', app.context.Date.now()));
    storage.set(prefix + 'event:take-event', { word: 'take', id: 'take-event', at: 4 });
    useSettings(app, { auto: false, autoBook: true });
    await click(shadow.querySelectorAll('.tab')[tab]);
    await click(shadow.querySelectorAll('.item').find(node => node.querySelector('.term')?.textContent === 'take'));
    const pane = shadow.querySelector('.detail-pane');
    const original = pane.querySelector('article');
    const before = json([...storage]);
    for (const selector of ['.word', '.definition']) {
      await selectInside(app, pane.querySelector(selector), ' TAKE ');
      assert.ok(!pane.querySelector('.lookup-back'));
      assert.equal(pane.querySelector('article'), original);
      assert.deepEqual(json([...storage]), before);
    }
  }
});

test('same-word selection preserves the review answer and keeps grading available', async () => {
  const app = setup();
  const { shadow, storage, prefix, click } = app;
  await openReview(app);
  await click(findButton(shadow, '显示释义'));
  const original = shadow.querySelector('.review-answer');
  const before = json(storage.get(prefix + 'study:alpha'));
  await selectInside(app, original.querySelector('.definition'), 'ALPHA');
  assert.ok(!shadow.querySelector('.lookup-back'));
  assert.equal(shadow.querySelector('.review-answer'), original);
  assert.equal(historyOf(app).length, 3);
  await press(app, '3');
  assert.equal(storage.get(prefix + 'study:alpha').reviews, before.reviews + 1);
});

test('same-word selection in the website card does not open a child lookup', async () => {
  const app = setup();
  const { shadow, context } = app;
  await press(app, 'Escape');
  const node = new app.Element('p');
  const range = { startContainer: node, endContainer: node, collapsed: false,
    toString: () => 'alpha', getBoundingClientRect: () => node.getBoundingClientRect() };
  const selection = setSelection(app, range);
  selection.toString = range.toString;
  context.document.listeners.pointerup.listener({ button: 0, target: node, composedPath: () => [node] });
  app.advance(250);
  await new Promise(setImmediate);
  const popover = shadow.querySelector('.popover');
  assert.equal(popover.hidden, false);
  assert.equal(popover.querySelector('.word').textContent, 'alpha');
  const original = popover.querySelector('article');
  await selectInside(app, popover.querySelector('.definition'), 'alpha');
  assert.ok(!popover.querySelector('.lookup-back'));
  assert.equal(popover.querySelector('article'), original);
  assert.equal(historyOf(app).length, 4, 'only the website lookup adds history');
});

test('automatic internal lookup works with website selection paused, saves history and stars, and restores nested views', async () => {
  const app = setup();
  const { shadow, click, storage, prefix } = app;
  useSettings(app, { auto: false });
  addWord(app, 'gamma');
  await click(shadow.querySelector('.item'));
  const pane = shadow.querySelector('.detail-pane');
  const original = pane.querySelector('article');
  pane.scrollTop = 75;
  shadow.querySelector('.list').scrollTop = 42;
  await selectInside(app, pane.querySelector('.definition'), 'beta');
  assert.equal(shadow.querySelector('.selection-lookup'), null, 'there is no extra lookup icon to click');
  assert.equal(pane.querySelector('.word').textContent, 'beta');
  assert.equal(historyOf(app).length, 4);
  assert.equal(shadow.querySelectorAll('.item').length, 4, 'the current history list updates without leaving the word');
  assert.ok(findButton(pane, '← 返回 alpha'));
  const star = pane.querySelector('.detail-star');
  assert.equal(star.textContent, '☆');
  assert.equal(star.getAttribute('aria-pressed'), 'false');
  assert.equal(star.getAttribute('aria-label'), '收藏 beta');
  await click(star);
  assert.equal(star.textContent, '★');
  assert.equal(star.getAttribute('aria-pressed'), 'true');
  assert.equal(star.getAttribute('aria-label'), '取消收藏 beta');
  assert.equal(star.title, '取消收藏 beta');
  assert.ok(star.className.split(' ').includes('starred'));
  assert.ok(storage.has(prefix + 'study:beta'));
  assert.equal(pane.querySelector('.word').textContent, 'beta', 'starring does not interrupt the temporary view');
  pane.scrollTop = 39;
  await selectInside(app, pane.querySelector('.definition'), 'gamma');
  assert.equal(pane.querySelector('.word').textContent, 'gamma');
  assert.equal(historyOf(app).length, 5);
  await click(findButton(pane, '← 返回 beta'));
  assert.equal(pane.scrollTop, 39);
  assert.equal(pane.querySelector('.detail-star').textContent, '★');
  await click(findButton(pane, '← 返回 alpha'));
  assert.equal(pane.querySelector('article'), original);
  assert.equal(pane.scrollTop, 75);
  assert.equal(shadow.querySelector('.list').scrollTop, 42);
  assert.equal(historyOf(app).length, 5, 'returning never records another lookup');
  assert.ok(shadow.querySelectorAll('.list-star').find(node => node.attributes['aria-label'] === '取消收藏 beta'));
  await click(shadow.querySelectorAll('.tab')[0]);
  assert.equal(shadow.querySelectorAll('.item').length, 5, 'temporary queries appear in the normal history');
});

test('lookup star preserves its state on cancellation or storage failure and clears progress only on confirmed removal', async () => {
  const app = setup();
  const { shadow, click, storage, prefix, context } = app;
  await click(shadow.querySelector('.item'));
  await selectInside(app, shadow.querySelector('.definition'), 'beta');
  const star = shadow.querySelector('.detail-star');
  const write = context.GM_setValue;
  context.GM_setValue = () => { throw new Error('Storage unavailable'); };
  await click(star);
  assert.equal(star.textContent, '☆');
  assert.equal(star.getAttribute('aria-pressed'), 'false');
  assert.equal(storage.has(prefix + 'study:beta'), false);
  assert.ok(shadow.querySelector('.toast').textContent.includes('Storage unavailable'));
  context.GM_setValue = write;
  await click(star);
  const progress = json(storage.get(prefix + 'study:beta'));
  context.confirm = () => false;
  await click(star);
  assert.equal(star.textContent, '★');
  assert.equal(star.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(json(storage.get(prefix + 'study:beta')), progress);
  context.confirm = () => true;
  await click(star);
  assert.equal(star.textContent, '☆');
  assert.equal(star.getAttribute('aria-pressed'), 'false');
  assert.equal(star.getAttribute('aria-label'), '收藏 beta');
  assert.equal(star.title, '收藏 beta');
  assert.equal(star.className.split(' ').includes('starred'), false);
  assert.equal(storage.has(prefix + 'study:beta'), false);
  assert.equal(historyOf(app).length, 4, 'favorite changes preserve lookup history');
});

test('review internal lookup preserves the revealed card and blocks grading until return', async () => {
  const app = setup();
  const { shadow, click, storage, prefix } = app;
  useSettings(app, { autoBook: true });
  await openReview(app);
  await click(findButton(shadow, '显示释义'));
  const original = shadow.querySelector('.review-answer');
  const before = json(storage.get(prefix + 'study:alpha'));
  shadow.querySelector('.view').scrollTop = 81;
  await selectInside(app, original.querySelector('.definition'), 'beta');
  assert.equal(shadow.querySelector('.view').querySelector('.word').textContent, 'beta');
  assert.ok(storage.has(prefix + 'study:beta'), 'temporary lookup respects automatic bookmarking');
  assert.equal(historyOf(app).at(-1).word, 'beta');
  await press(app, '1');
  await press(app, 'r');
  assert.deepEqual(json(storage.get(prefix + 'study:alpha')), before);
  assert.equal(shadow.querySelector('.toast').hidden, true, 'review pronunciation is not triggered underneath');
  await press(app, 'Escape');
  assert.equal(shadow.querySelector('.overlay').hidden, false);
  assert.equal(shadow.querySelector('.review-answer'), original);
  assert.equal(shadow.querySelector('.view').scrollTop, 81);
  assert.equal(shadow.activeElement, findButton(shadow, '记得 ·'));
  await press(app, '3');
  assert.equal(storage.get(prefix + 'study:alpha').reviews, before.reviews + 1);
});

test('automatic internal lookup ignores controls, phrases, collapsed and cancelled selections', async () => {
  const app = setup();
  const { shadow, click } = app;
  await click(shadow.querySelector('.item'));
  const definition = shadow.querySelector('.definition');
  for (const [node, raw, collapsed] of [
    [definition, 'two words', false], [definition, 'beta', true],
    [findButton(shadow, '查询'), 'query', false], [shadow.querySelector('input'), 'beta', false],
    [app.context.document.activeElement, 'beta', false]
  ]) {
    await selectInside(app, node, raw, collapsed);
    assert.equal(shadow.querySelector('.word').textContent, 'alpha');
    assert.equal(historyOf(app).length, 3);
  }
  await selectInside(app, definition, 'two words');
  const range = { startContainer: definition, endContainer: definition, collapsed: false, toString: () => 'beta' };
  setSelection(app, range);
  app.context.document.listeners.selectionchange.listener();
  app.context.window.getSelection = () => null;
  app.context.document.listeners.selectionchange.listener();
  app.advance(250);
  await new Promise(setImmediate);
  assert.equal(historyOf(app).length, 3);
});

test('automatic internal lookup waits for pointer release, debounces selection changes and does not repeat a consumed selection', async () => {
  const app = setup();
  const { shadow, context, click, advance } = app;
  await click(shadow.querySelector('.item'));
  const definition = shadow.querySelector('.definition');
  const range = { startContainer: definition, endContainer: definition, collapsed: false, toString: () => 'beta' };
  setSelection(app, range);
  shadow.listeners.pointerdown.listener({ button: 0, composedPath: () => [definition] });
  context.document.listeners.selectionchange.listener();
  advance(500);
  await new Promise(setImmediate);
  assert.equal(historyOf(app).length, 3, 'dragging does not query an intermediate selection');
  shadow.listeners.pointerup.listener({ button: 0 });
  advance(100);
  context.document.listeners.selectionchange.listener();
  advance(100);
  await new Promise(setImmediate);
  assert.equal(historyOf(app).length, 3, 'rapid events are debounced');
  advance(150);
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'beta');
  assert.equal(historyOf(app).length, 4);
  context.document.listeners.selectionchange.listener();
  shadow.listeners.keyup.listener({ key: 'Shift' });
  advance(250);
  await new Promise(setImmediate);
  assert.equal(historyOf(app).length, 4, 'the same selection cannot create another history event');
});

test('Escape cancels a pending automatic internal lookup before navigating or closing', async () => {
  const app = setup();
  const { shadow, context, click, advance } = app;
  await click(shadow.querySelector('.item'));
  const definition = shadow.querySelector('.definition');
  const range = { startContainer: definition, endContainer: definition, collapsed: false, toString: () => 'beta' };
  setSelection(app, range);
  context.document.listeners.selectionchange.listener();
  await press(app, 'Escape');
  advance(250);
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.overlay').hidden, false);
  assert.equal(shadow.querySelector('.word').textContent, 'alpha');
  assert.equal(historyOf(app).length, 3);
});

test('clicking a control cancels pending selection lookup instead of rearming it on pointer release', async () => {
  const app = setup();
  const { shadow, context, click, advance } = app;
  await click(shadow.querySelector('.item'));
  const definition = shadow.querySelector('.definition');
  const range = { startContainer: definition, endContainer: definition, collapsed: false, toString: () => 'beta' };
  setSelection(app, range);
  context.document.listeners.selectionchange.listener();
  const control = findButton(shadow, '查询');
  shadow.listeners.pointerdown.listener({ button: 0, composedPath: () => [control] });
  shadow.listeners.pointerup.listener({ button: 0 });
  context.document.listeners.selectionchange.listener();
  advance(250);
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.word').textContent, 'alpha');
  assert.equal(historyOf(app).length, 3);
});

test('internal lookup failures can retry or return, and late cancelled responses do not save history', async () => {
  const app = setup();
  const { shadow, click, context } = app;
  const requests = [];
  let aborted = 0;
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() { aborted++; } }; };
  await click(shadow.querySelector('.item'));
  const pane = shadow.querySelector('.detail-pane');
  await selectInside(app, pane.querySelector('.definition'), 'missing');
  assert.ok(textOf(pane).includes('正在查词'));
  requests[0].onerror();
  await new Promise(setImmediate);
  assert.ok(pane.querySelector('.error').textContent.includes('网络连接失败'));
  assert.equal(historyOf(app).length, 3);
  addWord(app, 'missing');
  await click(findButton(pane, '重试'));
  assert.equal(pane.querySelector('.word').textContent, 'missing');
  assert.equal(historyOf(app).length, 4);
  await click(findButton(pane, '← 返回 alpha'));
  await selectInside(app, pane.querySelector('.definition'), 'cancelled');
  await click(findButton(pane, '← 返回 alpha'));
  assert.equal(aborted, 1);
  requests[1].onload({ status: 200, responseText: JSON.stringify([{ word: 'cancelled',
    meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'stopped' }] }] }]) });
  await new Promise(setImmediate);
  assert.equal(pane.querySelector('.word').textContent, 'alpha');
  assert.equal(historyOf(app).length, 4);
  assert.equal(app.storage.has(app.prefix + 'word:cancelled'), false);
});

test('internal selections use composed ranges when a browser retargets shadow selections', async () => {
  const app = setup();
  const { shadow, click, context } = app;
  await click(shadow.querySelector('.item'));
  const definition = shadow.querySelector('.definition');
  const range = { startContainer: definition, endContainer: definition, collapsed: false, toString: () => 'beta' };
  context.document.createRange = () => ({ ...range, setStart() {}, setEnd() {} });
  const selection = setSelection(app, { startContainer: context.document });
  selection.getComposedRanges = ({ shadowRoots }) => {
    assert.equal(shadowRoots[0], shadow);
    return selection.rangeCount ? [{ startContainer: definition, endContainer: definition, startOffset: 0, endOffset: 4 }] : [];
  };
  context.document.listeners.selectionchange.listener();
  app.advance(250);
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'beta');
});

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
  assert.equal(storage.get(prefix + 'word:alpha').translationProvider, 'mymemory');
  assert.equal(requests.length, 1, 'the cached Youdao definition needs no additional request');
  assert.ok(textOf(shadow.querySelector('.review-answer')).includes('阿尔法'));
});

test('Chinese definitions request both sources immediately and display each result independently', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  const entry = { ...storage.get(prefix + 'word:alpha') };
  for (const key of ['translation', 'translationSource', 'youdaoTranslation', 'youdaoTranslatedAt']) delete entry[key];
  storage.set(prefix + 'word:alpha', entry);
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 2, 'both sources must start before either one succeeds or fails');
  const mymemory = requests.find(request => request.url.includes('mymemory'));
  const youdao = requests.find(request => request.url.includes('youdao'));
  mymemory.onload({ status: 200, responseText: JSON.stringify({ responseStatus: 200, responseData: { translatedText: '机器翻译' } }) });
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.translation-mymemory').querySelector('.translation-copy').textContent, '机器翻译');
  assert.equal(shadow.querySelector('.translation-youdao').querySelector('.translation-copy'), null);
  await respondYoudao(youdao, 'alpha', { trs: [{ tr: [{ l: { i: ['n. 阿尔法；开端'] } }] }] });
  assert.equal(shadow.querySelector('.translation-youdao').querySelector('.translation-copy').textContent, 'n. 阿尔法；开端');
  assert.equal(storage.get(prefix + 'word:alpha').translation, '机器翻译');
  assert.equal(storage.get(prefix + 'word:alpha').youdaoTranslation, 'n. 阿尔法；开端');
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 2, 'both cached sources avoid repeat requests');
});

test('Chinese definitions keep Youdao visible when MyMemory returns HTTP 429 and retry only MyMemory', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  const entry = { ...storage.get(prefix + 'word:alpha') };
  delete entry.translation;
  delete entry.translationSource;
  delete entry.youdaoTranslation;
  delete entry.youdaoTranslatedAt;
  storage.set(prefix + 'word:alpha', entry);
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 2);
  requests[0].onload({ status: 429, responseText: '{}' });
  await new Promise(setImmediate);
  assert.equal(requests.length, 2, 'failure does not start another request for the independent source');
  assert.ok(requests[1].url.startsWith('https://dict.youdao.com/jsonapi?'));
  await respondYoudao(requests[1], 'alpha', { trs: [{ tr: [{ l: { i: ['n. 阿尔法；开端'] } }] }] });
  const youdao = shadow.querySelector('.translation-youdao');
  assert.equal(youdao.querySelector('.translation-copy').textContent, 'n. 阿尔法；开端');
  assert.ok(textOf(youdao).includes('有道词典'));
  assert.equal(storage.get(prefix + 'word:alpha').translation, undefined);
  assert.equal(storage.get(prefix + 'word:alpha').youdaoTranslation, 'n. 阿尔法；开端');
  await click(findButton(shadow, '重试 MyMemory 中文释义'));
  assert.equal(requests.length, 3);
  assert.ok(requests[2].url.includes('mymemory'));
  requests[2].onload({ status: 200, responseText: JSON.stringify({ responseStatus: 200, responseData: { translatedText: '机器翻译' } }) });
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.translation-mymemory').querySelector('.translation-copy').textContent, '机器翻译');
  assert.equal(youdao.querySelector('.translation-copy').textContent, 'n. 阿尔法；开端');
  await click(shadow.querySelectorAll('.tab')[1]);
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 3, 'opening both successful caches needs no requests');
});

for (const [label, fail] of [
  ['quota exhaustion', request => request.onload({ status: 200, responseText: JSON.stringify({
    responseStatus: 200, quotaFinished: true, responseData: { translatedText: 'quota error' }
  }) })],
  ['timeout', request => request.ontimeout()],
  ['invalid JSON', request => request.onload({ status: 200, responseText: '<html>error</html>' })]
]) {
  test('Chinese definitions preserve cached Youdao after MyMemory ' + label + ' in review', async () => {
    const app = setup();
    const { shadow, storage, prefix, context, click } = app;
    delete storage.get(prefix + 'word:alpha').translation;
    delete storage.get(prefix + 'word:alpha').translationSource;
    const before = structuredClone(storage.get(prefix + 'study:alpha'));
    const requests = [];
    context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
    await openReview(app);
    await click(findButton(shadow, '显示释义'));
    fail(requests[0]);
    await new Promise(setImmediate);
    assert.equal(requests.length, 1, 'the independently cached source is not requested again');
    assert.ok(textOf(shadow.querySelector('.review-answer')).includes('有道中文'));
    assert.ok(findButton(shadow.querySelector('.translation-mymemory'), '重试 MyMemory 中文释义'));
    assert.deepEqual(storage.get(prefix + 'study:alpha'), before);
    assert.equal([...storage.keys()].filter(key => key.startsWith(prefix + 'event:')).length, 3);
  });
}

test('Chinese definitions ignore the retired fallback setting and remove its selector', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  useSettings(app, { translationFallback: 'none' });
  delete storage.get(prefix + 'word:alpha').youdaoTranslation;
  delete storage.get(prefix + 'word:alpha').youdaoTranslatedAt;
  await click(findButton(shadow, '设置'));
  assert.equal(shadow.querySelector('.translation-fallback'), null);
  assert.ok(textOf(shadow.querySelector('.view')).includes('同时显示、分别缓存'));
  await click(shadow.querySelectorAll('.tab')[0]);
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.includes('youdao'), 'old disabling settings do not suppress the second source');
  await respondYoudao(requests[0], 'alpha', { trs: [{ tr: [{ l: { i: ['n. 阿尔法'] } }] }] });
  assert.equal(shadow.querySelector('.translation-mymemory').querySelector('.translation-copy').textContent, '中文');
  assert.equal(shadow.querySelector('.translation-youdao').querySelector('.translation-copy').textContent, 'n. 阿尔法');
});

test('Chinese definitions preserve old MyMemory text and retry it without touching cached Youdao', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  delete storage.get(prefix + 'word:alpha').translationSource;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  requests[0].onerror();
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
  assert.equal(shadow.querySelector('.translation-mymemory').querySelector('.translation-copy').textContent, '中文');
  assert.ok(textOf(shadow.querySelector('.detail')).includes('MyMemory：网络连接失败'));
  await click(findButton(shadow, '重试 MyMemory 中文释义'));
  requests[1].onerror();
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.equal(storage.get(prefix + 'word:alpha').translation, '中文');
  assert.equal(storage.get(prefix + 'word:alpha').youdaoTranslation, '有道中文');
  assert.equal(shadow.querySelector('.translation-youdao').querySelector('.translation-copy').textContent, '有道中文');
});

test('Chinese definitions share Youdao with phonetics and forms while keeping both concurrent translations', async () => {
  const { shadow, storage, prefix, context, click } = setup('/main/', '');
  const entry = storage.get(prefix + 'word:alpha');
  delete entry.translation;
  delete entry.translationSource;
  delete entry.youdaoTranslation;
  delete entry.youdaoTranslatedAt;
  delete entry.wordForms;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 2, 'repeated views share both primary and supplemental requests');
  const primary = requests.find(request => request.url.includes('mymemory'));
  await respondYoudao(requests.find(request => request.url.includes('youdao')), 'alpha', {
    ukphone: 'ælfə', trs: [{ tr: [{ l: { i: ['n. 阿尔法'] } }] }]
  });
  primary.onload({ status: 200, responseText: JSON.stringify({ responseStatus: 200, responseData: { translatedText: '机器翻译' } }) });
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.equal(storage.get(prefix + 'word:alpha').translation, '机器翻译');
  assert.equal(storage.get(prefix + 'word:alpha').youdaoTranslation, 'n. 阿尔法');
  assert.equal(storage.get(prefix + 'word:alpha').phoneticSource, 'youdao');
  assert.equal(storage.get(prefix + 'word:alpha').phonetic, '/ælfə/');
  assert.deepEqual(json(storage.get(prefix + 'word:alpha').wordForms), { base: 'alpha', forms: [] });
});

test('Chinese definitions cannot restore deleted words and only MyMemory invalidates on English changes', async () => {
  for (const remove of [true, false]) {
    const { shadow, storage, prefix, context, click } = setup();
    delete storage.get(prefix + 'word:alpha').translation;
    delete storage.get(prefix + 'word:alpha').translationSource;
    delete storage.get(prefix + 'word:alpha').youdaoTranslation;
    delete storage.get(prefix + 'word:alpha').youdaoTranslatedAt;
    const requests = [];
    context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
    await click(shadow.querySelector('.item'));
    if (remove) storage.delete(prefix + 'word:alpha');
    else storage.get(prefix + 'word:alpha').meanings[0].definitions[0].definition = 'changed';
    await respondYoudao(requests[1], 'alpha', { trs: [{ tr: [{ l: { i: ['n. 阿尔法'] } }] }] });
    requests[0].onload({ status: 200, responseText: JSON.stringify({ responseStatus: 200, responseData: { translatedText: '迟到的机器翻译' } }) });
    await new Promise(setImmediate);
    assert.equal(storage.get(prefix + 'word:alpha')?.translation, undefined);
    assert.equal(storage.get(prefix + 'word:alpha')?.youdaoTranslation, remove ? undefined : 'n. 阿尔法');
    assert.ok(findButton(shadow, '重试 MyMemory 中文释义'));
    assert.ok(textOf(shadow.querySelector('.detail')).includes(remove ? '词条已删除' : '词典释义已更新'));
  }
});

test('Chinese definitions retain MyMemory when Youdao fails and retry only the dictionary', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  delete storage.get(prefix + 'word:alpha').youdaoTranslation;
  delete storage.get(prefix + 'word:alpha').youdaoTranslatedAt;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  await respondYoudao(requests[0], 'other', { trs: [{ tr: [{ l: { i: ['错误词条'] } }] }] });
  assert.equal(shadow.querySelector('.translation-mymemory').querySelector('.translation-copy').textContent, '中文');
  assert.ok(textOf(shadow.querySelector('.translation-youdao')).includes('有道词典：'));
  await click(findButton(shadow, '重试 有道词典 中文释义'));
  assert.equal(requests.length, 2);
  await respondYoudao(requests[1], 'alpha', { trs: [{ tr: [{ l: { i: ['n. 阿尔法'] } }] }] });
  assert.equal(storage.get(prefix + 'word:alpha').translation, '中文');
  assert.equal(storage.get(prefix + 'word:alpha').youdaoTranslation, 'n. 阿尔法');
});

test('Chinese definitions migrate legacy Youdao fallback caches without labeling them as MyMemory', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  const entry = { ...storage.get(prefix + 'word:alpha'), translation: '遗留的有道中文', translationProvider: 'youdao' };
  delete entry.youdaoTranslation;
  delete entry.youdaoTranslatedAt;
  storage.set(prefix + 'word:alpha', entry);
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.includes('mymemory'));
  assert.equal(shadow.querySelector('.translation-mymemory').querySelector('.translation-copy'), null);
  assert.equal(shadow.querySelector('.translation-youdao').querySelector('.translation-copy').textContent, '遗留的有道中文');
  requests[0].onload({ status: 200, responseText: JSON.stringify({ responseStatus: 200, responseData: { translatedText: '新的机器翻译' } }) });
  await new Promise(setImmediate);
  assert.equal(storage.get(prefix + 'word:alpha').translationProvider, 'mymemory');
  assert.equal(storage.get(prefix + 'word:alpha').translation, '新的机器翻译');
  assert.equal(storage.get(prefix + 'word:alpha').youdaoTranslation, '遗留的有道中文');
  assert.equal(storage.get(prefix + 'word:alpha').youdaoTranslatedAt, entry.translatedAt);
});

test('Chinese definitions report a source-specific storage failure and leave the other cache intact', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  delete storage.get(prefix + 'word:alpha').youdaoTranslation;
  delete storage.get(prefix + 'word:alpha').youdaoTranslatedAt;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  context.GM_setValue = () => { throw new Error('storage blocked'); };
  await click(shadow.querySelector('.item'));
  await respondYoudao(requests[0], 'alpha', { trs: [{ tr: [{ l: { i: ['n. 阿尔法'] } }] }] });
  assert.ok(textOf(shadow.querySelector('.translation-youdao')).includes('有道词典：storage blocked'));
  assert.equal(storage.get(prefix + 'word:alpha').youdaoTranslation, undefined);
  assert.equal(shadow.querySelector('.translation-mymemory').querySelector('.translation-copy').textContent, '中文');
  context.GM_setValue = (key, value) => storage.set(key, value);
  await click(findButton(shadow, '重试 有道词典 中文释义'));
  await respondYoudao(requests[1], 'alpha', { trs: [{ tr: [{ l: { i: ['n. 阿尔法'] } }] }] });
  assert.equal(storage.get(prefix + 'word:alpha').youdaoTranslation, 'n. 阿尔法');
  assert.equal(storage.get(prefix + 'word:alpha').translation, '中文');
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
  assert.equal(card.querySelector('.recall-prompt').querySelector('.translation-copy').textContent, '中文\n有道中文');
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
  await click(findButton(shadow, '设置'));
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