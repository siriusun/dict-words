async page => {
  const base = 'http://127.0.0.1:50336';
  const out = 'artifacts/review-030/';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.clock.install({ time: new Date('2026-11-13T09:00:00Z') });
  await page.goto(base + '/reading');
  await page.evaluate(() => {
    // Open only the isolated fixture's shadow root so Playwright can use real clicks and keys.
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) { return attach.call(this, { ...options, mode: 'open' }); };
    const prefix = 'lexi:v1:';
    const data = new Map();
    const now = Date.now();
    const day = 86400000;
    const words = ['alpha', 'beta', 'gamma', 'delta'].map(word => ({ word, fetchedAt: now, phonetic: '/test/', phoneticSource: 'youdao',
      audio: '', sourceUrl: '', license: { name: '', url: '' },
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: `The meaning of ${word}.`, example: '' }] }],
      translation: `1. 名词：${word} 的示例释义`, translatedAt: now, translationSource: `1. noun: The meaning of ${word}.` }));
    const review = (word, last, due, stability) => ({ word, addedAt: last - day, updatedAt: last, dueAt: due, stage: 3, reviews: 3,
      lastReviewedAt: last, lastGrade: 'good', fsrs: { due, stability, difficulty: 5, elapsed_days: 0,
        scheduled_days: Math.round((due - last) / day), learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: last } });
    const book = [
      { word: 'alpha', addedAt: now - 1000, updatedAt: now - 1000, dueAt: now - 1000, stage: 0, reviews: 0, lastReviewedAt: 0, lastGrade: '' },
      review('beta', now - 8 * day, now - day, 7),
      review('gamma', now - 2 * day, now + 3 * day, 5),
      review('delta', now - day, now + 6 * day, 7)
    ];
    for (const word of words) data.set(prefix + 'word:' + word.word, word);
    for (const study of book) data.set(prefix + 'study:' + study.word, study);
    data.set(prefix + 'event:browser-event-0001', { id: 'browser-event-0001', word: 'beta', at: now - 8 * day,
      context: 'It started slowly. The beta version shipped to a few readers first. Feedback followed.', title: 'Notes', sourceUrl: '' });
    window.__lexiData = data;
    window.__lexiMenus = new Map();
    Object.assign(window, {
      GM_getValue: (key, fallback) => structuredClone(data.has(key) ? data.get(key) : fallback),
      GM_setValue: (key, value) => data.set(key, structuredClone(value)),
      GM_deleteValue: key => data.delete(key), GM_listValues: () => [...data.keys()],
      GM_registerMenuCommand: (name, callback) => window.__lexiMenus.set(name, callback),
      GM_addValueChangeListener: () => {}, GM_info: { script: { version: '0.3.0' } },
      GM_xmlhttpRequest: () => { throw new Error('Unexpected network request'); }
    });
  });
  await page.addScriptTag({ url: base + '/lexi.user.js' });
  await page.evaluate(() => window.__lexiMenus.get('打开 Lexi 学习中心')());
  const study = word => page.evaluate(word => window.__lexiData.get('lexi:v1:study:' + word), word);
  const focused = () => page.evaluate(() => document.getElementById('lexi-local-root').shadowRoot.activeElement?.textContent || '');
  const word = () => page.locator('.review .word').first().textContent();
  await page.getByRole('button', { name: '复习', exact: true }).click();
  const stats = await page.locator('.stat strong').allTextContents();
  check(JSON.stringify(stats) === '["1","1","0","4"]', 'Overview stats: due review, new today, reviewed today, book ' + stats);
  check((await page.locator('.review').first().textContent()).includes('本轮 2 张：复习 1 · 新词 1'), 'Round composition');
  await page.screenshot({ path: out + '01-overview.png' });

  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  check(await word() === 'beta', 'Due review comes before the new word');
  check(await page.locator('.context-line mark').textContent() === 'beta', 'Context sentence highlights the word');
  check((await page.locator('.context-line').textContent()) === 'The beta version shipped to a few readers first.', 'Context is one sentence');
  check((await focused()) === '显示释义', 'Reveal button is focused');
  await page.keyboard.press('Space');
  check(await page.locator('.review-answer').count() === 1, 'Space reveals the answer');
  check((await focused()).startsWith('记得 ·'), 'Good button is focused after reveal');
  await page.screenshot({ path: out + '02-answer-context.png' });
  await page.keyboard.press('1');
  check((await study('beta')).fsrs.state === 3, 'Key 1 forgets beta into relearning');
  check(await word() === 'alpha', 'New word follows');
  await page.keyboard.press('Space');
  await page.keyboard.press('1');
  check(await word() === 'alpha', 'Forgotten new word is shown again in the same round (learn ahead)');
  check((await page.locator('.review > .muted').first().textContent()).includes('学习中'), 'Learning state shown');
  await page.keyboard.press('Control+z');
  check((await study('alpha')).reviews === 0 && !(await study('alpha')).log, 'Undo restores the new word');
  check(await page.locator('.review-answer').count() === 0, 'Undo returns to the question side');
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  check(await word() === 'beta', 'Relearning beta returns within the round');
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  check((await study('beta')).fsrs.state === 2, 'Beta relearned');
  check(await word() === 'alpha', 'Alpha 10-minute step in the same round');
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  check((await study('alpha')).fsrs.state === 2, 'Alpha graduated');
  check((await study('alpha')).log.length === 2, 'Alpha log has two reviews after undo');
  check((await page.locator('.review h2').textContent()) === '本轮已完成', 'Round completes');
  await page.getByRole('button', { name: '返回复习概览', exact: true }).click();
  const insight = await page.locator('.review-insight').textContent();
  check(insight.includes('记得率 0%（1 次）'), 'True retention counts the long-term review: ' + insight);
  await page.screenshot({ path: out + '03-overview-after.png', fullPage: true });

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '加入反向卡（看中文想英文）' }).check();
  await page.screenshot({ path: out + '04-settings.png', fullPage: true });
  await page.getByRole('button', { name: '复习', exact: true }).click();
  check(JSON.stringify(await page.locator('.stat strong').allTextContents()) === '["0","2","2","4"]', 'Reverse cards for gamma and delta; siblings reviewed today are deferred');
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  check(await page.locator('.review .word').count() === 0, 'Reverse card hides the English word');
  check((await page.locator('.recall-prompt').textContent()).includes('＿＿'), 'English word masked in the prompt');
  await page.keyboard.type('gamma');
  await page.keyboard.press('Enter');
  check((await page.locator('.spell').textContent()) === '✓ 拼写正确', 'Spelling check');
  check(await word() === 'gamma', 'Reverse card answer shows the word');
  await page.screenshot({ path: out + '05-reverse-answer.png' });
  await page.keyboard.press('4');
  const recall = await page.evaluate(() => window.__lexiData.get('lexi:v1:recall:gamma'));
  check(recall.fsrs.state === 2 && (await study('gamma')).reviews === 3, 'Reverse progress is separate from the meaning card');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '06-reverse-narrow-dark.png' });
  check(errors.length === 0, 'Page errors: ' + errors.join('; '));
  return 'browser checks passed';
}
