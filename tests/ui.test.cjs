const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { translationSource, schedule, createStudy, migrateStudy } = require('../lexi.user.js');
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
      this.className = ''; this.textContent = ''; this.style = { setProperty(name, value) { this[name] = value; } }; this.scrollTop = 0;
      this.scrollLeft = 0; this.scrollHeight = this.clientHeight = 100;
      this.scrollWidth = this.clientWidth = 100; this.css = {};
      this.classList = { toggle: (name, active) => {
        const classes = new Set(this.className.split(' ').filter(Boolean));
        active ? classes.add(name) : classes.delete(name);
        this.className = [...classes].join(' ');
      } };
    }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parent = this; this.children.push(node); } }
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
    getBoundingClientRect() {
      if (this.className.split(' ').includes('launcher')) {
        const margin = window.innerWidth <= 760 ? 16 : 24;
        const left = this.style.left ? parseFloat(this.style.left) : window.innerWidth - 46 - margin;
        const top = this.style.top ? parseFloat(this.style.top) : window.innerHeight - 46 - margin;
        return { left, top, right: left + 46, bottom: top + 46, width: 46, height: 46 };
      }
      return { left: 20, right: 120, top: 30, bottom: 70, width: 100, height: 40 };
    }
    setPointerCapture(id) { this.capturedPointer = id; }
    hasPointerCapture(id) { return this.capturedPointer === id; }
    releasePointerCapture(id) { if (this.capturedPointer === id) delete this.capturedPointer; }
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
  const downloads = new Map();
  const blobs = new Map();
  class BrowserURL extends URL {
    static createObjectURL(blob) { const url = URL.createObjectURL(blob); blobs.set(url, blob); return url; }
    static revokeObjectURL(url) { blobs.delete(url); URL.revokeObjectURL(url); }
  }
  Element.prototype.click = function () {
    if (this.tag === 'a' && this.download) {
      downloads.set(this.download, blobs.get(this.href));
      BrowserURL.revokeObjectURL(this.href);
    }
  };
  document.documentElement = new Element('html');
  document.createElement = tag => new Element(tag);
  document.createTextNode = text => { const node = new Element('#text'); node.textContent = text; return node; };
  document.activeElement = new Element('button');
  const window = new Element('window');
  window.innerWidth = 1100; window.innerHeight = 800;
  if (options.viewport) window.visualViewport = Object.assign(new Element(), options.viewport);
  window.getSelection = () => null;
  const prefix = 'lexi:v1:';
  const storage = new Map();
  if (options.settings !== undefined) storage.set(prefix + 'settings', options.settings);
  if (options.launcherPosition !== undefined) storage.set(prefix + 'launcher-position', options.launcherPosition);
  const menus = new Map();
  const valueListeners = new Map();
  const alerts = [];
  for (const word of ['alpha', 'beta']) {
    const entry = { word, fetchedAt: clockNow, phonetic, ...(phonetic && phoneticSource ? { phoneticSource } : {}),
      wordForms: { base: word, forms: [] },
      examples: [], examplesFetchedAt: clockNow,
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
    window, document, Element, Date: ClockDate, TextEncoder, URL: BrowserURL, Blob, btoa, location: { href: options.url || 'https://docs.example.com/reading' },
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
  return { get shadow() { return shadow; }, storage, events, context, Element, click, prefix, advance, timers, menus, valueListeners, alerts, downloads };
}

const findButton = (shadow, label) => shadow.querySelectorAll('button').find(node => node.textContent.startsWith(label));
test('opening the studio on a scaled-down mobile page does not focus the search field', async () => {
  const desktop = setup();
  assert.equal(desktop.shadow.activeElement.getAttribute('aria-label'), '查询英文单词或句子');

  const app = setup('/test/', 'youdao', {
    open: false, viewport: { width: 980, height: 1900, scale: 0.4, offsetTop: 0, offsetLeft: 0 }
  });
  const launcher = app.shadow.querySelector('.launcher');
  launcher.focus();
  await app.click(launcher);
  assert.equal(app.shadow.activeElement, app.shadow.querySelector('.studio'));
  await app.click(app.shadow.querySelector('.top').querySelector('.icon'));
  assert.equal(app.shadow.activeElement, launcher);
});

const openReview = async app => {
  await app.click(app.shadow.querySelectorAll('.tab')[2]);
  await app.click(findButton(app.shadow, '开始复习'));
};

function selectWebsite(app, word, pointerType = 'mouse') {
  let value = word;
  const node = new app.Element('p');
  node.textContent = word;
  const text = { isConnected: true, parentElement: node };
  const range = { startContainer: text, endContainer: text, collapsed: false,
    toString: () => value, getBoundingClientRect: () => node.getBoundingClientRect() };
  range.getClientRects = () => [range.getBoundingClientRect()];
  range.cloneRange = () => ({ ...range });
  const selection = {
    isCollapsed: false, rangeCount: 1, anchorNode: { parentElement: node },
    toString() { return this.rangeCount ? value : ''; }, getRangeAt: () => range,
    removeAllRanges() { this.rangeCount = 0; this.isCollapsed = true; this.anchorNode = null; }
  };
  app.context.window.getSelection = () => selection;
  app.context.document.listeners.pointerup.listener({ button: 0, pointerType, target: node, composedPath: () => [node] });
  return { node, range, selection, setText: next => { value = next; } };
}

function launcherPointer(app, type, clientX, clientY, extra = {}) {
  const launcher = app.shadow.querySelector('.launcher');
  launcher.listeners[type].listener({
    type, button: 0, pointerId: 1, isPrimary: true, clientX, clientY, preventDefault() {}, ...extra
  });
  return launcher;
}

test('launcher drags freely with its grab offset, persists across pages and does not open on release', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const launcher = launcherPointer(app, 'pointerdown', 1040, 740);
  assert.equal(launcher.hasPointerCapture(1), true);
  launcherPointer(app, 'pointermove', 310, 250);
  assert.equal(launcher.style.left, '300px');
  assert.equal(launcher.style.top, '240px');
  launcherPointer(app, 'pointermove', 700, 500, { pointerId: 2 });
  assert.equal(launcher.style.left, '300px', 'a second pointer cannot move the launcher');
  launcherPointer(app, 'pointerup', 310, 250);
  assert.equal(launcher.hasPointerCapture(1), false);
  await app.click(launcher);
  assert.equal(app.shadow.querySelector('.overlay').hidden, true, 'the click generated by a drag is suppressed');
  const position = app.storage.get(app.prefix + 'launcher-position');
  const restored = setup('/test/', 'youdao', { open: false, url: 'https://other.example.org/', launcherPosition: position });
  assert.equal(restored.shadow.querySelector('.launcher').style.left, '300px');
  assert.equal(restored.shadow.querySelector('.launcher').style.top, '240px');
  restored.context.window.innerWidth = 390;
  restored.context.window.innerHeight = 300;
  restored.context.window.listeners.resize.listener();
  const rect = restored.shadow.querySelector('.launcher').getBoundingClientRect();
  assert.ok(Math.abs(rect.left - 344 * position.x) < 0.001);
  assert.ok(Math.abs(rect.top - 254 * position.y) < 0.001);
  assert.ok(rect.left >= 0 && rect.top >= 0 && rect.right <= 390 && rect.bottom <= 300);
  launcherPointer(app, 'pointerdown', 310, 250);
  launcherPointer(app, 'pointermove', 312, 252);
  launcherPointer(app, 'pointerup', 312, 252);
  await app.click(launcher);
  assert.equal(app.shadow.querySelector('.overlay').hidden, false, 'a slightly shaky click still opens the studio');
});

test('launcher stays within viewport edges and cancellation or lost capture restores the saved placement', () => {
  const position = { x: 0.5, y: 0.5 };
  const app = setup('/test/', 'youdao', { open: false, launcherPosition: position });
  const launcher = launcherPointer(app, 'pointerdown', 540, 390);
  const savedLeft = launcher.style.left, savedTop = launcher.style.top;
  launcherPointer(app, 'pointermove', -2000, 5000);
  assert.equal(launcher.style.left, '0px');
  assert.equal(launcher.style.top, '754px');
  launcherPointer(app, 'pointercancel', -2000, 5000);
  assert.equal(launcher.style.left, savedLeft);
  assert.equal(launcher.style.top, savedTop);
  assert.equal(app.storage.get(app.prefix + 'launcher-position'), position);
  assert.equal(launcher.hasPointerCapture(1), false);
  launcherPointer(app, 'pointerdown', 540, 390);
  launcherPointer(app, 'pointermove', 5000, -2000);
  assert.equal(launcher.style.left, '1054px');
  assert.equal(launcher.style.top, '0px');
  launcherPointer(app, 'lostpointercapture', 5000, -2000);
  assert.equal(launcher.style.left, savedLeft);
  launcherPointer(app, 'pointerdown', 540, 390);
  launcherPointer(app, 'pointermove', 5000, -2000);
  launcherPointer(app, 'pointerup', 5000, -2000);
  assert.equal(app.storage.get(app.prefix + 'launcher-position').x, 1);
  assert.equal(app.storage.get(app.prefix + 'launcher-position').y, 0);
});

test('launcher ignores secondary buttons and non-primary touches, while keyboard activation still works after dragging', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const launcher = launcherPointer(app, 'pointerdown', 1040, 740, { button: 2 });
  launcherPointer(app, 'pointermove', 300, 200);
  launcherPointer(app, 'pointerup', 300, 200);
  launcherPointer(app, 'pointerdown', 1040, 740, { isPrimary: false });
  launcherPointer(app, 'pointermove', 300, 200);
  launcherPointer(app, 'pointerup', 300, 200);
  assert.equal(app.storage.has(app.prefix + 'launcher-position'), false);
  launcherPointer(app, 'pointerdown', 1040, 740);
  launcherPointer(app, 'pointermove', 300, 200);
  launcherPointer(app, 'pointerup', 300, 200);
  launcher.listeners.keydown.listener({ key: 'Enter' });
  await app.click(launcher);
  assert.equal(app.shadow.querySelector('.overlay').hidden, false);
});

test('launcher reports storage failures and restores the previous position instead of claiming it was saved', () => {
  const position = { x: 0.5, y: 0.5 };
  const app = setup('/test/', 'youdao', { open: false, launcherPosition: position });
  const launcher = app.shadow.querySelector('.launcher');
  const left = launcher.style.left;
  app.context.GM_setValue = () => { throw new Error('磁盘已满'); };
  launcherPointer(app, 'pointerdown', 540, 390);
  launcherPointer(app, 'pointermove', 300, 200);
  launcherPointer(app, 'pointerup', 300, 200);
  assert.equal(launcher.style.left, left);
  assert.equal(app.storage.get(app.prefix + 'launcher-position'), position);
  assert.equal(app.shadow.querySelector('.toast').textContent, '入口位置保存失败：磁盘已满');
});

test('disabling a page during a drag releases capture without persisting an unfinished move', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const launcher = launcherPointer(app, 'pointerdown', 1040, 740);
  launcherPointer(app, 'pointermove', 300, 200);
  await app.menus.get('禁用此页面')();
  assert.equal(launcher.hasPointerCapture(1), false);
  assert.equal(app.storage.has(app.prefix + 'launcher-position'), false);
  await app.menus.get('解除此页面禁用')();
  assert.equal(launcher.style.left, '');
  assert.equal(launcher.hidden, false);
});

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
  const app = setup('/test/', 'youdao', { rules: [rule], launcherPosition: { x: 0.5, y: 0.5 } });
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
  assert.equal(app.storage.has(app.prefix + 'launcher-position'), false);
  assert.equal(app.shadow.querySelector('.launcher').style.left, '');
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

test('JSON backups above the old 5 MiB limit restore vocabulary, repeated history and both card directions', async () => {
  const original = setup();
  const { storage, prefix } = original;
  const at = original.context.Date.now();
  const meaning = schedule(createStudy('alpha', at - 86400000), 'easy', at - 86400000);
  const recall = schedule(createStudy('alpha', at), 'good', at);
  storage.set(prefix + 'study:alpha', meaning);
  storage.set(prefix + 'recall:alpha', recall);
  await original.click(findButton(original.shadow, '设置'));

  for (const large of [false, true]) {
    if (large) {
      for (let i = 0; i < 3000; i++) {
        const word = 'fixture' + String.fromCharCode(97 + Math.floor(i / 676), 97 + Math.floor(i / 26) % 26, 97 + i % 26);
        storage.set(prefix + 'word:' + word, { word, fetchedAt: at, phonetic: '', meanings: [{
          partOfSpeech: 'noun', definitions: [
            { definition: '释义'.repeat(450), example: '' },
            { definition: '例句'.repeat(450), example: '' }
          ]
        }] });
      }
    }
    await original.click(findButton(original.shadow, '导出 JSON 备份'));
    const file = [...original.downloads.values()][0];
    assert.ok(file, 'export starts a file download');
    assert.equal(file.size > 5 * 1024 * 1024, large);

    const localSettings = { newPerDay: 3, reverse: true };
    const restored = setup('/test/', 'youdao', { settings: localSettings });
    for (const key of restored.storage.keys()) if (key !== prefix + 'settings') restored.storage.delete(key);
    await restored.click(findButton(restored.shadow, '设置'));
    const upload = restored.shadow.querySelectorAll('input').find(node => node.type === 'file');
    upload.files = [file];
    upload.listeners.change.listener();
    await new Promise(setImmediate);
    assert.match(restored.shadow.querySelector('.toast').textContent, /合并完成/);
    assert.equal([...restored.storage.keys()].filter(key => key.startsWith(prefix + 'word:')).length, large ? 3002 : 2);
    for (const event of original.events) {
      const actual = restored.storage.get(prefix + 'event:' + event.id);
      assert.deepEqual([actual.id, actual.word, actual.at], [event.id, event.word, event.at]);
    }
    for (const [key, expected] of [['study:alpha', meaning], ['recall:alpha', recall]]) {
      assert.deepEqual(JSON.parse(JSON.stringify(restored.storage.get(prefix + key))), expected);
    }
    assert.deepEqual(restored.storage.get(prefix + 'settings'), localSettings);
  }
});

test('JSON export refuses a collection beyond the restore record limit without downloading a backup', async () => {
  const app = setup();
  await app.click(findButton(app.shadow, '设置'));
  const template = app.storage.get(app.prefix + 'word:alpha');
  for (let i = 0; i < 9999; i++) {
    const word = 'fixture' + String.fromCharCode(97 + Math.floor(i / 676), 97 + Math.floor(i / 26) % 26, 97 + i % 26);
    app.storage.set(app.prefix + 'word:' + word, { ...template, word });
  }
  await app.click(findButton(app.shadow, '导出 JSON 备份'));
  assert.match(app.shadow.querySelector('.toast').textContent, /备份超过记录上限/);
  assert.equal(app.downloads.size, 0);
});

