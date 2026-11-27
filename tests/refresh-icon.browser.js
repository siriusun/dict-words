async page => {
  const base = new URL(await page.url()).origin;
  await page.goto(base + '/reading');
  await page.evaluate(async () => {
    const source = await (await fetch('/lexi.user.js')).text();
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = attach.call(this, options);
      if (this.id === 'lexi-refresh-test') window.__lexiShadow = root;
      return root;
    };
    const now = Date.now();
    const word = 'curiosity';
    const entry = {
      word, fetchedAt: now, phonetic: '/test/', phoneticSource: 'youdao',
      wordForms: { base: word, forms: [] }, audio: '', sourceUrl: '', license: { name: '', url: '' },
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A desire to learn.', example: '' }] }],
      translation: '求知欲', translationSource: '1. noun: A desire to learn.', translatedAt: now,
      youdaoTranslation: '好奇心', youdaoTranslatedAt: now, examples: [], examplesFetchedAt: now
    };
    const data = new Map([
      ['lexi:v1:word:' + word, entry],
      ['lexi:v1:event:refresh-icon', { id: 'refresh-icon', word, at: now }]
    ]);
    const menus = new Map();
    Object.assign(window, {
      GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
      GM_setValue: (key, value) => data.set(key, structuredClone(value)),
      GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
      GM_registerMenuCommand: (label, action) => { menus.set(label, action); return label; },
      GM_unregisterMenuCommand: () => {}, GM_addValueChangeListener: () => {},
      GM_info: { script: { version: 'refresh-icon-test' } },
      GM_xmlhttpRequest: request => { throw new Error('Unexpected request: ' + request.url); }
    });
    window.__lexiMenus = menus;
    new Function(source.replace("host.id = 'lexi-local-root'", "host.id = 'lexi-refresh-test'"))();
    const target = document.querySelector('#curiosity');
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', button: 0 }));
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .detail-refresh'));

  const check = async selector => {
    await page.mouse.move(0, 0);
    const initial = await page.evaluate(selector => {
      const button = window.__lexiShadow.querySelector(selector);
      const style = getComputedStyle(button);
      return { rect: button.getBoundingClientRect().toJSON(), background: style.backgroundColor,
        border: style.borderTopWidth, label: button.getAttribute('aria-label') };
    }, selector);
    if (initial.background !== 'rgba(0, 0, 0, 0)' || initial.border !== '0px'
      || initial.label !== '更新释义' || initial.rect.width < 44 || initial.rect.height < 44) {
      throw new Error('Refresh icon must be transparent and retain its accessible target: ' + JSON.stringify(initial));
    }
    await page.mouse.move(initial.rect.x + initial.rect.width / 2, initial.rect.y + initial.rect.height / 2);
    await page.waitForFunction(selector => {
      const button = window.__lexiShadow.querySelector(selector);
      return button.matches(':hover') && getComputedStyle(button).backgroundColor !== 'rgba(0, 0, 0, 0)';
    }, selector);
  };
  await check('.popover .detail-refresh');
  await page.evaluate(() => {
    window.__lexiMenus.get('打开 Lexi 学习中心')();
    window.__lexiShadow.querySelector('.item').click();
  });
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.detail-pane .detail-refresh'));
  await check('.detail-pane .detail-refresh');
  return 'Refresh icons are transparent by default and highlighted on hover in lookup and history.';
}
