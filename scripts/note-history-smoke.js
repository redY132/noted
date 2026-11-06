async page => {
  const native = await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__));
  if (native) {
    const status = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('workspace_status'));
    if (!status.path.includes('noted-sidebar-ui-')) throw new Error('Disposable history workspace required');
  } else if (new URL(page.url()).origin !== 'http://127.0.0.1:1436') throw new Error('Isolated history preview required');
  if (!await page.evaluate(() => localStorage.getItem('noted-sidebar-fixture'))) throw new Error('Synthetic notes required');
  const fixture = await page.evaluate(async native => {
    const api = native ? null : (await import('/src/api.ts')).api;
    const create = title => native ? window.__TAURI_INTERNALS__.invoke('create_note', { title, folderId: null }) : api.createNote(title, null);
    const save = note => native ? window.__TAURI_INTERNALS__.invoke('save_note', { note, expectedRevision: note.revision }) : api.save(note, note.revision);
    const notes = [];
    for (const label of ['A', 'B', 'C']) {
      const note = await create(`Synthetic reading ${label} ${Date.now()}`);
      note.content = { type: 'doc', content: Array.from({ length: label === 'A' ? 90 : 2 }, (_, index) => ({ type: 'paragraph', attrs: { id: `history-${label}-${index}` }, content: [{ type: 'text', text: `Synthetic ${label} paragraph ${index}. Reading positions and selections should survive navigation.` }] })) };
      notes.push(await save(note));
    }
    const result = notes.map(n => ({ id: n.id, title: n.title })); localStorage.setItem('noted-history-fixture', JSON.stringify(result)); return result;
  }, native);
  const checks = [], errors = [], record = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1200, height: 800 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload(); await page.waitForFunction(() => document.querySelector('#note-title')?.value);
  const browse = page.locator('[data-panel-toggle=navigation]'); if (await browse.getAttribute('aria-expanded') === 'true') await browse.click();
  const current = id => page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource === id, id);
  const open = async note => { await page.keyboard.press('Control+p'); await page.locator('#quick-open-search').fill(note.title); await page.locator(`[data-quick-note="${note.id}"]`).click(); await current(note.id); };
  const history = async () => { await page.locator('#view-toggle').click(); await page.locator('#shell-note-history').click(); };
  await open(fixture[0]);
  await page.locator('#editor .tiptap p').nth(40).click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight');
  const selected = await page.evaluate(() => window.getSelection().toString());
  await page.locator('.document-scroll').evaluate(el => { el.scrollTop = 900; });
  const top = await page.locator('.document-scroll').evaluate(el => el.scrollTop);
  await open(fixture[1]); await page.keyboard.press('Alt+ArrowLeft'); await current(fixture[0].id);
  await page.waitForTimeout(60);
  record('Back restores the saved reading position', Math.abs(await page.locator('.document-scroll').evaluate(el => el.scrollTop) - top) < 2);
  record('Back restores the selected text', selected.length > 0 && await page.evaluate(() => window.getSelection().toString()) === selected);
  await page.keyboard.press('Alt+ArrowRight'); await current(fixture[1].id); record('Forward reopens the next visit', true);
  await page.locator('#editor .tiptap').focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' Synthetic draft saved before history travel.');
  await page.keyboard.press('Alt+ArrowLeft'); await current(fixture[0].id); await page.keyboard.press('Alt+ArrowRight'); await current(fixture[1].id);
  record('history travel saves the current draft first', (await page.locator('#editor .tiptap').innerText()).includes('Synthetic draft saved before history travel.'));
  await page.keyboard.press('Alt+ArrowLeft'); await current(fixture[0].id); await open(fixture[2]);
  record('opening a different note after Back replaces the forward branch', await page.locator('[aria-label="Forward to note"]').isDisabled());
  await history(); record('history uses a focused named native dialog', await page.locator('[data-history-close]').evaluate(el => el === document.activeElement));
  const rows = await page.locator('[data-history-list]').innerText(); record('history keeps repeated visits and labels the current note', rows.includes(fixture[2].title) && rows.includes('Current note'));
  await page.keyboard.press('Alt+ArrowLeft'); record('history shortcut cannot navigate behind a modal', await page.locator('#note-title').inputValue() === fixture[2].title);
  await page.keyboard.press('Escape'); record('one Escape removes history from the accessibility tree', await page.locator('.note-history-dialog').evaluate(el => !el.open && el.inert));
  await open(fixture[1]); await page.locator('#trash-current').click(); await page.locator(`[data-restore="${fixture[1].id}"]`).waitFor(); await page.keyboard.press('Escape');
  record('moving the current note to Trash leaves no editable deleted note', await page.locator('#note-pane').isHidden());
  await history(); record('trashed history entries remain visible and unavailable', (await page.locator('[data-history-list]').innerText()).includes('In Trash'));
  await page.keyboard.press('Escape'); await page.keyboard.press('Alt+ArrowLeft'); await current(fixture[2].id);
  record('Back skips the trashed visit', true);
  await browse.click(); await page.locator('#open-trash').click(); await page.locator(`[data-restore="${fixture[1].id}"]`).click(); await page.locator(`[data-restore="${fixture[1].id}"]`).waitFor({ state: 'detached' }); await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+ArrowRight'); await current(fixture[1].id); record('Restore reactivates a saved history destination', true);
  const sizes = [[1600, 900], [1200, 800], [800, 560], [390, 840]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(80);
    const layout = await page.evaluate(() => { const header = document.querySelector('.shell-topbar'), controls = document.querySelector('.note-history-controls'); return { header: header.clientWidth, shown: !controls.hidden, overflow: header.scrollWidth > header.clientWidth + 1, body: document.body.scrollWidth > innerWidth + 1 }; });
    record(`${width}px layout keeps navigation usable without toolbar overflow`, !layout.overflow && !layout.body && layout.shown === (layout.header >= 440));
  }
  await history(); await page.locator('[data-history-clear]').click();
  record('clearing visits keeps the current note and no prior history', await page.locator('[data-history-index]').count() === 1 && await page.locator('[data-history-clear]').isDisabled());
  await page.keyboard.press('Escape'); await current(fixture[1].id);
  record('clearing history leaves the note open', true);
  record('no uncaught errors', errors.length === 0);
  return { passed: true, syntheticOnly: true, native, checks, errors };
}