test('import preview distinguishes replay from incomplete history and cancellation saves nothing', async () => {
  const app = setup('/test/', 'youdao', { settings: { retention: 0.95 } });
  const { storage, prefix, context, shadow, click } = app;
  const now = context.Date.now();
  const initial = schedule(createStudy('beta', now - 4 * DAY), 'easy', now - 4 * DAY);
  const local = schedule(initial, 'good', now - 2 * DAY);
  const incomingBeta = schedule(initial, 'again', now - DAY);
  storage.set(prefix + 'study:beta', local);
  const localAlpha = storage.get(prefix + 'study:alpha');
  const incomingAlpha = schedule(localAlpha, 'good', now);
  const data = { schemaVersion: 3, words: ['alpha', 'beta'].map(word => storage.get(prefix + 'word:' + word)),
    history: [], book: [incomingAlpha, incomingBeta], recall: [] };
  await click(findButton(shadow, '设置'));
  let preview;
  let confirmed = false;
  context.confirm = text => { preview = text; return confirmed; };
  async function uploadBackup() {
    const upload = shadow.querySelectorAll('input').find(node => node.type === 'file');
    upload.files = [new Blob([JSON.stringify(data)])];
    upload.listeners.change.listener();
    await new Promise(setImmediate);
  }
  await uploadBackup();
  assert.match(preview, /合并并重放：1 张/);
  assert.match(preview, /日志不全，保留较新进度：1 张/);
  assert.match(preview, /95%.*可能改变下次复习日期/);
  assert.equal(storage.get(prefix + 'study:alpha'), localAlpha);
  assert.equal(storage.get(prefix + 'study:beta'), local);
  confirmed = true;
  await uploadBackup();
  assert.deepEqual(json(storage.get(prefix + 'study:alpha')), incomingAlpha);
  const replay = storage.get(prefix + 'study:beta');
  assert.deepEqual(json(replay.log.map(({ at, rating }) => [at, rating])),
    [[now - 4 * DAY, 4], [now - 2 * DAY, 3], [now - DAY, 1]]);
});

async function setupNutstore() {
  const app = setup();
  const { storage, prefix, context, shadow, click } = app;
  const requests = [];
  context.GM_xmlhttpRequest = options => {
    requests.push(options);
    return { abort() { options.onabort(); } };
  };
  context.prompt = () => 'fixture-app-password';
  await click(findButton(shadow, '设置'));
  shadow.querySelectorAll('input').find(node => node.type === 'email').value = 'lexi@example.com';
  const folder = shadow.querySelectorAll('.sync-field').find(row => textOf(row).includes('同步文件夹'));
  folder.querySelector('input').value = '词库 2026';
  await click(findButton(shadow, '保存同步配置'));
  assert.equal(requests.length, 0, 'saving settings does not start synchronization');
  const start = () => click(findButton(shadow, '立即同步'));
  const finish = async () => {
    for (let i = 0; i < 30 && findButton(shadow, '立即同步').disabled; i++) await new Promise(setImmediate);
    assert.equal(findButton(shadow, '立即同步').disabled, false, 'sync has settled');
  };
  return { ...app, requests, start, finish, config: () => storage.get(prefix + 'nutstore-sync') };
}

function nutstoreFixture(entries = []) {
  const files = new Map(entries);
  const dav = (localName, content) => ({
    namespaceURI: 'DAV:', localName, textContent: typeof content === 'string' ? content : '',
    children: typeof content === 'string' ? [] : content
  });
  function connect(app, id, intercept = () => false) {
    let fileId = 0;
    app.context.crypto.randomUUID = () => `00000000-0000-4000-8000-${id}${String(++fileId).padStart(11, '0')}`;
    app.context.DOMParser = class {
      parseFromString(source) {
        return { documentElement: dav('multistatus', JSON.parse(source).map(name => dav('response', [
          dav('href', name.startsWith('https://') ? name : '/dav/词库%202026/' + name),
          dav('propstat', [dav('prop', [dav('resourcetype', [])]), dav('status', 'HTTP/1.1 200 OK')])
        ]))) };
      }
    };
    app.context.GM_xmlhttpRequest = request => {
      const { method, url, data, onload } = request;
      const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      app.requests.push(request);
      const respond = () => {
        if (method === 'PROPFIND') onload({ status: 207, responseText: JSON.stringify([...files.keys()]) });
        else if (method === 'GET') onload(files.has(name) ? { status: 200, responseText: files.get(name) } : { status: 404 });
        else if (method === 'PUT') {
          if (files.has(name)) onload({ status: 412 });
          else { files.set(name, data); onload({ status: 201 }); }
        } else if (method === 'DELETE') onload({ status: files.delete(name) ? 204 : 404 });
        else assert.fail(`Unexpected HTTP method ${method}`);
      };
      setImmediate(() => { if (!intercept(request, name, respond)) respond(); });
      return { abort() {} };
    };
  }
  return { files, connect };
}

test('Nutstore round-trips phone and desktop data without any ETag or reconfiguration', async () => {
  const phone = await setupNutstore();
  const desktop = await setupNutstore();
  const at = desktop.context.Date.now();
  const card = schedule(createStudy('gamma', at - DAY), 'good', at - DAY);
  const legacy = JSON.stringify({ schemaVersion: 3, words: [{ ...desktop.storage.get(desktop.prefix + 'word:beta'), word: 'gamma' }],
    history: [], book: [card], recall: [card], settings: { retention: 0.95 }, siteRules: [{ type: 'domain', value: 'docs.example.com' }] });
  const { files, connect } = nutstoreFixture([['lexi-sync.json', legacy]]);
  phone.storage.set(phone.prefix + 'event:phone-only-1', { id: 'phone-only-1', word: 'alpha', at: 100 });
  connect(phone, 1);
  connect(desktop, 2);
  await phone.start();
  await phone.finish();
  assert.match(phone.shadow.querySelector('.toast').textContent, /同步完成/);
  assert.equal(phone.storage.has(phone.prefix + 'word:gamma'), true);
  assert.deepEqual(json(phone.storage.get(phone.prefix + 'study:gamma')), card);
  assert.deepEqual(json(phone.storage.get(phone.prefix + 'recall:gamma')), card);
  assert.equal(phone.storage.has(phone.prefix + 'settings'), false);
  assert.equal(phone.storage.has(phone.prefix + 'disabled:domain:docs.example.com'), false);
  assert.equal(files.size, 2);
  assert.equal(files.get('lexi-sync.json'), legacy);
  await desktop.start();
  await desktop.finish();
  assert.equal(desktop.storage.has(desktop.prefix + 'event:phone-only-1'), true, 'the computer receives the phone’s local changes');
  assert.ok(desktop.requests.every(request => request.method !== 'PUT'), 'no unchanged snapshot is uploaded');
});

test('Nutstore first sync is manual, creates a new file, and does not export credentials', async () => {
  const app = await setupNutstore();
  const { requests, start, finish, config, shadow, click, downloads } = app;
  const { files, connect } = nutstoreFixture();
  let release;
  connect(app, 1, (request, _name, respond) => {
    if (request.method !== 'GET' || release) return false;
    release = respond;
    return true;
  });
  await click(findButton(shadow, '导出 JSON 备份'));
  const backup = await [...downloads.values()][0].text();
  assert.doesNotMatch(backup, /fixture-app-password|lexi@example\.com/);
  await start();
  await start();
  assert.equal(requests.length, 1, 'a pending sync cannot be started a second time');
  assert.equal(requests[0].url, 'https://dav.jianguoyun.com/dav/%E8%AF%8D%E5%BA%93%202026/lexi-sync.json');
  assert.equal(requests[0].headers.Authorization, 'Basic ' + btoa('lexi@example.com:fixture-app-password'));
  assert.equal(requests[0].redirect, 'error');
  release();
  await finish();
  const put = requests.find(request => request.method === 'PUT');
  assert.equal(put.headers['If-None-Match'], '*');
  assert.equal(put.headers['If-Match'], undefined);
  assert.match(put.url, /\/lexi-sync-snapshot-[0-9a-f-]{36}\.json$/);
  const uploaded = JSON.parse(put.data);
  assert.deepEqual(Object.keys(uploaded), ['schemaVersion', 'words', 'history', 'book', 'recall']);
  assert.equal(uploaded.history.length, 3);
  assert.equal(files.size, 1);
  assert.equal(config().lastSyncAt, app.context.Date.now());
  const count = requests.length;
  await click(findButton(shadow, '清除同步配置'));
  assert.equal(config(), undefined);
  assert.equal(app.storage.has(app.prefix + 'word:alpha'), true);
  assert.equal(requests.length, count);
});

test('Nutstore preserves concurrent uploads and compacts only snapshots that were actually merged', async () => {
  const phone = await setupNutstore(), desktop = await setupNutstore();
  const { files, connect } = nutstoreFixture([['unrelated.json', 'keep']]);
  let holdUpload = false, releaseUpload;
  connect(phone, 1, (request, _name, respond) => {
    if (request.method !== 'PUT' || !holdUpload) return false;
    releaseUpload = respond;
    return true;
  });
  connect(desktop, 2);
  await phone.start();
  await phone.finish();
  phone.storage.set(phone.prefix + 'event:only-phone-1', { id: 'only-phone-1', word: 'alpha', at: 100 });
  desktop.storage.set(desktop.prefix + 'event:only-desktop-1', { id: 'only-desktop-1', word: 'beta', at: 200 });
  // Hold the phone's upload until the desktop has merged and compacted the common baseline.
  holdUpload = true;
  await phone.start();
  for (let i = 0; i < 20 && !releaseUpload; i++) await new Promise(setImmediate);
  assert.ok(releaseUpload);
  await desktop.start();
  await desktop.finish();
  holdUpload = false;
  releaseUpload();
  await phone.finish();
  assert.equal(files.size, 3, 'both concurrent uploads survive along with the unrelated file');
  await desktop.start();
  await desktop.finish();
  assert.equal(files.size, 2, 'both snapshots are compacted into one');
  assert.equal(files.get('unrelated.json'), 'keep');
  await phone.start();
  await phone.finish();
  assert.ok(phone.storage.has(phone.prefix + 'event:only-desktop-1'));
  assert.ok(desktop.storage.has(desktop.prefix + 'event:only-phone-1'));
});

test('Nutstore refuses invalid cloud data and preserves concurrent local edits', async () => {
  const app = await setupNutstore();
  const { storage, prefix, shadow, requests, start, finish, config } = app;
  const { files, connect } = nutstoreFixture([['lexi-sync.json', '<html>not a backup</html>']]);
  let rejectUpload = false;
  connect(app, 1, (request, _name, respond) => {
    if (request.method !== 'PUT') return false;
    if (rejectUpload) request.onload({ status: 412 });
    else {
      storage.delete(prefix + 'event:history-event-0');
      storage.set(prefix + 'revision', 'edited-by-another-tab');
      respond();
    }
    return true;
  });
  const toast = () => shadow.querySelector('.toast').textContent;
  await start();
  await finish();
  assert.match(toast(), /不是有效的 Lexi JSON/);
  const remote = { schemaVersion: 3, words: [storage.get(prefix + 'word:beta')],
    history: [{ id: 'remote-event-2', word: 'beta', at: 100 }], book: [], recall: [] };
  files.set('lexi-sync.json', JSON.stringify(remote));
  rejectUpload = true;
  await start();
  await finish();
  assert.match(toast(), /云端文件已变化/);
  assert.equal(storage.has(prefix + 'event:remote-event-2'), false);
  rejectUpload = false;
  await start();
  await finish();
  assert.match(toast(), /本机数据或配置已变化/);
  assert.ok(requests.every(request => request.method !== 'DELETE'));
  assert.equal(storage.has(prefix + 'event:history-event-0'), false);
  assert.equal(storage.has(prefix + 'event:remote-event-2'), false);
  assert.equal(config().lastSyncAt, 0);
});

test('Nutstore refreshes a listing when a concurrent sync compacts it before download', async () => {
  const app = await setupNutstore();
  const old = 'lexi-sync-snapshot-00000000-0000-4000-8000-000000000001.json';
  const next = 'lexi-sync-snapshot-00000000-0000-4000-8000-000000000002.json';
  const backup = word => JSON.stringify({ schemaVersion: 3, words: [{ ...app.storage.get(app.prefix + 'word:alpha'), word }],
    history: [], book: [], recall: [] });
  const { files, connect } = nutstoreFixture([[old, backup('gamma')]]);
  // The replacement includes the old record and one new record from the other device.
  const replacement = JSON.parse(backup('gamma'));
  replacement.words.push(JSON.parse(backup('delta')).words[0]);
  connect(app, 1, (request, name) => {
    if (request.method === 'GET' && name === old) {
      files.delete(old);
      files.set(next, JSON.stringify(replacement));
    }
    return false;
  });
  await app.start();
  await app.finish();
  assert.equal(app.requests.filter(request => request.method === 'PROPFIND').length, 2);
  assert.ok(app.storage.has(app.prefix + 'word:gamma'));
  assert.ok(app.storage.has(app.prefix + 'word:delta'));
  assert.equal(files.size, 1);
});

