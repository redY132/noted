async page=>{
 const native=await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__));
 const expected=native?await page.evaluate(()=>window.notedCachedFixture):null;
 if(native){const ok=await page.evaluate(async expected=>{
  if(!expected?.workspace||!/noted-simple-ai-[A-Za-z0-9]+[\\/]workspace$/i.test(expected.workspace))return false;
  const norm=s=>String(s).replaceAll('\\','/').replace(/^\/\/\?\//,'').toLowerCase();
  const [s,r,p]=await Promise.all(['workspace_status','subscription_status','agent_access'].map(c=>window.__TAURI_INTERNALS__.invoke(c)));
  return norm(s.path)===norm(expected.workspace)&&r.authentication==='disabled'&&!r.available&&!p.enabled&&!p.allowHosted&&!p.folderIds.length;
 },expected);if(!ok)throw Error('Disabled exact generated native fixture required');}
 else if(new URL(page.url()).origin!=='http://127.0.0.1:1436')throw Error('Synthetic preview required');
 const fixture=await page.evaluate(()=>JSON.parse(localStorage.getItem('noted-sidebar-fixture')||'null'));
 const currentId=await page.locator('#header-connection-handle button').getAttribute('data-connect-source');
 if(!fixture?.notes?.includes(currentId))throw Error('Generated explorer note required');
 const id=await page.evaluate(async()=>{
  const invoke=window.__TAURI_INTERNALS__?.invoke,api=invoke?null:(await import('/src/api.ts')).api;
  const note=invoke?await invoke('create_note',{title:'Synthetic writing customization trial',folderId:null}):await api.createNote('Synthetic writing customization trial',null);
  note.content={type:'doc',content:[{type:'paragraph',attrs:{id:'writing-color-trial'},content:[{type:'text',text:'Synthetic editable words for custom color and writing-width checks.'}]}]};
  if(invoke)await invoke('save_note',{note,expectedRevision:note.revision});else await api.save(note,note.revision);
  const fixture=JSON.parse(localStorage.getItem('noted-sidebar-fixture'));fixture.notes=[...fixture.notes.slice(0,105),note.id];localStorage.setItem('noted-sidebar-fixture',JSON.stringify(fixture));return note.id;
 });
 await page.reload();if(native)await page.evaluate(expected=>window.notedCachedFixture=expected,expected);
 await page.waitForFunction(id=>document.querySelector('#header-connection-handle button')?.dataset.connectSource===id,id);
 const load=()=>page.evaluate(async id=>window.__TAURI_INTERNALS__?window.__TAURI_INTERNALS__.invoke('load_note',{id}):(await import('/src/api.ts')).api.load(id),id);
 const checks=[],profiles=[],errors=[],record=(label,condition)=>{if(!condition)throw Error(label);checks.push(label);};page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.setViewportSize({width:1400,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 if(await page.locator('[data-panel-toggle=navigation]').getAttribute('aria-expanded')==='true')await page.locator('[data-panel-toggle=navigation]').click();
 await page.locator('#view-toggle').click();await page.locator('[data-panel-choice=formatting]').check();await page.keyboard.press('Escape');
 const editor=page.locator('#editor .tiptap'),dialog=page.locator('#text-color-dialog');
 const original=await editor.innerHTML();await editor.focus();await page.keyboard.press('Control+a');
 await page.locator('#custom-color-open').click();await page.locator('#custom-color-value').fill('#abc');await page.locator('#custom-color-value').dispatchEvent('input');
 record('live color preview does not edit the document',await editor.innerHTML()===original);
 record('short hex synchronizes the native picker',await page.locator('#custom-color-picker').inputValue()==='#aabbcc');
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 record('Cancel preserves content and restores its control',await editor.innerHTML()===original&&await page.locator('#custom-color-open').evaluate(el=>el===document.activeElement));
 await page.locator('#custom-color-open').click();await page.locator('#custom-color-value').fill('oops');await page.locator('#custom-color-value').dispatchEvent('input');
 record('invalid colors cannot apply',await page.locator('[data-color-apply]').isDisabled());
 await page.locator('#custom-color-value').fill('#13579b');await page.locator('#custom-color-value').dispatchEvent('input');
 await page.locator('[data-color-apply]').click();await dialog.waitFor({state:'hidden'});
 const colored=await editor.innerHTML();record('custom color formats the chosen text',colored!==original&&await editor.locator('span[style*="color"]').count()>0);
 await page.keyboard.press('Control+z');record('custom color Undo restores the full projection',await editor.innerHTML()===original);
 await page.keyboard.press('Control+Shift+z');record('custom color Redo restores the full projection',await editor.innerHTML()===colored);
 await page.keyboard.press('Control+s');await page.waitForFunction(async id=>{
  const note=window.__TAURI_INTERNALS__?await window.__TAURI_INTERNALS__.invoke('load_note',{id}):await(await import('/src/api.ts')).api.load(id);
  return JSON.stringify(note.content).includes('#13579b');
 },id);
 const saved=await load();
 await page.locator('#appearance-toggle').click();await page.locator('#writing-width').selectOption('comfortable');await page.keyboard.press('Escape');
 record('comfortable width centers the existing document',await page.locator('.workspace .document').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return r.width<=760.5&&r.width>700&&Math.abs((r.left-p.left)-(p.right-r.right))<2;}));
 record('width changes preserve document content and editor selection',await editor.innerHTML()===colored);
 await page.reload();if(native)await page.evaluate(expected=>window.notedCachedFixture=expected,expected);
 await page.waitForFunction(id=>document.querySelector('#header-connection-handle button')?.dataset.connectSource===id,id);
 record('custom color persists after native save and reopen',JSON.stringify((await load()).content)===JSON.stringify(saved.content)&&await editor.locator('span[style*="color"]').count()>0);
 record('writing width persists after reopening the profile',await page.locator('#writing-width').inputValue()==='comfortable');
 const screenshotRoot=native?expected.workspace.replace(/[\\/]workspace$/,'/ui-evidence'):'output/playwright';
 for(const mode of ['light','dark']){
  await page.locator('#appearance-toggle').click();await page.locator('#appearance-mode').selectOption(mode);await page.keyboard.press('Escape');
  for(const [width,height,large]of [[1200,800,false],[800,560,false],[390,840,false],[800,600,true]]){
   await page.setViewportSize({width,height});await page.evaluate(large=>document.documentElement.style.fontSize=large?'200%':'',large);
   await page.locator('#view-toggle').click();await page.locator('[data-panel-choice=formatting]').check();await page.keyboard.press('Escape');
   await page.locator('#custom-color-open').click();await dialog.waitFor({state:'visible'});
   const measured=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return{fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+.5,scrollable:el.scrollHeight>el.clientHeight,minimumControlHeight:Math.min(...[...el.querySelectorAll('button,input')].map(e=>e.getBoundingClientRect().height)),overflow:document.documentElement.scrollWidth>innerWidth+1};});
   profiles.push({mode,width,height,large,...measured});record(mode+' '+width+' '+height+' custom color fits, scrolls and keeps native targets',measured.fits&&!measured.overflow&&measured.minimumControlHeight>=44);
   await page.screenshot({path:screenshotRoot+'/custom-color-'+mode+'-'+width+'-'+height+(large?'-large':'')+'.png'});
   await page.keyboard.press('Tab');record(mode+' '+width+' '+height+' keyboard focus stays in the color dialog',await dialog.evaluate(el=>el.contains(document.activeElement)));
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  }
 }
 await page.evaluate(()=>document.documentElement.style.fontSize='');await page.setViewportSize({width:1400,height:900});
 await page.locator('#appearance-toggle').click();await page.locator('#reset-appearance').click();
 record('Reset appearance restores full writing width',await page.locator('#writing-width').inputValue()==='full');await page.keyboard.press('Escape');
 record('writing preferences never rewrite the saved note',JSON.stringify((await load()).content)===JSON.stringify(saved.content));
 const freeId=await page.evaluate(async()=>{
  const invoke=window.__TAURI_INTERNALS__?.invoke,api=invoke?null:(await import('/src/api.ts')).api;
  const note=invoke?await invoke('create_note',{title:'Synthetic writing-width free canvas',folderId:null}):await api.createNote('Synthetic writing-width free canvas',null);
  note.content={type:'doc',content:[{type:'paragraph',attrs:{id:'width-intro'},content:[{type:'text',text:'Synthetic free canvas width test.'}]},{type:'notePanel',attrs:{id:'width-panel',width:640,placement:'free',x:1100,y:90,z:1},content:[{type:'paragraph',attrs:{id:'width-panel-text'},content:[{type:'text',text:'This generated panel must remain reachable.'}]}]}]};
  if(invoke)await invoke('save_note',{note,expectedRevision:note.revision});else await api.save(note,note.revision);
  const fixture=JSON.parse(localStorage.getItem('noted-sidebar-fixture'));fixture.notes=[...fixture.notes.slice(0,106),note.id];localStorage.setItem('noted-sidebar-fixture',JSON.stringify(fixture));return note.id;
 });
 await page.reload();if(native)await page.evaluate(expected=>window.notedCachedFixture=expected,expected);
 await page.waitForFunction(id=>document.querySelector('#header-connection-handle button')?.dataset.connectSource===id,freeId);
 await page.locator('#appearance-toggle').click();await page.locator('#writing-width').selectOption('narrow');await page.keyboard.press('Escape');
 await page.waitForFunction(()=>document.querySelector('#editor [data-placement=free]'));
 const reachable=await page.locator('.document-scroll').evaluate(el=>{el.scrollLeft=el.scrollWidth;return el.scrollLeft>0;});
 record('narrow writing width preserves horizontal access to free-placement content',reachable);
 await page.locator('.document-scroll').evaluate(el=>el.scrollLeft=0);
 await page.locator('#appearance-toggle').click();await page.locator('#reset-appearance').click();await page.keyboard.press('Escape');
 record('no uncaught rendering errors',errors.length===0);
 return{passed:true,native,syntheticOnly:true,noGenerationRequested:true,checks,profiles,errors};
 }catch(error){return{passed:false,native,syntheticOnly:true,checks,profiles,errors,error:String(error)};}
}
