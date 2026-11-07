async page=>{
 if(page.url()!=='http://127.0.0.1:1436/experiments/ai-activity/'||await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__)))throw new Error('Browser-only stubbed AI fixture required');
 const checks=[],record=(name,okay)=>{if(!okay)throw new Error(name);checks.push(name);};
 const setup=async()=>{
  await page.reload();await page.waitForFunction(()=>window.__notedActivityHarness?.ids.length===2);await page.setViewportSize({width:1200,height:800});
  await page.evaluate(()=>{window.__notedActivityHarness.state.allowExternalRequest=true;});
  await page.locator('#fixture-open-ai').click();await page.locator('[data-ai-prompt]').fill('Approved synthetic external request');await page.locator('[data-ai-advanced] summary').click();
 };
 await setup();await page.evaluate(()=>{window.__notedActivityHarness.state.holdExternalResponse=true;});await page.locator('[data-ai-request]').click();
 await page.waitForFunction(()=>window.__notedActivityHarness.state.row?.id==='fixture-external-1');
 await page.locator('[data-ai-close]').click();await page.locator('#fixture-other').click();await page.waitForFunction(()=>window.__notedActivityHarness.current()===window.__notedActivityHarness.ids[1]);
 await page.locator('#fixture-open-ai').click();const reads=await page.evaluate(()=>window.__notedActivityHarness.state.requestReads.length);
 await page.evaluate(()=>{window.__notedActivityHarness.state.holdExternalResponse=false;});await page.waitForFunction(()=>window.__notedActivityHarness.state.externalResponses===1&&!document.querySelector('[data-ai-prompt]').disabled);
 record('late creation stays with the approved original note',await page.evaluate(()=>{const h=window.__notedActivityHarness;return h.state.row.noteId===h.ids[0]&&h.state.externalRequests===1&&h.state.starts===0;}));
 record('late creation does not inspect or preview the new note',await page.evaluate(before=>{const s=window.__notedActivityHarness.state;return s.requestReads.length===before&&!s.replyReads.length&&!document.querySelector('#document-operations-dialog').open&&document.querySelector('[data-ai-preview]').hidden;},reads));
 for(const action of ['refresh','poll']){
  await setup();await page.locator('[data-ai-request]').click();await page.waitForFunction(()=>document.querySelector('[data-ai-existing]').value==='fixture-external-1'&&!document.querySelector('[data-ai-request]').disabled);
  await page.evaluate(()=>{const state=window.__notedActivityHarness.state;state.row={...state.row,id:'older-fixture-request',prompt:'Unrelated older proposal',status:'ready'};});
  if(action==='refresh')await page.locator('[data-ai-check]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ai-status]').textContent.includes('no longer available'));
  record(action+' explains the missing exact request',await page.locator('[data-ai-existing]').inputValue()==='');
  record(action+' never substitutes or previews an older proposal',await page.evaluate(()=>{const s=window.__notedActivityHarness.state;return !s.replyReads.includes('older-fixture-request')&&document.querySelector('[data-ai-preview]').hidden&&!document.querySelector('#document-operations-dialog').open&&s.starts===0;}));
 }
 await setup();await page.evaluate(()=>{const h=window.__notedActivityHarness;h.state.skipExternalListing=true;h.state.row={id:'older-fixture-request',noteId:h.ids[0],prompt:'Older proposal',expiresAt:'2099-01-01',status:'ready'};});
 await page.locator('[data-ai-request]').click();await page.waitForFunction(()=>window.__notedActivityHarness.state.externalResponses===1&&!document.querySelector('[data-ai-request]').disabled);
 record('a new unlisted request does not select an older proposal',await page.evaluate(()=>{const s=window.__notedActivityHarness.state;return document.querySelector('[data-ai-existing]').value===''&&!s.replyReads.includes('older-fixture-request')&&document.querySelector('[data-ai-preview]').hidden&&s.starts===0;}));
 record('external-request fixture records no unexpected errors',await page.evaluate(()=>window.__notedActivityHarness.errors.length===0));
 return{passed:true,browserOnly:true,simulatedAIAndAccount:true,noNativeIPC:true,checks};
}