test('settings can still import v1 and v2 progress backups', async () => {
  for (const version of [1, 2]) {
    const app = setup();
    const word = app.storage.get(app.prefix + 'word:alpha');
    const legacy = app.storage.get(app.prefix + 'study:alpha');
    app.storage.delete(app.prefix + 'study:alpha');
    const data = { schemaVersion: version, words: [word], history: [], book: [version === 1 ? legacy : migrateStudy(legacy)] };
    await app.click(findButton(app.shadow, '设置'));
    const upload = app.shadow.querySelectorAll('input').find(node => node.type === 'file');
    upload.files = [new Blob([JSON.stringify(data)])];
    upload.listeners.change.listener();
    await new Promise(setImmediate);
    assert.match(app.shadow.querySelector('.toast').textContent, /合并完成/);
    const progress = app.storage.get(app.prefix + 'study:alpha');
    assert.equal(progress.fsrs.due, legacy.dueAt);
    assert.equal(progress.reviews, legacy.reviews);
  }
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

const respondExamples = async (request, pairs, word = 'alpha') => {
  const full = new URL(request.url).searchParams.get('q') === 'lj:' + word;
  request.onload({ status: 200, responseText: JSON.stringify({
    input: full ? 'lj:' + word : word, ec: { word: [{ 'return-phrase': word, ukphone: 'test', wfs: [] }] },
    [full ? 'blng_sents' : 'blng_sents_part']: { 'sentence-pair': pairs }
  }) });
  await new Promise(setImmediate);
};
test('usage examples share enrichment requests, render safe bilingual text and persist across library and review', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const entry = storage.get(prefix + 'word:alpha');
  delete entry.examples;
  delete entry.examplesFetchedAt;
  delete entry.wordForms;
  entry.meanings[0].definitions[0].example = 'An alpha example from the main dictionary.';
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  const events = JSON.stringify(app.events);
  const progress = JSON.stringify(storage.get(prefix + 'study:alpha'));
  await click(shadow.querySelector('.item'));
  await click(shadow.querySelector('.item'));
  if (findButton(shadow, '获取用法例句')) await click(findButton(shadow, '获取用法例句'));
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(new URL(requests[0].url).searchParams.get('dicts')),
    { count: 3, dicts: [['ec', 'blng_sents_part']] });
  storage.set(prefix + 'word:alpha', { ...entry, translation: 'Concurrent update' });
  const sentence = 'Alpha and alpha, not alphabet. <img src=x onerror=alert(1)>';
  await respondExamples(requests[0], [{ sentence, 'sentence-translation': '测试双语例句', source: 'Fixture source' }]);
  const block = shadow.querySelector('.usage-examples');
  assert.equal(textOf(block.querySelector('.example-en')), sentence);
  assert.equal(block.querySelector('.example-zh').textContent, '测试双语例句');
  assert.equal(block.parent.children.at(-1), block, 'usage examples are the final definition-card section');
  assert.deepEqual(block.querySelectorAll('strong').map(node => node.textContent), ['Alpha', 'alpha']);
  assert.equal(block.querySelectorAll('img').length, 0);
  assert.match(textOf(block), /Fixture source/);
  assert.match(textOf(shadow.querySelector('.detail')), /例句：An alpha example from the main dictionary/);
  assert.equal(storage.get(prefix + 'word:alpha').translation, 'Concurrent update');
  assert.equal(storage.get(prefix + 'word:alpha').examples.length, 1);
  assert.equal(JSON.stringify(app.events), events);
  assert.equal(JSON.stringify(storage.get(prefix + 'study:alpha')), progress);
  await click(findButton(shadow, '生词本'));
  await click(shadow.querySelector('.item'));
  assert.equal(textOf(shadow.querySelector('.example-en')), sentence);
  await openReview(app);
  assert.equal(shadow.querySelector('.usage-examples'), null);
  await click(findButton(shadow, '显示释义'));
  assert.equal(textOf(shadow.querySelector('.review-answer').querySelector('.example-en')), sentence);
  assert.equal(shadow.querySelector('.review-answer').children.at(-1).className, 'usage-examples sense',
    'usage examples follow the English and Chinese explanations in review answers');
  assert.equal(requests.length, 1);
  storage.set(prefix + 'word:alpha', { ...storage.get(prefix + 'word:alpha'), fetchedAt: 1 });
  const query = shadow.querySelector('.search');
  query.querySelector('input').value = 'alpha';
  await click(query.querySelector('button'));
  requests[1].onload({ status: 200, responseText: JSON.stringify([{
    meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'alpha' }] }]
  }]) });
  await new Promise(setImmediate);
  assert.equal(storage.get(prefix + 'word:alpha').examples[0].sentence, sentence);
  assert.equal(requests.length, 2, 'dictionary refresh preserves the example cache');
});
test('expanded examples refresh old caches and remain available in cache-only review', async () => {
  const app = setup('/test/', 'youdao', { settings: { reviewCacheOnly: true } });
  const { shadow, storage, prefix, context, click } = app;
  const entry = storage.get(prefix + 'word:alpha');
  entry.examples = [{ sentence: 'Old alpha example.', translation: '', source: '' }];
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  const progress = JSON.stringify(storage.get(prefix + 'study:alpha'));
  const events = JSON.stringify(app.events);
  await click(shadow.querySelector('.item'));
  await click(findButton(shadow, '更新用法例句'));
  assert.equal(new URL(requests[0].url).searchParams.get('q'), 'lj:alpha');
  assert.deepEqual(JSON.parse(new URL(requests[0].url).searchParams.get('dicts')),
    { count: 12, dicts: [['blng_sents']] });
  const pairs = Array.from({ length: 12 }, (_, index) => ({ sentence: `Alpha usage ${index + 1}.` }));
  await respondExamples(requests[0], pairs);
  assert.equal(shadow.querySelectorAll('.example-en').length, 12);
  assert.equal(textOf(shadow.querySelectorAll('.example-en').at(-1)), pairs.at(-1).sentence);
  await click(findButton(shadow, '更新释义'));
  const definitions = Array.from({ length: 20 }, (_, index) => ({
    definition: `Alpha meaning ${index + 1}.`, example: `Alpha sense example ${index + 1}.`
  }));
  requests[1].onload({ status: 200, responseText: JSON.stringify([{
    meanings: [{ partOfSpeech: 'noun', definitions }]
  }]) });
  await new Promise(setImmediate);
  assert.equal(shadow.querySelectorAll('.definition').length, 20);
  assert.ok(findButton(shadow.querySelector('.detail-pane'), '删除'), 'refresh keeps the library delete action');
  assert.match(textOf(shadow.querySelector('.detail')), /Alpha sense example 20/);
  assert.equal(shadow.querySelectorAll('.example-en').length, 12);
  assert.equal(storage.get(prefix + 'word:alpha').meanings[0].definitions.length, 20);
  assert.equal(storage.get(prefix + 'word:alpha').translation, undefined, 'obsolete translation is not reused');
  const refreshCount = requests.length;
  await click(findButton(shadow, '更新释义'));
  requests[refreshCount].onload({ status: 200, responseText: JSON.stringify([{
    meanings: [{ partOfSpeech: 'noun', definitions: definitions.map(def => ({
      ...def, example: def.example + ' Updated.'
    })) }]
  }]) });
  await new Promise(setImmediate);
  assert.match(textOf(shadow.querySelector('.detail')), /Alpha sense example 20\. Updated\./,
    'repeated refreshes update the visible detail rather than a detached container');
  await openReview(app);
  assert.equal(shadow.querySelector('.usage-examples'), null);
  await click(findButton(shadow, '显示释义'));
  assert.match(textOf(shadow.querySelector('.review-answer')), /Alpha sense example 20/);
  assert.equal(shadow.querySelectorAll('.example-en').length, 12);
  assert.equal(JSON.stringify(storage.get(prefix + 'study:alpha')), progress);
  assert.equal(JSON.stringify(app.events), events);
});

test('failed refreshes keep cached examples and definitions and offer retries', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const entry = storage.get(prefix + 'word:alpha');
  entry.examples = [{ sentence: 'Old alpha example.', translation: '', source: '' }];
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  const cached = JSON.stringify(storage.get(prefix + 'word:alpha'));
  await click(findButton(shadow, '更新释义'));
  requests[0].onerror();
  await new Promise(setImmediate);
  assert.match(textOf(shadow.querySelector('.detail')), /更新释义失败/);
  assert.equal(findButton(shadow, '更新释义').disabled, false);
  await click(findButton(shadow, '更新用法例句'));
  requests[1].onerror();
  await new Promise(setImmediate);
  assert.equal(textOf(shadow.querySelector('.example-en')), 'Old alpha example.');
  assert.ok(findButton(shadow, '重试用法例句'));
  assert.equal(JSON.stringify(storage.get(prefix + 'word:alpha')), cached);
});

test('missing examples support cache-only review, retry errors and cache explicit absence', async () => {
  const app = setup('/test/', 'youdao', { settings: { reviewCacheOnly: true } });
  const { shadow, storage, prefix, context, click } = app;
  delete storage.get(prefix + 'word:alpha').examples;
  delete storage.get(prefix + 'word:alpha').examplesFetchedAt;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await openReview(app);
  await click(findButton(shadow, '显示释义'));
  assert.equal(requests.length, 0);
  await click(findButton(shadow, '获取用法例句'));
  requests[0].onerror();
  await new Promise(setImmediate);
  assert.ok(shadow.querySelector('.usage-examples').querySelector('.notice'));
  assert.equal(storage.get(prefix + 'word:alpha').examples, undefined);
  await click(findButton(shadow, '重试用法例句'));
  await respondExamples(requests[1], []);
  assert.match(textOf(shadow.querySelector('.usage-examples')), /暂未找到/);
  assert.deepEqual(JSON.parse(JSON.stringify(storage.get(prefix + 'word:alpha').examples)), []);
  await click(findButton(shadow, '查词历史'));
  await click(shadow.querySelector('.item'));
  assert.equal(requests.length, 2, 'known absence is not repeatedly fetched');
});
test('late example responses cannot recreate a deleted word or write after disabling the site', async () => {
  for (const disable of [false, true]) {
    const app = setup();
    const { shadow, storage, prefix, context, click } = app;
    delete storage.get(prefix + 'word:alpha').examples;
    delete storage.get(prefix + 'word:alpha').examplesFetchedAt;
    const requests = [];
    context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
    await click(shadow.querySelector('.item'));
    if (findButton(shadow, '获取用法例句')) await click(findButton(shadow, '获取用法例句'));
    if (disable) {
      storage.set(prefix + 'disabled:domain:docs.example.com', { type: 'domain', value: 'docs.example.com' });
      app.valueListeners.get(prefix + 'revision')();
    } else storage.delete(prefix + 'word:alpha');
    await respondExamples(requests[0], [{ sentence: 'Alpha is a label.' }]);
    assert.equal(storage.get(prefix + 'word:alpha')?.examples, undefined);
  }
});

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

test('review hides answers until recalled, shows state-only feedback and persists a grade only once', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const original = structuredClone(storage.get(prefix + 'study:alpha'));
  await openReview(app);
  assert.equal(shadow.querySelector('.review-answer'), null);
  for (const label of ['忘记', '困难', '记得', '轻松']) assert.ok(findButton(shadow, label));
  await click(findButton(shadow, '显示释义'));
  assert.ok(shadow.querySelector('.review-answer').querySelector('.sense'));
  for (const label of ['忘记', '困难', '记得', '轻松']) {
    const action = findButton(shadow, label);
    assert.ok(action);
    assert.equal(action.textContent, label);
    assert.doesNotMatch(action.title, /分钟|天|下次复习/);
    assert.doesNotMatch(action.attributes['aria-label'], /分钟|天|下次复习/);
  }
  const action = findButton(shadow, '记得');
  await Promise.all([click(action), click(action)]);
  const saved = storage.get(prefix + 'study:alpha');
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), schedule(original, 'good', context.Date.now()));
  assert.ok(shadow.querySelector('.review').querySelector('h2').textContent.includes('本轮已完成'));
  await click(findButton(shadow, '返回复习概览'));
  assert.deepEqual(shadow.querySelectorAll('.stat').map(node => node.querySelector('strong').textContent), ['0', '0', '1', '1']);
  assert.equal(shadow.querySelector('.review-plan').querySelector('.term').textContent, 'alpha');
});

test('review grade guide explains all four grades without changing progress', async () => {
  const app = setup();
  const { shadow, storage, click, prefix } = app;
  const original = structuredClone(storage.get(prefix + 'study:alpha'));
  await openReview(app);
  for (const revealed of [false, true]) {
    if (revealed) await click(findButton(shadow, '显示释义'));
    const trigger = shadow.querySelector('.review-grade-help');
    const guide = shadow.querySelector('.review-grade-guide');
    assert.equal(shadow.querySelector('.review-grades').children.at(-1), trigger);
    assert.equal(trigger.getAttribute('aria-controls'), guide.id);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(guide.hidden, true);
    await click(trigger);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(guide.hidden, false);
    assert.deepEqual(guide.querySelectorAll('dt').map(textOf), ['1忘记', '2困难', '3记得', '4轻松']);
    assert.equal(guide.querySelectorAll('dd').length, 4);
    assert.equal(Boolean(shadow.querySelector('.review-answer')), revealed);
    if (revealed) {
      await press(app, 'Escape', trigger);
      assert.equal(shadow.activeElement, trigger);
      assert.equal(shadow.querySelector('.overlay').hidden, false);
    } else await click(trigger);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(guide.hidden, true);
    assert.deepEqual(storage.get(prefix + 'study:alpha'), original);
  }
});

test('state-only feedback still saves the correct FSRS schedule for new and learned words', async () => {
  for (const fresh of [true, false]) {
    for (const revealed of [false, true]) {
      for (const [grade, label] of [['again', '忘记'], ['hard', '困难'], ['good', '记得'], ['easy', '轻松']]) {
        const app = setup();
        const { storage, prefix, context, shadow, click } = app;
        if (fresh) storage.set(prefix + 'study:alpha', createStudy('alpha', context.Date.now()));
        const before = structuredClone(storage.get(prefix + 'study:alpha'));
        const expected = schedule(before, grade, context.Date.now());
        await openReview(app);
        if (revealed) await click(findButton(shadow, '显示释义'));
        else assert.equal(shadow.querySelector('.review-answer'), null);
        const action = findButton(shadow, label);
        assert.equal(action.textContent, label);
        await click(action);
        assert.deepEqual(JSON.parse(JSON.stringify(storage.get(prefix + 'study:alpha'))), expected);
      }
    }
  }
});

test('review number shortcuts can grade before revealing the answer', async () => {
  const app = setup();
  const { storage, prefix, context } = app;
  const original = structuredClone(storage.get(prefix + 'study:alpha'));
  await openReview(app);
  await press(app, '1');
  assert.equal(app.shadow.querySelector('.review-answer'), null);
  assert.deepEqual(json(storage.get(prefix + 'study:alpha')), schedule(original, 'again', context.Date.now()));
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
  await click(findButton(shadow, '记得'));
  assert.equal(storage.get(prefix + 'study:alpha'), original);
  assert.ok(shadow.querySelector('.review-answer'));
  assert.equal(shadow.querySelector('.toast').textContent, 'Storage unavailable');
  context.GM_setValue = write;
  await click(findButton(shadow, '记得'));
  assert.equal(storage.get(prefix + 'study:alpha').reviews, original.reviews + 1);
});

