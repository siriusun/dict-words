async page => {
  const base = 'http://127.0.0.1:50972';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.clock.install({ time: new Date('2026-11-13T09:00:00Z') });
  await page.goto(base);
  await page.evaluate(() => {
    // Open only the isolated fixture's shadow root so Playwright can use real clicks.
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) { return attach.call(this, { ...options, mode: 'open' }); };
    const prefix = 'lexi:v1:';
    const data = new Map();
    const now = Date.now();
    const day = 86400000;
    const words = ['alpha', 'beta', 'gamma'].map(word => ({ word, fetchedAt: now, phonetic: '/test/', audio: '',
      sourceUrl: '', license: { name: '', url: '' },
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: `The meaning of ${word}.`, example: '' }] }],
      translation: '1. 名词：示例释义', translatedAt: now, translationSource: `1. noun: The meaning of ${word}.` }));
    const book = [
      { word: 'alpha', addedAt: now, updatedAt: now, dueAt: now, stage: 0, reviews: 0, lastReviewedAt: 0, lastGrade: '' },
      { word: 'beta', addedAt: now - 9 * day, updatedAt: now - 7 * day, dueAt: now - day,
        stage: 3, reviews: 4, lastReviewedAt: now - 7 * day, lastGrade: 'good' },
      { word: 'gamma', addedAt: now - 5 * day, updatedAt: now - 2 * day, dueAt: now + day,
        stage: 2, reviews: 2, lastReviewedAt: now - 2 * day, lastGrade: 'good' }
    ];
    for (const word of words) data.set(prefix + 'word:' + word.word, word);
    for (const study of book) data.set(prefix + 'study:' + study.word, study);
    window.__lexiData = data;
    window.__lexiLegacy = structuredClone({ schemaVersion: 1, words, book, history: [] });
    window.__lexiMenus = new Map();
    window.__lexiRequests = [];
    Object.assign(window, {
      GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
      GM_setValue: (key, value) => data.set(key, structuredClone(value)),
      GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
      GM_registerMenuCommand: (name, callback) => window.__lexiMenus.set(name, callback),
      GM_addValueChangeListener: () => {}, GM_info: { script: { version: '0.2.0' } },
      GM_xmlhttpRequest: request => { window.__lexiRequests.push(request.url); throw new Error('Unexpected network request'); }
    });
  });
  await page.addScriptTag({ url: base + '/lexi.user.js' });
  await page.evaluate(() => window.__lexiMenus.get('打开 Lexi 学习中心')());
  await page.getByRole('button', { name: '复习', exact: true }).click();
  const stats = () => page.locator('.stat strong').allTextContents();
  check(JSON.stringify(await stats()) === '["2","0","3"]', 'Initial due/today/book stats');
  await page.screenshot({ path: 'artifacts/review-020/01-overview-light.png' });
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  check(await page.locator('.review .word').textContent() === 'beta', 'Overdue word comes first');
  check(await page.locator('.review-answer').count() === 0, 'Answer stays hidden before reveal');
  await page.getByRole('button', { name: '显示释义', exact: true }).click();
  check(await page.locator('.actions button').count() === 4, 'Four feedback choices');
  await page.screenshot({ path: 'artifacts/review-020/02-answer-light.png' });
  await page.locator('.actions button').filter({ hasText: '忘记 ·' }).click();
  let beta = await page.evaluate(() => window.__lexiData.get('lexi:v1:study:beta'));
  check(beta.fsrs.state === 3 && beta.fsrs.lapses === 1 && beta.reviews === 5, 'Forgotten word enters relearning');
  check(await page.locator('.review .word').textContent() === 'alpha', 'Next new card appears');
  await page.getByRole('button', { name: '显示释义', exact: true }).click();
  await page.locator('.actions button').filter({ hasText: '困难 ·' }).click();
  await page.getByRole('button', { name: '返回复习概览', exact: true }).click();
  check(JSON.stringify(await stats()) === '["0","2","3"]', 'Today counts distinct words');
  check(await page.locator('.review-plan .setting').count() === 3, 'Upcoming plan retains all studied words');
  await page.screenshot({ path: 'artifacts/review-020/03-upcoming-light.png' });
  await page.clock.fastForward(6 * 60000);
  check(JSON.stringify(await stats()) === '["1","2","3"]', 'Due timer refreshes without reopening');
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await page.getByRole('button', { name: '显示释义', exact: true }).click();
  await page.locator('.actions button').filter({ hasText: '记得 ·' }).click();
  await page.getByRole('button', { name: '返回复习概览', exact: true }).click();
  await page.clock.fastForward(10 * 60000);
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  check(await page.locator('.review .word').textContent() === 'beta', 'Overdue relearning card returns');
  await page.getByRole('button', { name: '显示释义', exact: true }).click();
  await page.locator('.actions button').filter({ hasText: '记得 ·' }).click();
  check(await page.locator('.review .word').textContent() === 'alpha', 'Learning card returns after interval');
  await page.getByRole('button', { name: '显示释义', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'artifacts/review-020/04-answer-dark.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/review-020/05-answer-narrow-dark.png' });
  check(await page.evaluate(() => {
    const root = document.getElementById('lexi-local-root').shadowRoot;
    const width = window.innerWidth;
    return [...root.querySelectorAll('.review .actions button')].every(button => {
      const rect = button.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= width;
    });
  }), 'Feedback controls fit the narrow viewport');
  await page.locator('.actions button').filter({ hasText: '轻松 ·' }).click();
  await page.getByRole('button', { name: '返回复习概览', exact: true }).click();
  const learned = await page.evaluate(() => [...window.__lexiData.entries()].filter(([key]) => key.startsWith('lexi:v1:study:')).map(([, item]) => item));
  check(learned.every(item => item.dueAt > Date.parse('2026-11-13T09:16:00Z')), 'Remembered words keep future review dates');
  check((await stats())[1] === '2', 'Repeated reviews still count as two words today');
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON 备份', exact: true }).click();
  await (await downloadPromise).saveAs('artifacts/review-020/backup.json');
  const legacy = await page.evaluate(() => window.__lexiLegacy);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('input[type="file"]').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await page.getByText('合并完成，重复历史已去重', { exact: true }).waitFor();
  beta = await page.evaluate(() => window.__lexiData.get('lexi:v1:study:beta'));
  check(beta.fsrs.state === 2 && beta.fsrs.lapses === 1 && beta.reviews === 6, 'Importing older v1 backup preserves newer FSRS progress');
  await page.getByRole('button', { name: '复习', exact: true }).click();
  await page.screenshot({ path: 'artifacts/review-020/06-final-plan.png' });
  check(await page.evaluate(() => window.__lexiRequests.length) === 0, 'Review makes no network requests');
  check(errors.length === 0, `Browser exceptions: ${errors.join('; ')}`);
  return { stats: await stats(), feedback: ['忘记', '困难', '记得', '轻松'], screenshots: 6,
    browserErrors: errors, reviewNetworkRequests: 0, oldBackupImport: 'passed', backup: 'artifacts/review-020/backup.json' };
}
