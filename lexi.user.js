// ==UserScript==
// @name         Lexi · 划词词典与复习
// @namespace    lexi-local
// @version      0.1.5
// @description  英文划词、发音、跨网站历史、生词复习与本地备份。无需账号。
// @match        http://*/*
// @match        https://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @connect      api.dictionaryapi.dev
// @connect      api.mymemory.translated.net
// @connect      dict.youdao.com
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';
  const DAY = 86400000;
  const PREFIX = 'lexi:v1:';
  const INTERVALS = [1, 3, 7, 14, 30, 60];
  const DEFAULTS = { auto: true, context: false };
  const normalize = value => {
    if (typeof value !== 'string') return '';
    const word = value.trim().replace(/[‘’]/g, "'")
      .replace(/^[\s'"“”([{]+|[\s'"“”.,!?;:)\]}]+$/g, '').toLowerCase();
    return word.length <= 64 && /^[a-z]+(?:[-'][a-z]+)*$/.test(word) ? word : '';
  };
  const text = (value, max = 1200) => typeof value === 'string' ? value.slice(0, max) : '';
  const safeUrl = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  };
  const audioUrl = value => {
    const url = safeUrl(typeof value === 'string' && value.startsWith('//') ? 'https:' + value : value);
    if (!url) return '';
    const host = new URL(url).hostname;
    return host === 'api.dictionaryapi.dev' || host === 'gstatic.com' || host.endsWith('.gstatic.com') ? url : '';
  };
  function schedule(record, grade, now) {
    if (!['again', 'hard', 'good'].includes(grade)) throw new Error('未知复习反馈');
    const stage = grade === 'again' ? 0 : grade === 'good' ? Math.min(record.stage + 1, 6) : record.stage;
    const delay = grade === 'again' ? 600000 : grade === 'hard' ? DAY : INTERVALS[Math.max(0, stage - 1)] * DAY;
    return { ...record, stage, dueAt: now + delay, updatedAt: now, lastReviewedAt: now,
      reviews: record.reviews + 1, lastGrade: grade };
  }
  const csvCell = value => {
    let cell = String(value ?? '');
    if (/^[\s\uFEFF]*[=+\-@]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replace(/"/g, '""') + '"';
  };
  const csv = rows => '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const translationSource = entry => entry.meanings.flatMap(meaning => meaning.definitions.map(def =>
    `${meaning.partOfSpeech ? meaning.partOfSpeech + ': ' : ''}${def.definition}`))
    .slice(0, 6).map((definition, index) => `${index + 1}. ${definition}`).join('\n');
  function translationChunks(source) {
    const chunks = [];
    let chunk = '';
    const encoder = new TextEncoder();
    for (const token of source.match(/\S+\s*|\s+/g) || []) {
      if (encoder.encode(chunk + token).length > 480 && chunk) { chunks.push(chunk); chunk = ''; }
      for (const character of token) {
        if (encoder.encode(chunk + character).length > 480) { chunks.push(chunk); chunk = ''; }
        chunk += character;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  }
  const translationMatches = (cached, entry) => cached.translationSource
    ? cached.translationSource === translationSource(entry)
    : cached.meanings[0].definitions[0].definition === entry.meanings[0].definitions[0].definition;
  function youdaoPhonetic(raw, word) {
    const records = [raw?.simple?.word, raw?.ec?.word].flatMap(items => Array.isArray(items) ? items : []);
    for (const item of records) {
      const phrase = item?.['return-phrase'];
      if (normalize(typeof phrase === 'string' ? phrase : phrase?.l?.i) !== word) continue;
      const value = [item.ukphone, item.usphone, item.phone].find(value =>
        typeof value === 'string' && value.trim() && value.length <= 148);
      if (value) return '/' + value.trim().replace(/^\/|\/$/g, '') + '/';
    }
    throw new Error('暂未找到该词的音标，可稍后重试');
  }
  function dictionary(raw, word, now) {
    if (!Array.isArray(raw) || !raw.length) throw new Error('词典返回格式异常');
    const entries = raw.filter(entry => entry && typeof entry === 'object');
    const phonetics = entries.flatMap(entry => Array.isArray(entry.phonetics) ? entry.phonetics : []).filter(Boolean);
    const meanings = entries.flatMap(entry => Array.isArray(entry.meanings) ? entry.meanings : [])
      .filter(item => item && Array.isArray(item.definitions)).slice(0, 5).map(item => ({
        partOfSpeech: text(item.partOfSpeech, 50),
        definitions: item.definitions.filter(item => item && typeof item.definition === 'string' && item.definition.trim())
          .slice(0, 3).map(item => ({ definition: text(item.definition), example: text(item.example, 600) }))
      })).filter(item => item.definitions.length);
    if (!meanings.length) throw new Error('未找到可显示的释义');
    const first = entries[0];
    const phonetic = [...phonetics.map(item => item.text), ...entries.map(item => item.phonetic)]
      .find(value => typeof value === 'string' && value.trim());
    return { word, fetchedAt: now, phonetic: text(phonetic, 150).trim(),
      audio: phonetics.map(item => audioUrl(item.audio)).find(Boolean) || '', meanings,
      sourceUrl: safeUrl(first?.sourceUrls?.[0]),
      license: { name: text(first?.license?.name, 120), url: safeUrl(first?.license?.url) } };
  }
  function validateBackup(raw) {
    const fail = () => { throw new Error('备份格式无效或版本不兼容，未导入数据'); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const timestamp = value => Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;
    const validWord = value => typeof value === 'string' && normalize(value) === value && value !== '';
    const string = (value, max) => typeof value === 'string' && value.length <= max;
    if (!object(raw) || raw.schemaVersion !== 1 || !['words', 'history', 'book'].every(key => Array.isArray(raw[key]))) fail();
    if (raw.words.length > 10000 || raw.history.length > 30000 || raw.book.length > 10000) fail();
    const unique = (items, key) => new Set(items.map(item => item[key])).size === items.length;
    if (![...raw.words, ...raw.history, ...raw.book].every(object)) fail();
    if (!unique(raw.words, 'word') || !unique(raw.book, 'word') || !unique(raw.history, 'id')) fail();
    const words = raw.words.map(item => {
      if (!validWord(item.word) || !timestamp(item.fetchedAt) || !string(item.phonetic, 150) ||
          !Array.isArray(item.meanings) || !item.meanings.length || item.meanings.length > 5) fail();
      const meanings = item.meanings.map(meaning => {
        if (!object(meaning) || !string(meaning.partOfSpeech, 50) || !Array.isArray(meaning.definitions) ||
            !meaning.definitions.length || meaning.definitions.length > 3) fail();
        return { partOfSpeech: meaning.partOfSpeech, definitions: meaning.definitions.map(def => {
          if (!object(def) || !string(def.definition, 1200) || !def.definition.trim() || !string(def.example, 600)) fail();
          return { definition: def.definition, example: def.example };
        }) };
      });
      if (item.translation !== undefined && (!string(item.translation, 16000) || !timestamp(item.translatedAt))) fail();
      if (item.translationSource !== undefined && (!item.translation || !string(item.translationSource, 8000))) fail();
      if (item.phoneticSource !== undefined && (item.phoneticSource !== 'youdao' || !item.phonetic.trim())) fail();
      return { word: item.word, fetchedAt: item.fetchedAt, phonetic: item.phonetic.trim(), meanings,
        ...(item.phoneticSource ? { phoneticSource: item.phoneticSource } : {}),
        audio: audioUrl(item.audio), sourceUrl: safeUrl(item.sourceUrl),
        license: { name: text(item.license?.name, 120), url: safeUrl(item.license?.url) },
        ...(item.translation ? { translation: item.translation, translatedAt: item.translatedAt,
          ...(item.translationSource ? { translationSource: item.translationSource } : {}) } : {}) };
    });
    const wordSet = new Set(words.map(item => item.word));
    const history = raw.history.map(item => {
      if (!validWord(item.word) || !wordSet.has(item.word) || !timestamp(item.at) ||
          typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{10,80}$/.test(item.id)) fail();
      return { id: item.id, word: item.word, at: item.at,
        context: text(item.context, 300), title: text(item.title, 120), sourceUrl: safeUrl(item.sourceUrl) };
    });
    const book = raw.book.map(item => {
      if (!validWord(item.word) || !wordSet.has(item.word) || !timestamp(item.addedAt) || !timestamp(item.updatedAt) ||
          !timestamp(item.dueAt) || !Number.isInteger(item.stage) || item.stage < 0 || item.stage > 6 ||
          !Number.isSafeInteger(item.reviews) || item.reviews < 0 ||
          (item.lastReviewedAt !== 0 && !timestamp(item.lastReviewedAt)) ||
          !['', 'again', 'hard', 'good'].includes(item.lastGrade)) fail();
      return { word: item.word, addedAt: item.addedAt, updatedAt: item.updatedAt, dueAt: item.dueAt,
        stage: item.stage, reviews: item.reviews, lastReviewedAt: item.lastReviewedAt, lastGrade: item.lastGrade };
    });
    return { schemaVersion: 1, words, history, book };
  }
  function mergeBackup(current, incoming) {
    const words = new Map(current.words.map(item => [item.word, item]));
    for (const item of incoming.words) {
      const old = words.get(item.word);
      const newer = !old || item.fetchedAt > old.fetchedAt ? item : old;
      const translation = [old, item].filter(value => value?.translation && translationMatches(value, newer))
        .sort((a, b) => b.translatedAt - a.translatedAt)[0];
      const combined = { ...newer };
      const phonetic = [newer, old, item].find(value => value?.phonetic?.trim());
      if (phonetic) {
        combined.phonetic = phonetic.phonetic;
        delete combined.phoneticSource;
        if (phonetic.phoneticSource) combined.phoneticSource = phonetic.phoneticSource;
      }
      delete combined.translation;
      delete combined.translatedAt;
      delete combined.translationSource;
      words.set(item.word, { ...combined, ...(translation ? { translation: translation.translation, translatedAt: translation.translatedAt,
        ...(translation.translationSource ? { translationSource: translation.translationSource } : {}) } : {}) });
    }
    const history = new Map(current.history.map(item => [item.id, item]));
    for (const item of incoming.history) {
      const old = history.get(item.id);
      if (old && (old.word !== item.word || old.at !== item.at)) throw new Error('历史 ID 冲突，未导入数据');
      if (!old) history.set(item.id, item);
    }
    const book = new Map(current.book.map(item => [item.word, item]));
    for (const item of incoming.book) {
      if (!book.has(item.word) || item.updatedAt > book.get(item.word).updatedAt) book.set(item.word, item);
    }
    return { words: [...words.values()], history: [...history.values()], book: [...book.values()] };
  }
  const ordered = (events, oldest = false) => [...events].sort((a, b) =>
    (oldest ? 1 : -1) * (a.at - b.at || a.id.localeCompare(b.id)));
  if (typeof window === 'undefined') {
    module.exports = { normalize, schedule, csv, dictionary, validateBackup, mergeBackup, ordered, audioUrl, translationSource, translationChunks, youdaoPhonetic };
    return;
  }

  const get = (key, fallback) => GM_getValue(PREFIX + key, fallback);
  const put = (key, value) => GM_setValue(PREFIX + key, value);
  const remove = key => GM_deleteValue(PREFIX + key);
  const notify = () => put('revision', crypto.randomUUID());
  const all = type => GM_listValues().filter(key => key.startsWith(PREFIX + type + ':')).map(key => GM_getValue(key)).filter(Boolean);
  const snapshot = () => ({ schemaVersion: 1, exportedAt: new Date().toISOString(),
    words: all('word'), history: ordered(all('event'), true), book: all('study'), settings: get('settings', DEFAULTS) });
  const date = value => new Date(value).toLocaleString('zh-CN', { hour12: false });
  const today = value => new Date(value).toLocaleDateString() === new Date().toLocaleDateString();
  let settings = { ...DEFAULTS, ...get('settings', {}) };
  let queryEpoch = 0;
  let activeRequest;
  let activeAudio;
  let audioEpoch = 0;
  let ownSpeech = false;
  let selectedWord = '';
  let selectedEvent = null;
  let screen = 'history';
  let filter = '';
  let oldest = false;
  let queue = null;
  let reviewIndex = 0;
  let revealed = false;
  let returnFocus;
  const host = document.createElement('div');
  host.id = 'lexi-local-root';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.append(host);
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  function button(label, action, className = 'button', hint = '') {
    const node = el('button', className, label);
    node.type = 'button';
    if (hint) { node.title = hint; node.setAttribute('aria-label', hint); }
    node.addEventListener('click', () => Promise.resolve().then(action).then(() => {
      if (!overlay.hidden && !shadow.activeElement) input.focus();
    }).catch(showError));
    return node;
  }
  function link(label, url) {
    const node = el('a', 'link', label);
    node.href = safeUrl(url) || 'https://dictionaryapi.dev/';
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    return node;
  }
  const style = el('style');
  style.textContent = `
    :host{--paper:#fafaf7;--surface:#fff;--ink:#1e302b;--muted:#738079;--line:#e4e9e2;--accent:#23634c;--tint:#edf4ed;--error:#a33c36;all:initial;color-scheme:light}
    *{box-sizing:border-box} [hidden]{display:none!important}
    .app{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:var(--ink);letter-spacing:0;text-align:left;direction:ltr}
    button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}button{cursor:pointer}button:disabled{cursor:wait;opacity:.55}button,select{flex-shrink:0;white-space:nowrap}.search input,.row>input{flex:1;width:0}select{min-width:76px}
    button:focus-visible,a:focus-visible{outline:3px solid #75ac8c;outline-offset:3px}input:focus-visible,select:focus-visible{outline:none;background:var(--tint)}
    .launcher{pointer-events:auto;position:fixed;right:24px;bottom:24px;width:46px;height:46px;border:1px solid #ffffff40;border-radius:16px;background:var(--accent);color:white;box-shadow:0 6px 25px #102a2025;font:italic 28px Georgia,serif}
    .popover{pointer-events:auto;position:fixed;width:min(380px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 16px 65px #102a2026;padding:22px}
    .bar,.row,.actions{display:flex;align-items:center;gap:10px}.bar{justify-content:space-between}.actions{flex-wrap:wrap}.brand{font-weight:750;letter-spacing:3px;font-size:12px}.muted,.meta{color:var(--muted);font-size:12px}.meta{margin-top:4px}.word{font:42px/1.2 Georgia,"Times New Roman",serif;overflow-wrap:anywhere;margin:20px 0 6px}.phonetic{color:var(--muted);font-size:14px;margin-bottom:14px}
    .button,.icon,.tab{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:8px 13px;transition:background .12s}.button:hover,.icon:hover{background:var(--tint)}.primary{background:var(--accent);color:white;border-color:var(--accent)}.primary:hover{filter:brightness(1.1);background:var(--accent)}.icon{padding:5px 9px;font-size:16px}.danger{color:var(--error)}.active{background:var(--tint);border-color:var(--accent);color:var(--accent)}
    .sense{border-top:1px solid var(--line);padding-top:15px;margin-top:18px}.pos{display:inline-block;color:var(--accent);font-size:12px;font-weight:650;margin-bottom:6px}.definition{margin:0 0 10px;line-height:1.75}.example{color:var(--muted);border-left:2px solid var(--line);padding-left:10px;margin:5px 0 14px;font-size:13px}.translation{background:var(--tint);padding:14px;border-radius:10px;margin-top:14px}.source{border-top:1px solid var(--line);margin-top:20px;padding-top:12px;display:flex;flex-wrap:wrap;gap:8px;font-size:11px}.link{color:var(--accent);text-decoration:none}.link:hover{text-decoration:underline}.context{font-size:13px;margin-top:18px;color:var(--muted);overflow-wrap:anywhere}.error{color:var(--error)}
    .overlay{pointer-events:auto;position:fixed;inset:0;background:#0d211f55;backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:24px}.studio{background:var(--paper);border:1px solid var(--line);border-radius:24px;box-shadow:0 30px 100px #081d2038;width:min(1060px,100%);height:min(760px,90vh);display:grid;grid-template-columns:166px minmax(0,1fr);overflow:hidden}.sidebar{padding:28px 18px;background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;gap:8px}.logo{font:italic 34px Georgia,serif;margin:0 10px}.sidebar .muted{margin:0 10px 28px}.tab{text-align:left;border-color:transparent;background:transparent;padding:11px 14px}.tab.active{background:var(--tint);color:var(--accent);font-weight:650}.sidebar .footnote{margin-top:auto;font-size:11px;color:var(--muted);padding:12px}
    .main{min-width:0;display:flex;flex-direction:column}.top{padding:22px 26px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line)}.search{display:flex;gap:8px;flex:1;min-width:0}input,select{color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:9px 12px;min-width:0}input{width:100%}input::placeholder{color:var(--muted)}.view{padding:24px 26px;overflow:auto;min-height:0;flex:1}.heading{font-size:24px;letter-spacing:-.5px;margin:0;font-weight:650}.subheading{font-size:13px;color:var(--muted);margin:5px 0 22px}.split{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px}.list{display:flex;flex-direction:column;gap:6px;margin-top:12px;max-height:440px;overflow:auto;padding:4px}.item{display:block;width:100%;text-align:left;padding:11px 12px;border-radius:12px;background:transparent;border:1px solid transparent;color:var(--ink)}.item:hover{background:var(--surface)}.item.active{background:var(--tint);border-color:var(--line)}.item .term{font:22px Georgia,serif}.detail{min-width:0}.detail .word{margin-top:8px}.empty{color:var(--muted);text-align:center;padding:45px 15px;font-size:14px}.section{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;margin:16px 0}.section h3{margin:0 0 14px;font-size:15px}.setting{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:16px 0}.setting input{width:18px;height:18px;accent-color:var(--accent)}.notice{font-size:12px;color:var(--muted);margin-top:12px}.review{text-align:center;max-width:540px;margin:25px auto}.review .word{font-size:54px;margin:35px 0 12px}.review-answer{text-align:left;margin:25px 0}.stats{display:flex;gap:12px;margin:24px 0}.stat{flex:1;padding:18px;background:var(--surface);border:1px solid var(--line);border-radius:15px}.stat strong{display:block;font:32px Georgia,serif;color:var(--accent)}.toast{pointer-events:auto;position:fixed;left:50%;bottom:25px;transform:translateX(-50%);max-width:calc(100vw - 32px);background:var(--ink);color:var(--surface);padding:12px 20px;border-radius:12px;box-shadow:0 5px 25px #0002;z-index:2}
    @media(prefers-color-scheme:dark){:host{--paper:#15201d;--surface:#1b2823;--ink:#e4ede5;--muted:#9aada1;--line:#304238;--accent:#9fd2b1;--tint:#263c30;--error:#f1a19b;color-scheme:dark}.primary,.launcher{background:#38684d;color:#fff;border-color:#497a5d}.primary:hover{background:#38684d}}
    @media(max-width:760px){.overlay{padding:10px}.studio{grid-template-columns:1fr;height:95vh;border-radius:18px}.sidebar{padding:12px;flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid var(--line);gap:3px;flex-wrap:wrap}.sidebar .logo{font-size:25px;margin-right:auto}.sidebar .muted,.footnote{display:none}.tab{padding:7px 10px}.main{min-height:0}.top{padding:14px}.view{padding:18px}.split{grid-template-columns:1fr}.list{max-height:170px}.detail{border-top:1px solid var(--line);padding-top:18px}.review .word{font-size:40px}.stats{gap:6px}.stat{padding:12px}.launcher{right:16px;bottom:16px}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
  `;
  const app = el('div', 'app');
  style.textContent += `
    .toast{pointer-events:none}
    input,select{border:0;outline:none;box-shadow:none}
    .search input{font-size:18px;line-height:1.5;padding:8px 12px}
    .list{gap:2px;margin-top:8px;padding:2px}
    .item{padding:6px 10px;border:0;border-radius:9px}
    .item .term{font-size:21px;line-height:1.2}
    .item .meta{margin-top:2px;font-size:11px;line-height:1.4}
    .translation-copy{white-space:pre-line;line-height:1.85}
    .logo .version{font:11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--muted);margin-left:6px;white-space:nowrap}
    .phonetic{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.phonetic .link{font-size:11px}.phonetic .button{font-size:12px;padding:2px 8px}.review>.phonetic{justify-content:center}
    *{overscroll-behavior:contain}
    ::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
    ::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--muted) 42%,transparent);border-radius:8px}
    ::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--muted) 65%,transparent)}
    ::-webkit-scrollbar-button{display:none;width:0;height:0}
    @supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--muted) 42%,transparent) transparent}}
    .studio{grid-template-rows:minmax(0,1fr)}.main,.sidebar{min-height:0}.main{overflow:hidden}.sidebar{overflow:auto}.top{flex-shrink:0}
    .view.library{display:flex;flex-direction:column;overflow:hidden}.library>.heading,.library>.subheading{flex-shrink:0}
    .library .split{flex:1;min-height:0;grid-template-rows:minmax(0,1fr)}.library-list{display:flex;flex-direction:column;min-width:0;min-height:0}.library-list>.row{flex-shrink:0}
    .library .list{flex:1;min-height:0;max-height:none}.detail-pane{overflow:auto;min-height:0;padding:3px 8px 3px 3px}
    .list:focus-visible,.detail-pane:focus-visible{outline:2px solid #75ac8c;outline-offset:-2px}
    .history-row{position:relative;flex-shrink:0}.history-row>.item{padding-right:40px}.history-delete{position:absolute;right:5px;top:50%;transform:translateY(-50%);border:0;background:transparent;opacity:0;pointer-events:none}
    .history-row:hover>.history-delete,.history-row:focus-within>.history-delete{opacity:1;pointer-events:auto}
    @media(hover:none){.history-delete{opacity:1;pointer-events:auto}}
    @media(max-width:760px){.studio{grid-template-rows:auto minmax(0,1fr)}.library .split{grid-template-rows:minmax(0,2fr) minmax(0,3fr);gap:16px}}
  `;
  const launcher = button('L', () => openStudio(), 'launcher', '打开 Lexi 学习中心');
  const popover = el('section', 'popover');
  popover.setAttribute('role', 'region');
  popover.setAttribute('aria-label', 'Lexi 查词结果');
  popover.hidden = true;
  const overlay = el('div', 'overlay');
  overlay.hidden = true;
  const studio = el('section', 'studio');
  studio.setAttribute('role', 'dialog');
  studio.setAttribute('aria-modal', 'true');
  studio.setAttribute('aria-label', 'Lexi 学习中心');
  const sidebar = el('nav', 'sidebar');
  sidebar.setAttribute('aria-label', '学习导航');
  const logo = el('div', 'logo', 'Lexi');
  logo.append(el('span', 'version', 'v' + GM_info.script.version));
  sidebar.append(logo, el('div', 'muted', '个人词汇库'));
  const navButtons = {};
  for (const [key, label] of [['history', '查词历史'], ['book', '生词本'], ['review', '复习'], ['settings', '设置']]) {
    navButtons[key] = button(label, () => { screen = key; filter = ''; render(); }, 'tab');
    sidebar.append(navButtons[key]);
  }
  sidebar.append(el('div', 'footnote', '本地保存 · 无需账号'));
  const main = el('main', 'main');
  const top = el('header', 'top');
  const form = el('form', 'search');
  const input = el('input');
  input.placeholder = '输入英文单词，按 Enter 查词';
  input.setAttribute('aria-label', '查询英文单词');
  input.autocomplete = 'off';
  input.maxLength = 80;
  form.append(input, button('查询', () => lookup(input.value), 'button primary'));
  form.addEventListener('submit', event => { event.preventDefault(); lookup(input.value).catch(showError); });
  top.append(form, button('×', closeStudio, 'icon', '关闭学习中心'));
  const view = el('div', 'view');
  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  main.append(top, view);
  studio.append(sidebar, main);
  overlay.append(studio);
  app.append(launcher, popover, overlay, toast);
  shadow.append(style, app);
  let toastTimer;
  function message(value) {
    toast.textContent = value;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }
  const showError = error => message(error?.message || '操作失败，请重试');
  function stopQuery() { queryEpoch++; activeRequest?.abort(); activeRequest = null; }
  function stopAudio() {
    audioEpoch++;
    activeAudio?.pause();
    activeAudio = null;
    if (ownSpeech) window.speechSynthesis?.cancel();
    ownSpeech = false;
  }
  function closePopover() { popover.hidden = true; stopQuery(); stopAudio(); }
  function openStudio(nextScreen) {
    returnFocus = shadow.activeElement || document.activeElement;
    closePopover();
    if (nextScreen) screen = nextScreen;
    overlay.hidden = false;
    render();
    input.focus();
  }
  function closeStudio() {
    overlay.hidden = true;
    stopQuery();
    stopAudio();
    if (returnFocus?.getClientRects().length) returnFocus.focus?.();
    else launcher.focus();
  }
  overlay.addEventListener('click', event => { if (event.target === overlay) closeStudio(); });
  function containWheel(event) {
    event.stopPropagation();
    if (event.ctrlKey) return;
    const path = event.composedPath();
    const canScroll = path.slice(0, path.indexOf(event.currentTarget) + 1).some(node => {
      if (!(node instanceof Element)) return false;
      const style = getComputedStyle(node);
      return /^(auto|scroll)$/.test(style.overflowY) && (event.deltaY < 0 ? node.scrollTop > 0
        : event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1)
        || /^(auto|scroll)$/.test(style.overflowX) && (event.deltaX < 0 ? node.scrollLeft > 0
          : event.deltaX > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
    });
    if (!canScroll) event.preventDefault();
  }
  overlay.addEventListener('wheel', containWheel, { passive: false });
  popover.addEventListener('wheel', containWheel, { passive: false });
  shadow.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); overlay.hidden ? closePopover() : closeStudio(); }
    if (event.key !== 'Tab' || overlay.hidden) return;
    const focusable = [...studio.querySelectorAll('button,a,input,select,[tabindex="0"]')].filter(node => !node.disabled && node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (!focusable.includes(shadow.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    else if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popover.hidden) closePopover();
  });

  function request(url, lookupRequest = false) {
    let timer;
    let handle;
    const pending = new Promise((resolve, reject) => {
      // Anonymous requests force fetch mode, whose native timeout is ignored on Chrome.
      timer = setTimeout(() => { reject(new Error('请求超时，请稍后重试')); handle?.abort(); }, 10000);
      handle = GM_xmlhttpRequest({ method: 'GET', url, timeout: 10000, anonymous: true,
        onload: response => {
          if (response.status === 404) { reject(new Error('没有找到这个词，试试原形或其他拼写')); return; }
          if (response.status < 200 || response.status >= 300) { reject(new Error(`服务暂不可用（${response.status}），请稍后重试`)); return; }
          try {
            if (response.responseText.length > 300000) throw new Error('服务响应过大');
            resolve(JSON.parse(response.responseText));
          } catch { reject(new Error('服务返回格式异常，请稍后重试')); }
        },
        onerror: () => reject(new Error('网络连接失败，请检查网络或稍后重试')),
        ontimeout: () => reject(new Error('请求超时，请稍后重试')),
        onabort: () => reject(new Error('查询已取消'))
      });
      if (lookupRequest) activeRequest = handle;
    });
    return pending.finally(() => clearTimeout(timer));
  }
  function positionPopover(rect) {
    popover.hidden = false;
    const width = Math.min(380, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect?.left ?? window.innerWidth - width - 24, window.innerWidth - width - 12));
    const height = popover.getBoundingClientRect().height;
    const below = (rect?.bottom ?? 80) + 10;
    const top = below + height < window.innerHeight - 12 ? below : Math.max(12, (rect?.top ?? 80) - height - 10);
    popover.style.left = left + 'px';
    popover.style.top = Math.min(top, Math.max(12, window.innerHeight - height - 12)) + 'px';
  }
  function popHeader() {
    const bar = el('div', 'bar');
    bar.append(el('span', 'brand', 'LEXI · 英语词典'), button('×', closePopover, 'icon', '关闭查词卡'));
    return bar;
  }
  async function lookup(raw, rect, context = null) {
    const word = normalize(raw);
    if (!word) { message('请输入单个英文单词，支持内部连字符和撇号'); return; }
    stopQuery();
    const epoch = queryEpoch;
    const showPopup = overlay.hidden;
    if (showPopup) {
      popover.replaceChildren(popHeader(), el('h2', 'word', word), el('p', 'muted', '正在查词…'));
      positionPopover(rect);
    } else message(`正在查询 ${word}…`);
    let entry = get('word:' + word);
    let stale = false;
    try {
      if (!entry || Date.now() - entry.fetchedAt > 7 * DAY) {
        try {
          const response = await request('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word), true);
          if (epoch !== queryEpoch) return;
          const fresh = dictionary(response, word, Date.now());
          const cached = get('word:' + word);
          if (!fresh.phonetic && cached?.phonetic?.trim()) {
            fresh.phonetic = cached.phonetic;
            if (cached.phoneticSource) fresh.phoneticSource = cached.phoneticSource;
          }
          if (entry?.translation && translationMatches(entry, fresh)) {
            Object.assign(fresh, { translation: entry.translation, translatedAt: entry.translatedAt,
              ...(entry.translationSource ? { translationSource: entry.translationSource } : {}) });
          }
          entry = fresh;
        } catch (error) {
          if (epoch !== queryEpoch) return;
          if (!entry) throw error;
          stale = true;
        }
      }
      if (epoch !== queryEpoch) return;
      put('word:' + word, entry);
      const event = { id: crypto.randomUUID(), word, at: Date.now(), ...(context || {}) };
      put('event:' + event.id, event);
      selectedWord = word;
      selectedEvent = event;
      notify();
      if (showPopup) {
        popover.replaceChildren(popHeader(), wordDetail(entry, event));
        if (stale) popover.append(el('p', 'notice', '使用离线缓存 · 暂未能更新释义'));
        popover.append(button('打开学习中心 ↗', () => openStudio('history'), 'button'));
        positionPopover(rect);
      } else {
        if (toast.textContent === `正在查询 ${word}…`) toast.hidden = true;
        screen = 'history'; filter = ''; render();
        if (stale) message('使用离线缓存 · 暂未能更新释义');
      }
    } catch (error) {
      if (epoch !== queryEpoch) return;
      if (showPopup) {
        popover.replaceChildren(popHeader(), el('h2', 'word', word), el('p', 'error', error.message),
          button('重试', () => lookup(word, rect, context)));
        positionPopover(rect);
      } else showError(error);
    } finally { if (epoch === queryEpoch) activeRequest = null; }
  }
  function speak(entry) {
    stopAudio();
    const epoch = audioEpoch;
    const fallback = () => {
      if (epoch !== audioEpoch) return;
      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') { message('当前浏览器没有可用的朗读功能'); return; }
      const utterance = new SpeechSynthesisUtterance(entry.word);
      utterance.lang = 'en-US';
      utterance.rate = .85;
      ownSpeech = true;
      utterance.onend = () => { if (epoch === audioEpoch) ownSpeech = false; };
      utterance.onerror = () => {
        if (epoch !== audioEpoch) return;
        ownSpeech = false;
        message('朗读失败，请检查系统英语语音是否可用');
      };
      speechSynthesis.speak(utterance);
    };
    if (!audioUrl(entry.audio)) { fallback(); return; }
    activeAudio = new Audio(entry.audio);
    activeAudio.play().catch(() => {
      if (epoch !== audioEpoch) return;
      message('在线音频不可用，尝试浏览器朗读'); fallback();
    });
  }
  const translations = new Map();
  async function translate(entry, target) {
    target.replaceChildren(el('div', 'muted', '正在补全中文释义…'));
    const source = translationSource(entry);
    const key = entry.word + '\n' + source;
    try {
      if (!translations.has(key)) {
        const pending = (async () => {
          const translated = [];
          for (const chunk of translationChunks(source)) {
            if (!get('word:' + entry.word)) throw new Error('词条已删除，请重新查询');
            const result = await request('https://api.mymemory.translated.net/get?langpair=en%7Czh-CN&q=' + encodeURIComponent(chunk));
            const value = result?.responseData?.translatedText;
            if (Number(result?.responseStatus) !== 200 || result?.quotaFinished || typeof value !== 'string' || !value.trim()) {
              throw new Error('中文服务暂不可用或额度已用尽，可稍后重试');
            }
            translated.push(value.trim());
          }
          const current = get('word:' + entry.word);
          if (!current) throw new Error('词条已删除，请重新查询');
          if (translationSource(current) !== source) throw new Error('词典释义已更新，请重新获取中文');
          const translation = translated.join('\n');
          if (translation.length > 16000) throw new Error('中文响应过长，请稍后重试');
          const updated = { ...current, translation, translationSource: source, translatedAt: Date.now() };
          put('word:' + entry.word, updated);
          notify();
          return updated;
        })();
        translations.set(key, pending);
        pending.finally(() => translations.delete(key)).catch(() => {});
      }
      const updated = await translations.get(key);
      target.replaceChildren(translationBlock(updated));
    } catch (error) {
      target.replaceChildren();
      if (entry.translation) target.append(translationBlock(entry));
      target.append(el('p', 'notice', error.message), button('重试中文释义', () => translate(entry, target)));
    }
  }
  function translationBlock(entry) {
    const node = el('div', 'translation');
    node.append(el('div', 'translation-copy', entry.translation),
      el('div', 'meta', entry.translationSource ? '多条释义 · MyMemory 机器翻译' : 'MyMemory 机器翻译'));
    return node;
  }
  function toggleStar(word) {
    const existing = get('study:' + word);
    if (existing) {
      if (!confirm(`将 ${word} 移出生词本？该词的复习进度也会删除，查词历史保留。`)) return false;
      remove('study:' + word);
    } else {
      const now = Date.now();
      put('study:' + word, { word, addedAt: now, updatedAt: now, stage: 0, dueAt: now,
        reviews: 0, lastReviewedAt: 0, lastGrade: '' });
    }
    notify();
    if (!overlay.hidden) render();
    return true;
  }
  function senses(entry) {
    const container = el('div');
    for (const meaning of entry.meanings) {
      const section = el('section', 'sense');
      section.append(el('div', 'pos', meaning.partOfSpeech || '释义'));
      meaning.definitions.forEach((def, index) => {
        section.append(el('p', 'definition', `${meaning.definitions.length > 1 ? index + 1 + '. ' : ''}${def.definition}`));
        if (def.example) section.append(el('p', 'example', def.example));
      });
      container.append(section);
    }
    return container;
  }
  const pronunciations = new Map();
  function phoneticBlock(entry) {
    const node = el('div', 'phonetic');
    const show = current => {
      node.title = '';
      node.replaceChildren(el('span', '', current.phonetic));
      if (current.phoneticSource === 'youdao') node.append(link('有道音标', 'https://www.youdao.com/result?word=' + encodeURIComponent(entry.word) + '&lang=en'));
    };
    async function load() {
      node.replaceChildren(el('span', '', '正在补全音标…'));
      try {
        if (!pronunciations.has(entry.word)) {
          const pending = (async () => {
            const raw = await request('https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(entry.word)
              + '&dicts=' + encodeURIComponent(JSON.stringify({ count: 1, dicts: [['ec']] })));
            const phonetic = youdaoPhonetic(raw, entry.word);
            const current = get('word:' + entry.word);
            if (!current) throw new Error('词条已删除，请重新查询');
            if (current.phonetic.trim()) return current;
            const updated = { ...current, phonetic, phoneticSource: 'youdao' };
            put('word:' + entry.word, updated);
            notify();
            return updated;
          })();
          pronunciations.set(entry.word, pending);
          pending.finally(() => pronunciations.delete(entry.word)).catch(() => {});
        }
        show(await pronunciations.get(entry.word));
      } catch (error) {
        node.replaceChildren(el('span', '', '音标暂不可用'), button('重试', load));
        node.title = error.message;
      }
    }
    if (entry.phonetic.trim()) show(entry); else load();
    return node;
  }
  function wordDetail(entry, event = null, allowStar = true) {
    const node = el('article', 'detail');
    const title = el('div', 'bar');
    const actions = el('div', 'actions');
    actions.append(button('▷', () => speak(entry), 'icon', '播放单词发音'));
    if (allowStar) {
      const star = button(get('study:' + entry.word) ? '已收藏' : '＋ 收藏', () => {
        if (toggleStar(entry.word)) star.textContent = get('study:' + entry.word) ? '已收藏' : '＋ 收藏';
      });
      actions.append(star);
    }
    node.append(el('h2', 'word', entry.word));
    title.append(phoneticBlock(entry));
    title.append(actions);
    node.append(title);
    node.append(senses(entry));
    const chinese = el('div');
    node.append(chinese);
    if (entry.translation && entry.translationSource === translationSource(entry)) chinese.append(translationBlock(entry));
    else translate(entry, chinese);
    if (event?.context || event?.sourceUrl) {
      const context = el('details', 'context');
      context.append(el('summary', '', '阅读来源'));
      if (event.context) context.append(el('p', '', event.context));
      if (safeUrl(event.sourceUrl)) context.append(link(event.title || '打开原网页', event.sourceUrl));
      node.append(context);
    }
    const source = el('footer', 'source');
    source.append(link('Free Dictionary API', 'https://dictionaryapi.dev/'));
    if (entry.sourceUrl) source.append(link('词条出处', entry.sourceUrl));
    if (entry.license.name) source.append(link(entry.license.name, entry.license.url || entry.sourceUrl));
    node.append(source);
    return node;
  }

  function render() {
    for (const [key, node] of Object.entries(navButtons)) {
      node.classList.toggle('active', key === screen);
      if (key === screen) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
    }
    view.classList.toggle('library', screen === 'history' || screen === 'book');
    view.replaceChildren();
    if (screen === 'settings') { renderSettings(); return; }
    if (screen === 'review') { renderReview(); return; }
    renderLibrary();
  }
  function renderLibrary() {
    const isBook = screen === 'book';
    const records = isBook ? all('study').sort((a, b) => b.addedAt - a.addedAt || a.word.localeCompare(b.word)) : ordered(all('event'), oldest);
    view.append(el('h1', 'heading', isBook ? '生词本' : '查词历史'),
      el('p', 'subheading', isBook ? `${records.length} 个词 · 收藏的词会进入复习` : `${records.length} 次查询 · 每次成功查询都留有记录`));
    const split = el('div', 'split');
    const left = el('div', 'library-list');
    const toolbar = el('div', 'row');
    const search = el('input');
    search.placeholder = '筛选单词…';
    search.setAttribute('aria-label', '筛选已保存单词');
    search.value = filter;
    toolbar.append(search);
    if (!isBook) {
      const order = el('select');
      order.setAttribute('aria-label', '历史排序');
      for (const [value, label] of [['new', '最近'], ['old', '最早']]) {
        const option = el('option', '', label);
        option.value = value;
        order.append(option);
      }
      order.value = oldest ? 'old' : 'new';
      order.addEventListener('change', () => { oldest = order.value === 'old'; render(); });
      toolbar.append(order);
    }
    const list = el('div', 'list');
    list.tabIndex = 0;
    list.setAttribute('role', 'region');
    list.setAttribute('aria-label', isBook ? '生词列表' : '查询历史列表');
    const detail = el('div', 'detail detail-pane');
    detail.tabIndex = 0;
    detail.setAttribute('role', 'region');
    detail.setAttribute('aria-label', '单词释义');
    left.append(toolbar, list);
    split.append(left, detail);
    view.append(split);
    function drawDetail() {
      const entry = selectedWord ? get('word:' + selectedWord) : null;
      detail.replaceChildren(entry ? wordDetail(entry, selectedEvent) : el('div', 'empty', '选择一个单词，或在上方开始查询'));
    }
    function drawList() {
      list.replaceChildren();
      const matches = records.filter(item => item.word.includes(filter.toLowerCase()));
      if (!matches.length) { list.append(el('div', 'empty', records.length ? '没有匹配的单词' : isBook ? '遇到想记住的词，点一下收藏' : '你的第一条查词记录会出现在这里')); return; }
      // shortcut: 一次显示最近的 300 条匹配记录，历史超过此数量时使用筛选或导出查看全量。
      for (const [index, item] of matches.slice(0, 300).entries()) {
        const row = button('', () => {
          selectedWord = item.word;
          selectedEvent = isBook ? null : item;
          drawList(); drawDetail(); detail.scrollTop = 0;
        }, 'item');
        row.classList.toggle('active', isBook ? selectedWord === item.word : selectedEvent?.id === item.id);
        row.append(el('div', 'term', item.word), el('div', 'meta', isBook ? (item.dueAt <= Date.now() ? '待复习' : '下次 ' + date(item.dueAt)) : date(item.at)));
        if (isBook) list.append(row);
        else {
          const wrapper = el('div', 'history-row');
          wrapper.append(row, button('×', () => {
            const scrollTop = list.scrollTop;
            const detailTop = detail.scrollTop;
            remove('event:' + item.id);
            const deletingSelected = selectedEvent?.id === item.id;
            if (deletingSelected) {
              selectedEvent = matches[index + 1] || matches[index - 1] || null;
              selectedWord = selectedEvent?.word || '';
            }
            notify(); render();
            view.querySelector('.list').scrollTop = scrollTop;
            if (!deletingSelected) view.querySelector('.detail-pane').scrollTop = detailTop;
            const deletes = view.querySelectorAll('.history-delete');
            (deletes[index] || deletes[index - 1] || view.querySelector('input')).focus({ preventScroll: true });
          }, 'icon danger history-delete', `删除 ${item.word} 的这条查询记录`));
          list.append(wrapper);
        }
      }
      if (matches.length > 300) list.append(el('p', 'notice', `显示前 300 / ${matches.length} 条，可继续筛选或导出全量`));
    }
    search.addEventListener('input', () => { filter = search.value; drawList(); });
    drawList(); drawDetail();
  }
  function renderReview() {
    const book = all('study');
    const due = book.filter(item => item.dueAt <= Date.now()).sort((a, b) => a.dueAt - b.dueAt || a.word.localeCompare(b.word));
    view.append(el('h1', 'heading', '让单词留下来'), el('p', 'subheading', '短时复习，长期积累'));
    if (!queue) {
      const stats = el('div', 'stats');
      for (const [value, label] of [[due.length, '到期待复习'], [book.filter(item => today(item.lastReviewedAt)).length, '今日已复习词数'], [book.length, '收藏词数']]) {
        const stat = el('div', 'stat'); stat.append(el('strong', '', String(value)), el('span', 'muted', label)); stats.append(stat);
      }
      const landing = el('div', 'review');
      landing.append(el('h2', '', due.length ? '从一个词开始' : '今天的节奏刚刚好'),
        el('p', 'muted', due.length ? '每轮最多 20 词，先回忆，再看释义。' : book.length ? '暂时没有到期词，稍后再来看看。' : '先收藏几个想学的词，它们会出现在这里。'));
      if (due.length) landing.append(button('开始复习', () => { queue = due.slice(0, 20).map(item => item.word); reviewIndex = 0; revealed = false; render(); }, 'button primary'));
      view.append(stats, landing); return;
    }
    // A word may have been removed in another tab while this round was open.
    while (reviewIndex < queue.length && (!get('study:' + queue[reviewIndex]) || !get('word:' + queue[reviewIndex]))) reviewIndex++;
    const card = el('div', 'review');
    if (reviewIndex >= queue.length) {
      card.append(el('h2', '', '本轮已完成'), el('p', 'muted', '进度已保存。忘记的词会在 10 分钟后重新到期。'),
        button('返回复习概览', () => { queue = null; render(); }, 'button primary'));
      view.append(card); return;
    }
    const word = queue[reviewIndex];
    const entry = get('word:' + word);
    card.append(el('div', 'muted', `${reviewIndex + 1} / ${queue.length}`), el('h2', 'word', word));
    card.append(phoneticBlock(entry));
    card.append(button('▷ 播放发音', () => speak(entry)));
    if (!revealed) card.append(el('p', 'muted', '先回忆这个词的含义'), button('显示释义', () => { revealed = true; render(); }, 'button primary'));
    else {
      const answer = el('div', 'review-answer');
      answer.append(senses(entry));
      if (entry.translation) answer.append(translationBlock(entry));
      const actions = el('div', 'actions');
      for (const [grade, label] of [['again', '忘记 · 10 分钟'], ['hard', '模糊 · 1 天'], ['good', '记住了']]) {
        actions.append(button(label, () => {
          const current = get('study:' + word);
          if (current) { put('study:' + word, schedule(current, grade, Date.now())); notify(); }
          reviewIndex++; revealed = false; stopAudio(); render();
        }, grade === 'good' ? 'button primary' : 'button'));
      }
      card.append(answer, actions);
    }
    card.append(el('p', 'notice', '关闭或离开后，已完成的复习仍会保留。'));
    view.append(card);
  }
  function download(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const anchor = el('a');
    anchor.href = url; anchor.download = name;
    shadow.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    message('已发起导出，请确认浏览器下载记录');
  }
  function exportCsv(isBook) {
    const data = snapshot();
    const words = new Map(data.words.map(item => [item.word, item]));
    const records = isBook ? data.book : data.history;
    const rows = [isBook ? ['单词', '英文释义', '中文辅助', '阶段', '下次复习'] : ['查询时间', '单词', '英文释义', '中文辅助', '阅读上下文', '来源']];
    for (const item of records) {
      const entry = words.get(item.word);
      const definition = entry?.meanings[0]?.definitions[0]?.definition || '';
      rows.push(isBook ? [item.word, definition, entry?.translation, item.stage, new Date(item.dueAt).toISOString()]
        : [new Date(item.at).toISOString(), item.word, definition, entry?.translation, item.context, item.sourceUrl]);
    }
    download(`lexi-${isBook ? 'book' : 'history'}-${new Date().toISOString().slice(0, 10)}.csv`, csv(rows), 'text/csv;charset=utf-8');
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error('备份超过 5 MiB，请选择较小的 Lexi JSON 文件');
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('无法读取 JSON 备份，未导入数据'); }
    const incoming = validateBackup(parsed);
    // Validate conflicts before requesting confirmation or making any writes.
    mergeBackup(snapshot(), incoming);
    if (!confirm(`合并 ${incoming.words.length} 个词条、${incoming.history.length} 条历史、${incoming.book.length} 个生词进度？\n重复历史不会增加，设置保持当前值。建议先导出当前备份。`)) return;
    const merged = mergeBackup(snapshot(), incoming);
    try {
      for (const item of merged.words) put('word:' + item.word, item);
      for (const item of merged.history) put('event:' + item.id, item);
      for (const item of merged.book) put('study:' + item.word, item);
      notify(); queue = null; render(); message('合并完成，重复历史已去重');
    } catch { throw new Error('写入中断，部分记录可能已导入；原记录未主动删除，可再次导入继续合并'); }
  }
  function renderSettings() {
    view.append(el('h1', 'heading', '设置与数据'), el('p', 'subheading', '跨网站共用，数据保存在本机油猴存储'));
    const preferences = el('section', 'section');
    preferences.append(el('h3', '', '阅读偏好'));
    for (const [key, label] of [['auto', '自动划词查询'], ['context', '保存阅读上下文与来源（仅本地）']]) {
      const row = el('label', 'setting');
      const toggle = el('input'); toggle.type = 'checkbox'; toggle.checked = settings[key];
      toggle.addEventListener('change', () => {
        try {
          settings = { ...DEFAULTS, ...get('settings', {}), [key]: toggle.checked };
          put('settings', settings); notify();
        } catch (error) { toggle.checked = !toggle.checked; showError(error); }
      });
      row.append(el('span', '', label), toggle); preferences.append(row);
    }
    preferences.append(el('p', 'notice', '外观自动跟随系统深浅色。发音仅在点击后播放。'));
    const data = el('section', 'section');
    data.append(el('h3', '', '备份与迁移'));
    const actions = el('div', 'actions');
    actions.append(button('导出 JSON 备份', () => download(`lexi-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot(), null, 2), 'application/json')),
      button('导出历史 CSV', () => exportCsv(false)), button('导出生词 CSV', () => exportCsv(true)));
    const upload = el('input'); upload.type = 'file'; upload.accept = '.json,application/json'; upload.hidden = true;
    upload.addEventListener('change', () => { importFile(upload.files?.[0]).catch(showError); upload.value = ''; });
    actions.append(button('导入 JSON 合并', () => upload.click()));
    data.append(actions, upload, el('p', 'notice', 'JSON 包含完整历史与复习进度，CSV 便于表格查看。导入保留当前设置，按时间合并。'));
    const privacy = el('section', 'section');
    privacy.append(el('h3', '', '服务与隐私'), el('p', 'notice', '查词会向 Free Dictionary API 发送当前单词，并自动向 MyMemory 发送最多 6 条词典释义以补全中文；缺少音标时向有道词典发送当前单词补全。成功后本地保存，再次打开直接读取。网页上下文不会发送。在线音频和浏览器朗读可能联网。服务可用性、内容与额度由提供方决定。'),
      link('Free Dictionary API', 'https://dictionaryapi.dev/'), document.createTextNode(' · '),
      link('MyMemory', 'https://mymemory.translated.net/doc/spec.php'), document.createTextNode(' · '),
      link('有道词典', 'https://www.youdao.com/'));
    const cleanup = el('section', 'section');
    cleanup.append(el('h3', '', '清理数据'));
    const cleanActions = el('div', 'actions');
    cleanActions.append(button('清空查词历史', () => {
      if (!confirm('清空全部查词事件？词条缓存、生词本和复习进度会保留。建议先导出备份。')) return;
      for (const key of GM_listValues().filter(key => key.startsWith(PREFIX + 'event:'))) GM_deleteValue(key);
      selectedEvent = null; notify(); render(); message('查词历史已清空');
    }, 'button danger'), button('删除全部 Lexi 数据', () => {
      if (prompt('此操作不可撤销，请先导出备份。输入“删除全部”以删除全部 Lexi 历史、词条和复习进度：') !== '删除全部') return;
      stopQuery(); stopAudio();
      for (const key of GM_listValues().filter(key => key.startsWith(PREFIX))) GM_deleteValue(key);
      settings = { ...DEFAULTS }; selectedWord = ''; selectedEvent = null; queue = null;
      notify(); render(); message('Lexi 数据已删除');
    }, 'button danger'));
    cleanup.append(cleanActions);
    view.append(preferences, data, privacy, cleanup);
  }

  let selectionTimer;
  let lastSelection = '';
  let lastSelectionAt = 0;
  document.addEventListener('pointerup', event => {
    clearTimeout(selectionTimer);
    if (event.button !== 0 || event.composedPath().includes(host) || !overlay.hidden || !settings.auto) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    selectionTimer = setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const anchor = selection.anchorNode?.parentElement;
      if (anchor?.closest('input,textarea,[contenteditable]:not([contenteditable="false"])')) return;
      const raw = selection.toString();
      const word = normalize(raw);
      if (!word || (word === lastSelection && Date.now() - lastSelectionAt < 1200)) return;
      lastSelection = word; lastSelectionAt = Date.now();
      let context = null;
      if (settings.context) {
        const block = anchor?.closest('p,li,td,blockquote,figcaption') || anchor;
        const body = block?.textContent || '';
        const index = body.toLowerCase().indexOf(raw.toLowerCase());
        const url = new URL(location.href); url.search = ''; url.hash = '';
        context = { context: body.slice(Math.max(0, index - 90), Math.max(0, index - 90) + 300).replace(/\s+/g, ' '),
          title: text(document.title, 120), sourceUrl: safeUrl(url.href) };
      }
      lookup(word, selection.getRangeAt(0).getBoundingClientRect(), context).catch(showError);
    }, 220);
  });
  window.addEventListener('resize', () => { if (!popover.hidden) positionPopover(); });
  document.addEventListener('pointerdown', event => {
    if (!popover.hidden && !event.composedPath().includes(host)) closePopover();
  });
  GM_addValueChangeListener(PREFIX + 'revision', (_name, _old, _next, remote) => {
    if (!remote) return;
    settings = { ...DEFAULTS, ...get('settings', {}) };
    if (!overlay.hidden && !studio.contains(shadow.activeElement)) render();
  });
  window.addEventListener('focus', () => {
    settings = { ...DEFAULTS, ...get('settings', {}) };
    if (!overlay.hidden) render();
  });
  GM_registerMenuCommand('打开 Lexi 学习中心', () => openStudio());
  GM_registerMenuCommand('暂停 / 开启自动划词', () => {
    settings = { ...DEFAULTS, ...get('settings', {}), auto: !settings.auto };
    put('settings', settings); notify(); message(settings.auto ? '自动划词已开启' : '自动划词已暂停');
  });
})();
