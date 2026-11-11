async page => {
  const native=await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__));
  if(native) {
    const allowed=await page.evaluate(async()=>{
      const expected=window.notedCachedFixture?.workspace;if(!expected||!/noted-simple-ai-[A-Za-z0-9]+[\\/]workspace$/i.test(expected))return false;
      const normalize=v=>String(v).replaceAll('\\','/').replace(/^\/\/\?\//,'').toLowerCase();
      const [s,r,p]=await Promise.all(['workspace_status','subscription_status','agent_access'].map(c=>window.__TAURI_INTERNALS__.invoke(c)));
      return normalize(s.path)===normalize(expected)&&r.authentication==='disabled'&&!r.available&&!p.enabled&&!p.allowHosted&&!p.folderIds.length;
    });
    if(!allowed)throw new Error('Exact disabled generated native fixture required');
  } else if(new URL(page.url()).origin!=='http://127.0.0.1:1436')throw new Error('Synthetic preview required');
  const fixture=await page.evaluate(()=>JSON.parse(localStorage.getItem('noted-sidebar-fixture')||'null'));
  if(!fixture?.project||!fixture.observations||!fixture.notes)throw new Error('Explicit generated explorer fixture required');
  const screenshotRoot=native?await page.evaluate(()=>window.notedCachedFixture.workspace.replace(/[\\/]workspace$/,'/ui-evidence')):'output/playwright';
  const checks=[],profiles=[],errors=[];
  const record=(name,value)=>{if(!value)throw new Error(name);checks.push(name);};
  try {
  page.on('pageerror',e=>errors.push(e.message));
  const browse=page.locator('[data-panel-toggle=navigation]'),root=page.locator('#navigation-panel');
  const folder=id=>page.locator('[data-folder="'+id+'"]');
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const ensureOpen=async()=>{if(await browse.getAttribute('aria-expanded')!=='true')await browse.click();};
  const close=async()=>{if(await browse.getAttribute('aria-expanded')==='true')await browse.click();};
  const select=async id=>{await folder(id).click();await settle();};
  const goRoot=async()=>{await ensureOpen();await page.locator('#all-notes').click();await close();await ensureOpen();};
  await page.setViewportSize({width:1400,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await goRoot();
  record('initial explorer has one directory',await page.locator('#notes-panel').isHidden()&&await page.locator('#folder-graph').isHidden());
  await select(fixture.project);await select(fixture.research);await select(fixture.observations);
  await page.waitForFunction(()=>document.querySelector('#list-count').textContent==='95');
  await page.waitForFunction(()=>document.querySelectorAll('#folder-graph-canvas path').length>0);
  record('current folder has real saved links',await page.locator('#folder-graph-canvas path').count()>0);
  record('older ancestors leave the two-level window',await folder(fixture.project).count()===0);
  await page.locator('#navigation-back').click();record('Back returns to the parent',await page.locator('#collection-title').textContent()==='Research');
  await select(fixture.observations);
  const deep=await page.evaluate(async fixture=>{
    const folders=window.__TAURI_INTERNALS__?await window.__TAURI_INTERNALS__.invoke('list_folders'):await (await import('/src/api.ts')).api.folders();const path=[];let id=fixture.leaf;
    while(id&&id!==fixture.observations){path.unshift(id);id=folders.find(f=>f.id===id)?.parentId;}return path;
  },fixture);
  if(deep){for(const id of deep)await select(id);record('deep path exposes only parent and child levels',await root.locator('[data-folder]').count()<=2);for(let i=0;i<deep.length;i++)await page.locator('#navigation-back').click();record('deep Back restores the current collection',await page.locator('#collection-title').textContent()==='Observations');}
  for(const mode of ['light','dark']) {
    await page.locator('#appearance-toggle').click();await page.locator('#appearance-mode').selectOption(mode);await page.keyboard.press('Escape');
    for(const [width,height,large] of [[1400,900,false],[1000,720,false],[800,560,false],[390,840,false],[800,600,true]]){
      await page.setViewportSize({width,height});await page.evaluate(large=>document.documentElement.style.fontSize=large?'200%':'',large);await settle();
      await page.waitForTimeout(220);
      const measured=await root.evaluate(root=>{
        const buttons=[...root.querySelectorAll('button')].filter(el=>el.getClientRects().length&&!el.closest('[inert]'));
        const r=root.getBoundingClientRect(),w=document.querySelector('.workspace').getBoundingClientRect();
        const rgb=c=>{const channels=c.match(/[\d.]+/g).map(Number);if(c.startsWith('color(srgb '))for(let i=0;i<3;i++)channels[i]*=255;return channels;},lum=c=>c.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
        const background=el=>{for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length<4||c[3]===1)return c;}return[255,255,255];};
        const contrast=buttons.filter(el=>!el.disabled&&el.textContent.trim()).map(el=>{const a=lum(rgb(getComputedStyle(el).color)),b=lum(background(el));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
        const g=document.querySelector('#folder-graph').getBoundingClientRect();
        return{overflow:document.documentElement.scrollWidth>innerWidth+1,minimumWidth:Math.min(...buttons.map(b=>b.getBoundingClientRect().width)),minimumHeight:Math.min(...buttons.map(b=>b.getBoundingClientRect().height)),minimumControlTextContrast:Math.min(...contrast),pushes:w.left>=r.right-.5||w.top>=r.bottom-.5,graphVisible:!document.querySelector('#folder-graph').hidden,graphFits:g.left>=r.left-.5&&g.right<=r.right+.5};
      });
      profiles.push({mode,width,height,large,...measured});
      record(mode+' '+width+' '+height+' reflows and pushes the document',!measured.overflow&&measured.pushes&&measured.graphVisible&&measured.graphFits);
      record(mode+' '+width+' '+height+' retains 44px controls',measured.minimumWidth>=43.9&&measured.minimumHeight>=43.9);
      record(mode+' '+width+' '+height+' retains readable control text',measured.minimumControlTextContrast>=4.5);
      record(mode+' '+width+' '+height+' keeps child folders reachable',await page.locator('#folder-children').evaluate(el=>el.hidden||el.getBoundingClientRect().height>=44));
      await page.screenshot({path:screenshotRoot+'/progressive-'+mode+'-'+width+'-'+height+(large?'-large':'')+'.png'});
    }
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='');await page.setViewportSize({width:1400,height:900});
  await goRoot();await select(fixture.project);await page.setViewportSize({width:1300,height:850});await close();
  await page.waitForTimeout(650);
  record('interrupted transitions leave no ghosts or simulation',await page.locator('.explorer-ghost').count()===0&&await page.locator('#folder-graph-canvas').getAttribute('data-simulating')==='false');
  await page.emulateMedia({reducedMotion:'reduce'});await goRoot();await select(fixture.project);await select(fixture.research);await select(fixture.observations);
  await page.waitForFunction(()=>document.querySelector('#list-count').textContent==='95');await settle();
  record('reduced motion leaves no running force animation',await page.locator('#folder-graph-canvas').getAttribute('data-simulating')==='false'&&await page.locator('.explorer-ghost').count()===0);
  if(!await page.locator('[data-note="'+fixture.notes[0]+'"]').count())await page.locator('#show-more').click();
  await page.waitForFunction(()=>document.querySelectorAll('#note-list [data-note]').length===95);
  record('the scrollable directory loads the full long collection',await page.locator('#note-list [data-note]').count()===95);
  await select(deep[0]);
  record('the shifted parent directory retains its files',await page.locator('[data-explorer-parent-note]').count()===95);
  await page.locator('[data-explorer-parent-note="'+fixture.notes[0]+'"]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.panelNavigation==='false');
  record('opening a parent-directory file closes both panels',await root.isHidden()&&await page.locator('#note-title').inputValue()==='Synthetic trail map');
  await goRoot();await select(fixture.project);await select(fixture.research);await select(fixture.observations);
  await page.waitForFunction(()=>document.querySelector('#list-count').textContent==='95');
  if(!await page.locator('[data-note="'+fixture.notes[0]+'"]').count())await page.locator('#show-more').click();
  await page.locator('[data-note="'+fixture.notes[0]+'"]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.panelNavigation==='false');
  record('opening a note closes both directories',await root.isHidden()&&await page.locator('#note-title').inputValue()==='Synthetic trail map');
  await goRoot();await select(fixture.project);await select(fixture.research);await select(fixture.observations);
  await page.waitForFunction(()=>document.querySelector('#list-count').textContent==='95');
  await folder(fixture.observations).focus();await page.keyboard.press('ArrowRight');
  record('keyboard enters the child directory',await page.evaluate(()=>document.activeElement.closest('#folder-children')!==null));
  await page.keyboard.press('ArrowLeft');record('keyboard returns to the parent row',await folder(fixture.observations).evaluate(el=>el===document.activeElement));
  for(let cycle=0;cycle<3;cycle++){
    await page.locator('#navigation-back').click();await select(fixture.observations);
    record('repeat navigation keeps one transient snapshot '+cycle,await page.locator('.explorer-ghost').count()<=1);
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(()=>document.querySelector('#list-count').textContent==='95'&&document.querySelectorAll('[data-folder-graph-note]').length>0&&document.querySelector('#folder-graph-canvas').dataset.simulating==='false');
  const node=page.locator('[data-folder-graph-note]').first();await node.waitFor({state:'visible'});
  const box=await node.boundingBox(),titleBefore=await page.locator('#note-title').inputValue();
  if(!box)throw new Error('Graph node not visible');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+28,box.y+box.height/2+22,{steps:4});await page.mouse.up();
  record('dragging a graph node does not navigate',await browse.getAttribute('aria-expanded')==='true'&&await page.locator('#note-title').inputValue()===titleBefore);
  await node.click();await page.waitForFunction(()=>document.documentElement.dataset.panelNavigation==='false');
  record('opening a graph node closes the explorer',await root.isHidden());
  await page.emulateMedia({reducedMotion:'no-preference'});await goRoot();await select(fixture.project);
  await page.waitForTimeout(700);record('graph button is restored after arrival',await page.locator('#header-connection-handle button').evaluate(el=>getComputedStyle(el).visibility==='visible')&&await page.locator('.explorer-ghost').count()===0);
  await goRoot();await select(fixture.project);await page.waitForFunction(()=>Boolean(document.querySelector('.explorer-ghost')));await close();await settle();
  record('closing during the button flight restores the source',await page.locator('#header-connection-handle button').evaluate(el=>getComputedStyle(el).visibility==='visible')&&await page.locator('.explorer-ghost').count()===0);
  await goRoot();await select(fixture.project);await select(fixture.empty);
  await page.waitForFunction(()=>document.querySelector('#list-count').textContent==='0');await settle();
  record('empty folders have an empty graph and no force timer',await page.locator('[data-folder-graph-note]').count()===0&&await page.locator('#folder-graph-canvas').getAttribute('data-simulating')==='false');
  const iconBefore=await folder(fixture.empty).locator('svg').evaluate(el=>el.outerHTML);
  await page.locator('#customize-folder').click();await page.locator('[data-library="folders"]').waitFor({state:'visible'});
  record('customization targets the current folder',await page.locator('[data-folder-picker]').inputValue()===fixture.empty);
  await page.locator('[data-folder-edit-name]').fill('Renamed synthetic collection');
  const icon=page.locator('[data-folder-edit-icon]');await icon.selectOption(await icon.inputValue()==='book'?'leaf':'book');
  await page.locator('[data-folder-save]').click();await page.locator('[data-library="folders"]').waitFor({state:'hidden'});
  record('folder identity and new name survive customization',await folder(fixture.empty).count()===1&&await page.locator('#collection-title').textContent()==='Renamed synthetic collection');
  record('folder icons still customize on this device',await folder(fixture.empty).locator('svg').evaluate(el=>el.outerHTML)!==iconBefore);
  if(native)record('runner and sharing remain disabled',await page.evaluate(async()=>{const [r,p]=await Promise.all(['subscription_status','agent_access'].map(c=>window.__TAURI_INTERNALS__.invoke(c)));return r.authentication==='disabled'&&!r.available&&!p.enabled&&!p.allowHosted&&!p.folderIds.length;}));
  await close();record('no uncaught browser errors',errors.length===0);
  return{passed:true,syntheticOnly:true,noGenerationRequested:true,native,checks,profiles,errors};
  } catch(error) {
    const diagnostic=await page.evaluate(()=>({expanded:document.querySelector('#navigation-panel').dataset.explorerExpanded,simulating:document.querySelector('#folder-graph-canvas').dataset.simulating,ghosts:document.querySelectorAll('.explorer-ghost').length,sourceVisibility:document.querySelector('#header-connection-handle button')?.style.visibility}));
    return{passed:false,syntheticOnly:true,native,checks,profiles,errors,error:String(error),diagnostic};
  }
}