test('a grade cannot overwrite progress already saved in another tab or resurrect an unstarred word', async () => {
  for (const removed of [false, true]) {
    const app = setup();
    const { shadow, storage, prefix, context, click } = app;
    await openReview(app);
    await click(findButton(shadow, '显示释义'));
    const action = findButton(shadow, '记得');
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
    await click(findButton(shadow, '记得'));
  }
  assert.ok(shadow.querySelector('.review').querySelector('p').textContent.includes('还有 1 张待学'));
  await click(findButton(shadow, '继续下一轮'));
  await click(findButton(shadow, '显示释义'));
  await click(findButton(shadow, '记得'));
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

test('grouped history deletes one event at a time without changing cache or study progress', async () => {
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
  assert.equal(shadow.querySelectorAll('.history-delete').length, 1);
  assert.ok(shadow.querySelector('.subheading').textContent.startsWith('2 个词 · 2 次查询'));
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'alpha');
  await click(shadow.querySelector('.history-delete'));
  await click(shadow.querySelector('.item'));
  await click(shadow.querySelector('.history-delete'));
  assert.equal(shadow.querySelectorAll('.history-delete').length, 0);
  assert.ok(shadow.querySelector('.subheading').textContent.startsWith('0 个词 · 0 次查询'));
  assert.equal(shadow.activeElement, shadow.querySelector('.library-list').querySelector('input'));
});

test('history detail confirms deletion of a single event or all events for a word', async () => {
  const { shadow, storage, events, click, prefix, context } = setup();
  const confirmations = [];
  context.confirm = message => { confirmations.push(message); return false; };
  await click(shadow.querySelector('.item'));
  const detail = shadow.querySelector('.detail-pane');
  const actions = detail.querySelector('.actions');
  assert.deepEqual(actions.querySelectorAll('button').map(node => node.textContent), ['更新释义', '删除']);
  await click(detail.querySelector('.history-delete'));
  await click(findButton(actions, '删除'));
  assert.equal(confirmations.length, 2);
  assert.match(confirmations[0], /这条查询记录/);
  assert.match(confirmations[1], /全部查词记录/);
  assert.ok(events.every(event => storage.has(prefix + 'event:' + event.id)));
  assert.equal(detail.querySelector('.word').textContent, 'alpha');
  const cache = storage.get(prefix + 'word:alpha');
  const study = storage.get(prefix + 'study:alpha');
  storage.set(prefix + 'recall:alpha', createStudy('alpha'));
  const recall = storage.get(prefix + 'recall:alpha');
  context.confirm = () => true;
  await click(findButton(actions, '删除'));
  assert.equal(storage.has(prefix + 'event:' + events[0].id), false);
  assert.equal(storage.has(prefix + 'event:' + events[2].id), false);
  assert.ok(storage.has(prefix + 'event:' + events[1].id));
  assert.equal(storage.get(prefix + 'word:alpha'), cache);
  assert.equal(storage.get(prefix + 'study:alpha'), study);
  assert.equal(storage.get(prefix + 'recall:alpha'), recall);
  assert.equal(detail.querySelector('.word').textContent, 'beta');
});

test('book detail deletion confirms and removes both review directions while preserving history', async () => {
  const app = setup('/test/', 'youdao', { viewport: { width: 390, height: 714, scale: 1 } });
  const { shadow, storage, events, click, prefix, context } = app;
  storage.set(prefix + 'recall:alpha', createStudy('alpha'));
  await click(findButton(shadow, '生词本'));
  await click(shadow.querySelector('.item'));
  const layer = shadow.querySelector('.library-detail');
  const detail = shadow.querySelector('.detail-pane');
  const actions = detail.querySelector('.actions');
  assert.deepEqual(actions.querySelectorAll('button').map(node => node.textContent), ['更新释义', '删除']);
  const cache = storage.get(prefix + 'word:alpha');
  let prompt;
  context.confirm = message => { prompt = message; return false; };
  await click(findButton(actions, '删除'));
  assert.match(prompt, /复习进度/);
  assert.ok(storage.has(prefix + 'study:alpha'));
  assert.ok(storage.has(prefix + 'recall:alpha'));
  assert.equal(layer.hidden, false);
  context.confirm = () => true;
  await click(findButton(actions, '删除'));
  assert.equal(storage.has(prefix + 'study:alpha'), false);
  assert.equal(storage.has(prefix + 'recall:alpha'), false);
  assert.ok(events.every(event => storage.has(prefix + 'event:' + event.id)));
  assert.equal(storage.get(prefix + 'word:alpha'), cache);
  assert.equal(detail.querySelector('.word'), null);
  assert.equal(shadow.activeElement, shadow.querySelector('.library-sheet'));
  await click(findButton(shadow.querySelector('.library-sheet-bar'), '关闭'));
  assert.equal(layer.hidden, true);
  assert.equal(shadow.activeElement, shadow.querySelector('.library-list').querySelector('input'));
});

test('partial history word deletion reports storage errors and refreshes the remaining events', async () => {
  const { shadow, storage, events, click, prefix, context } = setup();
  await click(shadow.querySelector('.item'));
  const remove = context.GM_deleteValue;
  let calls = 0;
  context.GM_deleteValue = key => {
    if (++calls === 2) throw new Error('Storage unavailable');
    remove(key);
  };
  await click(findButton(shadow.querySelector('.detail-pane'), '删除'));
  assert.equal(storage.has(prefix + 'event:' + events[2].id), false);
  assert.ok(storage.has(prefix + 'event:' + events[0].id));
  assert.equal(shadow.querySelector('.history-footprint').querySelector('summary').textContent, '查询足迹 · 1 次');
  assert.equal(shadow.querySelector('.toast').textContent, 'Storage unavailable');
});

test('deleting a stale book detail cannot add the word back to the book', async () => {
  const { shadow, storage, click, prefix } = setup();
  await click(findButton(shadow, '生词本'));
  await click(shadow.querySelector('.item'));
  storage.delete(prefix + 'study:alpha');
  await click(findButton(shadow.querySelector('.detail-pane'), '删除'));
  assert.equal(storage.has(prefix + 'study:alpha'), false);
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word'), null);
  assert.match(shadow.querySelector('.toast').textContent, /已不在生词本/);
});

test('lookup cards and grouped rows show a word-specific query count and latest lookup', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  selectWebsite(app, 'alpha');
  app.advance(220);
  await new Promise(setImmediate);
  assert.match(app.shadow.querySelector('.popover').querySelector('.history-footprint').querySelector('summary').textContent,
    /^查过 3 次 · 最近 /);
  assert.equal(historyOf(app).length, 4, 'the successful lookup remains an individual event');
  app.menus.get('打开 Lexi 学习中心')();
  await app.click(app.shadow.querySelector('.tab'));
  assert.equal(app.shadow.querySelectorAll('.item').length, 2, 'repeated alpha lookups share one row');
  assert.match(app.shadow.querySelector('.item').querySelector('.meta').textContent, /^3 次查询 · 最近 /);
  const sort = app.shadow.querySelectorAll('select').find(node => node.getAttribute('aria-label') === '历史排序');
  sort.value = 'count';
  sort.listeners.change.listener();
  assert.equal(app.shadow.querySelector('.item').querySelector('.term').textContent, 'alpha');
});

test('failed deletion leaves the event and shows the storage error', async () => {
  const { shadow, storage, context, click } = setup();
  const before = [...storage.entries()];
  await click(shadow.querySelector('.item'));
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
  const search = shadow.querySelectorAll('input').find(node => node.getAttribute('aria-label') === '筛选已保存单词');
  search.value = 'plopped';
  search.listeners.input.listener();
  await click(shadow.querySelectorAll('.item').find(node => node.querySelector('.term').textContent === 'plopped'));
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

test('history and vocabulary reach beyond 300 filtered matches and clamp after removing the last page', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const at = context.Date.now();
  const words = Array.from({ length: 301 }, (_, i) =>
    'fixture' + String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26));
  for (const [i, word] of words.entries()) {
    storage.set(prefix + 'event:paging-event-' + i, { id: 'paging-event-' + i, word, at: at + i });
    addWord(app, word, createStudy(word, at + i));
  }
  const search = () => shadow.querySelectorAll('input').find(node => node.getAttribute('aria-label') === '筛选已保存单词');
  const filter = value => { search().value = value; search().listeners.input.listener(); };
  const lastPage = async () => {
    const next = findButton(shadow, '下一页');
    assert.ok(next, 'pagination is offered');
    for (let i = 0; i < 6; i++) await click(next);
    assert.equal(next.disabled, true);
  };
  const visible = () => shadow.querySelectorAll('.item').map(row => row.querySelector('.term').textContent);
  const status = () => shadow.querySelector('.library-pagination').querySelector('.meta').textContent;
  const sort = () => shadow.querySelectorAll('select').find(node => node.getAttribute('aria-label') === '历史排序');
  await click(findButton(shadow, '查词历史'));
  filter('fixture');
  assert.equal(visible()[0], words.at(-1));
  sort().value = 'old';
  sort().listeners.change.listener();
  assert.equal(visible()[0], words[0]);
  await lastPage();
  assert.deepEqual(visible(), [words.at(-1)]);
  await click(shadow.querySelector('.item'));
  await click(findButton(shadow.querySelector('.detail-pane'), '删除'));
  assert.match(status(), /6 \/ 6/);
  assert.equal(search().value, 'fixture');
  assert.equal(sort().value, 'old');
  assert.equal(visible().at(-1), words.at(-2));
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, words.at(-2));

  await click(findButton(shadow, '生词本'));
  filter('fixture');
  await lastPage();
  assert.deepEqual(visible(), [words[0]]);
  await click(shadow.querySelector('.item'));
  await click(findButton(shadow.querySelector('.detail-pane'), '删除'));
  assert.match(status(), /6 \/ 6/);
  assert.equal(search().value, 'fixture');
  assert.equal(visible().at(-1), words[1]);
  await click(findButton(shadow, '查词历史'));
  assert.match(status(), /6 \/ 6/);
  assert.equal(sort().value, 'old');
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

test('mobile definitions open a modal sheet, contain focus and return to the same list position', async () => {
  const app = setup('/test/', 'youdao', { viewport: { width: 390, height: 714, scale: 1 } });
  const { shadow, click } = app;
  const layer = shadow.querySelector('.library-detail');
  const list = shadow.querySelector('.list');
  const view = shadow.querySelector('.view');
  assert.equal(layer.hidden, true, 'details do not sit below the mobile list');
  assert.equal(layer.parentElement, shadow.querySelector('.studio'));
  list.scrollTop = 90;
  view.scrollTop = 15;
  await click(shadow.querySelector('.item'));
  assert.equal(layer.hidden, false);
  assert.equal(shadow.querySelector('.library-sheet').getAttribute('role'), 'dialog');
  assert.equal(shadow.querySelector('.main').inert, true);
  assert.equal(shadow.activeElement, shadow.querySelector('.library-sheet'));
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'alpha');
  assert.equal(shadow.querySelector('.library-sheet-nav').querySelector('.meta').textContent, '1 / 2');
  assert.equal(findButton(layer, '‹ 上一个').disabled, true);
  const next = findButton(layer, '下一个');
  next.focus();
  await press(app, 'Tab');
  assert.equal(shadow.activeElement, findButton(layer, '关闭'), 'Tab cannot reach the background library');
  await press(app, 'Escape');
  assert.equal(layer.hidden, true);
  assert.equal(shadow.querySelector('.overlay').hidden, false, 'Escape closes only the sheet');
  assert.equal(shadow.querySelector('.main').inert, false);
  assert.equal(list.scrollTop, 90);
  assert.equal(view.scrollTop, 15);
  assert.equal(shadow.activeElement, shadow.querySelector('.item'));
  await click(shadow.querySelector('.item'));
  layer.listeners.click.listener({ target: layer });
  assert.equal(layer.hidden, true, 'the sheet backdrop also returns to the list');
  await click(shadow.querySelector('.list-star'));
  assert.equal(layer.hidden, true, 'row actions do not open definitions');
});

test('mobile definition navigation follows filtered and sorted records across pages in history and book', async () => {
  for (const tab of [0, 1]) {
    const app = setup('/test/', 'youdao', { viewport: { width: 390, height: 714, scale: 1 } });
    const { shadow, storage, prefix, click } = app;
    const words = Array.from({ length: 52 }, (_, index) => 'sheet' + String.fromCharCode(97 + Math.floor(index / 26), 97 + index % 26));
    for (const [index, word] of words.entries()) {
      addWord(app, word, createStudy(word, index + 10));
      storage.set(prefix + 'event:sheet-' + index, { word, id: 'sheet-' + index, at: index + 10 });
    }
    await click(shadow.querySelectorAll('.tab')[tab]);
    const search = shadow.querySelector('.library-list').querySelector('input');
    search.value = 'sheet';
    search.listeners.input.listener();
    if (tab === 0) {
      const sort = shadow.querySelector('select');
      sort.value = 'old';
      sort.listeners.change.listener();
    }
    const expected = tab === 0 ? words : [...words].reverse();
    await click(shadow.querySelectorAll('.item').at(-1));
    const nav = shadow.querySelector('.library-sheet-nav');
    assert.equal(nav.querySelector('.meta').textContent, '50 / 52');
    shadow.querySelector('.detail-pane').scrollTop = 75;
    await click(findButton(nav, '下一个'));
    assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, expected[50]);
    assert.equal(shadow.querySelector('.detail-pane').scrollTop, 0);
    assert.equal(nav.querySelector('.meta').textContent, '51 / 52');
    await click(findButton(nav, '下一个'));
    assert.equal(findButton(nav, '下一个').disabled, true);
    assert.equal(nav.querySelector('.meta').textContent, '52 / 52');
    await click(findButton(nav, '‹ 上一个'));
    await click(findButton(shadow.querySelector('.library-sheet-bar'), '关闭'));
    assert.equal(shadow.querySelector('.library-pagination').querySelector('.meta').textContent, '2 / 2 页');
    const active = shadow.querySelectorAll('.item').find(row => row.getAttribute('aria-current') === 'true');
    assert.equal(active.querySelector('.term').textContent, expected[50]);
    assert.equal(shadow.activeElement, active, 'closing focuses the last viewed record');
    assert.equal(search.value, 'sheet');
    if (tab === 0) assert.equal(shadow.querySelector('select').value, 'old');
    assert.equal(shadow.querySelector('.library-detail').hidden, true);
  }
});

