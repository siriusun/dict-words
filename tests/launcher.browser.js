async page => {
  const base = new URL(page.url()).origin;
  const errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const near = (actual, expected) => Math.abs(actual - expected) < 1;
  const install = () => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = attach.call(this, options);
      if (this.id === 'lexi-local-root') window.__lexiShadow = root;
      return root;
    };
    const data = new Map(JSON.parse(sessionStorage.getItem('lexi-launcher-test') || '[]'));
    window.__lexiData = data;
    window.__lexiWrites = 0;
    Object.assign(window, {
      GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
      GM_setValue: (key, value) => {
        window.__lexiWrites++;
        data.set(key, structuredClone(value));
        sessionStorage.setItem('lexi-launcher-test', JSON.stringify([...data]));
      },
      GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
      GM_registerMenuCommand: () => '', GM_unregisterMenuCommand: () => {},
      GM_addValueChangeListener: () => {},
      GM_info: { script: { version: '0.4.2' } },
      GM_xmlhttpRequest: () => { throw new Error('Unexpected network request'); },
      alert: message => { throw new Error('Unexpected alert: ' + message); }
    });
  };
  await page.context().addInitScript(install);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(base + '/reading');
  page.on('pageerror', error => errors.push(error.message));
  const script = await (await page.request.get(base + '/lexi.user.js')).text();
  await page.addScriptTag({ content: script });
  const rect = target => target.evaluate(() => window.__lexiShadow.querySelector('.launcher').getBoundingClientRect().toJSON());
  const saved = () => page.evaluate(() => window.__lexiData.get('lexi:v1:launcher-position'));
  const isClosed = () => page.evaluate(() => window.__lexiShadow.querySelector('.overlay').hidden);
  const click = async label => {
    const handle = await page.evaluateHandle(label => window.__lexiShadow.querySelector(`[aria-label="${label}"]`), label);
    await handle.asElement().click();
    await handle.dispose();
  };
  const drag = async (x, y) => {
    const box = await rect(page);
    await page.mouse.move(box.left + 12, box.top + 10);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 10 });
    await page.mouse.up();
  };
  const initial = await rect(page);
  check(near(initial.right, 1076) && near(initial.bottom, 776), 'Unchanged default bottom-right placement');
  await drag(312, 250);
  let box = await rect(page);
  check(near(box.left, 300) && near(box.top, 240), 'Free placement keeps the grab offset rather than snapping to an edge');
  check(await isClosed(), 'Mouse drag does not open the studio');
  check(await page.evaluate(() => window.__lexiWrites === 1), 'Only the completed drag is written to storage');
  await click('打开 Lexi 学习中心');
  check(!await isClosed(), 'A normal click after dragging opens the studio');
  await click('关闭学习中心');
  box = await rect(page);
  await page.mouse.move(box.left + 12, box.top + 10);
  await page.mouse.down();
  await page.mouse.move(box.left + 14, box.top + 12);
  await page.mouse.up();
  check(!await isClosed(), 'Small pointer jitter still counts as a click');
  check(await page.evaluate(() => window.__lexiWrites === 1), 'A click does not save a new position');
  await click('关闭学习中心');
  await drag(0, 800);
  box = await rect(page);
  check(near(box.left, 0) && near(box.bottom, 800), 'Dragging outside the launcher clamps to viewport edges');
  check(await isClosed(), 'Dragging to the edge does not open the studio');
  await drag(312, 250);
  const position = await saved();
  await page.reload();
  await page.addScriptTag({ content: script });
  box = await rect(page);
  check(near(box.left, 300) && near(box.top, 240), 'Reload restores the saved placement');
  await page.setViewportSize({ width: 390, height: 500 });
  await page.emulateMedia({ colorScheme: 'dark' });
  box = await rect(page);
  check(near(box.left, 344 * position.x) && near(box.top, 454 * position.y)
    && box.left >= 0 && box.top >= 0 && box.right <= 390 && box.bottom <= 500,
  'Narrow dark layout preserves relative placement inside the viewport');

  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    const x = box.left + 12, y = box.top + 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 5; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
        touchPoints: [{ x: x + (212 - x) * step / 5, y: y + (150 - y) * step / 5 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    box = await rect(page);
    check(near(box.left, 200) && near(box.top, 140), 'Real touch input moves the launcher');
    check(await isClosed(), 'Touch drag does not open the studio');
    check(await page.evaluate(() => window.scrollY === 0 && !window.getSelection().toString()),
      'Touch dragging does not scroll the page or select text');
  } finally { await cdp.detach(); }

  const handle = await page.evaluateHandle(() => window.__lexiShadow.querySelector('.launcher'));
  await handle.asElement().focus();
  await page.keyboard.press('Enter');
  check(!await isClosed(), 'Keyboard activation works after dragging');
  await click('关闭学习中心');
  await handle.dispose();
  const data = await page.evaluate(() => [...window.__lexiData]);
  const sibling = await page.context().newPage();
  try {
    sibling.on('pageerror', error => errors.push(error.message));
    await sibling.setViewportSize({ width: 390, height: 500 });
    await sibling.route('https://lexi-launcher.test/**', route =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated launcher test</title>' }));
    await sibling.goto('https://lexi-launcher.test/');
    await sibling.evaluate(data => { for (const [key, value] of data) window.__lexiData.set(key, value); }, data);
    await sibling.addScriptTag({ content: script });
    const other = await rect(sibling);
    check(near(other.left, box.left) && near(other.top, box.top), 'A different website uses the shared GM placement');
  } finally { await sibling.close(); }
  check(errors.length === 0, 'No browser errors: ' + errors.join('; '));
  return { checks: ['default position', 'free mouse drag', 'grab offset', 'drag click suppression',
    'normal and shaky clicks', 'viewport bounds', 'reload persistence', 'narrow dark resize',
    'real touch drag', 'keyboard activation', 'cross-site position'], errors };
}
