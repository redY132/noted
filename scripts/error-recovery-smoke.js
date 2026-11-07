async page=>{
 const native=await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__));
 if(native){if(!await page.evaluate(async()=>{const status=await window.__TAURI_INTERNALS__.invoke('workspace_status');return status.path.includes('noted-sidebar-ui-');}))throw new Error('Disposable native workspace required');}
 else if(new URL(page.url()).origin!=='http://127.0.0.1:1436'||!await page.evaluate(()=>localStorage.getItem('noted-sidebar-fixture')))throw new Error('Synthetic preview required');
 const checks=[],errors=[],record=(name,value)=>{if(!value)throw new Error(name);checks.push(name);};page.on('pageerror',error=>errors.push(error.message));
 const call=(command,args={})=>page.evaluate(async({command,args,native})=>{if(native)return window.__TAURI_INTERNALS__.invoke(command,args);const {api}=await import('/src/api.ts');if(command==='load_note')return api.load(args.id);if(command==='save_note')return api.save(args.note,args.expectedRevision);throw new Error('Unknown fixture command');},{command,args,native});
 const saved=()=>page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('Saved on this device'));
 const current=()=>page.locator('#header-connection-handle button').getAttribute('data-connect-source');
 const browse=async show=>{const button=page.locator('[data-panel-toggle=navigation]');if((await button.getAttribute('aria-expanded')==='true')!==show)await button.click();};
 await page.setViewportSize({width:1200,height:800});await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>document.querySelector('#note-title')?.value);await browse(false);
 await page.keyboard.press('Control+n');await page.waitForFunction(()=>document.querySelector('#note-title')?.value==='Untitled');await page.locator('#note-title').fill('Synthetic recovery original');await page.locator('#editor .tiptap').fill('Synthetic recovery content remains intact.');await page.keyboard.press('Control+s');await saved();
 const id=await current(),external=await call('load_note',{id});external.title='Synthetic recovery external save';await call('save_note',{note:external,expectedRevision:external.revision});
 await page.locator('#note-title').fill('Synthetic recovery local draft');await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#save-state').classList.contains('save-error'));
 record('a real revision conflict retains the mounted draft',await current()===id&&await page.locator('#note-title').inputValue()==='Synthetic recovery local draft'&&(await page.locator('#editor .tiptap').innerText()).includes('Synthetic recovery content remains intact.'));
 await page.locator('#retry-save').click();await page.waitForFunction(()=>document.querySelector('#save-state').classList.contains('save-error'));record('Retry cannot overwrite a newer saved version',(await call('load_note',{id})).title==='Synthetic recovery external save');
 const realError=await page.locator('#error-message').innerText();
 const diagnostic='Synthetic long storage diagnostic: '+('VeryLongSyntheticStorageLocation'.repeat(30));
 await page.evaluate(message=>{document.querySelector('#error-message').textContent=message;},diagnostic);
 const measure=()=>page.evaluate(()=>{
  const root=document.querySelector('#error-banner'),r=root.getBoundingClientRect(),work=document.querySelector('.workspace').getBoundingClientRect(),writer=document.querySelector('.document-scroll').getBoundingClientRect(),message=document.querySelector('#error-message'),failures=[];
  const color=value=>{const values=value.match(/[\d.]+/g)?.map(Number)??[];return values.slice(0,3);},lum=rgb=>rgb.map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0),contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const background=color(getComputedStyle(root).backgroundColor),text=contrast(color(getComputedStyle(root).color),background);
  if(text<4.5)failures.push('text contrast');if(r.left<work.left-1||r.right>work.right+1||root.scrollWidth>root.clientWidth+1)failures.push('horizontal overflow');if(r.bottom>work.bottom+1)failures.push('vertical overflow');if(writer.height<70)failures.push('writing area obscured');
  for(const el of root.querySelectorAll('button,#error-message')){if(el.hidden)continue;const b=el.getBoundingClientRect();if(b.width<43.9||b.height<43.9)failures.push('target size');}
  return {width:innerWidth,height:innerHeight,writingWidth:work.width,writingHeight:writer.height,bannerHeight:r.height,messageScrollable:message.scrollHeight>message.clientHeight,minimumTextContrast:text,failures};
 });
 const focusChecks=async()=>{
  await page.locator('#error-message').focus();await page.keyboard.press('PageDown');await page.waitForTimeout(60);record('diagnostics scroll with the keyboard',await page.locator('#error-message').evaluate(el=>el.scrollTop>0));
  for(const id of ['retry-save','recover-draft','download-draft','dismiss-error']){
   await page.keyboard.press('Tab');record('keyboard reaches '+id,await page.locator('#'+id).evaluate(el=>el===document.activeElement));
   record('focused '+id+' stays visible',await page.locator('#'+id).evaluate(el=>{const r=el.getBoundingClientRect(),b=document.querySelector('#error-banner').getBoundingClientRect();return r.left>=b.left&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;}));
   const focus=await page.locator('#'+id).evaluate(el=>{const s=getComputedStyle(el),rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),lum=values=>values.map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0),a=lum(rgb(s.outlineColor)),b=lum(rgb(getComputedStyle(document.querySelector('#error-banner')).backgroundColor));return {outline:s.outlineStyle,width:parseFloat(s.outlineWidth),contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});record('focused recovery action is indicated',focus.outline!=='none'&&focus.width>=2&&focus.contrast>=3);
  }
 };
 const profiles=[];
 for(const mode of ['light','dark']){
  await page.setViewportSize({width:1200,height:800});await page.locator('#appearance-toggle').click();await page.locator('#appearance-mode').selectOption(mode);await page.keyboard.press('Escape');
  for(const[width,height,showBrowse]of[[1200,800,false],[800,560,false],[390,840,false],[1600,900,true],[800,560,true]]){
   await page.setViewportSize({width,height});await browse(showBrowse);await page.evaluate(()=>{document.querySelector('#error-banner').scrollTop=0;document.querySelector('#error-message').scrollTop=0;});
   const result=await measure();if(result.failures.length)throw new Error(JSON.stringify({mode,showBrowse,...result}));await focusChecks();await page.screenshot({path:`output/playwright/error-recovery-${native?'native':'preview'}-${mode}-${width}-${showBrowse?'dock':'closed'}.png`});profiles.push({mode,showBrowse,...result});
  }
 }
 await browse(false);await page.setViewportSize({width:800,height:600});await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
 const largeText=await measure();if(largeText.failures.length)throw new Error(JSON.stringify({largeText}));await focusChecks();await page.screenshot({path:`output/playwright/error-recovery-${native?'native':'preview'}-text-200.png`});await page.evaluate(()=>{document.documentElement.style.fontSize='';});await page.setViewportSize({width:1200,height:800});
 await page.evaluate(message=>{document.querySelector('#error-message').textContent=message;},realError);
 if(!native){
  const downloading=page.waitForEvent('download');await page.locator('#download-draft').click();const download=await downloading,stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const draft=JSON.parse(text);
  record('Download draft retains the unsaved title and identity',draft.id===id&&draft.title==='Synthetic recovery local draft'&&Boolean(draft.document));
 }
 await page.locator('#recover-draft').click();await page.locator('[data-library=conflict]').waitFor({state:'visible'});record('Keep both still previews the actual external version',(await page.locator('[data-conflict-disk]').innerText()).includes('Synthetic recovery external save'));
 await page.locator('[data-keep-both]').click();await page.waitForFunction(()=>document.querySelector('#note-title').value.includes('recovered draft'));const recovered=await current();
 record('recovery saves the draft into a separate note',recovered!==id&&(await call('load_note',{id})).title==='Synthetic recovery external save'&&(await page.locator('#editor .tiptap').innerText()).includes('Synthetic recovery content remains intact.'));
 record('successful recovery clears the stale error banner',await page.locator('#error-banner').isHidden());
 if(!native){
  await page.evaluate(async id=>{const {api}=await import('/src/api.ts');window.__recoveryOriginalLoad=api.load;api.load=async target=>{if(target===id)throw new Error('Synthetic unrelated open error');return window.__recoveryOriginalLoad(target);};},id);
  try {
   await page.keyboard.press('Control+p');await page.locator('#quick-open-search').fill('Synthetic recovery external save');await page.locator(`[data-quick-note="${id}"]`).click();await page.waitForFunction(()=>document.querySelector('#error-message').textContent.includes('Synthetic unrelated open error'));
   record('unrelated errors do not suggest conflict recovery',await page.locator('#recover-draft').isHidden()&&await page.locator('#retry-save').isHidden());await page.keyboard.press('Escape');await page.locator('#dismiss-error').click();
  } finally {await page.evaluate(async()=>{const {api}=await import('/src/api.ts');api.load=window.__recoveryOriginalLoad;});}
 }
 record('no uncaught UI errors',errors.length===0);
 return {passed:true,native,syntheticOnly:true,noGenerationRequested:true,renderedDiagnosticIsSynthetic:true,checks,profiles,largeText,errors};
}
