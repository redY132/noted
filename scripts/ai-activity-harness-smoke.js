async page => {
  if (page.url() !== 'http://127.0.0.1:1436/experiments/ai-activity/' || await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__))) throw new Error('Browser-only activity fixture required');
  await page.reload();
  await page.waitForFunction(() => window.__notedActivityHarness?.ids.length === 2);
  const checks = [], record = (name, okay) => { if (!okay) throw new Error(name); checks.push(name); };
  await page.setViewportSize({ width: 1200, height: 800 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const ids = await page.evaluate(() => window.__notedActivityHarness.ids);
  const start = async (phase = 'running') => {
    await page.evaluate(phase => { window.__notedActivityHarness.state.nextPhase = phase; }, phase);
    await page.locator('#fixture-open-ai').click(); await page.locator('[data-ai-prompt]').fill('Make the first paragraph bold.');
    await page.waitForFunction(() => !document.querySelector('[data-subscription-send]').disabled);
    await page.locator('[data-subscription-send]').evaluate(el => { el.click(); el.click(); });
  };
  const running = () => page.waitForFunction(() => document.querySelector('[data-activity-state]').textContent === 'Generating proposal');
  const comparison = () => page.waitForFunction(() => document.querySelector('#document-operations-dialog').open && !document.querySelector('[data-operations-apply]').disabled, null, { timeout: 60000 });
  await start(); await running(); record('duplicate clicks create one simulated job', await page.evaluate(() => window.__notedActivityHarness.state.starts === 1));
  await page.locator('[data-ai-close]').click();
  record('closed AI dialog is inert', await page.locator('.ai-formatting-dialog').evaluate(el => !el.open && el.inert));
  await page.locator('#fixture-other').click(); await page.waitForFunction(id => window.__notedActivityHarness.current() === id, ids[1]);
  await page.locator('#editor .tiptap').focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' Synthetic draft before proposal navigation.');
  const reads = await page.evaluate(() => window.__notedActivityHarness.state.requestReads.length);
  await page.evaluate(() => window.__notedActivityHarness.finish()); await page.waitForFunction(() => document.querySelector('[data-activity-state]').textContent === 'Proposal ready');
  record('closed-dialog completion reads only owned job metadata', await page.evaluate(reads => window.__notedActivityHarness.state.requestReads.length === reads, reads));
  record('background completion leaves the other note editable', await page.evaluate(id => window.__notedActivityHarness.current() === id && !document.querySelector('#document-operations-dialog').open, ids[1]));
  await page.locator('[data-activity-open]').click(); await comparison();
  record('Review returns to the originating note and opens comparison directly', await page.evaluate(id => window.__notedActivityHarness.current() === id, ids[0]));
  await page.locator('[aria-label="Close document operations"]').click(); record('closing comparison retains ready status', await page.locator('.ai-job-status').isVisible());
  await page.locator('[data-activity-open]').click(); await comparison(); await page.locator('[data-review-reject]').click();
  await page.waitForFunction(() => document.querySelector('.ai-job-status').hidden); record('Reject clears only the selected activity', true);
  await page.locator('#fixture-other').click(); await page.waitForFunction(id => window.__notedActivityHarness.current() === id, ids[1]);
  record('return-to-proposal saves the other draft first', (await page.locator('#editor .tiptap').innerText()).includes('Synthetic draft before proposal navigation.'));
  await page.locator('#fixture-other').click(); await page.waitForFunction(id => window.__notedActivityHarness.current() === id, ids[0]);
  const beforeFormatting=await page.locator('#editor .tiptap').innerHTML();
  await start('completed'); await comparison(); await page.locator('[data-operations-apply]').click();
  await page.waitForFunction(() => document.querySelector('#editor strong') && !document.querySelector('[data-ai-outcome]').hidden);
  record('Apply clears activity and retains Undo', await page.locator('.ai-job-status').isHidden());
  await page.locator('[data-ai-undo]').click(); await page.waitForFunction(() => document.querySelector('[data-ai-outcome-text]').textContent.includes('undone'));
  record('Undo restores original formatting', await page.locator('#editor .tiptap').innerHTML() === beforeFormatting);
  await start(); await running(); await page.locator('[data-ai-close]').click(); await page.locator('[data-activity-open]').click(); await page.locator('[data-subscription-stop]').click();
  await page.waitForFunction(() => document.querySelector('[data-activity-state]').textContent === 'Cancellation reported'); record('Cancel removes only its owned simulated request and waits for local status', await page.evaluate(() => window.__notedActivityHarness.state.cancels === 1 && !window.__notedActivityHarness.state.row));
  await page.locator('[data-ai-close]').click(); await page.locator('[data-activity-dismiss]').click(); await start(); await running(); await page.evaluate(() => { window.__notedActivityHarness.state.failStatus = true; }); await page.locator('[data-ai-close]').click();
  await page.waitForFunction(() => document.querySelector('[data-activity-state]').textContent.includes('unavailable')); record('failed status is visible without claiming completion', true);
  await page.evaluate(() => { window.__notedActivityHarness.state.failStatus = false; }); await page.locator('[data-activity-open]').click(); await running();
  record('explicit reopening retries status without starting another job', await page.evaluate(() => window.__notedActivityHarness.state.starts === 4));
  await page.locator('[data-subscription-stop]').click(); await page.waitForFunction(() => document.querySelector('[data-activity-state]').textContent === 'Cancellation reported'); await page.locator('[data-ai-close]').click(); await page.locator('[data-activity-dismiss]').click();
  await page.locator('#note-title').fill('Synthetic activity with a deliberately long title that wraps safely in the narrow writing area without covering the document or its controls');
  await start(); await running(); await page.locator('[data-ai-close]').click();
  const measure = async () => page.locator('.ai-job-status').evaluate(root => {
    const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number), lum = a => a.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0), ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    const background = el => { for (let p = el; p; p = p.parentElement) { const color = getComputedStyle(p).backgroundColor, values = color.match(/[\d.]+/g).map(Number); if (values.length < 4 || values[3] === 1) return values.slice(0, 3); } return [255, 255, 255]; };
    const failures = [], ratios = [], bounds = root.getBoundingClientRect();
    for (const el of root.querySelectorAll('strong,span,button')) {
      if (el.closest('[hidden]')) continue; const style = getComputedStyle(el), r = el.getBoundingClientRect(), bg = background(el), contrast = ratio(rgb(style.color), bg); ratios.push(contrast);
      if (contrast < 4.5) failures.push('text contrast'); if (el.matches('button') && (r.width < 43.9 || r.height < 43.9)) failures.push('target size');
      if (el.matches(':focus-visible') && style.outlineStyle !== 'none' && ratio(rgb(style.outlineColor), bg) < 3) failures.push('focus contrast');
      if (el === document.activeElement && (r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1)) failures.push('focused target clipped');
    }
    const r = root.getBoundingClientRect(), main = document.querySelector('.workspace').getBoundingClientRect(), pane = document.querySelector('#note-pane').getBoundingClientRect();
    if (r.left < main.left - 1 || r.right > main.right + 1 || root.scrollWidth > root.clientWidth + 1 || pane.top < r.bottom - 1 || r.right > innerWidth + 1) failures.push('overflow or overlap');
    return { minimumTextContrast: Math.min(...ratios), failures };
  });
  const profiles = [];
  for (const phase of ['running', 'ready']) {
    if (phase === 'ready') { await page.evaluate(() => window.__notedActivityHarness.finish()); await page.waitForFunction(() => document.querySelector('[data-activity-state]').textContent === 'Proposal ready'); }
    for (const mode of ['light', 'dark']) {
      await page.locator('#fixture-theme').selectOption(mode);
      for (const [width, height, writing] of [[1200, 800, 'full'], [1200, 800, '280'], [800, 560, 'full'], [390, 840, 'full']]) {
        await page.setViewportSize({ width, height }); await page.locator('#fixture-width').selectOption(writing); await page.locator('[data-activity-open]').focus(); await page.keyboard.press('ArrowRight');
        const result = await measure(); if (result.failures.length) throw new Error(JSON.stringify({ phase, mode, width, writing, result }));
        await page.screenshot({ path: `output/playwright/activity-${phase}-${mode}-${width}-${writing}.png` }); profiles.push({ phase, mode, width, height, writing, ...result });
      }
    }
  }
  await page.setViewportSize({ width: 800, height: 600 }); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.waitForFunction(() => { const target = document.querySelector('[data-activity-open]').getBoundingClientRect(), root = document.querySelector('.ai-job-status').getBoundingClientRect(); return target.top >= root.top - 1 && target.bottom <= root.bottom + 1; });
  const largeText = await measure(); if (largeText.failures.length) throw new Error(JSON.stringify({ largeText }));
  await page.screenshot({ path: 'output/playwright/activity-text-200.png' }); await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.locator('[data-activity-dismiss]').click(); record('Dismiss status retains the saved proposal', await page.evaluate(() => document.querySelector('.ai-job-status').hidden && window.__notedActivityHarness.state.row.status === 'ready'));
  record('Dismiss status returns keyboard focus to writing', await page.locator('#editor .tiptap').evaluate(el => el === document.activeElement));
  await page.locator('#editor .tiptap').focus();await page.keyboard.press('Control+a');await page.keyboard.press('Control+b');
  await page.locator('#fixture-open-ai').click();await page.locator('[data-ai-preview]:not([hidden])').waitFor();await page.locator('[data-ai-preview]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ai-status]').textContent.toLowerCase().includes('outdated'));
  record('saving a manual formatting draft invalidates an older proposal before comparison',!await page.locator('#document-operations-dialog').isVisible()&&await page.evaluate(()=>window.__notedActivityHarness.state.starts===5));
  await page.locator('[data-ai-close]').click();
  record('the harness recorded no unexpected errors', await page.evaluate(() => window.__notedActivityHarness.errors.length === 0));
  return { passed: true, browserOnly: true, simulatedAIAndAccount: true, checks, profiles, largeText };
}
