async page => {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:1436' || await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__))) throw new Error('Generated browser fallback fixture required');
  if (!await page.evaluate(() => Boolean(localStorage.getItem('noted-sidebar-fixture')))) throw new Error('Generated notes required');
  await page.addInitScript(() => {
    const original = CSS.supports.bind(CSS);
    CSS.supports = (...args) => args[0] === 'field-sizing' && args[1] === 'content' ? false : original(...args);
  });
  await page.reload(); await page.waitForFunction(() => document.querySelector('#note-title')?.value);
  if (!await page.locator('#note-title').evaluate(field => field.style.getPropertyValue('field-sizing') === 'fixed')) throw new Error('Fallback sizing was not activated');
  return {passed:true,syntheticOnly:true,fallbackSizing:true};
}