test('mobile grouped history shows each context and keeps nested lookup separate from word navigation', async () => {
  const app = setup('/test/', 'youdao', { viewport: { width: 390, height: 714, scale: 1 } });
  const { shadow, storage, prefix, click } = app;
  storage.get(prefix + 'event:history-event-2').context = 'Recent alpha context';
  storage.get(prefix + 'event:history-event-0').context = 'Earlier alpha context';
  const search = shadow.querySelector('.library-list').querySelector('input');
  search.value = 'alpha';
  search.listeners.input.listener();
  await click(shadow.querySelector('.item'));
  const pane = shadow.querySelector('.detail-pane');
  const layer = shadow.querySelector('.library-detail');
  assert.match(textOf(pane.querySelector('.history-footprint')), /Recent alpha/);
  assert.match(textOf(pane.querySelector('.history-footprint')), /Earlier alpha/);
  search.value = '';
  search.listeners.input.listener();
  await click(findButton(layer, '下一个'));
  assert.equal(pane.querySelector('.word').textContent, 'beta');
  await click(findButton(layer, '‹ 上一个'));
  const original = pane.querySelector('article');
  pane.scrollTop = 50;
  await selectInside(app, pane.querySelector('.definition'), 'beta');
  assert.equal(pane.querySelector('.word').textContent, 'beta');
  await press(app, 'Escape');
  assert.equal(layer.hidden, false, 'first Escape returns from nested lookup');
  assert.equal(pane.querySelector('article'), original);
  assert.equal(pane.scrollTop, 50);
  await press(app, 'Escape');
  assert.equal(layer.hidden, true);
  assert.equal(shadow.querySelectorAll('.item').find(row => row.getAttribute('aria-current') === 'true')
    .querySelector('.term').textContent, 'alpha');
  assert.equal(historyOf(app).length, 4, 'only the nested lookup adds history');
});

test('mobile sheets reset cleanly on studio close and breakpoint changes, and manual lookup shows its result', async () => {
  const app = setup('/test/', 'youdao', { viewport: { width: 390, height: 714, scale: 1 } });
  const { shadow, context, click } = app;
  await click(shadow.querySelector('.item'));
  Object.assign(context.window.visualViewport, { width: 1100, height: 800 });
  context.window.listeners.resize.listener();
  assert.equal(shadow.querySelector('.library-detail').parentElement, shadow.querySelector('.split'));
  assert.equal(shadow.querySelector('.library-detail').hidden, false);
  assert.equal(shadow.querySelector('.main').inert, false);
  Object.assign(context.window.visualViewport, { width: 390, height: 714 });
  context.window.listeners.resize.listener();
  assert.equal(shadow.querySelector('.library-detail').hidden, true);
  assert.equal(shadow.querySelectorAll('.detail-pane').length, 1);
  const form = shadow.querySelector('.search');
  form.querySelector('input').value = 'beta';
  await click(form.querySelector('button'));
  assert.equal(shadow.querySelector('.library-detail').hidden, false);
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'beta');
  await click(shadow.querySelector('.top').querySelector('.icon'));
  assert.equal(shadow.querySelector('.overlay').hidden, true);
  assert.equal(shadow.querySelector('.main').inert, false);
  await click(shadow.querySelector('.launcher'));
  assert.equal(shadow.querySelectorAll('.library-sheet').length, 1);
  assert.equal(shadow.querySelector('.library-detail').hidden, true);
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
  assert.deepEqual(shadow.querySelectorAll('.list-star').map(node => node.textContent), ['★', '☆']);

  shadow.querySelector('.list').scrollTop = 50;
  shadow.querySelector('.detail-pane').scrollTop = 90;
  await click(shadow.querySelectorAll('.list-star')[1]);
  assert.equal(storage.has(prefix + 'study:beta'), true);
  assert.deepEqual(shadow.querySelectorAll('.list-star').map(node => node.textContent), ['★', '★']);
  assert.equal(shadow.querySelector('.detail-pane').querySelector('.word').textContent, 'alpha');
  assert.equal(shadow.querySelector('.list').scrollTop, 50);
  assert.equal(shadow.querySelector('.detail-pane').scrollTop, 90);

  context.confirm = () => false;
  await click(shadow.querySelectorAll('.list-star')[0]);
  assert.equal(storage.has(prefix + 'study:alpha'), true);

  context.confirm = () => true;
  await click(shadow.querySelectorAll('.list-star')[0]);
  assert.equal(storage.has(prefix + 'study:alpha'), false);
  assert.deepEqual(shadow.querySelectorAll('.list-star').map(node => node.textContent), ['☆', '★']);
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
  await app.click(findButton(app.shadow, label));
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
const answerGoogle = (request, value) => request.onload({ status: 200, responseText: JSON.stringify([[[value]]]) });
const answerMicrosoft = (request, value) => request.onload({ status: 200,
  responseText: JSON.stringify([{ translations: [{ text: value, to: 'zh-Hans' }] }]) });
const answerMyMemory = (request, value) => request.onload({ status: 200,
  responseText: JSON.stringify({ responseStatus: 200, responseData: { translatedText: value } }) });

test('touchscreen webpage selection waits for an explicit action and uses the expanded selection', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const { shadow, context } = app;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  const selected = selectWebsite(app, 'alpha', 'touch');
  app.advance(250);
  assert.equal(shadow.querySelector('.popover').hidden, true, 'initial touch selection must not open the word card');
  const action = shadow.querySelector('.selection-action');
  assert.ok(action, 'touch selection exposes an explicit action');
  assert.equal(action.querySelector('.selection-verb').textContent, '查词');
  assert.equal(action.querySelector('.selection-preview').textContent, 'alpha');
  assert.equal(action.getAttribute('aria-label'), '查词 alpha');
  assert.equal(requests.length, 0);
  assert.equal(selected.selection.isCollapsed, false, 'native selection stays active before the action');

  selected.setText('alpha beta, now.');
  context.document.listeners.selectionchange.listener();
  assert.equal(action.querySelector('.selection-verb').textContent, '翻译');
  assert.equal(action.querySelector('.selection-preview').textContent, 'alpha beta, now.');
  assert.equal(action.getAttribute('aria-label'), '翻译所选句子');
  let prevented = false;
  action.listeners.pointerdown.listener({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'the action preserves the native selection when pressed');
  action.listeners.click.listener();
  await new Promise(setImmediate);
  assert.equal(selected.selection.isCollapsed, true, 'the native selection is cleared after the action');
  assert.equal(selected.selection.toString(), '');
  assert.equal(action.querySelector('.selection-preview').textContent, '', 'the hidden action does not retain the sentence');
  assert.equal(action.getAttribute('aria-label'), null);
  assert.equal(shadow.querySelector('.reading-marks').children.length, 1, 'the original text stays highlighted');
  assert.equal(shadow.querySelector('.popover').querySelector('.sentence-original').textContent, 'alpha beta, now.');
  assert.equal(new URL(requests[0].url).searchParams.get('q'), 'alpha beta, now.');
});

test('touch word lookup snapshots the latest selection and its reading position before clearing it', async () => {
  const app = setup('/test/', 'youdao', {
    open: false, settings: { context: true },
    viewport: { width: 390, height: 844, scale: 1, offsetTop: 0, offsetLeft: 0 }
  });
  const selected = selectWebsite(app, 'alpha', 'touch');
  const rect = { left: 180, right: 220, top: 320, bottom: 342, width: 40, height: 22 };
  selected.node.textContent = 'Earlier beta in the sentence.';
  selected.range.getBoundingClientRect = () => selected.selection.isCollapsed
    ? { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } : rect;
  selected.range.getClientRects = () => [rect];
  app.advance(250);
  selected.setText('beta');
  app.context.document.listeners.selectionchange.listener();
  const action = app.shadow.querySelector('.selection-action');
  assert.equal(action.getAttribute('aria-label'), '查词 beta');
  const remove = selected.selection.removeAllRanges;
  selected.selection.removeAllRanges = function () {
    assert.equal(app.shadow.querySelector('.reading-marks').children.length, 1, 'highlight is captured first');
    assert.equal(app.shadow.querySelector('.popover').hidden, true, 'selection is cleared before the card opens');
    remove.call(this);
  };
  await app.click(action);

  const popover = app.shadow.querySelector('.popover');
  assert.equal(selected.selection.isCollapsed, true);
  assert.equal(popover.querySelector('.word').textContent, 'beta');
  assert.equal(popover.style.left, '145px', 'the mobile card is horizontally centered rather than anchored to the word');
  assert.equal(popover.style.top, '844px', 'CSS anchors the card above the visible bottom edge');
  assert.equal(app.shadow.querySelector('.reading-marks').children[0].style.left, '180px');
  assert.equal(historyOf(app).at(-1).context, 'Earlier beta in the sentence.');
});

test('touch selection action stays at the bottom of the mobile viewport and temporarily hides the launcher', () => {
  const app = setup('/test/', 'youdao', {
    open: false, viewport: { width: 390, height: 844, scale: 1, offsetTop: 0, offsetLeft: 0 }
  });
  const { shadow, context } = app;
  const selected = selectWebsite(app, 'alpha', 'touch');
  app.advance(250);
  const action = shadow.querySelector('.selection-action');
  const launcher = shadow.querySelector('.launcher');

  assert.equal(action.style.left, '145px');
  assert.equal(action.style.top, '796px');
  assert.ok(launcher.className.split(' ').includes('selection-active'));
  assert.equal(launcher.inert, true);
  assert.equal(launcher.getAttribute('aria-hidden'), 'true');

  Object.assign(context.window.visualViewport, { width: 320, height: 568, offsetLeft: 20, offsetTop: 10 });
  context.window.visualViewport.listeners.resize.listener();
  app.advance(0);
  assert.equal(action.style.left, '130px', 'the action follows the visible viewport when it changes');
  assert.equal(action.style.top, '530px');

  selected.setText('');
  selected.selection.isCollapsed = true;
  context.document.listeners.selectionchange.listener();
  app.advance(0);
  assert.equal(action.hidden, true);
  assert.ok(!launcher.className.split(' ').includes('selection-active'));
  assert.equal(launcher.inert, false);
  assert.equal(launcher.getAttribute('aria-hidden'), null);
});

test('a long touch selection can be shortened without losing the native selection', () => {
  const app = setup('/test/', 'youdao', { open: false });
  const overlong = 'a '.repeat(2500) + 'bb';
  const selected = selectWebsite(app, overlong, 'touch');
  app.advance(250);
  const action = app.shadow.querySelector('.selection-action');
  assert.equal(action.disabled, true);
  assert.equal(selected.selection.toString(), overlong);
  assert.ok(action.querySelector('.selection-preview').textContent.length < overlong.length);

  selected.setText('alpha beta');
  app.context.document.listeners.selectionchange.listener();
  assert.equal(action.disabled, false);
  assert.equal(selected.selection.toString(), 'alpha beta');
  assert.equal(action.querySelector('.selection-preview').textContent, 'alpha beta');
});

test('touchscreen selection inside the plugin also waits for an action while mouse selection stays automatic', async () => {
  const app = setup();
  const { shadow, context } = app;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await app.click(shadow.querySelector('.item'));
  const pane = shadow.querySelector('.detail-pane');
  const original = pane.querySelector('article');
  const range = { startContainer: pane.querySelector('.definition'), endContainer: pane.querySelector('.definition'),
    collapsed: false, toString: () => 'alpha beta', getBoundingClientRect: () => pane.getBoundingClientRect() };
  range.cloneRange = () => ({ ...range });
  setSelection(app, range);
  shadow.listeners.pointerup.listener({ button: 0, pointerType: 'touch' });
  app.advance(250);
  await new Promise(setImmediate);
  assert.equal(pane.querySelector('article'), original, 'the first internal touch selection does not navigate away');
  assert.equal(shadow.querySelector('.selection-action').querySelector('.selection-verb').textContent, '翻译');
  assert.equal(shadow.querySelector('.selection-action').querySelector('.selection-preview').textContent, 'alpha beta');
  assert.equal(requests.length, 0);
  shadow.querySelector('.selection-action').listeners.click.listener();
  await new Promise(setImmediate);
  const result = shadow.querySelector('.sentence-result');
  assert.ok(result, `sentence result should be visible; toast=${shadow.querySelector('.toast').textContent}`);
  assert.equal(result.querySelector('.sentence-original').textContent, 'alpha beta');
  assert.equal(new URL(requests[0].url).searchParams.get('q'), 'alpha beta');
  await app.click(pane.querySelector('.lookup-back'));

  const mouse = setup('/test/', 'youdao', { open: false });
  selectWebsite(mouse, 'beta');
  mouse.advance(250);
  await new Promise(setImmediate);
  const popover = mouse.shadow.querySelector('.popover');
  assert.ok(!popover.hidden, 'mouse selection should remain automatic');
  assert.equal(popover.querySelector('.word')?.textContent, 'beta');
});

test('touch selection action disappears when the native selection is cleared', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const selected = selectWebsite(app, 'alpha', 'touch');
  app.advance(250);
  const action = app.shadow.querySelector('.selection-action');
  assert.equal(action.hidden, false);
  selected.setText('');
  selected.selection.isCollapsed = true;
  selected.range.collapsed = true;
  app.context.document.listeners.selectionchange.listener();
  app.advance(0);
  assert.equal(action.hidden, true);
});

test('website sentence translation is temporary, uncached, cancellable and repeatable after closing', async () => {
  const app = setup('/test/', 'youdao', { open: false, settings: { autoBook: true, context: true } });
  const { shadow, context, storage, click } = app;
  const before = json([...storage]);
  const requests = [];
  let aborted = 0;
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() { aborted++; } }; };
  const source = 'A small sentence without punctuation';
  selectWebsite(app, source);
  app.advance(220);
  await new Promise(setImmediate);
  const popover = shadow.querySelector('.popover');
  assert.equal(popover.querySelector('.sentence-original').textContent, source);
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).origin, 'https://translate.googleapis.com');
  assert.equal(new URL(requests[0].url).searchParams.get('q'), source);
  assert.equal(requests[0].anonymous, true);
  assert.equal(requests[0].nocache, true);
  answerGoogle(requests[0], '一个小句子');
  await new Promise(setImmediate);
  assert.equal(popover.querySelector('.translation-copy').textContent, '一个小句子');
  assert.ok(textOf(popover).includes('Google Translate'));
  assert.equal(popover.querySelector('.detail-star'), null);
  assert.deepEqual(json([...storage]), before, 'sentence translation changes no stored data, including context and auto-book');
  assert.equal(shadow.querySelector('.reading-marks').children.length, 1);
  await click(findButton(popover, '×'));
  assert.equal(popover.children.length, 0, 'closing removes the original and translation from the card');
  assert.equal(shadow.querySelector('.reading-marks').children.length, 0, 'sentence marker is removed immediately');
  selectWebsite(app, source);
  app.advance(220);
  await new Promise(setImmediate);
  assert.equal(requests.length, 2, 'reselecting the same sentence makes a new request');
  await click(findButton(popover, '×'));
  assert.equal(aborted, 1);
  answerGoogle(requests[1], '迟到的译文');
  await new Promise(setImmediate);
  assert.equal(popover.children.length, 0);
  assert.deepEqual(json([...storage]), before);
});

