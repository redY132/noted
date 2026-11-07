async page => {
  const native = await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__));
  if (native) { const status = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('workspace_status')); if (!status.path.includes('noted-sidebar-ui-')) throw new Error('Disposable outline workspace required'); }
  else if (new URL(page.url()).origin !== 'http://127.0.0.1:1436') throw new Error('Isolated outline preview required');
  if (!await page.evaluate(() => localStorage.getItem('noted-sidebar-fixture'))) throw new Error('Synthetic fixture required');
  const fixture = await page.evaluate(async native => {
    const api = native ? null : (await import('/src/api.ts')).api;
    const create = title => native ? window.__TAURI_INTERNALS__.invoke('create_note', { title, folderId: null }) : api.createNote(title, null);
    const save = note => native ? window.__TAURI_INTERNALS__.invoke('save_note', { note, expectedRevision: note.revision }) : api.save(note, note.revision);
    const note = await create(`Synthetic outline navigation ${Date.now()}`), parts = [], order = [], headings = [];
    for (let index = 0; index < 130; index++) {
      const id = crypto.randomUUID(), paragraph = crypto.randomUUID(); headings.push(id); order.push(id, paragraph);
      const text = index === 0 ? 'Visually first heading' : index === 1 ? 'Logical first heading' : index === 2 ? 'A deliberately long synthetic heading '.repeat(12) + 'searchable-tail' : index === 120 ? 'Synthetic target section 120' : `Synthetic section ${String(index).padStart(3, '0')}`;
      parts.push({ type: 'heading', attrs: { id, level: index % 6 + 1 }, content: [{ type: 'text', text }] }, { type: 'paragraph', attrs: { id: paragraph }, content: [{ type: 'text', text: `Synthetic section ${index} keeps original wording and reading order.` }] });
    }
    const codeId = crypto.randomUUID(); parts.push({ type: 'codeBlock', attrs: { id: codeId }, content: [{ type: 'text', text: '# This source text is not a heading.' }] }); order.push(codeId);
    const logical = [...order.slice(2, 4), ...order.slice(0, 2), ...order.slice(4)];
    delete note.document; note.formatVersion = 1; note.content = { type: 'doc', attrs: { readingOrder: logical }, content: parts }; await save(note);
    const empty = await create(`Synthetic outline empty ${Date.now()}`);
    const reference=await create(`Synthetic outline reference ${Date.now()}`);delete reference.document;reference.formatVersion=1;reference.content={type:'doc',content:[{type:'paragraph',attrs:{id:crypto.randomUUID()},content:[{type:'text',text:'Open the synthetic target section',marks:[{type:'link',attrs:{href:`noted://note/${note.id}#block=${headings[120]}`}}]}]}]};await save(reference);
    return { note: { id: note.id, title: note.title }, empty: { id: empty.id, title: empty.title }, reference:{id:reference.id,title:reference.title}, headings };
  }, native);
  const checks = [], errors = [], record = (name, value) => { if (!value) throw new Error(name); checks.push(name); }; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1200, height: 800 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const browse = page.locator('[data-panel-toggle=navigation]'); if (await browse.getAttribute('aria-expanded') === 'true') await browse.click();
  const open = async note => { await page.keyboard.press('Control+p'); await page.locator('#quick-open-search').fill(note.title); await page.locator(`[data-quick-note="${note.id}"]`).click(); await page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource === id, note.id); };
  const outline = async () => { await page.locator('#view-toggle').click(); await page.locator('#shell-go-heading').click(); await page.locator('.document-outline-dialog').waitFor({ state: 'visible' }); };
  const revision = async id => page.evaluate(async ({ native, id }) => (native ? await window.__TAURI_INTERNALS__.invoke('load_note', { id }) : await (await import('/src/api.ts')).api.load(id)).revision, { native, id });
  await open(fixture.note); const before = await revision(fixture.note.id); await page.evaluate(() => { window.__outlineEditor = document.querySelector('#editor .tiptap'); });
  await outline();
  record('outline follows logical order instead of visual object order', (await page.locator('[data-outline-index="0"] strong').innerText()) === 'Logical first heading');
  record('heading results are exposed as a named region',await page.getByRole('region',{name:'Headings in this note',exact:true}).isVisible());
  record('large outlines initially render 40 rows', await page.locator('[data-outline-index]').count() === 40);
  await page.locator('[data-outline-search]').fill('section 120');
  const composingEscape=await page.locator('[data-outline-search]').evaluate(field=>{const event=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,isComposing:true});field.dispatchEvent(event);return event.defaultPrevented;});
  record('composing Escape keeps heading search open and focused',!composingEscape&&await page.locator('.document-outline-dialog').isVisible()&&await page.locator('[data-outline-search]').evaluate(el=>el===document.activeElement));
  await page.locator('[data-outline-search]').fill('');
  await page.locator('[data-outline-more]').click(); record('paging focuses the first new heading', await page.locator('[data-outline-index="40"]').evaluate(el => el === document.activeElement));
  await page.locator('[data-outline-more]').click(); await page.locator('[data-outline-more]').click(); record('last page includes every heading and hides More', await page.locator('[data-outline-index]').count() === 130 && await page.locator('[data-outline-more]').isHidden());
  await page.locator('[data-outline-search]').fill('searchable-tail'); record('search includes the full long title while displaying a bounded label', await page.locator('[data-outline-index]').count() === 1 && (await page.locator('[data-outline-index] strong').innerText()).length <= 241);
  await page.locator('[data-outline-search]').fill('target section 120'); await page.keyboard.press('Enter');
  await page.waitForFunction(id => window.getSelection()?.anchorNode?.parentElement?.closest('[data-id]')?.getAttribute('data-id') === id, fixture.headings[120]);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  record('Enter selects the matching stable block and scrolls the document', await page.locator('.document-scroll').evaluate(el => el.scrollTop > 1000));
  record('heading navigation preserves the editor and dock visibility', await page.evaluate(() => window.__outlineEditor === document.querySelector('#editor .tiptap')) && await browse.getAttribute('aria-expanded') === 'false');
  record('heading navigation does not write a note revision', await revision(fixture.note.id) === before);
  const writer = page.locator('#editor .tiptap'); await writer.focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' Synthetic outline Undo marker.');
  await outline(); await page.locator('[data-outline-search]').fill('target section 120'); await page.keyboard.press('Enter'); await writer.focus(); await page.keyboard.press('Control+z');
  record('Undo survives a heading jump', !(await writer.innerText()).includes('Synthetic outline Undo marker.'));
  await writer.focus(); await page.keyboard.press('Control+End'); await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft');
  const selected = await page.evaluate(() => window.getSelection().toString()), top = await page.locator('.document-scroll').evaluate(el => el.scrollTop);
  await outline(); await page.locator('[data-outline-search]').fill('there-is-no-heading');
  record('filtered-empty outline explains recovery', (await page.locator('[data-outline-status]').innerText()).includes('No matching headings'));
  await page.keyboard.press('Control+p'); record('quick open cannot replace another modal', await page.locator('.document-outline-dialog').isVisible() && !await page.locator('.quick-open-dialog').isVisible());
  await page.keyboard.press('Escape'); record('one Escape closes the outline and makes it inert', await page.locator('.document-outline-dialog').evaluate(el => !el.open && el.inert));
  await writer.focus(); record('cancelling preserves selection and reading position', await page.evaluate(() => window.getSelection().toString()) === selected && Math.abs(await page.locator('.document-scroll').evaluate(el => el.scrollTop) - top) < 2);
  await open(fixture.reference);await page.locator('#editor .tiptap a').click();await page.waitForFunction(id=>window.getSelection()?.anchorNode?.parentElement?.closest('[data-id]')?.getAttribute('data-id')===id,fixture.headings[120]);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  record('block links from another note reveal their destination',await page.locator('.document-scroll').evaluate(el=>el.scrollTop>1000));
  await open(fixture.empty); await outline(); record('notes without headings provide useful guidance', (await page.locator('[data-outline-status]').innerText()).includes('No headings yet') && await page.locator('[data-outline-index]').count() === 0); await page.keyboard.press('Escape');
  await open(fixture.note); if (await browse.getAttribute('aria-expanded') !== 'true') await browse.click();
  const measure = async () => page.locator('.document-outline-dialog').evaluate(root => {
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true }); canvas.width = canvas.height = 1;
    const color = value => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
    const lum = rgb => rgb.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0), contrast = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    const background = el => { for (let p = el; p; p = p.parentElement) { const c = color(getComputedStyle(p).backgroundColor); if (c[3] === 255) return c; } return [255, 255, 255, 255]; };
    const visible = el => { if (!el.getClientRects().length || el.closest('[hidden]')) return false; const r = el.getBoundingClientRect(); for (let p = el.parentElement; p && p !== root; p = p.parentElement) { const s = getComputedStyle(p), clip = p.getBoundingClientRect(); if (/auto|scroll|hidden/.test(s.overflowY) && (r.top >= clip.bottom || r.bottom <= clip.top)) return false; } return true; };
    const failures = [], ratios = []; const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const node = walker.currentNode, el = node.parentElement; if (!node.textContent.trim() || !visible(el)) continue; const ratio = contrast(color(getComputedStyle(el).color), background(el)); ratios.push(ratio); if (ratio < 4.5) failures.push('text contrast'); }
    for (const el of root.querySelectorAll('button,input')) { if (!visible(el)) continue; const r = el.getBoundingClientRect(), s = getComputedStyle(el); if (r.width < 43.9 || r.height < 43.9) failures.push('target size'); if (el.matches('input') && contrast(color(s.borderTopColor), background(el)) < 3) failures.push('field boundary'); if (el.matches(':focus-visible') && s.outlineStyle !== 'none' && contrast(color(s.outlineColor), background(el)) < 3) failures.push('focus contrast'); }
    const r = root.getBoundingClientRect(); if (r.left < 0 || r.right > innerWidth + 1 || r.top < 0 || r.bottom > innerHeight + 1 || root.scrollWidth > root.clientWidth + 1) failures.push('overflow');
    return { minimumTextContrast: Math.min(...ratios), failures };
  });
  const profiles = [];
  for (const mode of ['light', 'dark']) {
    await page.setViewportSize({ width: 1200, height: 800 }); await page.locator('#appearance-toggle').click(); await page.locator('#appearance-mode').selectOption(mode); await page.keyboard.press('Escape');
    for (const [width, height] of [[1200, 800], [800, 560], [390, 840]]) {
      await page.setViewportSize({ width, height }); await outline(); await page.locator('[data-outline-search]').focus(); const result = await measure(); if (result.failures.length) throw new Error(JSON.stringify({ mode, width, result }));
      await page.screenshot({ path: `output/playwright/outline-${native ? 'native' : 'preview'}-${mode}-${width}.png` }); profiles.push({ mode, width, height, ...result }); await page.keyboard.press('Escape');
    }
  }
  await page.setViewportSize({ width: 800, height: 600 }); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await outline();
  const largeText = await measure(); if (largeText.failures.length) throw new Error(JSON.stringify({ largeText })); await page.screenshot({ path: `output/playwright/outline-${native ? 'native' : 'preview'}-text-200.png` }); await page.keyboard.press('Escape'); await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  record('no uncaught errors', errors.length === 0);
  return { passed: true, native, syntheticOnly: true, noModelCalls: true, checks, profiles, largeText, errors };
}
