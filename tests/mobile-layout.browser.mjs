export async function installMobileLayoutFixture(page, source) {
  await page.evaluate(source => {
    const data = new Map();
    const menus = new Map();
    const now = Date.now();
    for (let index = 0; index < 60; index++) {
      const word = ['invading', 'override', 'dictation', 'discovery', 'curiosity', 'reflection'][index % 6]
        + (index < 6 ? '' : String.fromCharCode(97 + Math.floor(index / 6)));
      const entry = {
        word, fetchedAt: now, phonetic: '/test/', phoneticSource: 'youdao',
        wordForms: { base: word, forms: [] }, audio: '', sourceUrl: '', license: { name: '', url: '' },
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A small moment of discovery.', example: 'Reading brings discovery.' }] }],
        translation: '发现的瞬间', translationSource: '1. noun: A small moment of discovery.',
        translatedAt: now, youdaoTranslation: '发现；察觉', youdaoTranslatedAt: now
      };
      data.set('lexi:v1:word:' + word, entry);
      data.set('lexi:v1:event:mobile-layout-' + index, { word, id: 'mobile-layout-' + index, at: now - index * 60000 });
      if (index < 12) data.set('lexi:v1:study:' + word, {
        word, addedAt: now, updatedAt: now, dueAt: now, stage: 0, reviews: 0, lastReviewedAt: 0, lastGrade: ''
      });
    }
    window.__lexiRequests = [];
    Object.assign(window, {
      GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
      GM_setValue: (key, value) => data.set(key, structuredClone(value)),
      GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
      GM_registerMenuCommand: (label, action) => { menus.set(label, action); return label; },
      GM_unregisterMenuCommand: label => menus.delete(label),
      GM_addValueChangeListener: () => {}, GM_info: { script: { version: 'mobile-layout-test' } },
      GM_xmlhttpRequest: request => { window.__lexiRequests.push(request.url); throw new Error('Unexpected request'); }
    });
    new Function(source.replace("host.id = 'lexi-local-root'", "host.id = 'lexi-mobile-layout-test'")
      .replace("attachShadow({ mode: 'closed' })", "attachShadow({ mode: 'open' })"))();
    window.__lexiShadow = document.getElementById('lexi-mobile-layout-test').shadowRoot;
    menus.get('打开 Lexi 学习中心')();
  }, source);
}

export async function mobileLayoutMetrics(page) {
  return page.evaluate(() => {
    const root = window.__lexiShadow;
    const rect = selector => root.querySelector(selector).getBoundingClientRect().toJSON();
    const list = rect('.list');
    const view = rect('.view');
    const viewport = window.visualViewport;
    return {
      viewport: { width: viewport.width, height: viewport.height, scale: viewport.scale },
      studio: rect('.studio'), top: rect('.top'), list, row: rect('.library-row'),
      visibleRows: [...root.querySelectorAll('.library-row')].filter(row => {
        const box = row.getBoundingClientRect();
        return box.top >= Math.max(list.top, view.top) && box.bottom <= Math.min(list.bottom, view.bottom);
      }).length,
      overflow: root.querySelector('.view').scrollWidth - root.querySelector('.view').clientWidth,
      inputFont: parseFloat(getComputedStyle(root.querySelector('.search input')).fontSize),
      focusedSearch: root.activeElement === root.querySelector('.search input'),
      requests: window.__lexiRequests
    };
  });
}

export async function checkMobileLayout(page, baseUrl, source) {
  const check = (condition, message, result) => {
    if (!condition) throw new Error(message + ': ' + JSON.stringify(result));
  };
  const results = [];
  for (const [width, height, scheme, scaled] of [
    [390, 714, 'dark', false], [320, 568, 'light', false], [430, 932, 'light', false],
    [740, 360, 'dark', false], [390, 340, 'light', false], [390, 714, 'dark', true],
    [1100, 800, 'light', false]
  ]) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 1000
    });
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: width < 1000 });
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: scheme }]
    });
    await page.goto(baseUrl + '/reading');
    if (scaled) await page.evaluate(() => document.querySelector('meta[name="viewport"]').remove());
    await installMobileLayoutFixture(page, source);
    const result = await mobileLayoutMetrics(page);
    const { studio, viewport } = result;
    check(studio.top >= 0 && studio.bottom <= viewport.height + 1
      && studio.left >= 0 && studio.right <= viewport.width + 1 && result.overflow <= 1,
    'Panel and content fit the visible viewport', result);
    if (width < 1000) {
      const scale = viewport.scale;
      check(studio.left * scale >= 17 && (viewport.width - studio.right) * scale >= 17,
        'Mobile panel leaves clear side gutters', result);
      check(studio.height * scale > Math.min(640, (height - 16) * .82)
        && studio.height * scale <= height * .88, 'Panel is modestly taller, not fullscreen', result);
      check(result.row.height * scale >= 43 && result.row.height * scale <= 47,
        'History rows are compact but usable', result);
      check(result.inputFont >= 16 && !result.focusedSearch,
        'Opening does not focus or shrink the mobile search input', result);
      if (height >= 568) check(result.visibleRows >= (height >= 700 ? 6 : 4),
        'More complete history rows are visible', result);
    } else {
      check(studio.width === Math.min(1060, viewport.width - 48) && studio.height === 720 && result.inputFont === 18,
        'Desktop geometry and input size stay unchanged', result);
    }
    await page.evaluate(async () => {
      window.__lexiShadow.querySelector('.library-row .item').click();
      await Promise.resolve();
    });
    check(await page.evaluate(() => Boolean(window.__lexiShadow.querySelector('.detail-pane .word'))),
      'History selection still displays the definition', result);
    const tabs = await page.evaluate(() => [...window.__lexiShadow.querySelectorAll('.tab')].map(tab => tab.textContent));
    for (let index = 1; index < tabs.length; index++) {
      await page.evaluate(async index => {
        window.__lexiShadow.querySelectorAll('.tab')[index].click();
        await Promise.resolve();
      }, index);
      check(await page.evaluate(() => {
        const view = window.__lexiShadow.querySelector('.view');
        return view.scrollWidth <= view.clientWidth + 1;
      }), 'No horizontal overflow in ' + tabs[index], { width, height, scaled });
    }
    check(result.requests.length === 0 && await page.evaluate(() => window.__lexiRequests.length === 0),
      'Fixture does not access online dictionaries', result);
    results.push({ width, height, scheme, scaled, ...result });
  }
  return results;
}
