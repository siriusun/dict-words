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
        translation: '示例中文', translationSource: `1. noun: ${definition}`,
        youdaoTranslation: '有道示例', youdaoTranslatedAt: now, examples: [], examplesFetchedAt: now
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
      GM_registerMenuCommand: (name, callback) => { window.__lexiMenus.set(name, callback); return name; },
      GM_unregisterMenuCommand: name => window.__lexiMenus.delete(name),
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
      const target = node.closest('.popover,.detail-pane,.view');
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: target.scrollTop,
        target: target.classList.contains('popover') ? '.popover' : target.classList.contains('detail-pane') ? '.detail-pane' : '.view',
        word: node.textContent.trim().split(/\s+/)[0].toLowerCase() };
    });
    await page.mouse.dblclick(rect.x + Math.min(10, rect.width / 2), rect.y + rect.height / 2);
    await node.dispose();
    await page.waitForFunction(({ target, word }) => {
      const pane = window.__lexiShadow.querySelector(target);
      return pane.querySelector('.detail .word')?.textContent === word && pane.querySelector('.lookup-back');
    }, rect, { timeout: 5000 });
    check(await page.evaluate(() => !window.__lexiShadow.querySelector('.selection-lookup')), 'Lookup needs no magnifier button');
    return rect.top;
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
  const favorite = async (selector, word, starred) => {
    const node = await element(selector + ' .detail-star');
    const state = await node.evaluate(node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const heading = node.closest('.word-heading');
      const headingRect = heading.getBoundingClientRect();
      const wordRect = heading.querySelector('.word').getBoundingClientRect();
      return { text: node.textContent, label: node.getAttribute('aria-label'), title: node.title,
        pressed: node.getAttribute('aria-pressed'), width: rect.width, height: rect.height,
        border: style.borderWidth, background: style.backgroundColor, fontSize: parseFloat(style.fontSize),
        centerOffset: Math.abs(rect.y + rect.height / 2 - wordRect.y - wordRect.height / 2),
        rightOffset: Math.abs(rect.right - headingRect.right), gap: rect.left - wordRect.right };
    });
    await node.dispose();
    const label = (starred ? '取消收藏 ' : '收藏 ') + word;
    check(state.text === (starred ? '★' : '☆') && state.pressed === String(starred), 'Favorite star reflects saved state');
    check(state.label === label && state.title === label, 'Favorite star has an accessible label and hover hint');
    check(state.width === 44 && state.height === 44 && state.fontSize >= 30 && state.border === '0px'
      && state.background === 'rgba(0, 0, 0, 0)', 'Favorite is a larger borderless star with a 44px click target');
    check(state.centerOffset < 1 && state.rightOffset < 1 && state.gap >= 10,
      'Favorite is right-aligned and vertically centered beside the word without overlap');
    await fits(selector + ' .detail-star');
  };
  await click('.item');
  await page.evaluate(() => {
    const pane = window.__lexiShadow.querySelector('.detail-pane');
    window.__originalDetail = pane.querySelector('article');
    pane.scrollTop = 35;
  });
  await click('input', '查询英文单词或句子');
  await page.keyboard.type('alpha');
  await page.keyboard.press('ControlOrMeta+A');
  await page.waitForTimeout(350);
  check(await historyCount() === 1, 'Selecting input text does not query');
  const originalTop = await selectWord('.detail-pane .definition');
  await page.evaluate(top => { window.__originalTop = top; }, originalTop);
  check(await word('.detail-pane .word') === 'beta', 'Selection automatically replaces the detail pane while website auto is paused');
  check(await historyCount() === 2, 'Temporary lookup saves history');
  check(await page.evaluate(() => window.__lexiShadow.querySelectorAll('.item').length === 2), 'Current history list updates immediately');
  await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
  await page.waitForTimeout(350);
  check(await historyCount() === 2, 'Repeated selection events do not duplicate history');
  await favorite('.detail-pane', 'beta', false);
  await click('.detail-pane .detail-star', '收藏 beta');
  check(Boolean(await study('beta')), 'Temporary lookup can be starred');
  await page.mouse.move(0, 0);
  await favorite('.detail-pane', 'beta', true);
  check(await word('.detail-pane .word') === 'beta', 'Starring preserves temporary view');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  check(await word('.detail-pane .word') === 'beta', 'Refocusing does not discard temporary navigation');
  await selectWord('.detail-pane .definition');
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
    range.collapse(true);
    const selection = root.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
  });
  await page.waitForTimeout(350);
  check(await historyCount() === 3, 'A collapsed selection does not query');

  await click('.tab', '复习');
  await click('button', '开始复习');
  await click('button', '显示释义');
  const before = JSON.stringify(await study('alpha'));
  await page.evaluate(() => { window.__originalAnswer = window.__lexiShadow.querySelector('.review-answer'); });
  await selectWord('.review-answer .definition');
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
  check(Boolean(await word('.detail-pane .word')), 'Narrow dark temporary detail is usable');
  await fits('.lookup-back');
  await page.keyboard.press('Escape');
  await click('.library-sheet-bar button', '关闭');
  await click('button', '关闭学习中心');
  await page.evaluate(() => {
    window.__lexiData.set('lexi:v1:settings', { auto: true });
    window.dispatchEvent(new Event('focus'));
    document.getElementById('serendipity').textContent = 'alpha';
  });
  await page.locator('#serendipity').dblclick();
  await page.waitForFunction(() => !window.__lexiShadow.querySelector('.popover').hidden);
  check(await word('.popover .word') === 'alpha', 'Website selection still opens the normal card');
  await page.mouse.move(0, 0);
  await favorite('.popover', 'alpha', true);
  await page.evaluate(() => { window.confirm = () => false; });
  await click('.popover .detail-star', '取消收藏 alpha');
  await page.mouse.move(0, 0);
  await favorite('.popover', 'alpha', true);
  await page.evaluate(() => { window.confirm = () => true; });
  const beforeUnstar = await historyCount();
  await click('.popover .detail-star', '取消收藏 alpha');
  await page.mouse.move(0, 0);
  await favorite('.popover', 'alpha', false);
  check(!await study('alpha') && await historyCount() === beforeUnstar, 'Unstarring removes progress but preserves history');
  await click('.popover .detail-star', '收藏 alpha');
  await page.mouse.move(0, 0);
  await favorite('.popover', 'alpha', true);
  await selectWord('.popover .definition');
  check(await word('.popover .word') === 'beta', 'Normal card supports temporary lookup');
  await fits('.popover');
  await page.keyboard.press('Escape');
  check(await word('.popover .word') === 'alpha', 'Normal card back restores original word');

  await page.evaluate(() => { window.__lexiShadow.getSelection = undefined; });
  await selectWord('.popover .definition');
  check(await word('.popover .word') === 'beta', 'Window selection composed-range fallback works with closed shadow');
  await click('.popover button', '关闭查词卡');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.popover').hidden), 'Close dismisses nested card');
  check(await page.evaluate(() => window.__lexiRequests === 0), 'Cached lookup and back make no network requests');
  await page.evaluate(() => {
    window.__sentenceRequests = [];
    window.__beforeSentence = JSON.stringify([...window.__lexiData]);
    window.GM_xmlhttpRequest = request => {
      const url = new URL(request.url);
      if (url.hostname !== 'translate.googleapis.com') throw new Error('Unexpected request: ' + url.hostname);
      window.__sentenceRequests.push({ text: url.searchParams.get('q'), nocache: request.nocache, anonymous: request.anonymous });
      const timer = setTimeout(() => request.onload({ status: 200, responseText: JSON.stringify([[[
        url.searchParams.get('q') === 'Make this translation long.' ? '长译文'.repeat(250) : '模拟译文'
      ]]]) }), 20);
      return { abort() { clearTimeout(timer); request.onabort(); } };
    };
    const origin = document.querySelector('#phrase');
    origin.textContent = 'alpha beta';
    const range = document.createRange();
    range.selectNodeContents(origin);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    origin.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .translation-copy')?.textContent === '模拟译文');
  check(await word('.popover .sentence-original') === 'alpha beta', 'Webpage phrases show the original text');
  check(await page.evaluate(() => {
    const request = window.__sentenceRequests[0];
    return request.text === 'alpha beta' && request.nocache && request.anonymous &&
      JSON.stringify([...window.__lexiData]) === window.__beforeSentence;
  }), 'Webpage translation is anonymous, uncached and does not change stored data');
  await fits('.popover');
  await selectWord('.popover .sentence-original');
  check(await word('.popover .word') === 'alpha', 'A word selected in the translation still uses the dictionary');
  await page.keyboard.press('Escape');
  check(await word('.popover .sentence-original') === 'alpha beta', 'Returning restores the temporary translation');
  await click('.popover button', '关闭查词卡');
  check(await page.evaluate(() => !window.__lexiShadow.querySelector('.popover').textContent.includes('alpha beta')),
    'Closing removes the sentence from the hidden card');

  await page.evaluate(() => {
    window.__lexiData.set('lexi:v1:settings', { auto: false });
    window.dispatchEvent(new Event('focus'));
    const origin = document.querySelector('#phrase');
    const range = document.createRange(); range.selectNodeContents(origin);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    origin.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, composed: true }));
  });
  await page.waitForTimeout(300);
  check(await page.evaluate(() => window.__sentenceRequests.length === 1), 'Paused webpage selection does not send sentences');
  await click('.launcher');
  await page.evaluate(() => { window.__beforeManualSentence = JSON.stringify([...window.__lexiData]); });
  const search = await element('input', '查询英文单词或句子');
  const longSentence = 'A useful sentence '.repeat(45).trim();
  await search.fill(longSentence);
  check((await search.inputValue()).length > 80, 'Manual search accepts sentences longer than the old word limit');
  await search.press('Enter');
  check(await search.inputValue() === '', 'Submitted sentence is cleared from the search input');
  await search.dispose();
  await page.waitForFunction(source => window.__lexiShadow.querySelector('.view .sentence-original')?.textContent === source
    && Boolean(window.__lexiShadow.querySelector('.view .translation-copy')), longSentence);
  check(await page.evaluate(() => JSON.stringify([...window.__lexiData]) === window.__beforeManualSentence),
    'Manual translation does not change stored data');
  check(await page.evaluate(() => {
    const result = window.__lexiShadow.querySelector('.view .sentence-result');
    result.scrollTop = result.scrollHeight;
    return result.clientHeight > 0 && result.scrollTop > 0;
  }), 'Long mobile translation results can be scrolled');
  await fits('.lookup-back');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => !window.__lexiShadow.querySelector('.sentence-result')), 'Back removes the manual translation');

  await click('.item');
  await page.evaluate(() => {
    const original = window.__lexiShadow.querySelector('.detail-pane .definition');
    original.textContent = 'A phrase for internal lookup.';
    window.__beforeInternalSentence = JSON.stringify([...window.__lexiData]);
    const range = document.createRange(); range.selectNodeContents(original);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    original.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.detail-pane .sentence-original')?.textContent
    === 'A phrase for internal lookup.' && Boolean(window.__lexiShadow.querySelector('.detail-pane .translation-copy')));
  check(await page.evaluate(() => JSON.stringify([...window.__lexiData]) === window.__beforeInternalSentence),
    'Internal selection translates while website lookup is paused without saving data');
  await page.keyboard.press('Escape');
  check(await word('.detail-pane .definition') === 'A phrase for internal lookup.', 'Back restores the previous mobile detail');
  await click('.library-sheet-bar button', '关闭');
  await click('button', '关闭学习中心');
  check(await page.evaluate(() => !window.__lexiShadow.querySelector('.sentence-result')), 'Closing the studio leaves no sentence result');
  await page.setViewportSize({ width: 390, height: 780 });
  await page.evaluate(() => {
    window.__lexiData.set('lexi:v1:settings', { auto: true });
    window.dispatchEvent(new Event('focus'));
    window.__beforeTouchSelection = JSON.stringify([...window.__lexiData]);
    const origin = document.querySelector('#phrase');
    origin.textContent = 'Mobile selection grows into a full sentence.';
    const range = document.createRange();
    range.setStart(origin.firstChild, 0);
    range.setEnd(origin.firstChild, 6);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    origin.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerType: 'touch', bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.selection-action')?.getAttribute('aria-label') === '查词 mobile');
  check(await page.evaluate(() => {
    const action = window.__lexiShadow.querySelector('.selection-action');
    return window.__lexiShadow.querySelector('.popover').hidden && window.getSelection().toString() === 'Mobile'
      && action.getBoundingClientRect().height >= 44;
  }), 'Touch word selection neither opens the card nor clears native selection, and has a 44px touch target');
  await page.evaluate(() => {
    const origin = document.querySelector('#phrase');
    const range = document.createRange(); range.selectNodeContents(origin);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.selection-action')?.getAttribute('aria-label') === '翻译所选句子');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.popover').hidden
    && window.getSelection().toString() === 'Mobile selection grows into a full sentence.'),
  'Expanding the native selection updates the action without opening a lookup card');
  await page.evaluate(() => {
    const action = window.__lexiShadow.querySelector('.selection-action');
    const down = new PointerEvent('pointerdown', { button: 0, pointerType: 'touch', bubbles: true, cancelable: true });
    action.dispatchEvent(down);
    window.__touchActionPreservedSelection = down.defaultPrevented && window.getSelection().toString()
      === 'Mobile selection grows into a full sentence.';
    action.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerType: 'touch', bubbles: true, cancelable: true }));
    action.click();
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .translation-copy')?.textContent === '模拟译文');
  check(await page.evaluate(() => window.__touchActionPreservedSelection
    && JSON.stringify([...window.__lexiData]) === window.__beforeTouchSelection),
  'Touching the explicit action preserves the selection and only performs transient translation');
  await fits('.popover');
  await click('.popover button', '关闭查词卡');
  await page.evaluate(() => {
    const origin = document.querySelector('#serendipity');
    const range = document.createRange(); range.selectNodeContents(origin);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    origin.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerType: 'touch', bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.selection-action')?.getAttribute('aria-label') === '查词 alpha');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.popover').hidden),
    'Touch word selection waits for an explicit lookup action');
  await click('.selection-action', '查词');
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .word')?.textContent === 'alpha');
  await click('.popover button', '关闭查词卡');
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => {
    window.__lexiData.set('lexi:v1:settings', { auto: true });
    window.dispatchEvent(new Event('focus'));
    window.__beforeDesktopSentence = JSON.stringify([...window.__lexiData]);
    const origin = document.querySelector('#phrase');
    origin.textContent = 'A short desktop sentence.';
    const range = document.createRange(); range.selectNodeContents(origin);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    origin.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .translation-copy')?.textContent === '模拟译文');
  await fits('.popover');
  check(await page.evaluate(() => JSON.stringify([...window.__lexiData]) === window.__beforeDesktopSentence),
    'Desktop translation also leaves stored data unchanged');
  await click('.popover button', '关闭查词卡');
  await page.evaluate(() => {
    const origin = document.querySelector('#serendipity');
    const range = document.createRange(); range.selectNodeContents(origin);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    origin.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .word')?.textContent === 'alpha');
  await page.evaluate(() => {
    const root = window.__lexiShadow;
    root.querySelector('.popover').style.top = (innerHeight - 160) + 'px';
    const original = root.querySelector('.popover .definition');
    original.textContent = 'Make this translation long.';
    const range = document.createRange(); range.selectNodeContents(original);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    original.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .sentence-result .translation-copy')?.textContent.length > 500);
  await fits('.popover');
  await click('.popover button', '关闭查词卡');
  await page.evaluate(() => {
    window.__fallbackRequests = [];
    window.__beforeFallbackSentence = JSON.stringify([...window.__lexiData]);
    window.GM_xmlhttpRequest = request => {
      const host = new URL(request.url).hostname;
      window.__fallbackRequests.push({ host, method: request.method, data: request.data,
        anonymous: request.anonymous, nocache: request.nocache });
      const timer = setTimeout(() => {
        if (host === 'translate.googleapis.com') request.onerror();
        else if (host === 'edge.microsoft.com') request.onload({ status: 200,
          responseText: JSON.stringify([{ translations: [{ text: '微软模拟译文', to: 'zh-Hans' }] }]) });
        else throw new Error('Unexpected request: ' + host);
      }, 20);
      return { abort() { clearTimeout(timer); request.onabort(); } };
    };
    const origin = document.querySelector('#phrase');
    origin.textContent = 'A Microsoft fallback sentence.';
    const range = document.createRange(); range.selectNodeContents(origin);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    origin.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerType: 'mouse', bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .translation-copy')?.textContent === '微软模拟译文');
  check(await page.evaluate(() => {
    const [google, microsoft] = window.__fallbackRequests;
    return window.__fallbackRequests.length === 2 && google.host === 'translate.googleapis.com'
      && microsoft.host === 'edge.microsoft.com' && microsoft.method === 'POST'
      && JSON.parse(microsoft.data)[0] === 'A Microsoft fallback sentence.'
      && google.anonymous && google.nocache && microsoft.anonymous && microsoft.nocache
      && window.__lexiShadow.querySelector('.popover .sentence-result').textContent.includes('Microsoft Translator')
      && JSON.stringify([...window.__lexiData]) === window.__beforeFallbackSentence;
  }), 'Google failure displays Microsoft fallback without storing the sentence');
  await click('.popover button', '关闭查词卡');
  check(errors.length === 0, 'Page errors: ' + errors.join('; '));
  await page.evaluate(() => { window.__lexiBrowserCheckPassed = true; });
  return 'Closed-shadow browser checks passed: sentence provider fallback, mouse and touch selection, no storage, paused selection, desktop and narrow dark layouts.';
}
