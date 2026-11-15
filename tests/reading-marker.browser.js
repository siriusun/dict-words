async page => {
  const base = new URL(page.url()).origin;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.clock.install();
  const results = [];
  for (const native of [true, false]) {
    await page.goto(base + '/reading');
    await page.setViewportSize({ width: native ? 1100 : 390, height: 800 });
    await page.emulateMedia({ colorScheme: native ? 'light' : 'dark' });
    await page.evaluate(native => {
      document.querySelector('main').innerHTML = '<p id="origin">alpha</p><p id="second">beta</p>';
      document.body.style.minHeight = '5000px';
      document.querySelector('main').style.margin = '90px auto';
      window.__originalReadingHTML = document.querySelector('main').innerHTML;
      if (!native) Object.defineProperty(window, 'Highlight', { value: undefined, configurable: true });
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) {
        const root = attach.call(this, options);
        if (this.id === 'lexi-local-root') window.__lexiShadow = root;
        return root;
      };
      const data = new Map();
      const now = Date.now();
      for (const [word, definition] of [['alpha', 'beta'], ['beta', 'alpha']]) {
        data.set('lexi:v1:word:' + word, {
          word, fetchedAt: now, phonetic: '/test/', phoneticSource: 'youdao',
          wordForms: { base: word, forms: [] }, audio: '', sourceUrl: '', license: { name: '', url: '' },
          meanings: [{ partOfSpeech: 'noun', definitions: [{ definition, example: '' }] }],
          translation: '中文', translatedAt: now, translationSource: '1. noun: ' + definition,
          youdaoTranslation: '有道中文', youdaoTranslatedAt: now
        });
      }
      data.set('lexi:v1:settings', { readingMarkerSeconds: 7 });
      window.__lexiData = data;
      window.__lexiRequests = 0;
      Object.assign(window, {
        GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
        GM_setValue: (key, value) => data.set(key, structuredClone(value)),
        GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
        GM_registerMenuCommand: () => {}, GM_unregisterMenuCommand: () => {},
        GM_addValueChangeListener: () => {}, GM_info: { script: { version: 'test' } },
        GM_xmlhttpRequest: () => { window.__lexiRequests++; throw new Error('Unexpected network request'); }
      });
    }, native);
    await page.addScriptTag({ url: base + '/lexi.user.js' });
    const control = async (selector, label) => {
      const handle = await page.evaluateHandle(({ selector, label }) =>
        [...window.__lexiShadow.querySelectorAll(selector)].find(node =>
          label === undefined || node.getAttribute('aria-label') === label || node.textContent === label), { selector, label });
      const element = handle.asElement();
      check(element, 'Missing control: ' + selector + ' ' + label);
      return element;
    };
    const click = async (selector, label, force = false) => {
      const element = await control(selector, label);
      await element.click({ force });
      await element.dispose();
    };
    const select = async (selector, internal = false) => {
      const element = internal ? await control(selector) : await page.$(selector);
      await element.scrollIntoViewIfNeeded();
      const rect = await element.evaluate(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, word: node.textContent.trim().toLowerCase() };
      });
      await page.mouse.dblclick(rect.x + Math.min(10, rect.width / 2), rect.y + rect.height / 2);
      await element.dispose();
      await page.clock.runFor(250);
      await page.waitForFunction(word => window.__lexiShadow.querySelector('.popover .word')?.textContent === word, rect.word);
    };
    const marked = () => page.evaluate(native => native
      ? CSS.highlights.has('lexi-reading-origin')
      : window.__lexiShadow.querySelector('.reading-marks').children.length > 0, native);
    await select('#origin');
    check(await marked(), 'Original word is highlighted');
    check(await page.evaluate(() => document.getElementById('lexi-local-root').shadowRoot === null), 'Closed shadow root');
    await click('.detail-star');
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.clock.runFor(10000);
    check(await marked(), 'Lost selection and card interaction keep the marker without starting expiry');
    if (native) check(await page.evaluate(() => [...CSS.highlights.get('lexi-reading-origin')][0].toString() === 'alpha'),
      'Native highlight retains the exact original range');
    await select('.popover .definition', true);
    check(await page.evaluate(() => window.__lexiShadow.querySelector('.popover .word').textContent === 'beta'), 'Child lookup');
    check(await marked(), 'Child lookup keeps original webpage marker');
    await click('.launcher');
    await page.clock.runFor(10000);
    check(await marked(), 'Studio keeps original webpage marker');
    await click('.tab', '设置');
    const seconds = await control('.reading-marker-seconds');
    check(await seconds.inputValue() === '7', 'Duration is restored in settings');
    await seconds.fill('5');
    await seconds.dispatchEvent('change');
    check(await page.evaluate(() => window.__lexiData.get('lexi:v1:settings').readingMarkerSeconds === 5), 'Duration is saved');
    await seconds.fill('7');
    await seconds.dispatchEvent('change');
    await seconds.dispose();
    const scrollBeforeClose = await page.evaluate(() => window.scrollY);
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    await click('button', '关闭学习中心', true);
    check(await page.evaluate(() => window.scrollY) === scrollBeforeClose, 'Closing does not scroll the page');
    await page.clock.runFor(6999);
    check(await marked(), 'Configured 7 seconds: marker remains at 6999ms');
    await page.clock.runFor(1);
    check(!await marked(), 'Configured 7 seconds: marker disappears at 7000ms');
    await page.clock.resume();
    check(await page.evaluate(() => document.querySelector('main').innerHTML === window.__originalReadingHTML), 'Page text and DOM are untouched');

    await select('#second');
    await click('button', '关闭查词卡');
    await page.clock.runFor(1000);
    await select('#origin');
    await page.clock.runFor(10000);
    check(await marked(), 'Old expiry cannot clear the new word');
    await page.evaluate(() => window.scrollTo({ top: 1300, behavior: 'instant' }));
    await page.clock.runFor(50);
    await page.waitForFunction(() => !window.__lexiShadow.querySelector('.reading-return').hidden);
    check(await page.evaluate(() => !window.__lexiShadow.querySelector('.reading-return').hidden), 'Offscreen origin offers return action');
    await click('.reading-return');
    await page.clock.runFor(50);
    check(await page.locator('#origin').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    }), 'Explicit return brings original word back into view');
    check(await marked(), 'Returning emphasizes original word');
    await page.locator('#origin').evaluate(node => node.remove());
    check(!await marked(), 'Removing original content clears obsolete marker');
    check(await page.evaluate(() => window.__lexiShadow.querySelector('.reading-return').hidden), 'Obsolete return action is removed');

    await page.evaluate(() => {
      window.__lexiData.set('lexi:v1:settings', { readingMarkerSeconds: 0 });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await select('#second');
    check(await marked(), 'Zero duration still highlights while card is open');
    await click('button', '关闭查词卡');
    check(!await marked(), 'Zero duration removes highlight immediately after close');

    await page.clock.runFor(1300);
    const nestedWord = await page.evaluate(() => {
      window.__lexiData.set('lexi:v1:settings', { readingMarkerSeconds: 7 });
      const pane = document.createElement('div');
      pane.id = 'reading-pane';
      pane.style.cssText = 'height:160px;overflow:auto;border:1px solid gray';
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Reading a long paragraph. '.repeat(120) + 'beta';
      pane.append(paragraph);
      document.querySelector('main').append(pane);
      pane.scrollTop = pane.scrollHeight;
      pane.scrollIntoView({ block: 'center', behavior: 'instant' });
      const range = document.createRange();
      range.setStart(paragraph.firstChild, paragraph.textContent.length - 4);
      range.setEnd(paragraph.firstChild, paragraph.textContent.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    await page.mouse.dblclick(nestedWord.x + 8, nestedWord.y + nestedWord.height / 2);
    await page.clock.runFor(250);
    await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .word')?.textContent === 'beta'
      && !window.__lexiShadow.querySelector('.popover').hidden);
    check(await marked(), 'A word at the end of a long nested paragraph is marked');
    await page.locator('#reading-pane').evaluate(node => { node.scrollTop = 0; });
    await page.waitForFunction(() => !window.__lexiShadow.querySelector('.reading-return').hidden);
    if (!native) check(!await marked(), 'Fallback is clipped when the word leaves the nested scroll pane');
    await click('.reading-return');
    check(await page.locator('#reading-pane').evaluate(pane => {
      const text = pane.querySelector('p').firstChild;
      const range = document.createRange();
      range.setStart(text, text.length - 4); range.setEnd(text, text.length);
      const rect = range.getBoundingClientRect(), bounds = pane.getBoundingClientRect();
      return rect.top >= bounds.top && rect.bottom <= bounds.bottom && rect.top >= 0 && rect.bottom <= innerHeight;
    }), 'Return targets the exact word, not the top of a long paragraph');
    await page.clock.runFor(7100);
    check(!await marked(), 'Nested reading marker also expires');
    check(await page.evaluate(() => window.__lexiRequests === 0), 'All lookups use isolated fixture data');
    results.push({ mode: native ? 'CSS Highlight API' : 'overlay fallback', passed: true });
  }
  check(errors.length === 0, 'Browser errors: ' + errors.join('; '));
  return { results, errors };
}
