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
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A small moment of discovery.', example: 'Reading brings discovery. '.repeat(30) }] }],
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
    const input = root.querySelector('.search input');
    const inputStyle = getComputedStyle(input);
    const placeholderStyle = getComputedStyle(input, '::placeholder');
    const canvas = document.createElement('canvas').getContext('2d');
    canvas.font = `${placeholderStyle.fontStyle} ${placeholderStyle.fontWeight} ${placeholderStyle.fontSize} ${placeholderStyle.fontFamily}`;
    const viewport = window.visualViewport;
    return {
      viewport: { width: viewport.width, height: viewport.height, scale: viewport.scale },
      studio: rect('.studio'), top: rect('.top'), list, row: rect('.library-row'),
      searchInput: rect('.search input'), searchButton: rect('.search .button'), searchField: rect('.search-field'),
      searchGroup: rect('.search'), closeButton: rect('.top .close-studio'),
      groupDivider: getComputedStyle(root.querySelector('.search')).borderRightWidth,
      searchFieldBackground: getComputedStyle(root.querySelector('.search-field')).backgroundColor,
      searchInputBackground: inputStyle.backgroundColor,
      hint: {
        available: input.clientWidth - parseFloat(inputStyle.paddingLeft) - parseFloat(inputStyle.paddingRight),
        essential: canvas.measureText(input.placeholder.split('，')[0]).width,
        full: canvas.measureText(input.placeholder).width
      },
      visibleRows: [...root.querySelectorAll('.library-row')].filter(row => {
        const box = row.getBoundingClientRect();
        return box.top >= Math.max(list.top, view.top) && box.bottom <= Math.min(list.bottom, view.bottom);
      }).length,
      overflow: root.querySelector('.view').scrollWidth - root.querySelector('.view').clientWidth,
      inputFont: parseFloat(inputStyle.fontSize),
      placeholderFont: parseFloat(placeholderStyle.fontSize),
      searchButtonFont: parseFloat(getComputedStyle(root.querySelector('.search .button')).fontSize),
      focusedSearch: root.activeElement === input,
      requests: window.__lexiRequests
    };
  });
}

export function checkSearchTypography(result, mobile, width) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message + ': ' + JSON.stringify(result));
  };
  check(result.groupDivider !== '0px' && result.searchButton.right < result.searchGroup.right
    && result.searchGroup.right < result.closeButton.left,
  'Search and close are visually separated without overlapping');
  check(result.searchFieldBackground !== 'rgba(0, 0, 0, 0)' && result.searchInputBackground === 'rgba(0, 0, 0, 0)'
    && result.searchButton.left >= result.searchField.left && result.searchButton.right < result.searchField.right
    && result.searchButton.top > result.searchField.top && result.searchButton.bottom < result.searchField.bottom,
  'Search button sits inside the input field background');
  check(result.closeButton.width >= 36 && result.closeButton.height >= 36,
    'Close retains a usable target');
  if (mobile) {
    check(result.inputFont >= 16 && !result.focusedSearch,
      'Opening does not focus or shrink the mobile search input');
    check(result.placeholderFont >= 12 && result.placeholderFont <= result.searchButtonFont,
      'Mobile search hint is legible and visually balanced with its button');
    check(result.hint.essential <= result.hint.available,
      'The query type remains visible on narrow phones');
    if (width >= 390) check(result.hint.full <= result.hint.available,
      'The full search hint fits on wider phones');
  } else {
    check(result.searchInput.height >= 42 && result.searchInput.height > result.searchButton.height,
      'Desktop search field retains its height around the inset button');
    check(result.inputFont >= result.searchButtonFont && result.inputFont <= result.searchButtonFont + 1
      && result.placeholderFont === result.inputFont,
    'Desktop search text is visually balanced with its button');
  }
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
    checkSearchTypography(result, width < 1000, width);
    if (width < 1000) {
      const scale = viewport.scale;
      check(studio.left * scale >= 17 && (viewport.width - studio.right) * scale >= 17,
        'Mobile panel leaves clear side gutters', result);
      check(studio.height * scale > Math.min(640, (height - 16) * .82)
        && studio.height * scale <= height * .88, 'Panel is modestly taller, not fullscreen', result);
      check(result.row.height * scale >= 43 && result.row.height * scale <= 47,
        'History rows are compact but usable', result);
      if (height >= 568) check(result.visibleRows >= (height >= 700 ? 6 : 4),
        'More complete history rows are visible', result);
      else check(result.visibleRows >= 1, 'Short viewports still expose a usable list row', result);
    } else {
      check(studio.width === Math.min(1060, viewport.width - 48) && studio.height === 720,
        'Desktop panel geometry stays unchanged', result);
    }
    await page.evaluate(async () => {
      window.__lexiShadow.querySelector('.library-row .item').click();
      await Promise.resolve();
    });
    check(await page.evaluate(() => Boolean(window.__lexiShadow.querySelector('.detail-pane .word'))),
      'History selection still displays the definition', result);
    if (width < 1000) {
      const sheet = await page.evaluate(() => {
        const root = window.__lexiShadow;
        const rect = selector => root.querySelector(selector).getBoundingClientRect().toJSON();
        const pane = root.querySelector('.detail-pane');
        const before = { listTop: root.querySelector('.list').scrollTop, viewTop: root.querySelector('.view').scrollTop,
          navTop: rect('.library-sheet-nav').top, headerTop: rect('.library-sheet-bar').top };
        const definition = rect('.detail-pane .definition');
        const body = rect('.detail-pane');
        pane.scrollTop = pane.scrollHeight;
        return {
          panel: rect('.library-sheet'), studio: rect('.studio'), body, definition,
          close: rect('.library-sheet-bar .button'), next: rect('.library-sheet-nav .button:last-child'),
          inert: root.querySelector('.main').inert && root.querySelector('.sidebar').inert,
          focusedPanel: root.activeElement === root.querySelector('.library-sheet'),
          bodyScrolled: pane.scrollTop > 0,
          backgroundUnchanged: before.listTop === root.querySelector('.list').scrollTop && before.viewTop === root.querySelector('.view').scrollTop,
          chromeFixed: before.navTop === rect('.library-sheet-nav').top && before.headerTop === rect('.library-sheet-bar').top
        };
      });
      check(sheet.panel.top >= sheet.studio.top - 1 && sheet.panel.bottom <= sheet.studio.bottom + 1
        && sheet.panel.left >= sheet.studio.left - 1 && sheet.panel.right <= sheet.studio.right + 1,
      'Definition sheet fits the studio', sheet);
      check(sheet.inert && sheet.focusedPanel && sheet.bodyScrolled && sheet.backgroundUnchanged && sheet.chromeFixed,
        'Sheet is modal, with independent scrolling and fixed controls', sheet);
      check(sheet.definition.top >= sheet.body.top && sheet.definition.top < sheet.body.bottom,
        'First definition is immediately visible without scrolling the list', sheet);
      if (height >= 568) {
        check(sheet.definition.bottom <= sheet.body.bottom + 1,
          'Portrait sheets show the complete first definition immediately', sheet);
        check(sheet.panel.height * viewport.scale >= height * .60 && sheet.panel.height * viewport.scale <= height * .66,
          'Default sheet height is about sixty percent of the visible screen', sheet);
      }
      check(sheet.close.height * viewport.scale >= 43 && sheet.next.height * viewport.scale >= 43,
        'Sheet controls retain touch-sized targets', sheet);
    } else {
      check(await page.evaluate(() => {
        const root = window.__lexiShadow;
        return root.querySelector('.library-detail').parentElement === root.querySelector('.split')
          && !root.querySelector('.main').inert && getComputedStyle(root.querySelector('.library-sheet-nav')).display === 'none';
      }), 'Desktop retains the non-modal two-column definition pane', result);
    }
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

