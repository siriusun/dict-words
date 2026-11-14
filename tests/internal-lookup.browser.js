async page => {
  const base = new URL(page.url()).origin;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(base + '/reading');
  await page.evaluate(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = attach.call(this, options);
      if (this.id === 'lexi-local-root') window.__lexiShadow = root;
      return root;
    };
    const prefix = 'lexi:v1:';
    const data = new Map();
    const now = Date.now();
    for (const [word, definition] of [['alpha', 'beta'], ['beta', 'gamma'], ['gamma', 'delta']]) {
      data.set(prefix + 'word:' + word, {
        word, fetchedAt: now, phonetic: '/test/', phoneticSource: 'youdao', wordForms: { base: word, forms: [] },
        audio: '', sourceUrl: '', license: { name: '', url: '' },
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition, example: 'Reading these words. '.repeat(70) }] }],
        translation: '示例中文', translationSource: `1. noun: ${definition}`
      });
    }
    data.set(prefix + 'study:alpha', { word: 'alpha', addedAt: now - 1000, updatedAt: now - 1000,
      dueAt: now - 1000, stage: 0, reviews: 0, lastReviewedAt: 0, lastGrade: '' });
    data.set(prefix + 'event:browser-event-0001', { id: 'browser-event-0001', word: 'alpha', at: now - 1000 });
    data.set(prefix + 'settings', { auto: false });
    window.__lexiData = data;
    window.__lexiMenus = new Map();
    window.__lexiRequests = 0;
    Object.assign(window, {
      GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
      GM_setValue: (key, value) => data.set(key, structuredClone(value)),
      GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
      GM_registerMenuCommand: (name, callback) => window.__lexiMenus.set(name, callback),
      GM_addValueChangeListener: () => {}, GM_info: { script: { version: '0.3.2' } },
      GM_xmlhttpRequest: () => { window.__lexiRequests++; throw new Error('Unexpected network request'); }
    });
  });
  await page.addScriptTag({ url: base + '/lexi.user.js' });
  await page.evaluate(() => window.__lexiMenus.get('打开 Lexi 学习中心')());
  check(await page.evaluate(() => document.getElementById('lexi-local-root').shadowRoot === null), 'Real closed shadow root');
  const element = async (selector, label) => {
    const handle = await page.evaluateHandle(({ selector, label }) => [...window.__lexiShadow.querySelectorAll(selector)]
      .find(node => label === undefined || node.textContent.startsWith(label) || node.getAttribute('aria-label') === label), { selector, label });
    const node = handle.asElement();
    check(node, `Missing ${selector}: ${label}`);
    return node;
  };
  const click = async (selector, label) => { const node = await element(selector, label); await node.click(); await node.dispose(); };
  const selectWord = async selector => {
    const node = await element(selector);
    await node.scrollIntoViewIfNeeded();
    const rect = await node.evaluate(node => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    await page.mouse.dblclick(rect.x + Math.min(10, rect.width / 2), rect.y + rect.height / 2);
    await node.dispose();
    await page.waitForFunction(() => !window.__lexiShadow.querySelector('.selection-lookup').hidden, null, { timeout: 5000 });
  };
  const word = selector => page.evaluate(selector => window.__lexiShadow.querySelector(selector)?.textContent, selector);
  const historyCount = () => page.evaluate(() => [...window.__lexiData.keys()].filter(key => key.startsWith('lexi:v1:event:')).length);
  const study = word => page.evaluate(word => window.__lexiData.get('lexi:v1:study:' + word), word);
  const fits = async selector => {
    const rect = await (await element(selector)).boundingBox();
    const viewport = page.viewportSize();
    check(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width
      && rect.y + rect.height <= viewport.height, `Viewport fit: ${selector}`);
  };
  const lightweightEntry = async () => {
    const entry = await element('.selection-lookup');
    const appearance = await entry.evaluate(node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const symbol = node.querySelector('.lookup-symbol');
      const selection = window.__lexiShadow.getSelection();
      const selectionRect = selection.getRangeAt(0).getBoundingClientRect();
      return { width: rect.width, height: rect.height, background: style.backgroundColor, border: style.borderWidth,
        shadow: style.boxShadow, text: node.textContent, label: node.getAttribute('aria-label'), title: node.title,
        selectedWord: selection.toString().trim().toLowerCase(),
        icon: symbol?.getAttribute('aria-hidden') === 'true' && symbol.getBoundingClientRect().width > 0,
        outsideSelection: rect.bottom <= selectionRect.top || rect.top >= selectionRect.bottom
          || rect.right <= selectionRect.left || rect.left >= selectionRect.right };
    });
    await entry.dispose();
    check(appearance.width === 24 && appearance.height === 24, 'Compact entry has a 24px click target');
    check(appearance.background === 'rgba(0, 0, 0, 0)' && appearance.border === '0px' && appearance.shadow === 'none',
      'Idle entry has no filled background, border or shadow');
    check(appearance.text === '' && appearance.icon, 'Entry shows only the magnifier icon');
    check(appearance.label === '查询 ' + appearance.selectedWord && appearance.title === appearance.label,
      'Icon keeps the selected word accessible');
    check(appearance.outsideSelection, 'Entry does not cover the selected word');
  };
  await click('.item');
  await page.evaluate(() => {
    const pane = window.__lexiShadow.querySelector('.detail-pane');
    window.__originalDetail = pane.querySelector('article');
    pane.scrollTop = 35;
  });
  await selectWord('.detail-pane .definition');
  await fits('.selection-lookup');
  await lightweightEntry();
  check(await historyCount() === 1, 'Selection alone does not save history');
  await click('input', '查询英文单词');
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.selection-lookup').hidden);
  await selectWord('.detail-pane .definition');
  await page.evaluate(() => { window.__originalTop = window.__lexiShadow.querySelector('.detail-pane').scrollTop; });
  await click('.selection-lookup');
  check(await word('.detail-pane .word') === 'beta', 'Explicit lookup replaces the detail pane while auto is paused');
  check(await historyCount() === 2, 'Temporary lookup saves history');
  check(await page.evaluate(() => window.__lexiShadow.querySelectorAll('.item').length === 2), 'Current history list updates immediately');
  await click('.detail-pane button', '＋ 收藏');
  check(Boolean(await study('beta')), 'Temporary lookup can be starred');
  check(await word('.detail-pane .word') === 'beta', 'Starring preserves temporary view');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  check(await word('.detail-pane .word') === 'beta', 'Refocusing does not discard temporary navigation');
  await selectWord('.detail-pane .definition');
  await click('.selection-lookup');
  check(await word('.detail-pane .word') === 'gamma', 'Nested lookup');
  await click('.lookup-back', '← 返回 beta');
  check(await word('.detail-pane .word') === 'beta', 'Nested back');
  await click('.lookup-back', '← 返回 alpha');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.detail-pane article') === window.__originalDetail),
    'Back restores the same DOM, not a new query');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.detail-pane').scrollTop === window.__originalTop),
    'Back restores the original scroll position');
  check(await historyCount() === 3, 'Back does not add history');

  await page.evaluate(() => {
    const root = window.__lexiShadow;
    const example = root.querySelector('.detail-pane .example');
    const range = document.createRange();
    range.selectNodeContents(example);
    const selection = root.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.selection-lookup').hidden);
  check(await historyCount() === 3, 'Selecting a phrase does not query');

  await click('.tab', '复习');
  await click('button', '开始复习');
  await click('button', '显示释义');
  const before = JSON.stringify(await study('alpha'));
  await page.evaluate(() => { window.__originalAnswer = window.__lexiShadow.querySelector('.review-answer'); });
  await selectWord('.review-answer .definition');
  await click('.selection-lookup');
  check(await word('.view .word') === 'beta', 'Review temporarily switches to the selected word');
  await page.keyboard.press('1');
  check(JSON.stringify(await study('alpha')) === before, 'Temporary lookup cannot grade the original card');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.review-answer') === window.__originalAnswer),
    'Return restores the revealed answer');
  await page.keyboard.press('3');
  check((await study('alpha')).reviews === JSON.parse(before).reviews + 1, 'Review shortcuts work after return');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 780 });
  await click('.tab', '查词历史');
  await click('.item');
  await selectWord('.detail-pane .definition');
  await fits('.selection-lookup');
  await lightweightEntry();
  await click('.selection-lookup');
  check(Boolean(await word('.detail-pane .word')), 'Narrow dark temporary detail is usable');
  await fits('.lookup-back');
  await page.keyboard.press('Escape');
  await click('button', '关闭学习中心');
  await page.evaluate(() => {
    window.__lexiData.set('lexi:v1:settings', { auto: true });
    window.dispatchEvent(new Event('focus'));
    document.getElementById('serendipity').textContent = 'alpha';
  });
  await page.locator('#serendipity').dblclick();
  await page.waitForFunction(() => !window.__lexiShadow.querySelector('.popover').hidden);
  check(await word('.popover .word') === 'alpha', 'Website selection still opens the normal card');
  await selectWord('.popover .definition');
  await click('.selection-lookup');
  check(await word('.popover .word') === 'beta', 'Normal card supports temporary lookup');
  await fits('.popover');
  await page.keyboard.press('Escape');
  check(await word('.popover .word') === 'alpha', 'Normal card back restores original word');

  await page.evaluate(() => { window.__lexiShadow.getSelection = undefined; });
  await selectWord('.popover .definition');
  await click('.selection-lookup');
  check(await word('.popover .word') === 'beta', 'Window selection composed-range fallback works with closed shadow');
  await click('.popover button', '关闭查词卡');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.popover').hidden), 'Close dismisses nested card');
  check(await page.evaluate(() => window.__lexiRequests === 0), 'Cached lookup and back make no network requests');
  check(errors.length === 0, 'Page errors: ' + errors.join('; '));
  return 'Closed-shadow browser checks passed: explicit entry, nested back, history, favorites, review, narrow dark, website card and composed ranges.';
}
