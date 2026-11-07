async page=>{
 if(page.url()!=='http://127.0.0.1:1436/experiments/ai-activity/'||await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__)))throw new Error('Browser-only stubbed AI fixture required');
 const checks=[];
 for(const route of ['[data-subscription-send]','[data-ai-request]']){
  await page.reload();await page.waitForFunction(()=>window.__notedActivityHarness?.ids.length===2);
  await page.setViewportSize({width:1200,height:800});
  await page.locator('#fixture-open-ai').click();await page.locator('[data-ai-prompt]').fill('Format only this explicitly approved synthetic note.');
  if(route==='[data-ai-request]')await page.locator('[data-ai-advanced] summary').click();
  await page.evaluate(()=>{window.__notedActivityHarness.state.holdEligibility=true;});
  await page.locator(route).click();await page.waitForFunction(()=>document.querySelector('[data-subscription-send]').disabled);
  await page.locator('[data-ai-close]').click();await page.locator('#fixture-other').click();
  await page.waitForFunction(()=>window.__notedActivityHarness.current()===window.__notedActivityHarness.ids[1]);
  await page.evaluate(()=>{window.__notedActivityHarness.state.holdEligibility=false;});
  await page.waitForFunction(()=>window.__notedActivityHarness.errors.some(error=>error.includes('open note changed')));
  const passed=await page.evaluate(()=>{const {state}=window.__notedActivityHarness;return state.starts===0&&state.externalRequests===0&&state.job===null&&state.row===null;});
  if(!passed)throw new Error('Approval followed navigation into an unapproved note');checks.push(route+' refused note drift without generation or request creation');
  await page.locator('#fixture-open-ai').click();await page.waitForFunction(()=>document.querySelector('.ai-formatting-dialog').open&&!document.querySelector('[data-ai-prompt]').disabled);
  if(!await page.locator('[data-subscription-send]').isEnabled())throw new Error('The new note cannot receive a fresh explicit approval');
  checks.push(route+' allows reopening for a fresh approval');await page.locator('[data-ai-close]').click();
 }
 return{passed:true,browserOnly:true,simulatedAIAndAccount:true,noNativeIPC:true,checks};
}
