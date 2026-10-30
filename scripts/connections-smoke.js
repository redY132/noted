async page => {
  // Isolated profile/disposable native workspace only. Never a user's notes.
  for(const title of ['Alpha connection check','Beta connection check','Gamma connection check']) {
    const headerHandle=page.locator('#header-connection-handle button');
    const previous=await headerHandle.count()?await headerHandle.getAttribute('data-connect-source'):null;
    await page.keyboard.press('Control+n');
    await page.waitForFunction(previous=>!document.querySelector('#note-pane').inert&&document.querySelector('#header-connection-handle button')?.dataset.connectSource!==previous,previous);
    await page.locator('#note-title').fill(title);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('Saved'));
  }
  const content=page.getByRole('textbox',{name:'Note content',exact:true});
  await content.fill('Original words remain unchanged by connections.');
  await page.keyboard.press('Control+s');
  await page.locator('#header-connection-handle button').click();
  await page.locator('#connection-query').fill('Alpha connection check');
  await page.waitForFunction(()=>document.querySelectorAll('#connection-picker-results [data-picker-connect]').length===1);
  await page.locator('#connection-picker-results [data-picker-connect]').click();
  await page.waitForFunction(()=>document.querySelector('#connection-picker-results [data-picker-connect]')?.disabled);
  if(await page.locator('#connection-picker').isHidden())throw Error('Multi-connect picker closed');
  await page.keyboard.press('Escape');
  if(await page.locator('#connections-panel').isHidden())await page.locator('#connections-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#connections-saved').textContent.includes('Alpha connection check'));
  await page.locator('#connections-saved [data-remove-connection]').click();
  await page.waitForFunction(()=>!document.querySelector('#connections-saved [data-remove-connection]'));
  await page.locator('#connection-undo').click();
  await page.waitForFunction(()=>document.querySelector('#connections-saved [data-remove-connection]'));
  const handle=page.locator('.note-card-shell').filter({hasText:'Gamma connection check'}).first().locator('[data-connect-source]');
  const target=page.locator('.note-card-shell').filter({hasText:'Beta connection check'}).first();
  const a=await handle.boundingBox(),b=await target.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});
  await page.waitForFunction(()=>!document.querySelector('#connection-ray').hasAttribute('hidden'));
  await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('#connections-saved').textContent.includes('Beta connection check'));
  if(await page.locator('#note-title').inputValue()!=='Gamma connection check')throw Error('Drop navigated');
  if(await content.innerText()!=='Original words remain unchanged by connections.')throw Error('Connection changed text');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#connections-saved').textContent.includes('Beta connection check'));
}
