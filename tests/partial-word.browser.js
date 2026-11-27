async page => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.evaluate(async () => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = attach.call(this, options);
      if (this.id === 'lexi-local-root') window.__lexiShadow = root;
      return root;
    };
    const data = new Map();
    const now = Date.now();
    for (const [word, definition] of [['alpha', 'beta'], ['pha', 'example'], ['beta', 'example'],
      ["don't", 'example'], ['mother-in-law', 'example'], ['abc', 'example']]) {
      data.set('lexi:v1:word:' + word, {
        word, fetchedAt: now, phonetic: '/test/', phoneticSource: 'youdao', wordForms: { base: word, forms: [] },
        audio: '', sourceUrl: '', license: { name: '', url: '' },
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition, example: '' }] }],
        translation: '示例中文', translationSource: `1. noun: ${definition}`, translatedAt: now,
        youdaoTranslation: '有道示例', youdaoTranslatedAt: now, examples: [], examplesFetchedAt: now
      });
    }
    data.set('lexi:v1:settings', { context: true });
    window.__lexiData = data;
    Object.assign(window, {
      GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
      GM_setValue: (key, value) => data.set(key, structuredClone(value)),
      GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
      GM_registerMenuCommand: name => name, GM_unregisterMenuCommand: () => {},
      GM_addValueChangeListener: () => {}, GM_info: { script: { version: 'partial-word-test' } },
      GM_xmlhttpRequest: request => { throw new Error('Unexpected request: ' + request.url); }
    });
    const script = document.createElement('script');
    script.src = '/lexi.user.js';
    await new Promise((resolve, reject) => {
      script.onload = resolve; script.onerror = reject; document.head.append(script);
    });
  });
  const select = (selector, start, end, pointerType = 'mouse', internal = false) => page.evaluate(
    ({ selector, start, end, pointerType, internal }) => {
      const node = internal ? window.__lexiShadow.querySelector(selector) : document.querySelector(selector);
      const range = document.createRange();
      range.setStart(node.firstChild, start); range.setEnd(node.firstChild, end);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      node.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerType, bubbles: true, composed: true }));
    }, { selector, start, end, pointerType, internal });
  const choose = async index => {
    const point = await page.evaluate(index => {
      const rect = window.__lexiShadow.querySelectorAll('.word-choice button')[index].getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, index);
    await page.mouse.click(point.x, point.y);
  };
  const waitChoice = () => page.waitForFunction(() => !window.__lexiShadow.querySelector('.word-choice').hidden);
  const waitWord = word => page.waitForFunction(word => window.__lexiShadow.querySelector('.popover .word')?.textContent === word, word);
  const close = () => page.evaluate(() => window.__lexiShadow.querySelector('[aria-label="关闭查词卡"]').click());
  const inspectChoice = () => page.evaluate(() => {
    const root = window.__lexiShadow;
    const choice = root.querySelector('.word-choice');
    return { buttons: [...choice.querySelectorAll('button')].map(button => button.textContent),
      popoverHidden: root.querySelector('.popover').hidden,
      events: [...window.__lexiData.keys()].filter(key => key.startsWith('lexi:v1:event:')).length };
  });

  await page.evaluate(() => { document.querySelector('#serendipity').textContent = 'alpha'; });
  await select('#serendipity', 2, 5);
  await waitChoice();
  let state = await inspectChoice();
  check(state.buttons[0].includes('pha') && state.buttons[1].includes('alpha') && state.popoverHidden && state.events === 0,
    'Mouse selection offers both choices before any lookup');
  await choose(1);
  await waitWord('alpha');
  check(await page.evaluate(() => {
    const highlight = window.CSS?.highlights?.get('lexi-reading-origin');
    return !highlight || [...highlight].some(range => range.toString() === 'alpha');
  }), 'Whole-word lookup marks the expanded reading origin');
  await close();

  await select('#serendipity', 2, 5);
  await waitChoice();
  await choose(0);
  await waitWord('pha');
  await close();

  await select('#serendipity', 0, 5);
  await waitWord('alpha');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.word-choice').hidden), 'Whole words still look up immediately');
  await select('.popover .definition', 1, 3, 'mouse', true);
  await waitChoice();
  state = await inspectChoice();
  check(state.buttons[0].includes('et') && state.buttons[1].includes('beta'), 'Internal selections offer both choices');
  await choose(1);
  await waitWord('beta');
  check(await page.evaluate(() => Boolean(window.__lexiShadow.querySelector('.lookup-back'))), 'Internal lookup keeps back navigation');
  await close();

  await select('#serendipity', 1, 4, 'touch');
  await page.waitForFunction(() => !window.__lexiShadow.querySelector('.selection-action').hidden);
  await page.evaluate(() => window.__lexiShadow.querySelector('.selection-action').click());
  await waitChoice();
  check(await page.evaluate(() => window.getSelection().toString() === 'lph'), 'Touch choice preserves selection until lookup');
  await choose(1);
  await waitWord('alpha');
  check(await page.evaluate(() => window.getSelection().isCollapsed), 'Touch lookup clears the native selection');
  await close();

  await page.evaluate(() => { document.querySelector('#serendipity').innerHTML = 'al<strong>ph</strong>a'; });
  await page.evaluate(() => {
    const node = document.querySelector('#serendipity strong').firstChild;
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    node.parentElement.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerType: 'mouse', bubbles: true, composed: true }));
  });
  await waitChoice();
  state = await inspectChoice();
  check(state.buttons[1].includes('alpha'), 'Word expansion crosses inline markup');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.word-choice').hidden), 'Escape dismisses the choice');

  await page.evaluate(() => { document.querySelector('#serendipity').textContent = 'alpha'; });
  await select('#serendipity', 1, 4);
  await waitChoice();
  await page.evaluate(() => { document.querySelector('#serendipity').textContent = 'changed'; });
  await choose(1);
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.word-choice').hidden
    && window.__lexiShadow.querySelector('.popover').hidden), 'A changed selection is never queried');

  for (const [content, start, end, whole] of [["'don't'", 1, 4, "don't"], ['mother-in-law', 7, 9, 'mother-in-law']]) {
    await page.evaluate(content => { document.querySelector('#serendipity').textContent = content; }, content);
    await select('#serendipity', start, end);
    await waitChoice();
    state = await inspectChoice();
    check(state.buttons[1].includes(whole), 'Contractions and hyphenated words expand without surrounding punctuation');
    await choose(1);
    await waitWord(whole);
    await close();
  }
  await page.evaluate(() => { document.querySelector('#serendipity').textContent = 'abc123'; });
  await select('#serendipity', 0, 3);
  await waitWord('abc');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.word-choice').hidden),
    'Digits next to a selection do not create a misleading complete word');
  await close();
  return 'Partial-word browser checks passed.';
}