export async function checkMobileLibrarySheet(page, baseUrl, source) {
  const check = (condition, message, result) => {
    if (!condition) throw new Error(message + ': ' + JSON.stringify(result));
  };
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 714, deviceScaleFactor: 1, mobile: true });
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.goto(baseUrl + '/reading');
  await installMobileLayoutFixture(page, source);
  // Use DOM events because browser automation input may reset the emulated viewport.
  const click = selector => page.evaluate(async selector => {
    window.__lexiShadow.querySelector(selector).click();
    await Promise.resolve();
  }, selector);
  const press = key => page.evaluate(key => {
    window.__lexiShadow.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
  }, key);
  const before = await page.evaluate(() => {
    const list = window.__lexiShadow.querySelector('.list');
    list.scrollTop = 140;
    return list.scrollTop;
  });
  await click('.library-row:nth-child(5) .item');
  await click('.library-sheet-bar .button');
  check(await page.evaluate(top => {
    const root = window.__lexiShadow;
    return root.querySelector('.library-detail').hidden && root.querySelector('.list').scrollTop === top
      && root.activeElement === root.querySelector('.item.active') && !root.querySelector('.overlay').hidden;
  }, before), 'Closing without navigation restores the original list position', { before });

  await page.evaluate(async () => {
    const root = window.__lexiShadow;
    root.querySelector('.list').scrollTop = 1e5;
    root.querySelector('.library-row:last-child .item').click();
    await Promise.resolve();
  });
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.library-sheet-nav .meta').textContent === '50 / 60'),
    'Sheet count reflects the full filtered result, not only one page');
  await click('.library-sheet-nav .button:last-child');
  await press('Tab');
  check(await page.evaluate(() => window.__lexiShadow.activeElement === window.__lexiShadow.querySelector('.library-sheet-bar .button')),
    'Keyboard focus cannot escape into the background');
  await click('.library-sheet-bar .button');
  const after = await page.evaluate(() => {
    const root = window.__lexiShadow;
    const list = root.querySelector('.list').getBoundingClientRect();
    const row = root.querySelector('.item.active').getBoundingClientRect();
    return { position: root.querySelector('.library-pagination .meta').textContent,
      selectedVisible: row.top >= list.top - 1 && row.bottom <= list.bottom + 1,
      focusedRow: root.activeElement === root.querySelector('.item.active') };
  });
  check(after.position === '2 / 2 页' && after.selectedVisible && after.focusedRow,
    'Cross-page navigation returns to a visible highlighted row', after);

  await click('.item.active');
  await click('.library-detail');
  check(await page.evaluate(() => window.__lexiShadow.querySelector('.library-detail').hidden),
    'Tapping the backdrop closes only the definition sheet');
  await click('.tab:nth-of-type(2)');
  await click('.library-row .item');
  await click('.library-sheet-nav .button:last-child');
  await press('Escape');
  check(await page.evaluate(() => {
    const root = window.__lexiShadow;
    return root.querySelector('.library-detail').hidden && root.querySelector('.item.active')
      && !root.querySelector('.main').inert && root.querySelectorAll('.detail-pane').length === 1;
  }), 'Book uses the same sheet and returns cleanly with Escape');
  return { originalListTop: before, ...after };
}
