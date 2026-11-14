async page => {
  const base = new URL(page.url()).origin;
  const errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const install = () => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = attach.call(this, options);
      if (this.id === 'lexi-local-root') window.__lexiShadow = root;
      return root;
    };
    const data = new Map();
    const listeners = new Map();
    const prefix = 'lexi:v1:';
    for (const word of ['serendipity', 'curiosity']) {
      const definition = 'A moment of discovery.';
      data.set(prefix + 'word:' + word, {
        word, fetchedAt: Date.now(), phonetic: '/test/', phoneticSource: 'youdao',
        wordForms: { base: word, forms: [] }, audio: '', sourceUrl: '', license: { name: '', url: '' },
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition, example: '' }] }],
        translation: '示例中文', translatedAt: Date.now(), translationSource: '1. noun: ' + definition,
        youdaoTranslation: '有道中文', youdaoTranslatedAt: Date.now()
      });
    }
    window.__lexiData = data;
    window.__lexiMenus = new Map();
    window.__lexiListeners = listeners;
    window.__lexiRequests = 0;
    window.__lexiConfirmations = [];
    window.confirm = message => { window.__lexiConfirmations.push(message); return true; };
    window.alert = message => { throw new Error('Unexpected alert: ' + message); };
    Object.assign(window, {
      GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
      GM_setValue: (key, value) => data.set(key, structuredClone(value)),
      GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
      GM_registerMenuCommand: (name, callback) => { window.__lexiMenus.set(name, callback); return name; },
      GM_unregisterMenuCommand: name => window.__lexiMenus.delete(name),
      GM_addValueChangeListener: (key, callback) => listeners.set(key, callback),
      GM_info: { script: { version: '0.4.1' } },
      GM_xmlhttpRequest: () => { window.__lexiRequests++; throw new Error('Unexpected network request'); }
    });
  };
  await page.context().addInitScript(install);
  await page.goto(base + '/reading');
  page.on('pageerror', error => errors.push(error.message));
  await page.addScriptTag({ url: base + '/lexi.user.js' });
  const button = async (target, label) => {
    const handle = await target.evaluateHandle(label => [...window.__lexiShadow.querySelectorAll('button')]
      .find(node => node.textContent === label || node.getAttribute('aria-label') === label), label);
    const node = handle.asElement();
    check(node, 'Missing button: ' + label);
    await node.click();
    await handle.dispose();
  };
  const menu = (target, label) => target.evaluate(label => {
    const action = window.__lexiMenus.get(label);
    if (!action) throw new Error('Missing menu: ' + label);
    return action();
  }, label);
  const visible = target => target.evaluate(() => Boolean(document.getElementById('lexi-local-root'))
    && !window.__lexiShadow.querySelector('.launcher').hidden);
  const historyCount = () => page.evaluate(() => [...window.__lexiData.keys()].filter(key => key.startsWith('lexi:v1:event:')).length);
  check(await visible(page), 'Default-enabled launcher');
  await page.locator('#serendipity').dblclick();
  await page.waitForFunction(() => window.__lexiShadow.querySelector('.popover .detail .word')?.textContent === 'serendipity');
  check(await historyCount() === 1, 'Real website selection saves one event');
  const summary = await page.evaluateHandle(() => window.__lexiShadow.querySelector('.scope-menu summary'));
  await summary.asElement().click();
  await summary.dispose();
  await button(page, '禁用此页面');
  await page.waitForFunction(() => !document.getElementById('lexi-local-root'));
  await page.locator('#curiosity').dblclick();
  await page.waitForTimeout(300);
  check(await historyCount() === 1, 'Disabled selection does not save history');
  await page.evaluate(() => history.pushState({}, '', '/other'));
  await page.waitForFunction(() => Boolean(document.getElementById('lexi-local-root')));
  check(await visible(page), 'Other path automatically resumes without reload');
  await page.evaluate(() => history.pushState({}, '', '/reading?share=1#heading'));
  await page.waitForFunction(() => !document.getElementById('lexi-local-root'));
  await menu(page, '打开 Lexi 学习中心（手动）');
  check(!await visible(page), 'Manual study does not enable the launcher');
  const query = await page.evaluateHandle(() => window.__lexiShadow.querySelector('.search input'));
  await query.asElement().fill('curiosity');
  await query.dispose();
  await button(page, '查询');
  check(await historyCount() === 2, 'Manual study works while the page remains disabled');
  await button(page, '关闭学习中心');
  check(!await visible(page), 'Closing manual study detaches its UI');
  await menu(page, '解除此页面禁用');
  check(await visible(page), 'Menu restores the current page');

  const sibling = await page.context().newPage();
  await sibling.goto(base + '/reading');
  sibling.on('pageerror', error => errors.push(error.message));
  await sibling.addScriptTag({ url: base + '/lexi.user.js' });
  await menu(page, '禁用此域名');
  check(await page.evaluate(() => window.__lexiConfirmations.some(value => value.includes(location.hostname))), 'Domain confirmation names its scope');
  const rules = await page.evaluate(() => [...window.__lexiData].filter(([key]) => key.startsWith('lexi:v1:disabled:')));
  await sibling.evaluate(rules => {
    for (const [key, value] of rules) window.__lexiData.set(key, value);
    window.__lexiListeners.get('lexi:v1:scope-revision')('', '', 'remote', true);
  }, rules);
  check(!await visible(sibling), 'Remote domain ban detaches another tab');
  const disabledStartup = await page.context().newPage();
  await disabledStartup.goto(base + '/reading');
  disabledStartup.on('pageerror', error => errors.push(error.message));
  await disabledStartup.evaluate(rules => {
    for (const [key, value] of rules) window.__lexiData.set(key, value);
  }, rules);
  await disabledStartup.addScriptTag({ url: base + '/lexi.user.js' });
  check(await disabledStartup.evaluate(() => !document.getElementById('lexi-local-root') && !window.__lexiShadow
    && window.__lexiMenus.has('解除此域名禁用') && window.__lexiRequests === 0), 'Disabled startup creates no UI and makes no network requests');
  await menu(disabledStartup, '解除此域名禁用');
  check(await visible(disabledStartup), 'Disabled startup can initialize UI on restore');
  await disabledStartup.close();
  await sibling.close();

  await menu(page, '管理网页启用范围');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.scope-manager').textContent.includes('域名禁用规则')
    && window.__lexiShadow.querySelector('.heading').textContent === '网页管理'), 'Dedicated page explains the matching rule');
  await button(page, '设置');
  check(await page.evaluate(() => !window.__lexiShadow.querySelector('.scope-manager')), 'Settings no longer embeds scope management');
  await page.evaluate(() => {
    const create = URL.createObjectURL;
    URL.createObjectURL = blob => {
      window.__lexiExport = blob.text().then(value => JSON.parse(value));
      return create(blob);
    };
  });
  await button(page, '导出 JSON 备份');
  check(await page.evaluate(async () => (await window.__lexiExport).siteRules.some(rule =>
    rule.type === 'domain' && rule.value === location.hostname)), 'Real backup export includes disabled ranges');
  await page.evaluate(() => {
    for (let index = 0; index < 100; index++) {
      const rule = { type: 'page', value: 'https://example.com/page-' + String(index).padStart(3, '0') + '/' + 'long-path-'.repeat(30) };
      window.__lexiData.set('lexi:v1:disabled:page:' + encodeURIComponent(rule.value), rule);
    }
  });
  await menu(page, '管理网页启用范围');
  check(await page.evaluate(() => window.__lexiShadow.querySelectorAll('.scope-rule').length === 50), 'Only 50 rows render from a larger list');
  await button(page, '下一页');
  await button(page, '下一页');
  check(await page.evaluate(() => window.__lexiShadow.querySelectorAll('.scope-rule').length === 1), 'Last page contains the remaining row');
  await button(page, '解除');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.scope-pagination span').textContent === '2 / 2 页'
    && window.__lexiShadow.querySelectorAll('.scope-rule').length === 50), 'Removing the final row clamps to the preceding page');
  const filter = await page.evaluateHandle(() => window.__lexiShadow.querySelector('.scope-filter'));
  await filter.asElement().fill('page-00');
  check(await page.evaluate(() => window.__lexiShadow.querySelectorAll('.scope-rule').length === 10), 'Search spans all pages');
  await filter.asElement().fill('');
  await filter.dispose();
  for (const [width, scheme] of [[1100, 'light'], [390, 'dark']]) {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme: scheme });
    check(await page.evaluate(() => {
      const root = window.__lexiShadow;
      const studio = root.querySelector('.studio').getBoundingClientRect();
      const section = root.querySelector('.scope-manager');
      const list = root.querySelector('.scope-rule-list');
      const rect = list.getBoundingClientRect();
      return studio.left >= 0 && studio.right <= innerWidth && studio.top >= 0 && studio.bottom <= innerHeight
        && section.scrollWidth <= section.clientWidth && rect.bottom <= studio.bottom && rect.height > 80
        && list.scrollHeight > list.clientHeight
        && [...root.querySelectorAll('.scope-rule')].every(row => row.getBoundingClientRect().height <= 40
          && row.querySelector('.scope-address').title === row.querySelector('.scope-address').textContent
          && getComputedStyle(row.querySelector('.scope-address')).textOverflow === 'ellipsis');
    }), 'Compact independently scrolling scope list fits ' + width + 'px / ' + scheme);
  }
  check(await page.evaluate(() => window.__lexiRequests === 0), 'No online dictionary or user data used');
  check(errors.length === 0, 'No browser errors: ' + errors.join('; '));
  return { checks: ['real selection', 'quick page disable', 'query/anchor matching', 'SPA navigation', 'manual study',
    'menu recovery', 'domain confirmation', 'remote tab update', 'disabled startup', 'backup export',
    'standalone management page', 'pagination and removal', 'cross-page search', 'compact light/dark narrow layout'],
    history: await historyCount(), errors };
}