test('manual sentence translation preserves the current view and words still use normal history and auto-book', async () => {
  const app = setup('/test/', 'youdao', { settings: { auto: false, autoBook: true, context: true } });
  const { shadow, context, storage, click, prefix } = app;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  const pane = shadow.querySelector('.detail-pane');
  const original = pane.querySelector('article');
  const before = json([...storage]);
  const input = shadow.querySelector('.search').querySelector('input');
  input.value = 'take off';
  await click(shadow.querySelector('.search').querySelector('button'));
  assert.equal(input.value, '', 'the submitted sentence is cleared from the search input');
  const view = shadow.querySelector('.view');
  assert.equal(view.querySelector('.sentence-original').textContent, 'take off');
  answerGoogle(requests[0], '起飞');
  await new Promise(setImmediate);
  assert.equal(view.querySelector('.translation-copy').textContent, '起飞');
  assert.deepEqual(json([...storage]), before);
  await click(view.querySelector('.lookup-back'));
  assert.equal(pane.querySelector('article'), original);
  assert.equal(view.querySelector('.sentence-result'), null);
  input.value = '“Beta!”';
  await click(shadow.querySelector('.search').querySelector('button'));
  assert.equal(historyOf(app).at(-1).word, 'beta');
  assert.ok(storage.has(prefix + 'study:beta'));
  assert.equal(requests.length, 1, 'cached single words still follow the existing lookup path');
});

test('sentence translation respects disabled sites while remaining available in manually opened study', async () => {
  const rule = { type: 'domain', value: 'docs.example.com' };
  const app = setup('/test/', 'youdao', { open: false, rules: [rule] });
  const { context, storage, menus, click } = app;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await menus.get('打开 Lexi 学习中心（手动）')();
  const before = json([...storage]);
  const search = app.shadow.querySelector('.search');
  search.querySelector('input').value = 'Manual translation still works.';
  await click(search.querySelector('button'));
  answerGoogle(requests[0], '手动翻译仍可使用。');
  await new Promise(setImmediate);
  assert.equal(app.shadow.querySelector('.sentence-result').querySelector('.translation-copy').textContent, '手动翻译仍可使用。');
  assert.deepEqual(json([...storage]), before);
  await click(app.shadow.querySelectorAll('button').find(node => node.getAttribute('aria-label') === '关闭学习中心'));
  assert.equal(context.document.documentElement.children.length, 0);
  selectWebsite(app, 'A disabled page sentence.');
  app.advance(220);
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
  assert.deepEqual(json([...storage]), before);
});

test('a newer sentence cancels the previous request and prevents late chunks or results', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const { shadow, context, storage } = app;
  const before = json([...storage]);
  const requests = [];
  let aborted = 0;
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() { aborted++; } }; };
  selectWebsite(app, 'Old source to cancel. '.repeat(30));
  app.advance(220);
  await new Promise(setImmediate);
  selectWebsite(app, 'The newest sentence.');
  app.advance(220);
  await new Promise(setImmediate);
  assert.equal(aborted, 1);
  assert.equal(requests.length, 2);
  answerGoogle(requests[0], '旧内容');
  await new Promise(setImmediate);
  assert.equal(requests.length, 2, 'cancellation prevents further old chunks or fallback requests');
  answerGoogle(requests[1], '新内容');
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.sentence-original').textContent, 'The newest sentence.');
  assert.equal(shadow.querySelector('.translation-copy').textContent, '新内容');
  assert.deepEqual(json([...storage]), before);
});

test('returning from a word selected during sentence translation offers a retry instead of a stuck loader', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const { shadow, context, click } = app;
  const requests = [];
  let aborted = 0;
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() { aborted++; } }; };
  selectWebsite(app, 'alpha beta');
  app.advance(220);
  await new Promise(setImmediate);
  const popover = shadow.querySelector('.popover');
  await selectInside(app, popover.querySelector('.sentence-original'), 'alpha');
  assert.equal(aborted, 1);
  assert.equal(popover.querySelector('.word').textContent, 'alpha');
  await press(app, 'Escape');
  assert.equal(popover.querySelector('.sentence-original').textContent, 'alpha beta');
  assert.ok(textOf(popover).includes('翻译已取消'));
  await click(findButton(popover, '重试'));
  assert.equal(requests.length, 2);
  answerGoogle(requests[1], '重新翻译');
  await new Promise(setImmediate);
  assert.equal(popover.querySelector('.translation-copy').textContent, '重新翻译');
});

test('internal sentence translation works while webpage selection is paused and restores the review without grading', async () => {
  const app = setup('/test/', 'youdao', { settings: { auto: false, autoBook: true, reviewCacheOnly: true } });
  const { shadow, context, storage, click, prefix } = app;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await openReview(app);
  await click(findButton(shadow, '显示释义'));
  const answer = shadow.querySelector('.review-answer');
  const before = json([...storage]);
  await selectInside(app, answer.querySelector('.definition'), 'A useful example.');
  const view = shadow.querySelector('.view');
  assert.equal(view.querySelector('.sentence-original').textContent, 'A useful example.');
  await press(app, '1');
  assert.deepEqual(json([...storage]), before);
  answerGoogle(requests[0], '一个有用的例子。');
  await new Promise(setImmediate);
  assert.equal(view.querySelector('.translation-copy').textContent, '一个有用的例子。');
  await press(app, 'Escape');
  assert.equal(shadow.querySelector('.review-answer'), answer);
  assert.equal(view.querySelector('.sentence-result'), null);
  assert.deepEqual(json([...storage]), before);
  await press(app, '3');
  assert.equal(storage.get(prefix + 'study:alpha').reviews, 4);
});

test('sentence translation uses Microsoft after Google fails without persisting the result', async () => {
  const app = setup();
  const { shadow, context, storage, click } = app;
  const before = json([...storage]);
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  const source = 'A short sentence.';
  shadow.querySelector('.search').querySelector('input').value = source;
  await click(shadow.querySelector('.search').querySelector('button'));
  assert.equal(new URL(requests[0].url).origin, 'https://translate.googleapis.com');
  requests[0].onerror();
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  const microsoft = requests[1];
  const url = new URL(microsoft.url);
  assert.equal(url.origin, 'https://edge.microsoft.com');
  assert.equal(url.pathname, '/translate/translatetext');
  assert.equal(url.searchParams.get('from'), 'en');
  assert.equal(url.searchParams.get('to'), 'zh-Hans');
  assert.equal(microsoft.method, 'POST');
  assert.equal(microsoft.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(microsoft.data), [source]);
  assert.equal(microsoft.anonymous, true);
  assert.equal(microsoft.nocache, true);
  answerMicrosoft(microsoft, '微软译文');
  await new Promise(setImmediate);
  const result = shadow.querySelector('.sentence-result');
  assert.equal(result.querySelector('.translation-copy').textContent, '微软译文');
  assert.ok(textOf(result).includes('Microsoft Translator（备用）'));
  assert.ok(textOf(result).includes('Google Translate：网络连接失败'));
  assert.equal(requests.length, 2, 'successful Microsoft fallback must not contact MyMemory');
  assert.deepEqual(json([...storage]), before);
});

test('sentence fallback restarts all chunks with each provider without mixing or saving results', async () => {
  const app = setup();
  const { shadow, context, storage, click } = app;
  const before = json([...storage]);
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  const input = shadow.querySelector('.search').querySelector('input');
  const source = 'A useful example. '.repeat(35).trim();
  input.value = source;
  await click(shadow.querySelector('.search').querySelector('button'));
  const firstChunk = new URL(requests[0].url).searchParams.get('q');
  answerGoogle(requests[0], '不要混入谷歌');
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  requests[1].onload({ status: 429, responseText: '{}' });
  await new Promise(setImmediate);
  assert.equal(requests.length, 3);
  assert.equal(new URL(requests[2].url).origin, 'https://edge.microsoft.com');
  assert.equal(JSON.parse(requests[2].data)[0], firstChunk);
  answerMicrosoft(requests[2], '不要混入微软');
  await new Promise(setImmediate);
  assert.equal(requests.length, 4);
  requests[3].onerror();
  await new Promise(setImmediate);
  assert.equal(requests.length, 5);
  assert.equal(new URL(requests[4].url).origin, 'https://api.mymemory.translated.net');
  assert.equal(new URL(requests[4].url).searchParams.get('q'), firstChunk);
  answerMyMemory(requests[4], '备用第一段');
  await new Promise(setImmediate);
  assert.equal(requests.length, 6);
  answerMyMemory(requests[5], '备用第二段');
  await new Promise(setImmediate);
  const result = shadow.querySelector('.sentence-result');
  assert.equal(result.querySelector('.translation-copy').textContent, '备用第一段\n备用第二段');
  assert.ok(textOf(result).includes('MyMemory（备用）'));
  assert.ok(textOf(result).includes('Google Translate：'));
  assert.ok(textOf(result).includes('Microsoft Translator：'));
  assert.ok(requests.every(request => request.nocache && request.anonymous));
  assert.deepEqual(json([...storage]), before);
});

test('invalid Microsoft translation falls back to MyMemory and reports all providers on failure', async () => {
  const app = setup();
  const { shadow, context, storage, click } = app;
  const before = json([...storage]);
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  shadow.querySelector('.search').querySelector('input').value = 'A short sentence.';
  await click(shadow.querySelector('.search').querySelector('button'));
  requests[0].ontimeout();
  await new Promise(setImmediate);
  requests[1].onload({ status: 200, responseText: JSON.stringify([{ translations: [{ text: 'wrong language', to: 'en' }] }]) });
  await new Promise(setImmediate);
  assert.equal(new URL(requests[2].url).origin, 'https://api.mymemory.translated.net');
  requests[2].onload({ status: 429, responseText: '{}' });
  await new Promise(setImmediate);
  const result = shadow.querySelector('.sentence-result');
  const error = result.querySelector('.error').textContent;
  assert.ok(error.includes('Google Translate：'));
  assert.ok(error.includes('Microsoft Translator：'));
  assert.ok(error.includes('MyMemory：'));
  await click(findButton(result, '重试'));
  assert.equal(new URL(requests[3].url).origin, 'https://translate.googleapis.com');
  answerGoogle(requests[3], '重试成功');
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.sentence-result').querySelector('.translation-copy').textContent, '重试成功');
  assert.deepEqual(json([...storage]), before);
});

test('cancelling Microsoft sentence fallback prevents later providers and late results', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const { shadow, context, storage, click } = app;
  const before = json([...storage]);
  const requests = [];
  let aborted = 0;
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() { aborted++; } }; };
  selectWebsite(app, 'A short sentence.');
  app.advance(220);
  await new Promise(setImmediate);
  requests[0].onerror();
  await new Promise(setImmediate);
  assert.equal(new URL(requests[1].url).origin, 'https://edge.microsoft.com');
  await click(findButton(shadow.querySelector('.popover'), '×'));
  assert.equal(aborted, 1);
  answerMicrosoft(requests[1], '迟到的译文');
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.equal(shadow.querySelector('.popover').children.length, 0);
  assert.deepEqual(json([...storage]), before);
});

test('disabling fallback during a Microsoft translation prevents additional chunks or providers', async () => {
  const app = setup();
  const { shadow, context, storage, click, prefix } = app;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  shadow.querySelector('.search').querySelector('input').value = 'A useful example. '.repeat(35).trim();
  await click(shadow.querySelector('.search').querySelector('button'));
  requests[0].onerror();
  await new Promise(setImmediate);
  assert.equal(new URL(requests[1].url).origin, 'https://edge.microsoft.com');
  storage.set(prefix + 'settings', { translationFallback: 'none' });
  answerMicrosoft(requests[1], '部分译文');
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.ok(shadow.querySelector('.sentence-result').querySelector('.error').textContent.includes('备用翻译已关闭'));
});

test('sentence translation respects disabled fallback, reports errors and retries without caching', async () => {
  const app = setup('/test/', 'youdao', { settings: { translationFallback: 'none' } });
  const { shadow, context, storage, click } = app;
  const before = json([...storage]);
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  shadow.querySelector('.search').querySelector('input').value = 'A short sentence.';
  await click(shadow.querySelector('.search').querySelector('button'));
  assert.equal(new URL(requests[0].url).origin, 'https://translate.googleapis.com');
  requests[0].onerror();
  await new Promise(setImmediate);
  const result = shadow.querySelector('.sentence-result');
  assert.ok(result.querySelector('.error').textContent.includes('网络连接失败'));
  assert.equal(requests.length, 1);
  await click(findButton(result, '重试'));
  assert.equal(requests.length, 2);
  answerGoogle(requests[1], '重试成功');
  await new Promise(setImmediate);
  assert.equal(shadow.querySelector('.sentence-result').querySelector('.translation-copy').textContent, '重试成功');
  assert.deepEqual(json([...storage]), before);
});

test('sentence length limit is enforced in all entry points without truncation or stray navigation', async () => {
  const app = setup();
  const { shadow, context, click } = app;
  const requests = [];
  let aborted = 0;
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() { aborted++; } }; };
  const exact = 'a '.repeat(2499) + 'ab';
  assert.equal(exact.length, 5000);
  const input = shadow.querySelector('.search').querySelector('input');
  input.value = exact + 'c';
  await click(shadow.querySelector('.search').querySelector('button'));
  assert.equal(requests.length, 0);
  assert.equal(input.value.length, 5001, 'overlong input remains editable instead of being silently truncated');
  assert.ok(shadow.querySelector('.toast').textContent.includes('5000'));
  await click(shadow.querySelector('.item'));
  const pane = shadow.querySelector('.detail-pane');
  await selectInside(app, pane.querySelector('.definition'), exact + 'c');
  assert.equal(requests.length, 0);
  assert.equal(pane.querySelector('.lookup-back'), null);
  input.value = exact;
  await click(shadow.querySelector('.search').querySelector('button'));
  assert.equal(requests.length, 1, 'exactly 5,000 characters are accepted');
  assert.equal(shadow.querySelector('.sentence-original').textContent.length, 5000);
  await click(shadow.querySelector('.view').querySelector('.lookup-back'));
  assert.equal(aborted, 1);
  input.value = exact + 'c';
  await click(shadow.querySelectorAll('button').find(node => node.getAttribute('aria-label') === '关闭学习中心'));
  assert.equal(input.value, '', 'closing also clears an overlong sentence that was not submitted');
  selectWebsite(app, exact + 'c');
  app.advance(220);
  await new Promise(setImmediate);
  assert.equal(requests.length, 1, 'overlong webpage selection is not sent');
  assert.ok(shadow.querySelector('.toast').textContent.includes('5000'));
});

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
  const { shadow } = app;
  await press(app, 'Escape');
  selectWebsite(app, 'alpha');
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

