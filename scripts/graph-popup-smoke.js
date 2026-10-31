async page => {
  // Playwright CLI function; disposable create-graph-fixture.mjs workspace only.
  await page.setViewportSize({width:1200,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  const source='10000000-0000-4000-8000-000000000001';
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  if(!await page.locator('#connections-panel').evaluate(el=>el.hidden))await page.locator('#connections-close').click();
  if(await page.locator('[data-panel-toggle=notes]').getAttribute('aria-expanded')!=='true')await page.locator('[data-panel-toggle=notes]').click();
  await page.locator('#search').fill('Orchard notebook');await page.locator(`[data-note="${source}"]`).click();await page.waitForFunction(()=>document.querySelector('#note-title')?.value==='Orchard notebook');await page.locator('#search').fill('');
  const content=await page.getByRole('textbox',{name:'Note content',exact:true}).innerText(),revision=await page.locator('#revision-label').innerText();
  await page.locator('#header-connection-handle button').click();await page.waitForFunction(()=>document.querySelector('#connection-graph').dataset.layoutState==='settled');
  const candidate=page.locator('.connection-node.suggested').first(),first=await candidate.getAttribute('data-graph-node');
  await candidate.locator('circle').click();await page.waitForFunction(()=>!document.querySelector('#connection-node-popup').hidden);
  assert(await page.locator('#note-title').inputValue()==='Orchard notebook','Click navigated without choosing Open note');
  assert(await page.locator('[data-node-action=open]').isEnabled()&&await page.locator('[data-node-action=connect]').isEnabled(),'Popup did not offer Open and Connect');
  const arrow=await page.locator('#connection-node-popup').evaluate(el=>({side:el.dataset.side,size:getComputedStyle(el,'::after').width,position:getComputedStyle(el).position}));
  assert(['above','below'].includes(arrow.side)&&arrow.size==='11px'&&arrow.position==='fixed','Popup arrow is missing');
  await page.screenshot({path:'output/playwright/graph-node-popup.png'});
  await page.keyboard.press('Escape');assert(await page.locator('#connections-panel').evaluate(el=>!el.hidden),'Escape closed graph instead of popup');
  await page.locator(`[data-graph-node="${first}"] circle`).click({modifiers:['Control']});
  const second=await page.evaluate(first=>{const popup=document.querySelector('#connection-node-popup').getBoundingClientRect();return [...document.querySelectorAll('.connection-node.suggested')].filter(el=>el.dataset.graphNode!==first).find(el=>{const r=el.querySelector('circle').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return x<popup.left-10||x>popup.right+10||y<popup.top-10||y>popup.bottom+10;})?.dataset.graphNode;},first);
  assert(Boolean(second),'No second suggested node available');await page.locator(`[data-graph-node="${second}"] circle`).click({modifiers:['Control']});
  assert(await page.locator('.batch-selected').count()===2,'Ctrl+click did not select two nodes');assert((await page.locator('#connection-popup-title').innerText())==='2 notes selected','Batch source actions missing');
  await page.screenshot({path:'output/playwright/graph-multi-selection.png'});
  await page.locator('[data-node-action=connect-selected]').click();await page.waitForFunction(()=>document.querySelector('#connection-toast').textContent.includes('Connected 2 notes'));
  await page.waitForFunction(({source,first,second})=>[...document.querySelectorAll('[data-graph-edge]')].filter(el=>{const ids=JSON.parse(el.dataset.graphEdge);return ids.includes(source)&&(ids.includes(first)||ids.includes(second));}).length===2,{source,first,second});
  const rootEdges=await page.locator('[data-graph-edge]').evaluateAll((els,{source,first,second})=>els.map(el=>JSON.parse(el.dataset.graphEdge)).filter(ids=>ids.includes(source)&&(ids.includes(first)||ids.includes(second))).length,{source,first,second});
  assert(rootEdges===2,'Batch did not save both source connections');
  assert(await page.locator(`[data-graph-edge='${JSON.stringify([first,second].sort())}']`).count()===0,'Batch created an unwanted link between selected notes');
  await page.locator('#connection-undo').click();await page.waitForFunction(()=>document.querySelector('#connection-toast').textContent.includes('Connections restored'));
  await page.waitForFunction(({source,first,second})=>![...document.querySelectorAll('[data-graph-edge]')].some(el=>{const ids=JSON.parse(el.dataset.graphEdge);return ids.includes(source)&&(ids.includes(first)||ids.includes(second));}),{source,first,second});
  assert(await page.locator(`[data-graph-edge='${JSON.stringify([source,first].sort())}']`).count()===0&&await page.locator(`[data-graph-edge='${JSON.stringify([source,second].sort())}']`).count()===0,'Undo did not restore both pairs');
  await page.keyboard.press('Escape');
  const edge=page.locator('[data-graph-edge]').first();await edge.dispatchEvent('click');const slider=page.locator('#connection-strength');
  const initial=await slider.inputValue();await slider.evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});const weak=await edge.evaluate(el=>parseFloat(getComputedStyle(el).strokeWidth));
  await slider.evaluate(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));});const strong=await edge.evaluate(el=>parseFloat(getComputedStyle(el).strokeWidth));assert(strong>weak,'Edge width did not demonstrate strength');
  assert(await edge.evaluate(el=>el.nextElementSibling.textContent)==='5/5','Exact edge value missing');
  await page.screenshot({path:'output/playwright/graph-edge-strength.png'});
  await slider.evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},initial);
  assert(await page.getByRole('textbox',{name:'Note content',exact:true}).innerText()===content&&await page.locator('#revision-label').innerText()===revision,'Connection actions changed note content or revision');
  // Explicit navigation remains a choice in the node popup.
  await page.locator(`[data-graph-node="${first}"] circle`).click();const name=await page.locator('#connection-popup-title').innerText();await page.locator('[data-node-action=open]').click();await page.waitForFunction(name=>document.querySelector('#note-title')?.value===name,name);await page.waitForFunction(name=>document.querySelector('#connection-source-title').textContent===`From: ${name}`,name);
  await page.locator('#connections-close').click();return{passed:true,nodePopup:true,arrow:true,explicitNavigation:true,ctrlMultiSelect:true,sourceOnlyBatch:true,batchUndo:true,strengthWidths:{weak,strong},noteUnchanged:true};
}
