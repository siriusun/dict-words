async page => {
  const base = new URL(page.url()).origin;
  const browser = page.context().browser();
  const chromium = browser.browserType().name() === 'chromium';
  const context = await browser.newContext({
    viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, hasTouch: true,
    ...(chromium ? { isMobile: true } : {})
  });
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const install = async target => {
    await target.evaluate(() => {
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) {
        const root = attach.call(this, options);
        if (this.id === 'lexi-local-root') window.__lexiShadow = root;
        return root;
      };
      const data = new Map();
      const now = Date.now();
      for (const [word, definition] of [['alpha', 'beta'], ['beta', 'gamma']]) {
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
      window.__lexiRequests = [];
      Object.assign(window, {
        GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
        GM_setValue: (key, value) => data.set(key, structuredClone(value)),
        GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
        GM_registerMenuCommand: name => name, GM_unregisterMenuCommand: () => {},
        GM_addValueChangeListener: () => {}, GM_info: { script: { version: 'selection-test' } },
        GM_xmlhttpRequest: request => {
          const url = new URL(request.url);
          if (url.hostname !== 'translate.googleapis.com') throw new Error('Unexpected request: ' + url.hostname);
          window.__lexiRequests.push(url.searchParams.get('q'));
          const timer = setTimeout(() => request.onload({ status: 200, responseText: JSON.stringify([[['模拟译文']]]) }), 0);
          return { abort() { clearTimeout(timer); } };
        }
      });
    });
    await target.addScriptTag({ url: base + '/lexi.user.js' });
  };
  const select = (target, selector, text, end, internal = false, pointerType = 'touch') => target.evaluate(
    ({ selector, text, end, internal, pointerType }) => {
      const node = internal ? window.__lexiShadow.querySelector(selector) : document.querySelector(selector);
      if (text !== null) node.textContent = text;
      const range = document.createRange();
      range.setStart(node.firstChild, 0);
      range.setEnd(node.firstChild, end ?? node.firstChild.length);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      node.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerType, bubbles: true, composed: true }));
    }, { selector, text, end, internal, pointerType });
  const tapAction = async target => {
    const handle = await target.evaluateHandle(() => window.__lexiShadow.querySelector('.selection-action'));
    await handle.asElement().tap();
    await handle.dispose();
  };
  try {
    const phone = await context.newPage();
    await phone.goto(base + '/reading');
    await install(phone);
    await select(phone, '#serendipity', 'Alpha');
    await phone.waitForFunction(() => window.__lexiShadow.querySelector('.selection-action').getAttribute('aria-label') === '查词 alpha');
    check(await phone.evaluate(() => {
      const root = window.__lexiShadow;
      const action = root.querySelector('.selection-action');
      const rect = action.getBoundingClientRect();
      return window.getSelection().toString() === 'Alpha' && root.querySelector('.popover').hidden
        && action.querySelector('.selection-preview').textContent === 'Alpha'
        && action.querySelector('.selection-verb').textContent === '查词'
        && rect.height >= 44 && rect.left >= 8 && rect.right <= innerWidth - 8
        && getComputedStyle(root.querySelector('.launcher')).visibility === 'hidden';
    }), 'The touch action previews the selection without clearing it or opening a result');
    for (const scheme of ['light', 'dark']) {
      await phone.emulateMedia({ colorScheme: scheme });
      await phone.evaluate(async () => {
        const action = window.__lexiShadow.querySelector('.selection-action');
        getComputedStyle(action).backgroundColor;
        await Promise.all(action.getAnimations().map(animation => animation.finished));
      });
      const ratios = await phone.evaluate(() => {
        const action = window.__lexiShadow.querySelector('.selection-action');
        const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = color => {
          const channels = color.map(value => value / 255).map(value => value <= 0.04045
            ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const contrast = (foreground, background) => {
          const style = getComputedStyle(foreground);
          const opacity = Number(style.opacity);
          const back = rgb(getComputedStyle(background).backgroundColor);
          const front = rgb(style.color).map((value, index) => value * opacity + back[index] * (1 - opacity));
          const a = luminance(front), b = luminance(back);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        return {
          caption: contrast(action.querySelector('.selection-caption'), action),
          preview: contrast(action.querySelector('.selection-preview'), action),
          call: contrast(action.querySelector('.selection-verb'), action.querySelector('.selection-call'))
        };
      });
      check(Object.values(ratios).every(ratio => ratio >= 4.5),
        `Selection action text needs readable ${scheme} contrast: ` + JSON.stringify(ratios));
    }
    await phone.evaluate(() => {
      window.__lexiShadow.querySelector('.selection-action').addEventListener('pointerdown', event => {
        window.__selectionOnPress = { prevented: event.defaultPrevented, text: window.getSelection().toString() };
      }, { once: true });
    });
    await tapAction(phone);
    await phone.waitForFunction(() => window.__lexiShadow.querySelector('.popover .word')?.textContent === 'alpha');
    check(await phone.evaluate(() => {
      const root = window.__lexiShadow;
      const highlight = window.CSS?.highlights?.get('lexi-reading-origin');
      return window.getSelection().isCollapsed && window.getSelection().rangeCount === 0
        && window.__selectionOnPress.prevented && window.__selectionOnPress.text === 'Alpha'
        && root.querySelector('.selection-preview').textContent === ''
        && (highlight ? [...highlight].some(range => range.toString() === 'Alpha') : root.querySelector('.reading-marks').children.length > 0)
        && getComputedStyle(root.querySelector('.launcher')).visibility !== 'hidden';
    }), 'Word lookup clears the native selection while keeping the reading marker');

    await select(phone, '.popover .definition', null, null, true);
    await phone.waitForFunction(() => window.__lexiShadow.querySelector('.selection-action').getAttribute('aria-label') === '查词 beta');
    await tapAction(phone);
    await phone.waitForFunction(() => window.__lexiShadow.querySelector('.popover .word')?.textContent === 'beta');
    check(await phone.evaluate(() => {
      const root = window.__lexiShadow;
      const highlight = window.CSS?.highlights?.get('lexi-reading-origin');
      return window.getSelection().isCollapsed && Boolean(root.querySelector('.popover .lookup-back'))
        && (highlight ? [...highlight].some(range => range.toString() === 'Alpha') : root.querySelector('.reading-marks').children.length > 0);
    }), 'An internal lookup still clears its selection and preserves the webpage origin');
    await phone.evaluate(() => window.__lexiShadow.querySelector('[aria-label="关闭查词卡"]').click());
    await phone.waitForFunction(() => window.__lexiShadow.querySelector('.popover').hidden);

    const sentence = 'Mobile selection grows into a full sentence for translation.';
    await phone.evaluate(() => { window.__beforeSentence = JSON.stringify([...window.__lexiData]); });
    await select(phone, '#phrase', sentence, 6);
    await phone.waitForFunction(() => window.__lexiShadow.querySelector('.selection-action').getAttribute('aria-label') === '查词 mobile');
    await select(phone, '#phrase', null);
    await phone.waitForFunction(() => window.__lexiShadow.querySelector('.selection-action').getAttribute('aria-label') === '翻译所选句子');
    check(await phone.evaluate(sentence => {
      const action = window.__lexiShadow.querySelector('.selection-action');
      const preview = action.querySelector('.selection-preview');
      return window.getSelection().toString() === sentence && preview.textContent === sentence
        && action.querySelector('.selection-verb').textContent === '翻译'
        && preview.scrollWidth > preview.clientWidth && getComputedStyle(preview).textOverflow === 'ellipsis';
    }, sentence), 'Expanding the native selection updates and truncates the sentence preview');
    await phone.setViewportSize({ width: 320, height: 568 });
    await phone.waitForFunction(() => {
      const rect = window.__lexiShadow.querySelector('.selection-action').getBoundingClientRect();
      const viewport = window.visualViewport;
      return Math.abs((rect.left + rect.right) / 2 - (viewport.offsetLeft + viewport.width / 2)) < 1
        && viewport.offsetTop + viewport.height - rect.bottom <= 12;
    });
    await tapAction(phone);
    await phone.waitForFunction(() => window.__lexiShadow.querySelector('.popover .translation-copy')?.textContent === '模拟译文');
    check(await phone.evaluate(sentence => {
      const root = window.__lexiShadow;
      const highlight = window.CSS?.highlights?.get('lexi-reading-origin');
      return window.getSelection().isCollapsed && window.getSelection().rangeCount === 0
        && root.querySelector('.selection-preview').textContent === ''
        && root.querySelector('.popover .sentence-original').textContent === sentence
        && window.__lexiRequests.length === 1 && window.__lexiRequests[0] === sentence
        && JSON.stringify([...window.__lexiData]) === window.__beforeSentence
        && (highlight ? [...highlight].some(range => range.toString() === sentence) : root.querySelector('.reading-marks').children.length > 0);
    }, sentence), 'Translation clears the selection and preserves the complete text and reading marker');
    await phone.evaluate(() => window.__lexiShadow.querySelector('[aria-label="关闭查词卡"]').click());
    await phone.waitForFunction(() => window.__lexiShadow.querySelector('.popover').hidden);

    await phone.setViewportSize({ width: 1100, height: 800 });
    await select(phone, '#serendipity', 'beta', null, false, 'mouse');
    await phone.waitForFunction(() => window.__lexiShadow.querySelector('.popover .word')?.textContent === 'beta');
    check(await phone.evaluate(() => window.getSelection().toString() === 'beta'
      && window.__lexiShadow.querySelector('.selection-action').hidden),
    'Desktop mouse selection remains automatic and does not clear the selection');

    if (chromium) {
      const scaled = await context.newPage();
      await scaled.route('**/reading', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace(/<meta name="viewport"[^>]*>/, '') });
      });
      await scaled.goto(base + '/reading');
      const cdp = await context.newCDPSession(scaled);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 390 / 980 });
      await install(scaled);
      await select(scaled, '#serendipity', 'alpha');
      await scaled.waitForFunction(() => window.__lexiShadow.querySelector('.selection-action').getAttribute('aria-label') === '查词 alpha');
      const metrics = await scaled.evaluate(() => {
        const rect = window.__lexiShadow.querySelector('.selection-action').getBoundingClientRect();
        const viewport = window.visualViewport;
        const scale = viewport.scale;
        return { scale, height: rect.height * scale, left: (rect.left - viewport.offsetLeft) * scale,
          right: (viewport.offsetLeft + viewport.width - rect.right) * scale,
          bottom: (viewport.offsetTop + viewport.height - rect.bottom) * scale };
      });
      check(metrics.scale < 0.5 && metrics.height >= 44 && metrics.height <= 72
        && metrics.left >= 8 && metrics.right >= 8 && Math.abs(metrics.left - metrics.right) < 1
        && metrics.bottom >= 7 && metrics.bottom <= 16,
      'The scaled mobile action stays centered, visible and touch-sized: ' + JSON.stringify(metrics));
      await tapAction(scaled);
      await scaled.waitForFunction(() => window.__lexiShadow.querySelector('.popover .word')?.textContent === 'alpha');
      check(await scaled.evaluate(() => window.getSelection().isCollapsed),
        'Tapping the scaled action clears the selection and opens the word');
    }
    return `Mobile selection action checks passed in ${browser.browserType().name()}.`;
  } finally {
    await context.close();
  }
}
