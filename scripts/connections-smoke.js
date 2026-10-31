async page => {
  // Playwright CLI function; isolated profile/disposable NOTED_WORKSPACE only.
  await page.setViewportSize({width:1200,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const suffix=Date.now(),ids=[];
  for(const name of ['Alpha','Beta','Gamma']){
    const old=await page.locator('#header-connection-handle button').count()?await page.locator('#header-connection-handle button').getAttribute('data-connect-source'):null;
    await page.keyboard.press('Control+n');
    await page.waitForFunction(old=>!document.querySelector('#note-pane').inert&&document.querySelector('#header-connection-handle button')?.dataset.connectSource!==old,old);
    await page.locator('#note-title').fill(`${name} graph check ${suffix}`);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('Saved'));
    ids.push(await page.locator('#header-connection-handle button').getAttribute('data-connect-source'));
  }
  const content=page.getByRole('textbox',{name:'Note content',exact:true});
  await content.fill('Original words remain unchanged by connections.');await page.keyboard.press('Control+s');
  await content.press('Control+Home');await content.press('Control+Shift+ArrowRight');
  const selection=await page.evaluate(()=>getSelection().toString());
  await page.evaluate(()=>{window.__graphEditor=document.querySelector('#editor .tiptap');});
  await page.locator('#header-connection-handle button').click();
  await page.waitForFunction(()=>!document.querySelector('#connections-panel').hidden);
  assert(await page.evaluate(()=>getSelection().toString())===selection,'Opening graph lost text selection');
  assert(await page.locator('#connections-toggle').count()===0&&await page.locator('#connection-picker').count()===0,'Old connection interfaces remain');
  await page.locator('[data-graph-action=add]').click();
  for(const [i,name]of ['Alpha','Beta'].entries()){
    await page.locator('#connection-query').fill(`${name} graph check ${suffix}`);
    await page.waitForFunction(id=>document.querySelector(`[data-picker-connect="${id}"]`),ids[i]);
    await page.locator(`[data-picker-connect="${ids[i]}"]`).click();
    await page.waitForFunction(id=>document.querySelector(`[data-picker-connect="${id}"]`)?.disabled,ids[i]);
    assert(!await page.locator('#connections-panel').evaluate(el=>el.hidden),'Connecting closed graph');
    assert(await page.locator('#connection-picker-results').isVisible(),'Multi-connect results closed');
  }
  await page.locator('[data-graph-action=reset]').click();
  await page.locator(`[data-graph-node="${ids[0]}"]`).dispatchEvent('click');
  assert((await page.locator('#note-title').inputValue()).startsWith('Gamma'),'Selection navigated');
  await page.locator('[data-selected-action=remove]').click();
  await page.waitForFunction(()=>document.querySelector('#connection-toast').textContent.includes('removed'));
  await page.locator('#connection-undo').click();
  await page.waitForFunction(()=>document.querySelector('[data-selected-action=remove]'));
  const edgeKey=JSON.stringify([ids[2],ids[0]].sort());
  await page.locator('[data-graph-edge]').evaluateAll((elements,key)=>elements.find(el=>el.dataset.graphEdge===key).dispatchEvent(new MouseEvent('click',{bubbles:true})),edgeKey);
  const strength=page.locator('#connection-strength'),initial=Number(await strength.inputValue());
  await strength.evaluate(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert(await page.locator('#connection-strength-value').innerText()==='5','Strength preview missing');
  await strength.dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#connection-toast').textContent.includes('strength saved'));
  await page.locator('#connection-undo').click();
  await page.waitForFunction(value=>document.querySelector('#connection-strength')?.value===String(value),initial);
  assert(await page.evaluate(()=>window.__graphEditor===document.querySelector('#editor .tiptap')),'Graph recreated editor');
  assert(await content.innerText()==='Original words remain unchanged by connections.','Graph changed words');
  await page.keyboard.press('F8');
  assert(await page.locator('#connections-panel').evaluate(el=>el.hidden),'Focus mode left graph open');
  await page.keyboard.press('F8');
  if(await page.locator('[data-panel-toggle=notes]').getAttribute('aria-expanded')!=='true')await page.locator('[data-panel-toggle=notes]').click();
  const source=page.locator(`.note-card-shell[data-note-target="${ids[2]}"] [data-connect-source]`),target=page.locator(`.note-card-shell[data-note-target="${ids[1]}"]`);
  const a=await source.boundingBox(),b=await target.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});
  assert((await page.locator('.connection-ray-path').getAttribute('d')).includes(' C '),'Curved drag missing');
  await page.mouse.up();await page.waitForFunction(()=>document.querySelector('#connection-toast').textContent.includes('Already connected'));
  await page.locator(`.note-card-shell[data-note-target="${ids[0]}"] [data-connect-source]`).click();
  await page.waitForFunction(()=>document.querySelector('#connection-source-title').textContent.startsWith('From: Alpha'));
  assert((await page.locator('#note-title').inputValue()).startsWith('Gamma'),'Card graph navigated editor');
  await page.keyboard.press('Escape');
  await page.locator('#header-connection-handle button').focus();await page.keyboard.press('Enter');
  assert(await page.locator('#connection-query').evaluate(el=>el===document.activeElement),'Keyboard opening did not focus search');
  await page.keyboard.press('Escape');await page.reload();
  await page.waitForFunction(()=>document.querySelector('#note-title')?.value.startsWith('Gamma'));
  await page.locator('#header-connection-handle button').click();
  await page.waitForFunction(source=>[...document.querySelectorAll('[data-graph-edge]')].filter(el=>JSON.parse(el.dataset.graphEdge).includes(source)).length===2,ids[2]);
  return {passed:true,multiConnect:true,selection:true,strengthUndo:true,cardSource:true,focusMode:true,keyboard:true,dragDuplicate:true,persistence:true};
}
