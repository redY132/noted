async page => {
  await page.locator('#view-toggle').click();
  await page.locator('[data-panel-choice=formatting]').setChecked(true);
  await page.locator('[data-panel-choice=components]').setChecked(true);
  await page.keyboard.press('Escape');
  // Run in an isolated browser profile or a disposable native workspace only.
  // Generate output/playwright/two-frame.gif from the experiment fixture first.
  const previous = await page.locator('#header-connection-handle button').count() ? await page.locator('#header-connection-handle button').getAttribute('data-connect-source') : null;
  await page.keyboard.press('Control+n');
  await page.waitForFunction(previous => !document.querySelector('#note-pane').inert && document.querySelector('#header-connection-handle button')?.dataset.connectSource !== previous, previous);
  await page.getByRole('textbox', { name: 'Note title', exact: true }).fill('Artistic integration check');
  const content = page.getByRole('textbox', { name: 'Note content', exact: true });
  await content.fill('Long scrolling text remains editable. '.repeat(400));
  const scroll = page.locator('.document-scroll');
  const bounds = await scroll.evaluate(el => ({height:el.clientHeight,total:el.scrollHeight,bottom:el.getBoundingClientRect().bottom,viewport:innerHeight}));
  if (!(bounds.total > bounds.height && bounds.height > 60 && bounds.bottom <= bounds.viewport)) throw new Error('Document is not constrained to a usable scroll area: '+JSON.stringify(bounds));
  await scroll.hover(); await page.mouse.wheel(0, 1200);
  await page.waitForFunction(() => document.querySelector('.document-scroll').scrollTop > 300);
  await content.fill('Every original word stays in this free panel.');
  await content.press('Control+a');
  await page.locator('#make-panel').click();
  await page.getByRole('combobox', {name:'Component placement'}).selectOption('free');
  const field = async (name, value) => { const input = page.getByRole('spinbutton', {name,exact:true}); await input.fill(String(value)); await input.press('Tab'); };
  await field('Component width', 320);
  await field('Component X', 1200); await field('Component Y', 1500);
  await field('Component layer', 3);
  await page.waitForFunction(() => document.querySelector('.document-scroll').scrollWidth > 1500 && document.querySelector('.document-scroll').scrollHeight > 1800);
  const move = page.locator('.note-panel > .component-move');
  await move.scrollIntoViewIfNeeded();
  const before = await page.locator('.note-panel').evaluate(el => ({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
  const rect = await move.boundingBox();
  await page.mouse.move(rect.x+10,rect.y+10); await page.mouse.down();
  await page.mouse.move(rect.x+70,rect.y+50,{steps:8}); await page.mouse.up();
  const after = await page.locator('.note-panel').evaluate(el => ({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
  if (Math.abs(after.x-before.x-60)>2 || Math.abs(after.y-before.y-40)>2) throw new Error('Free drag did not preserve pointer displacement: '+JSON.stringify({before,after}));
  await page.getByRole('button', {name:'Undo',exact:true}).click();
  if (await page.locator('.note-panel').evaluate(el=>parseFloat(el.style.left)) !== before.x) throw new Error('Free drag undo failed');
  await page.getByRole('button', {name:'Redo',exact:true}).click();
  await page.getByRole('combobox', {name:'Component placement'}).selectOption('flow');
  if (!(await content.innerText()).includes('Every original word stays')) throw new Error('Returning to flow lost text');
  await page.getByRole('combobox', {name:'Component placement'}).selectOption('free');
  await field('Component X', 40); await field('Component Y', 70);
  await page.getByRole('combobox', {name:'Component animation'}).selectOption('float');
  // Decorative motion deliberately prevents Playwright's stable-element wait.
  await page.locator('.note-panel').evaluate(el => el.scrollIntoView({block:'center'}));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.note-panel')).animationName === 'noted-float');
  await page.locator('#motion-control').click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.note-panel')).animationName === 'none');
  await page.locator('#motion-control').click();
  await page.locator('#image-file').setInputFiles('output/playwright/two-frame.gif');
  const gif = page.locator('.local-image img');
  await gif.evaluate(el => el.scrollIntoView({block:'center'}));
  await page.waitForFunction(() => document.querySelector('.local-image img')?.naturalWidth > 0);
  await page.waitForFunction(() => document.querySelector('.local-image img')?.dataset.gifPlaying === 'true');
  const colors = new Set();
  for (let i=0;i<8;i++) {
    const rect = await gif.boundingBox();
    const pixel = await page.screenshot({clip:{x:Math.ceil(rect.x+rect.width/2),y:Math.ceil(rect.y+rect.height/2),width:1,height:1}});
    colors.add(pixel.toString('base64'));
    await page.waitForTimeout(150);
  }
  if (colors.size < 2) throw new Error('GIF did not animate in rendered screenshots');
  await page.locator('#motion-control').click();
  await page.waitForFunction(() => document.querySelector('.local-image img')?.getAttribute('src')?.startsWith('data:image/png'));
  await page.locator('#motion-control').click();
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.querySelector('#save-state')?.textContent?.includes('Saved'));
  await page.reload();
  await page.locator('.local-image img').evaluate(el => el.scrollIntoView({block:'center'}));
  await page.waitForFunction(() => document.querySelector('.local-image img')?.naturalWidth > 0);
  if (await page.locator('.note-panel').getAttribute('data-placement') !== 'free') throw new Error('Placement not saved');
  if (await page.locator('.note-panel').evaluate(el=>parseFloat(el.style.left)) !== 40) throw new Error('X not saved');
  if (!(await content.innerText()).includes('Every original word stays')) throw new Error('Reload lost text');
}