test('original reading marker survives lost selection, nested lookup and studio, then expires at the configured duration', async () => {
  const app = setup('/test/', 'youdao', { open: false, settings: { readingMarkerSeconds: 7 } });
  selectWebsite(app, 'alpha');
  app.advance(220);
  await new Promise(setImmediate);
  const popover = app.shadow.querySelector('.popover');
  const marks = app.shadow.querySelector('.reading-marks');
  assert.equal(marks.children.length, 1);
  app.context.window.getSelection = () => null;
  await app.click(popover.querySelector('.detail-star'));
  assert.equal(marks.children.length, 1, 'interacting with the card does not lose the origin');
  await selectInside(app, popover.querySelector('.definition'), 'beta');
  assert.equal(popover.querySelector('.word').textContent, 'beta');
  assert.equal(marks.children.length, 1, 'child lookup keeps the original webpage marker');
  await app.click(app.shadow.querySelector('.launcher'));
  app.advance(8000);
  assert.equal(marks.children.length, 1, 'the studio is still part of the lookup');
  await app.click(app.shadow.querySelectorAll('button').find(node => node.attributes['aria-label'] === '关闭学习中心'));
  app.advance(6999);
  assert.equal(marks.children.length, 1);
  app.advance(1);
  assert.equal(marks.children.length, 0);
  assert.equal(app.shadow.querySelector('.reading-return').hidden, true);
});

test('new webpage selections replace old markers and cancelled expiry timers cannot remove the new origin', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const baselineTimers = app.timers.size;
  selectWebsite(app, 'alpha');
  app.advance(220);
  await new Promise(setImmediate);
  await app.click(findButton(app.shadow.querySelector('.popover'), '×'));
  app.advance(1000);
  const { node } = selectWebsite(app, 'beta');
  node.getBoundingClientRect = () => ({ left: 210, right: 280, top: 90, bottom: 110, width: 70, height: 20 });
  app.advance(220);
  await new Promise(setImmediate);
  app.advance(5000);
  const marks = app.shadow.querySelector('.reading-marks');
  assert.equal(marks.children.length, 1);
  assert.equal(marks.children[0].style.left, '210px');
  await app.menus.get('禁用此页面')();
  assert.equal(marks.children.length, 0, 'disabling the page immediately clears the marker');
  assert.equal(app.timers.size, baselineTimers, 'only the existing address watcher remains after disabling');
});

test('reading marker duration validates, persists, restores and supports zero without changing review settings', async () => {
  const app = setup();
  await app.click(findButton(app.shadow, '设置'));
  const input = app.shadow.querySelector('.reading-marker-seconds');
  assert.equal(input.value, '3');
  for (const invalid of ['', '-1', '301', '1.5', 'not a number']) {
    input.value = invalid;
    input.listeners.change.listener();
    assert.equal(input.value, '3');
    assert.equal(app.storage.has(app.prefix + 'settings'), false);
    assert.ok(app.shadow.querySelector('.toast').textContent.includes('0–300'));
  }
  input.value = '7';
  input.listeners.change.listener();
  const saved = app.storage.get(app.prefix + 'settings');
  const restored = setup('/test/', 'youdao', { settings: saved });
  await restored.click(findButton(restored.shadow, '设置'));
  assert.equal(restored.shadow.querySelector('.reading-marker-seconds').value, '7');
  input.value = '0';
  input.listeners.change.listener();
  await press(app, 'Escape');
  selectWebsite(app, 'alpha');
  app.advance(220);
  await new Promise(setImmediate);
  assert.equal(app.shadow.querySelector('.reading-marks').children.length, 1, 'zero still highlights during lookup');
  await app.click(findButton(app.shadow.querySelector('.popover'), '×'));
  assert.equal(app.shadow.querySelector('.reading-marks').children.length, 0);
  assert.equal(app.storage.get(app.prefix + 'settings').newPerDay, 20);
});

test('same-word debounce still updates the reading origin and expires when no card is open', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  selectWebsite(app, 'alpha');
  app.advance(220);
  await new Promise(setImmediate);
  await app.click(findButton(app.shadow.querySelector('.popover'), '×'));
  const { node } = selectWebsite(app, 'alpha');
  node.getBoundingClientRect = () => ({ left: 210, right: 280, top: 90, bottom: 110, width: 70, height: 20 });
  app.advance(220);
  await new Promise(setImmediate);
  const marks = app.shadow.querySelector('.reading-marks');
  assert.equal(marks.children[0].style.left, '210px', 'the marker follows the newly selected occurrence');
  assert.equal(historyOf(app).length, 4, 'existing duplicate-query suppression is unchanged');
  assert.equal(app.shadow.querySelector('.popover').hidden, true);
  app.advance(3000);
  assert.equal(marks.children.length, 0, 'duplicate suppression cannot leave an indefinite marker');
});

test('offscreen reading marker returns only on request; detached origins are cleared instead of scrolling elsewhere', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const { node, range } = selectWebsite(app, 'alpha');
  app.advance(220);
  await new Promise(setImmediate);
  const marks = app.shadow.querySelector('.reading-marks');
  const back = app.shadow.querySelector('.reading-return');
  let scrolled = 0;
  node.getBoundingClientRect = () => ({ left: 20, right: 100, top: -80, bottom: -60, width: 80, height: 20 });
  node.scrollIntoView = () => { scrolled++; };
  app.context.window.scrollBy = () => {
    scrolled++;
    node.getBoundingClientRect = () => ({ left: 20, right: 100, top: 390, bottom: 410, width: 80, height: 20 });
  };
  app.context.document.listeners.scroll.listener();
  assert.equal(back.hidden, false);
  assert.equal(marks.children.length, 0);
  assert.equal(scrolled, 0, 'scroll tracking never scrolls on its own');
  await app.click(back);
  assert.equal(scrolled, 2);
  assert.equal(back.hidden, true);
  assert.equal(app.shadow.querySelector('.popover').hidden, true);
  assert.equal(marks.children.length, 1);
  range.startContainer.isConnected = false;
  app.context.document.listeners.scroll.listener();
  assert.equal(marks.children.length, 0);
  assert.equal(back.hidden, true);
});

test('native CSS highlights use a cloned original range and clean up without changing page text', async () => {
  const app = setup('/test/', 'youdao', { open: false });
  const registry = new Map();
  app.context.window.CSS = { highlights: registry };
  app.context.window.Highlight = class { constructor(range) { this.range = range; } };
  const { node, range } = selectWebsite(app, 'alpha');
  app.advance(220);
  await new Promise(setImmediate);
  const highlight = registry.get('lexi-reading-origin');
  assert.notEqual(highlight.range, range);
  assert.equal(highlight.range.toString(), 'alpha');
  assert.equal(node.textContent, 'alpha');
  assert.equal(app.shadow.querySelector('.reading-marks').children.length, 0, 'no overlay needed with native support');
  await app.click(findButton(app.shadow.querySelector('.popover'), '×'));
  app.advance(3000);
  assert.equal(registry.size, 0);
  assert.equal(app.context.document.documentElement.querySelectorAll('style').length, 0);
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
  assert.equal(shadow.querySelectorAll('.item').length, 2, 'the current word remains grouped in history');
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
  assert.equal(shadow.querySelectorAll('.item').length, 3, 'temporary queries appear in the grouped history');
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
  assert.equal(shadow.activeElement, findButton(shadow, '记得'));
  await press(app, '3');
  assert.equal(storage.get(prefix + 'study:alpha').reviews, before.reviews + 1);
});

test('automatic internal lookup ignores controls, invalid text, collapsed and cancelled selections', async () => {
  const app = setup();
  const { shadow, click } = app;
  await click(shadow.querySelector('.item'));
  const definition = shadow.querySelector('.definition');
  for (const [node, raw, collapsed] of [
    [definition, 'abc123', false], [definition, 'beta', true],
    [findButton(shadow, '查询'), 'query', false], [shadow.querySelector('input'), 'beta', false],
    [app.context.document.activeElement, 'beta', false]
  ]) {
    await selectInside(app, node, raw, collapsed);
    assert.equal(shadow.querySelector('.word').textContent, 'alpha');
    assert.equal(historyOf(app).length, 3);
  }
  await selectInside(app, definition, 'abc123');
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

test('learning steps return within the same round, preferring other ready cards before optional early review', async () => {
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
  assert.match(textOf(shadow.querySelector('.review')), /下一张.*到期/);
  await app.click(findButton(shadow, '现在提前复习'));
  assert.equal(currentWord(shadow), 'gamma');
  await answerWith(app, '记得');
  await app.click(findButton(shadow, '现在提前复习'));
  assert.equal(currentWord(shadow), 'beta');
  await answerWith(app, '记得');
  assert.ok(shadow.querySelector('.review').querySelector('h2').textContent.includes('本轮已完成'));
  for (const word of ['beta', 'gamma']) assert.equal(storage.get(prefix + 'study:' + word).fsrs.state, 2);
  assert.deepEqual(json(storage.get(prefix + 'study:beta').log.map(entry => entry.rating)), [1, 3, 3]);
});

test('a single learning card waits, returns at its due time, and cancels its wait when leaving', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click, advance, timers } = app;
  const at = context.Date.now();
  storage.set(prefix + 'study:alpha', createStudy('alpha', at));
  await openReview(app);
  await answerWith(app, '忘记');
  assert.equal(currentWord(shadow), undefined);
  assert.ok(findButton(shadow, '现在提前复习'));
  const due = storage.get(prefix + 'study:alpha').dueAt;
  advance(due - context.Date.now() - 1);
  assert.equal(currentWord(shadow), undefined);
  advance(1);
  assert.equal(currentWord(shadow), 'alpha');
  assert.ok(findButton(shadow, '显示释义'));
  await answerWith(app, '记得');
  await click(findButton(shadow, '现在提前复习'));
  assert.equal(currentWord(shadow), 'alpha');
  await click(findButton(shadow, '撤销上一次'));
  assert.equal(currentWord(shadow), 'alpha');
  assert.equal(storage.get(prefix + 'study:alpha').log.length, 1);
  await answerWith(app, '记得');
  const nextDue = storage.get(prefix + 'study:alpha').dueAt;
  assert.ok([...timers.values()].some(timer => timer.at === nextDue));
  await click(findButton(shadow, '生词本'));
  assert.equal([...timers.values()].some(timer => timer.at === nextDue), false);
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

test('a new card revealed before 4:00 and graded after 4:00 uses the new learning day', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click, advance } = app;
  const boundary = new Date(context.Date.now());
  boundary.setDate(boundary.getDate() + 1);
  boundary.setHours(4, 0, 0, 0);
  advance(boundary.getTime() - 30000 - context.Date.now());
  storage.delete(prefix + 'study:alpha');
  for (const word of ['beta', 'gamma']) addWord(app, word, createStudy(word, context.Date.now()));
  useSettings(app, { newPerDay: 1 });
  await openReview(app);
  await click(findButton(shadow, '显示释义'));
  advance(45000);
  await click(findButton(shadow, '轻松'));
  const saved = storage.get(prefix + 'study:beta');
  assert.equal(saved.log[0].at, boundary.getTime() + 15000);
  await click(findButton(shadow, '返回复习概览'));
  assert.match(textOf(shadow.querySelector('.review')), /今日新词上限 1 个已用完/);
});

test('pausing and resuming reverse cards does not refund a new-card slot', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const now = context.Date.now();
  storage.set(prefix + 'study:alpha', schedule(createStudy('alpha', now - 86400000), 'easy', now - 86400000));
  storage.set(prefix + 'recall:alpha', schedule(createStudy('alpha', now - 1000), 'easy', now - 1000));
  storage.set(prefix + 'study:beta', createStudy('beta', now));
  await click(shadow.querySelectorAll('.tab')[2]);
  for (const reverse of [true, false, true]) {
    useSettings(app, { reverse, newPerDay: 1 });
    assert.match(textOf(shadow.querySelector('.review')), /今日新词上限 1 个已用完/);
  }
});

test('a stale round cannot use a slot taken in another tab, but undo can return a slot', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const now = context.Date.now();
  storage.delete(prefix + 'study:alpha');
  const beta = createStudy('beta', now);
  storage.set(prefix + 'study:beta', beta);
  addWord(app, 'gamma', createStudy('gamma', now + 1));
  useSettings(app, { newPerDay: 1 });
  await openReview(app);
  await click(findButton(shadow, '显示释义'));
  storage.set(prefix + 'study:gamma', schedule(createStudy('gamma', now), 'easy', now));
  await click(findButton(shadow, '轻松'));
  assert.deepEqual(storage.get(prefix + 'study:beta'), beta);
  assert.match(shadow.querySelector('.toast').textContent, /今日新词上限/);
  storage.set(prefix + 'study:gamma', createStudy('gamma', now + 1));
  await click(findButton(shadow, '返回复习概览'));
  await click(findButton(shadow, '开始复习'));
  await answerWith(app, '轻松');
  assert.equal(storage.get(prefix + 'study:beta').reviews, 1);
  await click(findButton(shadow, '撤销上一次'));
  assert.deepEqual(storage.get(prefix + 'study:beta'), beta);
  await answerWith(app, '轻松');
  assert.equal(storage.get(prefix + 'study:beta').reviews, 1);
});

