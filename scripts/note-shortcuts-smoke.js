async page => {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:1436' || await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__))) throw new Error('Generated browser shortcut fixture required');
  if (!await page.evaluate(() => Boolean(localStorage.getItem('noted-sidebar-fixture')))) throw new Error('Generated notes required');
  const checks = [], errors = [], record = (name, okay) => { if (!okay) throw new Error(name); checks.push(name); };
  page.on('pageerror', error => errors.push(error.message));
  await page.reload(); await page.waitForFunction(() => document.querySelector('#header-connection-handle button'));
  const seeded = await page.evaluate(async () => (await import('/src/api.ts')).api.createNote(`Synthetic shortcut case ${Date.now()}`, null));
  await page.keyboard.press('Control+p'); await page.locator('#quick-open-search').fill(seeded.title); await page.locator(`[data-quick-note="${seeded.id}"]`).click();
  await page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource === id, seeded.id);
  const title = page.getByRole('textbox', { name: 'Note title', exact: true }), current = () => page.locator('#header-connection-handle button').getAttribute('data-connect-source');
  const before = await current(), oldTitle = await title.inputValue();
  for (const [name, extra] of [['composition',{isComposing:true}],['extra Shift modifier',{shiftKey:true}],['extra Alt modifier',{altKey:true}],['held-key repeat',{repeat:true}]]) {
    await title.focus();
    const prevented = await title.evaluate((field, extra) => { const event = new KeyboardEvent('keydown', {key:'n',ctrlKey:true,bubbles:true,cancelable:true,...extra});field.dispatchEvent(event);return event.defaultPrevented; }, extra);
    await page.waitForTimeout(180);
    record(`New note ignores ${name}`, prevented === Boolean(extra.repeat) && await current() === before && await title.inputValue() === oldTitle);
  }
  const focusBefore = await page.locator('#focus-mode').getAttribute('aria-pressed');
  for (const [name, extra] of [['composition',{isComposing:true}],['extra modifier',{ctrlKey:true}],['held-key repeat',{repeat:true}]]) {
    await title.focus();
    const prevented = await title.evaluate((field, extra) => {const event=new KeyboardEvent('keydown',{key:'F8',bubbles:true,cancelable:true,...extra});field.dispatchEvent(event);return event.defaultPrevented;}, extra);
    record(`Focus mode ignores ${name}`, prevented === Boolean(extra.repeat) && await page.locator('#focus-mode').getAttribute('aria-pressed') === focusBefore);
  }
  for (const key of ['p','s']) for (const [name, extra] of [['composition',{isComposing:true}],['extra Alt modifier',{altKey:true}],['held-key repeat',{repeat:true}]]) {
    await title.focus();
    const prevented=await title.evaluate((field,{key,extra})=>{const event=new KeyboardEvent('keydown',{key,ctrlKey:true,bubbles:true,cancelable:true,...extra});field.dispatchEvent(event);return event.defaultPrevented;},{key,extra});
    record(`${key.toUpperCase()} shortcut ignores ${name}`, prevented === Boolean(extra.repeat) && await current() === before && !await page.locator('.quick-open-dialog').isVisible());
  }
  await page.keyboard.press('F8'); await page.keyboard.press('F8');
  record('the documented Focus chord restores the original arrangement', await page.locator('#focus-mode').getAttribute('aria-pressed') === focusBefore);
  const savedTitle = 'Synthetic keyboard draft retained before new note', body = 'Synthetic keyboard draft saved before navigating to a new note.';
  await title.fill(savedTitle); await page.locator('#editor .tiptap').fill(body); await page.keyboard.press('Control+n');
  await page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource !== id, before);
  record('the documented Control N chord creates a note and selects its title', await title.inputValue() === 'Untitled' && await title.evaluate(field => field === document.activeElement && field.selectionStart === 0 && field.selectionEnd === field.value.length));
  record('new-note navigation saved the previous generated draft', await page.evaluate(async ({id,title,body}) => {const note=await(await import('/src/api.ts')).api.load(id);return note.title === title && JSON.stringify(note.content).includes(body);},{id:before,title:savedTitle,body}));
  record('shortcut workflow has no uncaught browser errors', errors.length === 0);
  return {passed:true,native:false,syntheticOnly:true,checks,errors};
}
