async page=>{
 const native=await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__));
 if(native){if(!await page.evaluate(async()=>{const s=await window.__TAURI_INTERNALS__.invoke('workspace_status');return s.path.includes('noted-sidebar-ui-');}))throw new Error('Disposable workspace required');}
 else if(new URL(page.url()).origin!=='http://127.0.0.1:1436'||!await page.evaluate(()=>localStorage.getItem('noted-sidebar-fixture')))throw new Error('Synthetic browser fixture required');
 const checks=[],errors=[],record=(name,value)=>{if(!value)throw new Error(name);checks.push(name);};page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1200,height:800});await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>document.querySelector('#note-title')?.value);
 const id=await page.locator('#header-connection-handle button').getAttribute('data-connect-source'),dock=await page.locator('[data-panel-toggle=navigation]').getAttribute('aria-expanded');
 const revision=()=>page.evaluate(async({id,native})=>(native?await window.__TAURI_INTERNALS__.invoke('load_note',{id}):await(await import('/src/api.ts')).api.load(id)).revision,{id,native}),before=await revision();
 const open=async()=>{await page.locator('#view-toggle').click();await page.locator('#shell-workspace').click();await page.getByRole('dialog',{name:'Workspace',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.backup-tools').getAttribute('aria-busy')==='false');};
 const close=()=>page.locator('#workspace-dialog .workspace-header button').click();
 await open();record('workspace opens as a named modal with one Close',await page.getByRole('dialog',{name:'Workspace',exact:true}).isVisible()&&await page.locator('#workspace-dialog button[data-close]').count()===1);
 record('backup controls reflect desktop availability',await page.locator('[data-backup-create]').isDisabled()===!native);await page.keyboard.press('Escape');record('first Escape closes the workspace',!await page.locator('#workspace-dialog').isVisible());
 const measure=()=>page.evaluate(()=>{
  const root=document.querySelector('#workspace-dialog'),header=root.querySelector('.workspace-header'),r=root.getBoundingClientRect(),h=header.getBoundingClientRect(),failures=[],ratios=[];
  const rgb=value=>(value.match(/[\d.]+/g)??[]).map(Number),lum=values=>values.slice(0,3).map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0),contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const background=el=>{for(let p=el;p;p=p.parentElement){const value=rgb(getComputedStyle(p).backgroundColor);if(value.length>=3&&(value.length<4||value[3]===1))return value;}return [255,255,255];};
  const visible=el=>{if(!el.checkVisibility?.({visibilityProperty:true}))return false;const b=el.getBoundingClientRect();return b.bottom>r.top&&b.top<r.bottom&&b.width>0&&b.height>0;};
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode,el=node.parentElement;if(!node.textContent.trim()||!visible(el)||el.closest(':disabled'))continue;const ratio=contrast(rgb(getComputedStyle(el).color),background(el));ratios.push(ratio);if(ratio<4.5)failures.push('text contrast');}
  for(const el of root.querySelectorAll('button,input:not([type=checkbox]),select,summary')){if(!visible(el)||el.disabled)continue;const b=el.getBoundingClientRect(),s=getComputedStyle(el);if(b.width<43.9||b.height<43.9)failures.push('target size');if(el.matches('input,select')&&contrast(rgb(s.borderTopColor),background(el))<3)failures.push('field boundary');if(el.matches(':focus-visible')&&(s.outlineStyle==='none'||contrast(rgb(s.outlineColor),background(el))<3))failures.push('focus contrast');}
  if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1||root.scrollWidth>root.clientWidth+1)failures.push('overflow');
  if(h.top<r.top-1||h.bottom>r.bottom+1)failures.push('Close header obscured');return {minimumTextContrast:Math.min(...ratios),failures};
 });
 const profiles=[];
 for(const mode of ['light','dark']){
  await page.setViewportSize({width:1200,height:800});await page.locator('#appearance-toggle').click();await page.locator('#appearance-mode').selectOption(mode);await page.keyboard.press('Escape');
  for(const[width,height]of[[1200,800],[800,560],[390,840]]){
   await page.setViewportSize({width,height});await open();await page.locator('#workspace-dialog details').first().evaluate(el=>{el.open=true;});
   const start=await measure();if(start.failures.length)throw new Error(JSON.stringify({mode,width,start}));
   await page.locator('#export-connections').focus();const end=await measure();if(end.failures.length)throw new Error(JSON.stringify({mode,width,end}));
   record('bottom actions stay reachable under sticky Close',await page.locator('#export-connections').evaluate(el=>{const r=el.getBoundingClientRect(),d=document.querySelector('#workspace-dialog').getBoundingClientRect(),h=document.querySelector('.workspace-header').getBoundingClientRect();return r.top>=h.bottom-1&&r.bottom<=d.bottom+1;}));
   await page.screenshot({path:`output/playwright/workspace-${native?'native':'preview'}-${mode}-${width}.png`});profiles.push({mode,width,height,start,end});await close();
  }
 }
 await page.setViewportSize({width:800,height:600});await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await open();await page.locator('#export-connections').focus();const largeText=await measure();if(largeText.failures.length)throw new Error(JSON.stringify({largeText}));
 record('workspace explanations and form text scale with large text',await page.evaluate(()=>{const minimum=parseFloat(getComputedStyle(document.documentElement).fontSize)*.8;return [...document.querySelectorAll('#workspace-dialog .dialog-description,#workspace-dialog .migration-tools p')].every(el=>parseFloat(getComputedStyle(el).fontSize)>=minimum);}));
 await page.screenshot({path:`output/playwright/workspace-${native?'native':'preview'}-text-200.png`});
 await page.setViewportSize({width:390,height:840});await page.locator('#rebuild-index').focus();await page.keyboard.press('Shift+Tab');const largeNarrow=await measure();if(largeNarrow.failures.length)throw new Error(JSON.stringify({largeNarrow}));
 record('large-text bottom actions remain reachable in a narrow window',await page.locator('#export-connections').evaluate(el=>{const r=el.getBoundingClientRect(),d=document.querySelector('#workspace-dialog').getBoundingClientRect(),h=document.querySelector('.workspace-header').getBoundingClientRect();return el===document.activeElement&&r.top>=h.bottom-1&&r.bottom<=d.bottom+1;}));
 await page.screenshot({path:`output/playwright/workspace-${native?'native':'preview'}-narrow-text-200.png`});await close();await page.evaluate(()=>{document.documentElement.style.fontSize='';});
 record('workspace controls leave saved note and dock state unchanged',await revision()===before&&await page.locator('[data-panel-toggle=navigation]').getAttribute('aria-expanded')===dock&&await page.locator('#header-connection-handle button').getAttribute('data-connect-source')===id);record('no uncaught UI errors',errors.length===0);
 return {passed:true,native,syntheticOnly:true,noGenerationRequested:true,noImportOrBackupRequested:true,checks,profiles,largeText,largeNarrow,errors};
}