test('saving uses the grading time, and an answer open over 10 minutes needs reconfirmation', async () => {
  for (const wait of [30000, 11 * 60000]) {
    const app = setup();
    const { shadow, storage, prefix, context, click, advance } = app;
    const original = structuredClone(storage.get(prefix + 'study:alpha'));
    await openReview(app);
    const shownAt = context.Date.now();
    await click(findButton(shadow, '显示释义'));
    advance(wait);
    await click(findButton(shadow, '记得'));
    if (wait < 600000) {
      assert.deepEqual(json(storage.get(prefix + 'study:alpha')), schedule(original, 'good', shownAt + wait));
      continue;
    }
    assert.deepEqual(storage.get(prefix + 'study:alpha'), original);
    assert.ok(shadow.querySelector('.toast').textContent.includes('超过 10 分钟'));
    await click(findButton(shadow, '记得'));
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
  assert.equal(shadow.activeElement, findButton(shadow, '记得'));
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

test('cache-only review keeps cached hints, lets users fetch missing hints, and does not change library lookup', async () => {
  const app = setup('/cached/', '');
  const { storage, prefix, context, shadow, click } = app;
  const alpha = storage.get(prefix + 'word:alpha');
  delete alpha.youdaoTranslation;
  delete alpha.wordForms;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(findButton(shadow, '设置'));
  const toggle = shadow.querySelectorAll('.setting').find(row => textOf(row).includes('复习仅用缓存')).querySelector('input');
  assert.equal(toggle.checked, false);
  toggle.checked = true;
  toggle.listeners.change.listener();
  assert.equal(storage.get(prefix + 'settings').reviewCacheOnly, true);

  await openReview(app);
  assert.match(textOf(shadow.querySelector('.phonetic')), /\/cached\//);
  assert.ok(findButton(shadow, '补全音标'));
  await click(findButton(shadow, '显示释义'));
  assert.equal(requests.length, 0);
  assert.ok(findButton(shadow, '补全词形变化'));
  assert.match(textOf(shadow.querySelector('.translation-mymemory')), /中文/);
  await click(findButton(shadow, '获取有道中文释义'));
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).hostname, 'dict.youdao.com');
  await respondYoudao(requests[0], 'alpha', { trs: [{ tr: [{ l: { i: ['测试有道释义'] } }] }] });
  assert.match(textOf(shadow.querySelector('.translation-youdao')), /测试有道释义/);
  await click(findButton(shadow, '补全音标'));
  assert.equal(requests.length, 2);
  await respondYoudao(requests[1], 'alpha', { ukphone: 'ˈælfə' });
  assert.match(textOf(shadow.querySelector('.phonetic')), /\/ˈælfə\//);
  await click(findButton(shadow, '记得'));
  assert.equal(storage.get(prefix + 'study:alpha').lastGrade, 'good');
  await click(findButton(shadow, '查词历史'));
  const beta = shadow.querySelectorAll('.item').find(row => row.querySelector('.term').textContent === 'beta');
  await click(beta);
  assert.ok(requests.some(req => new URL(req.url).searchParams.get('q') === 'beta'));
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
  const { shadow, storage, prefix, context, click } = setup('/test/', 'youdao', { settings: { translationFallback: 'none' } });
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
    const app = setup('/test/', 'youdao', { settings: { translationFallback: 'none' } });
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

test('Chinese definitions keep Youdao independent when machine translation fallback is disabled', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  useSettings(app, { translationFallback: 'none' });
  delete storage.get(prefix + 'word:alpha').youdaoTranslation;
  delete storage.get(prefix + 'word:alpha').youdaoTranslatedAt;
  await click(findButton(shadow, '设置'));
  assert.equal(shadow.querySelector('.translation-fallback').value, 'none');
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
  const app = setup('/test/', 'youdao', { settings: { translationFallback: 'none' } });
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

for (const [label, fail] of [
  ['HTTP 429', request => request.onload({ status: 429, responseText: '{}' })],
  ['quota exhaustion', request => request.onload({ status: 200, responseText: JSON.stringify({
    responseStatus: 200, quotaFinished: true, responseData: { translatedText: 'quota error' }
  }) })],
  ['service error', request => request.onload({ status: 200, responseText: JSON.stringify({
    responseStatus: 429, responseData: { translatedText: 'quota error' }
  }) })],
  ['network error', request => request.onerror()],
  ['timeout', request => request.ontimeout()],
  ['invalid JSON', request => request.onload({ status: 200, responseText: '<html>error</html>' })]
]) {
  test('machine translation fallback uses Google after MyMemory ' + label + ' and reuses its labeled cache', async () => {
    const app = setup();
    const { shadow, storage, prefix, context, click } = app;
    delete storage.get(prefix + 'word:alpha').translation;
    delete storage.get(prefix + 'word:alpha').translationSource;
    const before = structuredClone(storage.get(prefix + 'study:alpha'));
    const requests = [];
    context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
    await openReview(app);
    await click(findButton(shadow, '显示释义'));
    assert.equal(requests.length, 1);
    fail(requests[0]);
    await new Promise(setImmediate);
    assert.equal(requests.length, 2);
    const url = new URL(requests[1].url);
    assert.equal(url.origin, 'https://translate.googleapis.com');
    assert.equal(url.searchParams.get('q'), translationSource(storage.get(prefix + 'word:alpha')));
    assert.equal(url.searchParams.get('sl'), 'en');
    assert.equal(url.searchParams.get('tl'), 'zh-CN');
    requests[1].onload({ status: 200, responseText: JSON.stringify([[['1. 名词：', '1. noun:'], ['阿尔法', 'alpha']], null, 'en']) });
    await new Promise(setImmediate);
    const cached = storage.get(prefix + 'word:alpha');
    assert.equal(cached.translation, '1. 名词：阿尔法');
    assert.equal(cached.translationProvider, 'google');
    assert.equal(cached.translationSource, translationSource(cached));
    const block = shadow.querySelector('.translation-mymemory');
    assert.equal(block.querySelector('.translation-copy').textContent, '1. 名词：阿尔法');
    assert.ok(textOf(block).includes('Google Translate'));
    assert.ok(textOf(block).includes('MyMemory'));
    assert.ok(textOf(shadow.querySelector('.translation-youdao')).includes('有道中文'));
    await click(shadow.querySelectorAll('.tab')[0]);
    await click(shadow.querySelector('.item'));
    assert.equal(requests.length, 2, 'Google cache avoids repeatedly hitting the unavailable primary');
    assert.ok(textOf(shadow.querySelector('.translation-mymemory')).includes('Google Translate'));
    assert.deepEqual(storage.get(prefix + 'study:alpha'), before);
    assert.equal([...storage.keys()].filter(key => key.startsWith(prefix + 'event:')).length, 3);
    await click(findButton(shadow, '重试 MyMemory 中文释义'));
    assert.equal(requests.length, 3);
    assert.ok(requests[2].url.includes('mymemory'));
    requests[2].onload({ status: 200, responseText: JSON.stringify({
      responseStatus: 200, responseData: { translatedText: '恢复的主服务翻译' }
    }) });
    await new Promise(setImmediate);
    assert.equal(storage.get(prefix + 'word:alpha').translationProvider, 'mymemory');
    assert.equal(shadow.querySelector('.translation-mymemory').querySelector('.pos').textContent, 'MyMemory');
  });
}

test('machine translation fallback setting persists, restores and reports storage failures', async () => {
  const app = setup();
  const { shadow, storage, prefix, context, click } = app;
  await click(findButton(shadow, '设置'));
  const select = shadow.querySelector('.translation-fallback');
  assert.ok(select);
  assert.equal(select.value, 'google');
  select.value = 'none';
  select.listeners.change.listener();
  assert.equal(storage.get(prefix + 'settings').translationFallback, 'none');
  const restored = setup('/test/', 'youdao', { settings: storage.get(prefix + 'settings') });
  await restored.click(findButton(restored.shadow, '设置'));
  assert.equal(restored.shadow.querySelector('.translation-fallback').value, 'none');
  context.GM_setValue = () => { throw new Error('storage blocked'); };
  select.value = 'google';
  select.listeners.change.listener();
  assert.equal(select.value, 'none');
  assert.ok(shadow.querySelector('.toast').textContent.includes('storage blocked'));
});

for (const response of [null, [], [[['']]], [[['中文'], [null]]], [[['中'.repeat(16001)]]]]) {
  test('machine translation fallback rejects unusable Google response ' + JSON.stringify(response)?.slice(0, 45), async () => {
    const { shadow, storage, prefix, context, click } = setup();
    delete storage.get(prefix + 'word:alpha').translationSource;
    const requests = [];
    context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
    await click(shadow.querySelector('.item'));
    requests[0].onload({ status: 429, responseText: '{}' });
    await new Promise(setImmediate);
    assert.equal(requests.length, 2);
    requests[1].onload({ status: 200, responseText: JSON.stringify(response) });
    await new Promise(setImmediate);
    const block = shadow.querySelector('.translation-mymemory');
    assert.ok(textOf(block).includes('429'));
    assert.ok(textOf(block).includes('Google Translate：'));
    assert.ok(findButton(block, '重试 MyMemory 中文释义'));
    assert.equal(storage.get(prefix + 'word:alpha').translation, '中文', 'failure keeps the existing translation');
    assert.equal(storage.get(prefix + 'word:alpha').translationProvider, undefined);
  });
}

test('machine translation fallback restarts all chunks instead of mixing providers after partial success', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  const entry = storage.get(prefix + 'word:alpha');
  delete entry.translation;
  delete entry.translationSource;
  entry.meanings[0].definitions[0].definition = 'A lengthy definition. '.repeat(35);
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  requests[0].onload({ status: 200, responseText: JSON.stringify({
    responseStatus: 200, responseData: { translatedText: '不应混入的主服务片段' }
  }) });
  await new Promise(setImmediate);
  requests[1].onload({ status: 429, responseText: '{}' });
  await new Promise(setImmediate);
  assert.equal(requests.length, 3);
  assert.equal(new URL(requests[2].url).searchParams.get('q'), new URL(requests[0].url).searchParams.get('q'));
  requests[2].onload({ status: 200, responseText: JSON.stringify([[['备用第一段']]]) });
  await new Promise(setImmediate);
  requests[3].onload({ status: 200, responseText: JSON.stringify([[['备用第二段']]]) });
  await new Promise(setImmediate);
  assert.equal(storage.get(prefix + 'word:alpha').translation, '备用第一段\n备用第二段');
  assert.equal(storage.get(prefix + 'word:alpha').translationProvider, 'google');
});

test('machine translation fallback keeps its cache with one retry control when both services fail', async () => {
  const { shadow, storage, prefix, context, click } = setup();
  storage.get(prefix + 'word:alpha').translationProvider = 'google';
  const requests = [];
  context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
  await click(shadow.querySelector('.item'));
  await click(findButton(shadow, '重试 MyMemory 中文释义'));
  requests[0].onload({ status: 429, responseText: '{}' });
  await new Promise(setImmediate);
  requests[1].onerror();
  await new Promise(setImmediate);
  const block = shadow.querySelector('.translation-mymemory');
  assert.ok(textOf(block).includes('429'));
  assert.ok(textOf(block).includes('Google Translate：网络连接失败'));
  assert.equal(block.querySelectorAll('button').length, 1);
  assert.equal(storage.get(prefix + 'word:alpha').translation, '中文');
  assert.equal(storage.get(prefix + 'word:alpha').translationProvider, 'google');
  await click(findButton(block, '重试 MyMemory 中文释义'));
  requests[2].onload({ status: 200, responseText: JSON.stringify({
    responseStatus: 200, responseData: { translatedText: '主服务已恢复' }
  }) });
  await new Promise(setImmediate);
  assert.equal(block.querySelectorAll('button').length, 0);
  assert.equal(storage.get(prefix + 'word:alpha').translationProvider, 'mymemory');
});

test('machine translation fallback cannot write late Google results after deletion, English changes or site disable', async () => {
  for (const change of ['deleted', 'changed', 'site-disabled']) {
    const app = setup();
    const { shadow, storage, prefix, context, click } = app;
    delete storage.get(prefix + 'word:alpha').translation;
    delete storage.get(prefix + 'word:alpha').translationSource;
    const requests = [];
    context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
    await click(shadow.querySelector('.item'));
    requests[0].onload({ status: 429, responseText: '{}' });
    await new Promise(setImmediate);
    if (change === 'deleted') storage.delete(prefix + 'word:alpha');
    else if (change === 'changed') storage.get(prefix + 'word:alpha').meanings[0].definitions[0].definition = 'Changed.';
    else await app.menus.get('禁用此页面')();
    requests[1].onload({ status: 200, responseText: JSON.stringify([[['不应写入的译文']]]) });
    await new Promise(setImmediate);
    assert.equal(storage.get(prefix + 'word:alpha')?.translation, undefined, change);
    assert.equal(requests.length, 2);
  }
});

test('machine translation fallback respects disabling while MyMemory is pending and cannot restore deleted or changed words', async () => {
  for (const change of ['disabled', 'deleted', 'changed']) {
    const app = setup();
    const { shadow, storage, prefix, context, click } = app;
    delete storage.get(prefix + 'word:alpha').translation;
    delete storage.get(prefix + 'word:alpha').translationSource;
    const requests = [];
    context.GM_xmlhttpRequest = request => { requests.push(request); return { abort() {} }; };
    await click(shadow.querySelector('.item'));
    if (change === 'disabled') useSettings(app, { translationFallback: 'none' });
    else if (change === 'deleted') storage.delete(prefix + 'word:alpha');
    else storage.get(prefix + 'word:alpha').meanings[0].definitions[0].definition = 'Changed.';
    requests[0].onload({ status: 429, responseText: '{}' });
    await new Promise(setImmediate);
    assert.equal(requests.length, 1, change + ' prevents a fallback request');
    assert.equal(storage.get(prefix + 'word:alpha')?.translation, undefined);
  }
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

test('reverse card titles match the prompt language and hide every target occurrence until reveal', async () => {
  for (const chinese of [false, true]) {
    const app = setup();
    const { shadow, storage, prefix, context, click } = app;
    const phrase = 'Alpha or alpha, not alphabet.';
    const sentence = 'Alpha met alpha near Alphabet and ALPHA.';
    const entry = storage.get(prefix + 'word:alpha');
    entry.meanings[0].definitions[0].definition = phrase;
    delete entry.translation;
    delete entry.youdaoTranslation;
    if (chinese) entry.youdaoTranslation = '释义：' + phrase;
    storage.set(prefix + 'event:context-alpha', { word: 'alpha', id: 'context-alpha', at: 20, context: sentence });
    storage.set(prefix + 'study:alpha', schedule(createStudy('alpha', context.Date.now() - DAY), 'easy', context.Date.now() - DAY));
    useSettings(app, { reverse: true });
    await openReview(app);
    const readCard = () => shadow.querySelector('.review');
    assert.match(readCard().querySelector('.muted').textContent, chinese ? /看中文想英文/ : /看英文释义想单词/);
    assert.equal(textOf(readCard().querySelector('.recall-prompt')), (chinese ? '释义：' : '') + '＿＿＿ or ＿＿＿, not alphabet.');
    assert.equal(textOf(readCard().querySelector('.context-line')), '＿＿＿ met ＿＿＿ near Alphabet and ＿＿＿.');
    await click(findButton(shadow, '显示单词'));
    assert.equal(textOf(readCard().querySelector('.context-line')), sentence);
    assert.equal(textOf(readCard().querySelector('.recall-prompt')), (chinese ? '释义：' : '') + phrase);
  }
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
  await click(findButton(shadow, '记得'));
  assert.equal(storage.get(prefix + 'recall:alpha').fsrs.state, 1);
  assert.equal(storage.get(prefix + 'study:alpha'), meaning);
  await click(findButton(shadow, '现在提前复习'));
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
  await click(findButton(shadow, '记得'));
  const saved = json(storage.get(prefix + 'study:alpha'));
  assert.deepEqual(saved, schedule(original, 'good', context.Date.now(), 0.95));
  assert.ok(saved.dueAt < schedule(original, 'good', context.Date.now()).dueAt);
});