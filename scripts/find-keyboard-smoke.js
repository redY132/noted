async page => {
  const native=await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__));
  if(native){
    const allowed=await page.evaluate(async()=>{const expected=window.notedCachedFixture?.workspace;if(!expected||!/noted-simple-ai-[A-Za-z0-9]+[\\/]workspace$/i.test(expected))return false;const normalize=value=>String(value).replaceAll('\\','/').replace(/^\/\/\?\//,'').toLowerCase();const[s,r,p]=await Promise.all(['workspace_status','subscription_status','agent_access'].map(command=>window.__TAURI_INTERNALS__.invoke(command)));return normalize(s.path)===normalize(expected)&&r.authentication==='disabled'&&!r.available&&!p.enabled&&!p.allowHosted&&!p.folderIds.length;});
    if(!allowed)throw new Error('Exact disabled generated native find fixture required');
  }else if(new URL(page.url()).origin!=='http://127.0.0.1:1436'||!await page.evaluate(()=>Boolean(localStorage.getItem('noted-sidebar-fixture'))))throw new Error('Generated browser find fixture required');
  const screenshots=native?await page.evaluate(()=>window.notedCachedFixture.workspace.replace(/[\\/]workspace$/,'/ui-evidence')):'output/playwright';
  let stage='starting',profiles=[];
  const checks = [], errors = [], record = (name, value) => { if (!value) throw new Error(name); checks.push(name); stage=name; };
  page.on('pageerror', error => errors.push(error.message));
  try {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1200,height:800});
  await page.reload(); await page.waitForFunction(() => document.querySelector('#header-connection-handle button'));
  const note = await page.evaluate(async native => {const title=`Synthetic find keyboard ${Date.now()}`;return native?window.__TAURI_INTERNALS__.invoke('create_note',{title,folderId:null}):(await import('/src/api.ts')).api.createNote(title,null);},native);
  await page.keyboard.press('Control+p'); await page.locator('#quick-open-search').fill(note.title); await page.locator(`[data-quick-note="${note.id}"]`).click();
  await page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource === id, note.id);
  const writer = page.locator('#editor .tiptap'), panel = page.locator('#find-panel'), query = page.locator('#find-query');
  const body = 'Synthetic needle and needle. Preserve the original wording until Replace is chosen.';
  await writer.fill(body);
  const send = (target, key, extra = {}) => target.evaluate((field, {key, extra}) => {
    const event = new KeyboardEvent('keydown', {key,bubbles:true,cancelable:true,...extra}); field.dispatchEvent(event); return event.defaultPrevented;
  }, {key,extra});
  for (const key of ['f','h','k']) {
    await writer.focus();
    record(`${key} shortcut leaves composition alone`, !await send(writer,key,{ctrlKey:true,isComposing:true}) && !await panel.isVisible() && !await page.locator('#url-dialog').isVisible());
    record(`${key} shortcut consumes held-key repeat without opening controls`, await send(writer,key,{ctrlKey:true,repeat:true}) && !await panel.isVisible() && !await page.locator('#url-dialog').isVisible());
  }
  await page.keyboard.press('Control+f'); await query.fill('needle'); await page.waitForFunction(() => document.querySelector('#find-count').textContent === '1 of 2');
  record('normal Find opens and keeps typing focus in the query', await query.evaluate(field => field === document.activeElement));
  for (const key of ['Enter','Escape']) record(`find ${key} leaves composition alone`, !await send(query,key,{isComposing:true}) && await panel.isVisible() && await page.locator('#find-count').textContent() === '1 of 2');
  for (const modifier of ['ctrlKey','metaKey','altKey']) record(`find Enter ignores ${modifier}`, !await send(query,'Enter',{[modifier]:true}) && await page.locator('#find-count').textContent() === '1 of 2');
  await query.press('Enter'); record('Enter selects the next match', await page.locator('#find-count').textContent() === '2 of 2');
  await query.press('Shift+Enter'); record('Shift Enter selects the previous match', await page.locator('#find-count').textContent() === '1 of 2');
  record('search alone preserves the document body', await writer.textContent() === body);
  await page.locator('#replace-text').fill('thread'); await page.locator('#replace-all').click();
  record('explicit Replace all changes both matches', await writer.textContent() === body.replaceAll('needle','thread'));
  await page.locator('#find-close').click(); await writer.press('Control+z');
  record('one Undo restores the original words', await writer.textContent() === body);
  for (const mode of ['light','dark']) {
    stage=`${mode} appearance transition`;
    await page.setViewportSize({width:1200,height:800});
    await page.locator('#appearance-toggle').click(); await page.locator('#appearance-mode').selectOption(mode); await page.keyboard.press('Escape');
    for (const [width,height,large] of [[1200,800,false],[800,560,false],[390,840,false],[800,360,false],[800,600,true]]) {
      stage=`${mode} ${width}x${height}${large?' large text':''} layout`;
      await page.setViewportSize({width,height});
      await page.evaluate(large => document.documentElement.style.fontSize=large?'200%':'',large);
      await page.keyboard.press('Control+f');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const measured=await panel.evaluate(panel=>{
        const bounds=panel.getBoundingClientRect(),targets=[...panel.querySelectorAll('button:not(:disabled),input:not([type=checkbox]),label')];
        const rgb=value=>value.match(/[\d.]+/g).map(Number),lum=values=>values.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0),background=el=>{for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length<4||c[3]===1)return c;}return[255,255,255];};
        const ratios=[...targets,panel.querySelector('#find-count')].map(el=>{const a=lum(rgb(getComputedStyle(el).color)),b=lum(background(el));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
        const fieldRatios=targets.filter(el=>el.matches('input')).map(el=>{const a=lum(rgb(getComputedStyle(el).borderTopColor));return Math.min(...[el,el.parentElement].map(neighbor=>{const b=lum(background(neighbor));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}));});
        return {minimumTargetWidth:Math.min(...targets.map(el=>el.getBoundingClientRect().width)),minimumTargetHeight:Math.min(...targets.map(el=>el.getBoundingClientRect().height)),minimumTextContrast:Math.min(...ratios),minimumFieldBoundaryContrast:Math.min(...fieldRatios),queryFont:parseFloat(getComputedStyle(panel.querySelector('#find-query')).fontSize),countFont:parseFloat(getComputedStyle(panel.querySelector('#find-count')).fontSize),rootOverflow:document.documentElement.scrollWidth>innerWidth+1,panelHeight:bounds.height,writingHeight:document.querySelector('.document-scroll').getBoundingClientRect().height,scrollable:panel.scrollHeight>panel.clientHeight};
      });
      const okay=measured.minimumTargetWidth>=43.9&&measured.minimumTargetHeight>=43.9&&measured.minimumTextContrast>=4.5&&measured.minimumFieldBoundaryContrast>=3&&!measured.rootOverflow&&measured.writingHeight>=44&&(!large||measured.queryFont>=27.9&&measured.countFont>=23.9);
      if(!okay)throw new Error(JSON.stringify({mode,width,height,large,...measured}));
      record(`${mode} ${width}x${height}${large?' large text':''} keeps targets and a writing viewport`,true);
      for(const selector of ['#find-query','#find-case','#find-prev','#find-next','#find-close','#replace-text','#replace-one','#replace-all']){
        await page.locator(selector).focus();
        const reachable=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),b=el.closest('#find-panel').getBoundingClientRect();return r.top>=b.top-.5&&r.bottom<=b.bottom+.5&&r.left>=b.left-.5&&r.right<=b.right+.5;});
        if(!reachable)throw new Error(`Find control clipped: ${mode} ${width} ${height} ${large} ${selector}`);
      }
      // Retained scrolling with an already-focused query reproduced the short-window failure.
      await query.focus();
      await panel.evaluate(el=>el.scrollTop=29);
      const documentScroll=await page.locator('.document-scroll').evaluate(el=>el.scrollTop);
      for(let repeat=0;repeat<2;repeat++) {
        await page.keyboard.press('Control+f');
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        record(`${mode} ${width}x${height} repeated Find reveals query ${repeat}`,await query.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('#find-panel').getBoundingClientRect();return el===document.activeElement&&r.top>=p.top-.5&&r.bottom<=p.bottom+.5;}));
      }
      record(`${mode} ${width}x${height} reveal preserves document scroll`,await page.locator('.document-scroll').evaluate((el,expected)=>Math.abs(el.scrollTop-expected)<.5,documentScroll));
      await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      record(`${mode} ${width}x${height} keyboard returns to visible query`,await query.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('#find-panel').getBoundingClientRect();return el===document.activeElement&&r.top>=p.top-.5&&r.bottom<=p.bottom+.5;}));
      const needsScroll=await panel.evaluate(el=>el.scrollHeight>el.clientHeight+1);
      if(needsScroll){stage=`${mode} ${width}x${height} keyboard scrolling`;await panel.evaluate(el=>el.scrollTop=0);await panel.focus();await panel.press('PageDown');await page.waitForFunction(()=>document.querySelector('#find-panel').scrollTop>0,null,{timeout:3000});record(`${mode} ${width}x${height} panel scrolls by keyboard`,await panel.evaluate(el=>el.scrollTop>0));}
      await panel.evaluate(el=>el.scrollTop=0);
      await page.screenshot({path:`${screenshots}/find-${native?'native':'preview'}-${mode}-${width}-${height}${large?'-text-200':''}.png`});
      profiles.push({mode,width,height,large,...measured});
      await page.locator('#find-close').click();
    }
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='');
  await page.setViewportSize({width:1200,height:800});
  await page.keyboard.press('Control+f'); await query.press('Escape');
  record('normal Escape closes Find and returns to writing', !await panel.isVisible() && await writer.evaluate(field => field === document.activeElement));
  record('find keyboard workflow finishes without uncaught browser errors', errors.length === 0 && !await page.locator('dialog[open]').count());
  return {passed:true,native,syntheticOnly:true,noGenerationRequested:true,checks,profiles,screenshots,errors};
  } catch(reason) {
    const diagnostic=await page.evaluate(()=>{const p=document.querySelector('#find-panel');return{panelOpen:p&&!p.hidden,scrollTop:p?.scrollTop,scrollHeight:p?.scrollHeight,clientHeight:p?.clientHeight,focusInPanel:p?.contains(document.activeElement),focusedId:document.activeElement?.id,rootFont:getComputedStyle(document.documentElement).fontSize,theme:document.documentElement.dataset.theme};});
    return {passed:false,native,syntheticOnly:true,noGenerationRequested:true,stage,checks,profiles,screenshots,diagnostic,error:String(reason),errors};
  }
}
