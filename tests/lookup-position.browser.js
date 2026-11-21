async page => {
  const base = new URL(page.url()).origin;
  const results = [];
  for (const [width, height, scaled] of [[390, 714, false], [320, 568, false], [740, 360, false], [390, 340, false], [390, 714, true]]) {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await page.goto(base + '/reading');
    await page.evaluate(scaled => {
      if (scaled) document.querySelector('meta[name="viewport"]').content = 'width=980';
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) {
        const root = attach.call(this, options);
        if (this.id === 'lexi-local-root') window.__lexiShadow = root;
        return root;
      };
      const now = Date.now();
      const data = new Map([['lexi:v1:word:curiosity', {
        word: 'curiosity', fetchedAt: now, phonetic: '/test/', phoneticSource: 'youdao',
        wordForms: { base: 'curiosity', forms: [] }, audio: '', sourceUrl: '', license: { name: '', url: '' },
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A desire to learn.', example: 'Reading brings discovery. '.repeat(30) }] }],
        translation: '求知欲', translationSource: '1. noun: A desire to learn.', translatedAt: now,
        youdaoTranslation: '好奇心', youdaoTranslatedAt: now, examples: [], examplesFetchedAt: now
      }]]);
      window.__lexiMenus = new Map();
      window.__lexiRequests = [];
      Object.assign(window, {
        GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
        GM_setValue: (key, value) => data.set(key, structuredClone(value)),
        GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
        GM_registerMenuCommand: (label, action) => { window.__lexiMenus.set(label, action); return label; },
        GM_unregisterMenuCommand: label => window.__lexiMenus.delete(label),
        GM_addValueChangeListener: () => {}, GM_info: { script: { version: 'lookup-position-test' } },
        GM_xmlhttpRequest: request => { window.__lexiRequests.push(request.url); throw new Error('Unexpected network request'); }
      });
    }, scaled);
    if (scaled) {
      await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: .5 });
      await page.waitForFunction(() => visualViewport.scale < 1);
    }
    await page.addScriptTag({ url: base + '/lexi.user.js' });
    const studio = await page.evaluate(async () => {
      window.__lexiMenus.get('打开 Lexi 学习中心')();
      await Promise.resolve();
      const root = window.__lexiShadow;
      const bounds = root.querySelector('.studio').getBoundingClientRect().toJSON();
      root.querySelector('[aria-label="关闭学习中心"]').click();
      await Promise.resolve();
      return bounds;
    });
    await page.evaluate(() => {
      const word = document.querySelector('#curiosity');
      word.scrollIntoView({ block: 'center' });
      const range = document.createRange();
      range.selectNodeContents(word);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      word.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', button: 0 }));
    });
    await page.waitForFunction(() => !window.__lexiShadow.querySelector('.selection-action').hidden);
    await page.evaluate(() => window.__lexiShadow.querySelector('.selection-action').click());
    await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .word')?.textContent === 'curiosity');
    const popup = await page.evaluate(() => {
      const node = window.__lexiShadow.querySelector('.popover');
      return { ...node.getBoundingClientRect().toJSON(), scale: visualViewport.scale,
        scrollable: node.scrollHeight > node.clientHeight, requests: window.__lexiRequests };
    });
    const result = { width, height, scaled, studio, popup };
    results.push(result);
    if (Math.abs(popup.bottom - studio.bottom) * popup.scale > 1) {
      throw new Error('Mobile lookup and studio must share the bottom edge: ' + JSON.stringify(result));
    }
    if (Math.abs(popup.height - studio.height) * popup.scale > 1) {
      throw new Error('Mobile lookup and studio must share the height: ' + JSON.stringify(result));
    }
    if (!popup.scrollable || popup.requests.length) throw new Error('Lookup must scroll locally: ' + JSON.stringify(result));
    const shortHeight = await page.evaluate(() => {
      const root = window.__lexiShadow;
      root.querySelector('.popover .example').textContent = 'A short example.';
      return root.querySelector('.popover').getBoundingClientRect().height;
    });
    if (Math.abs(shortHeight - studio.height) * popup.scale > 1) {
      throw new Error('Short definitions must retain the same panel height: ' + JSON.stringify(result));
    }
    await session.detach();
  }
  return results;
}
