export async function checkNutstoreSettings(page, baseUrl) {
  for (const width of [1100, 320]) {
    await page.goto(`${baseUrl}/${width === 1100 ? 'reading' : ''}`);
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width, height: 720, deviceScaleFactor: 1, mobile: width === 320
    });
    const result = await page.evaluate(async () => {
      let shadow;
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) {
        const root = attach.call(this, options);
        if (this.id === 'lexi-local-root') shadow = root;
        return root;
      };
      Object.assign(window, {
        GM_getValue: (_key, fallback) => fallback,
        GM_setValue: () => { throw new Error('Unexpected storage write'); },
        GM_listValues: () => [], GM_addValueChangeListener: () => {},
        GM_registerMenuCommand: () => '', GM_unregisterMenuCommand: () => {},
        GM_xmlhttpRequest: () => { throw new Error('Unexpected network request'); },
        GM_info: { script: { version: 'test' } }
      });
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/lexi.user.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
      shadow.querySelector('.launcher').click();
      await Promise.resolve();
      shadow.querySelector('.tab:last-of-type').click();
      await Promise.resolve();
      const email = shadow.querySelector('input[type="email"]');
      const section = email.closest('section');
      const fields = [...section.querySelectorAll('input')].map(input => {
        const { width, height } = input.getBoundingClientRect();
        return { width, height, border: getComputedStyle(input).borderTopWidth };
      });
      return { fields, overflow: section.scrollWidth - section.clientWidth };
    });
    if (result.fields.length !== 2 || result.fields.some(field => field.width < 180 || field.height < 40 || field.border === '0px') || result.overflow > 1) {
      throw new Error(`Account and folder must have visible, usable inputs at ${width}px: ${JSON.stringify(result)}`);
    }
    console.log(`PASS: both Nutstore inputs are visible and usable at ${width}px`);
  }
}
