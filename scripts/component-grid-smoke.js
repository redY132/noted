async page => {
  const expected=await page.evaluate(()=>window.notedComponentGridWorkspace ?? window.notedResourceDiagnosticExpected ?? window.notedBenchmarkOptions?.fixtureWorkspace);
  const allowed=await page.evaluate(async expected=>{if(!expected||!window.__TAURI_INTERNALS__)return false;const normalize=value=>String(value).replaceAll('\\','/').replace(/^\/\/\?\//,'').toLowerCase();const [s,r,p]=await Promise.all(['workspace_status','subscription_status','agent_access'].map(command=>window.__TAURI_INTERNALS__.invoke(command)));return normalize(s.path)===normalize(expected)&&r.authentication==='disabled'&&!r.available&&!p.enabled&&!p.allowHosted&&!p.folderIds.length;},expected);
  if(!allowed||!/noted-release resource trial-[a-f0-9]{32}[\\/]runs[\\/][^\\/]+[\\/]workspace$/i.test(expected))throw new Error('EXACT_DISABLED_GENERATED_GRID_FIXTURE_REQUIRED');
  const checks=[],profiles=[],errors=[],record=(name,okay)=>{if(!okay)throw new Error(name);checks.push(name);};page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  await page.keyboard.press('Control+p');await page.locator('#quick-open-search').fill('eight-active-components');await page.locator('[data-quick-note]').first().click();await page.waitForFunction(()=>document.querySelector('#note-title')?.value==='eight-active-components');
  const id=await page.locator('#header-connection-handle button').getAttribute('data-connect-source');
  const fingerprint=()=>page.evaluate(async id=>{const note=await window.__TAURI_INTERNALS__.invoke('load_note',{id});return{revision:note.revision,token:note.revisionToken};},id),before=await fingerprint();
  record('the generated note has a revision-bound fingerprint',typeof before.token==='string'&&/^[a-f0-9]{64}$/.test(before.token));
  const browse=page.locator('[data-panel-toggle=navigation]');if(await browse.getAttribute('aria-expanded')!=='true')await browse.click();
  await page.locator('#view-toggle').click();if(!await page.locator('[data-panel-choice=components]').isChecked())await page.locator('[data-panel-choice=components]').click();await page.keyboard.press('Escape');
  await page.locator('#interactive-library').click();await page.locator('[data-component-picker]').selectOption('noted.benchmark@1');
  await page.locator('[data-component-disable]').click();await page.waitForFunction(()=>document.querySelector('[data-component-status]')?.textContent.includes('disabled'));record('disabled generated code leaves no component worker',page.workers().length===0);
  await page.locator('[data-component-enable]').click();await page.waitForFunction(()=>document.querySelector('[data-component-status]')?.textContent.includes('enabled'));await page.locator('#component-library-dialog [data-tool-close]').click();
  await page.locator('#view-toggle').click();if(await page.locator('[data-panel-choice=components]').isChecked())await page.locator('[data-panel-choice=components]').click();await page.keyboard.press('Escape');
  const visible=()=>page.evaluate(()=>{const v=document.querySelector('.document-scroll').getBoundingClientRect();return [...document.querySelectorAll('.interactive-component-body button')].filter(el=>{const r=el.getBoundingClientRect();return el.textContent.trim()==='+'&&r.right>v.left&&r.left<v.right&&r.bottom>v.top&&r.top<v.bottom;}).length;});
  const measure=()=>page.evaluate(()=>{
    const paper=document.querySelector('.document-scroll'),v=paper.getBoundingClientRect(),bodies=[...document.querySelectorAll('.interactive-component-body')],buttons=[...document.querySelectorAll('.interactive-component-body button')].filter(el=>el.textContent.trim()==='+');
    const rgb=value=>value.match(/[\d.]+/g).map(Number),lum=values=>values.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0),background=el=>{for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length<4||c[3]===1)return c;}return[255,255,255];};
    const ratios=[];for(const body of bodies){const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(!node.textContent.trim())continue;const el=node.parentElement,r=el.getBoundingClientRect();if(!r.width||!r.height||r.right<=v.left||r.left>=v.right||r.bottom<=v.top||r.top>=v.bottom)continue;const a=lum(rgb(getComputedStyle(el).color)),b=lum(background(el));ratios.push((Math.max(a,b)+.05)/(Math.min(a,b)+.05));}}
    return{instances:bodies.length,columns:getComputedStyle(document.querySelector('.note-panel[data-layout-kind="grid"] > .note-panel-content')).gridTemplateColumns.split(' ').length,minimumBodyWidth:Math.min(...bodies.map(el=>el.clientWidth)),minimumButtonWidth:Math.min(...buttons.map(el=>el.getBoundingClientRect().width)),minimumButtonHeight:Math.min(...buttons.map(el=>el.getBoundingClientRect().height)),horizontalScroll:paper.scrollWidth>paper.clientWidth,rootOverflow:document.documentElement.scrollWidth>innerWidth+1,contrastSamples:ratios.length,minimumTextContrast:Math.min(...ratios)};
  });
  for(const mode of ['light','dark'])for(const [width,height,docked]of [[1280,900,true],[1280,900,false],[800,600,true],[390,840,true]]){
    await page.setViewportSize({width,height});if((await browse.getAttribute('aria-expanded')==='true')!==docked)await browse.click();
    await page.locator('#appearance-toggle').click();await page.locator('#appearance-mode').selectOption(mode);await page.keyboard.press('Escape');
    await page.locator('.document-scroll').evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});await page.locator('.interactive-component-body').first().scrollIntoViewIfNeeded();await page.waitForTimeout(220);
    record(`${mode} ${width}px keeps a visible benchmark control`,await visible()>0);
    const m=await measure();record(`${mode} ${width}px preserves columns, readable controls and theme contrast`,m.instances===8&&m.columns===4&&m.minimumBodyWidth>=44&&m.minimumButtonWidth>=44&&m.minimumButtonHeight>=44&&!m.rootOverflow&&m.contrastSamples>0&&m.minimumTextContrast>=4.5);
    if(docked&&width===1280)record(`${mode} narrow writing area scrolls its fixed grid`,m.horizontalScroll);
    profiles.push({mode,width,height,docked,...m});
  }
  await page.locator('.interactive-component-body').last().scrollIntoViewIfNeeded();await page.locator('.interactive-component-body').last().getByRole('button',{name:'+',exact:true}).waitFor({state:'attached'});
  record('horizontal and vertical scrolling reaches the last component',await page.locator('.interactive-component-body').last().getByRole('button',{name:'+',exact:true}).count()>0);
  const after=await fingerprint();record('viewing the grid preserves the saved revision and fingerprint',before.revision===after.revision&&before.token===after.token);
  await page.keyboard.press('Control+p');await page.locator('#quick-open-search').fill('ordinary-100-paragraphs');await page.locator('[data-quick-note]').first().click();await page.waitForFunction(()=>document.querySelector('#note-title')?.value==='ordinary-100-paragraphs');await page.waitForTimeout(100);
  record('leaving the component note terminates its worker',page.workers().length===0);record('grid checks have no uncaught browser errors',errors.length===0);
  return{passed:true,native:true,syntheticOnly:true,checks,profiles,errors};
}
