async page => {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:1436' || await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__))) throw new Error('Generated browser title fixture required');
  const fixture = await page.evaluate(() => JSON.parse(localStorage.getItem('noted-sidebar-fixture') || 'null'));
  if (!fixture?.notes?.length) throw new Error('Generated sidebar notes required');
  const checks = [], profiles = [], errors = [], record = (name, okay) => { if (!okay) throw new Error(name); checks.push(name); };
  page.on('pageerror', error => errors.push(error.message));
  await page.reload(); await page.waitForFunction(() => document.querySelector('#note-title')?.value);
  const title = page.getByRole('textbox', { name: 'Note title', exact: true });
  const fallbackSizing = await title.evaluate(field => field.style.getPropertyValue('field-sizing') === 'fixed');
  const long = 'A long synthetic document title that stays fully readable beside the folder directory and saved connections graph as the writing area changes width';
  await title.fill(long); await page.keyboard.press('Control+s'); await page.waitForFunction(() => document.querySelector('#save-state').textContent.includes('Saved'));
  await page.reload(); await page.waitForFunction(value => document.querySelector('#note-title')?.value === value, long);
  record('long title saves and reopens as the same metadata value', true);
  const browse = page.locator('[data-panel-toggle=navigation]'); if (await browse.getAttribute('aria-expanded') !== 'true') await browse.click();
  for (const mode of ['light', 'dark']) {
    await page.setViewportSize({ width: 1200, height: 800 }); await page.locator('#appearance-toggle').click(); await page.locator('#appearance-mode').selectOption(mode); await page.keyboard.press('Escape');
    for (const [width, height, zoom] of [[1200,800,100],[800,560,100],[390,840,100],[800,600,200]]) {
      await page.setViewportSize({ width, height }); await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom === 100 ? '' : zoom + '%'; }, zoom); await page.waitForTimeout(240);
      const geometry = await title.evaluate(field => { const r=field.getBoundingClientRect(),s=getComputedStyle(field); return { width:r.width,height:r.height,lineHeight:parseFloat(s.lineHeight),verticalOverflow:field.scrollHeight>field.clientHeight+1,horizontalOverflow:field.scrollWidth>field.clientWidth+1,documentOverflow:document.documentElement.scrollWidth>innerWidth+1,fieldSizing:s.getPropertyValue('field-sizing') }; });
      record(`${mode} ${width}px ${zoom}% title wraps without internal overflow`, geometry.height > geometry.lineHeight * 1.5 && !geometry.verticalOverflow && !geometry.horizontalOverflow && !geometry.documentOverflow);
      profiles.push({mode,width,height,zoom,geometry});
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize=''; }); await page.setViewportSize({width:390,height:840});
  await title.focus(); await page.keyboard.press('Control+Enter');
  record('Control Enter leaves the title and keyboard focus unchanged', await title.inputValue() === long && await title.evaluate(field => field === document.activeElement));
  await page.locator('#editor .tiptap').focus(); await page.keyboard.press('Control+Home'); await title.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  record('Enter moves from the title into the existing note body', await page.locator('#editor .tiptap').evaluate(el => el === document.activeElement));
  record('Enter reveals the writing position below a long title', await page.evaluate(() => { const p=document.querySelector('#editor .tiptap p').getBoundingClientRect(),v=document.querySelector('.document-scroll').getBoundingClientRect();return p.top>=v.top-1&&p.bottom<=v.bottom+1; }));
  await title.fill('Pasted synthetic\nsecond line'); record('pasted title line breaks become spaces', await title.inputValue() === 'Pasted synthetic second line');
  await page.keyboard.press('Control+s'); await page.waitForFunction(() => document.querySelector('#save-state').textContent.includes('Saved'));
  await title.fill(long); const expanded = await title.evaluate(field => field.clientHeight);
  await title.fill('Short synthetic title'); const compact = await title.evaluate(field => field.clientHeight);
  record('the title shrinks again after shortening', expanded > compact);
  await title.fill(long); await page.keyboard.press('Control+s'); await page.waitForFunction(() => document.querySelector('#save-state').textContent.includes('Saved'));
  await page.screenshot({path:`output/playwright/note-title-${fallbackSizing?'fallback':'native-sizing'}-dark-390.png`});
  record('title workflow has no uncaught browser errors', errors.length === 0);
  return {passed:true,native:false,syntheticOnly:true,fallbackSizing,checks,profiles,errors};
}
