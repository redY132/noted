async page => {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:1436' || await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__))) throw new Error('Isolated synthetic preview required');
  const fixture = await page.evaluate(() => JSON.parse(localStorage.getItem('noted-history-fixture') || 'null'));
  if (!fixture?.length || !await page.evaluate(() => localStorage.getItem('noted-sidebar-fixture'))) throw new Error('Synthetic history fixtures required');
  const checks = [], record = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
  await page.setViewportSize({ width: 1200, height: 800 }); await page.reload(); await page.waitForFunction(() => document.querySelector('#note-title')?.value);
  const current = id => page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource === id, id);
  const open = async note => { await page.keyboard.press('Control+p'); await page.locator('#quick-open-search').fill(note.title); await page.locator(`[data-quick-note="${note.id}"]`).click(); await current(note.id); };
  await page.evaluate(async () => { const { api } = await import('/src/api.ts'); window.__historyOriginalSave = api.save; window.__historyOriginalLoad = api.load; api.save = async (...args) => { if (window.__historyFailSave) throw new Error('Synthetic history save failure'); return window.__historyOriginalSave(...args); }; });
  try {
    await open(fixture[0]); await open(fixture[1]);
    await page.evaluate(() => { window.__historyFailSave = true; window.__historyEditor = document.querySelector('#editor .tiptap'); });
    await page.locator('#editor .tiptap').focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' Synthetic unsaved history fault.');
    await page.keyboard.press('Alt+ArrowLeft'); await page.waitForFunction(() => document.querySelector('#error-message')?.textContent.includes('Synthetic history save failure'));
    record('failed save preserves the current draft and mounted editor', await page.evaluate(() => window.__historyEditor === document.querySelector('#editor .tiptap') && document.querySelector('#editor .tiptap').textContent.includes('Synthetic unsaved history fault.')));
    await current(fixture[1].id);
    await page.evaluate(() => { window.__historyFailSave = false; }); await page.keyboard.press('Alt+ArrowLeft'); await current(fixture[0].id);
    await page.keyboard.press('Alt+ArrowRight'); await current(fixture[1].id);
    record('retry uses the same history destination and saves the preserved draft', (await page.locator('#editor .tiptap').innerText()).includes('Synthetic unsaved history fault.'));
    await page.evaluate(async () => { const { api } = await import('/src/api.ts'); api.load = async () => { throw new Error('Synthetic history load failure'); }; window.__historyEditor = document.querySelector('#editor .tiptap'); });
    await page.locator('#view-toggle').click(); await page.locator('#shell-note-history').click();
    const destination = page.locator('[data-history-list] button').filter({ hasText: fixture[0].title }).first(); await destination.click();
    await page.waitForFunction(() => document.querySelector('[data-history-status]')?.textContent.includes('Could not open'));
    record('failed history-list load stays retryable and does not replace the editor', await page.evaluate(() => window.__historyEditor === document.querySelector('#editor .tiptap') && document.querySelector('.note-history-dialog').open));
    await page.evaluate(async () => { const { api } = await import('/src/api.ts'); api.load = window.__historyOriginalLoad; }); await destination.click(); await current(fixture[0].id);
    record('retrying a failed load opens the requested visit', !await page.locator('.note-history-dialog').isVisible());
    await page.locator('#editor .tiptap p').nth(40).click(); await page.keyboard.press('End'); await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft');
    await open(fixture[1]);
    await page.evaluate(async id => { const { api } = await import('/src/api.ts'); const note = await api.load(id); delete note.document; note.content = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'history-external-fixture' }, content: [{ type: 'text', text: 'Synthetic externally replaced document.' }] }] }; await api.save(note, note.revision); }, fixture[0].id);
    await page.keyboard.press('Alt+ArrowLeft'); await current(fixture[0].id);
    record('a changed file loads its current text instead of a cached body', (await page.locator('#editor .tiptap').innerText()).includes('Synthetic externally replaced document.'));
    record('changed revisions discard obsolete selection offsets and clamp scrolling', await page.evaluate(() => window.getSelection().toString() === '' && document.querySelector('.document-scroll').scrollTop === 0));
    return { passed: true, syntheticOnly: true, checks };
  } finally {
    await page.evaluate(async () => { const { api } = await import('/src/api.ts'); api.save = window.__historyOriginalSave; api.load = window.__historyOriginalLoad; window.__historyFailSave = false; });
  }
}
