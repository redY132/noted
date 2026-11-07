async page=>{
 if(page.url()!=='http://127.0.0.1:1436/experiments/ai-activity/'||await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__)))throw new Error('Browser-only stubbed AI fixture required');
 const checks=[];
 for(const mode of ['goal','selection']){
  await page.reload();await page.waitForFunction(()=>window.__notedActivityHarness?.ids.length===2);await page.setViewportSize({width:1200,height:800});
  if(mode==='selection')await page.evaluate(()=>{const h=window.__notedActivityHarness;h.state.row={id:'other-pending',noteId:h.ids[0],prompt:'Other saved request',expiresAt:'2099-01-01',status:'waiting'};});
  await page.locator('#fixture-open-ai').click();await page.locator('[data-ai-prompt]').fill('Original synthetic formatting goal');await page.locator('[data-subscription-send]').click();
  await page.waitForFunction(()=>document.querySelector('[data-activity-state]').textContent==='Generating proposal');
  await page.evaluate(()=>{const h=window.__notedActivityHarness;h.state.holdNextRequest=true;h.state.holdRequestResponse=true;h.finish();});
  await page.waitForFunction(()=>window.__notedActivityHarness.state.requestReadHeld&&!document.querySelector('[data-ai-goal]').disabled);
  if(mode==='goal')await page.locator('[data-ai-goal]').selectOption('schema');
  else{await page.locator('[data-ai-advanced] summary').click();await page.locator('[data-ai-existing]').selectOption('other-pending');}
  await page.waitForFunction(()=>!document.querySelector('[data-ai-goal]').disabled);
  await page.evaluate(()=>{window.__notedActivityHarness.state.holdRequestResponse=false;});await page.waitForFunction(()=>!window.__notedActivityHarness.state.requestReadHeld);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await page.evaluate(()=>({goal:document.querySelector('[data-ai-goal]').value,selected:document.querySelector('[data-ai-existing]').value,hidden:document.querySelector('[data-ai-preview]').hidden,comparison:document.querySelector('#document-operations-dialog').open,starts:window.__notedActivityHarness.state.starts}));
  if(!state.hidden||state.comparison||state.starts!==1||mode==='goal'&&state.goal!=='schema'||mode==='selection'&&state.selected!=='other-pending')throw new Error(JSON.stringify({mode,state}));
  checks.push(mode+' retains the latest user choice and ignores the older result');
  if(!await page.evaluate(()=>window.__notedActivityHarness.errors.length===0))throw new Error('Unexpected context fixture error');checks.push(mode+' records no extra generation or unexpected error');
 }
 return{passed:true,browserOnly:true,simulatedAIAndAccount:true,noNativeIPC:true,checks};
}
