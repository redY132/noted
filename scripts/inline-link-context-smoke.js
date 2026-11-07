async page=>{
  const native=await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__));
  if(native){
    const allowed=await page.evaluate(async()=>{const expected=window.notedCachedFixture?.workspace;if(!expected||!/noted-simple-ai-[A-Za-z0-9]+[\\/]workspace$/i.test(expected))return false;const normalize=value=>String(value).replaceAll('\\','/').replace(/^\/\/\?\//,'').toLowerCase();const[s,r,p]=await Promise.all(['workspace_status','subscription_status','agent_access'].map(command=>window.__TAURI_INTERNALS__.invoke(command)));return normalize(s.path)===normalize(expected)&&r.authentication==='disabled'&&!r.available&&!p.enabled&&!p.allowHosted&&!p.folderIds.length;});
    if(!allowed)throw new Error('Exact disabled generated native inline-link fixture required');
  }else if(new URL(page.url()).origin!=='http://127.0.0.1:1436'||!await page.evaluate(()=>Boolean(localStorage.getItem('noted-sidebar-fixture'))))throw new Error('Generated browser inline-link fixture required');
  const screenshots=native?await page.evaluate(()=>window.notedCachedFixture.workspace.replace(/[\\/]workspace$/,'/ui-evidence')):'output/playwright';
  const checks=[],profiles=[],errors=[],record=(name,okay)=>{if(!okay)throw new Error(name);checks.push(name);};page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1280,height:900});await page.reload();await page.waitForFunction(()=>document.querySelector('#header-connection-handle button'));
  const notes=await page.evaluate(async native=>{const create=title=>native?window.__TAURI_INTERNALS__.invoke('create_note',{title,folderId:null}):import('/src/api.ts').then(({api})=>api.createNote(title,null));return Promise.all([...['source','destination','target'].map(name=>create(`Synthetic inline link ${name} ${Date.now()}`)),create('Synthetic '+ 'L'.repeat(290))]);},native);
  await page.keyboard.press('Control+p');await page.locator('#quick-open-search').fill(notes[0].title);await page.locator(`[data-quick-note="${notes[0].id}"]`).click();await page.waitForFunction(id=>document.querySelector('#header-connection-handle button')?.dataset.connectSource===id,notes[0].id);
  if(!await page.locator('#formatting-tools').isVisible())await page.locator('[data-panel-toggle=formatting]').click();
  const writer=page.locator('#editor .tiptap'),dialog=page.locator('#link-dialog'),target=page.locator(`[data-link="${notes[2].id}"]`),snapshot=()=>writer.evaluate(el=>JSON.stringify(el.editor.getJSON()));
  const open=async()=>{await writer.evaluate(el=>el.editor.commands.setTextSelection({from:1,to:6}));await page.locator('#insert-link').click();await dialog.waitFor({state:'visible'});await page.locator('#link-search').fill(notes[2].title);await target.waitFor({state:'visible'});};
  await writer.fill('Alpha Beta');await open();await writer.evaluate(el=>el.editor.commands.insertContentAt(1,'Changed '));const changed=await snapshot();await target.click();await dialog.waitFor({state:'hidden'});
  record('a changed document refuses a stale local-note link range',await snapshot()===changed&&await writer.locator('a').count()===0);
  record('closing releases the local-note result controls',await page.locator('#link-results [data-link]').count()===0);
  await open();await page.waitForFunction(id=>document.querySelector(`#note-list [data-note="${id}"]`),notes[1].id);await page.evaluate(id=>document.querySelector(`#note-list [data-note="${id}"]`).click(),notes[1].id);await page.waitForFunction(id=>document.querySelector('#header-connection-handle button')?.dataset.connectSource===id,notes[1].id);
  const destination=await snapshot();await target.click();await dialog.waitFor({state:'hidden'});
  record('another editor refuses the previous local-note link range',await snapshot()===destination&&await writer.locator('a').count()===0);
  await writer.fill('Gamma Delta');await open();await target.click();await dialog.waitFor({state:'hidden'});
  record('a normal local-note link preserves words and the stable target ID',await writer.textContent()==='Gamma Delta'&&await writer.locator('a').textContent()==='Gamma'&&await writer.locator('a').getAttribute('href')===`noted://note/${notes[2].id}`);
  await writer.press('Control+z');record('one Undo removes the selected-text local-note link',await writer.textContent()==='Gamma Delta'&&await writer.locator('a').count()===0);
  await writer.focus();await writer.press('Control+End');await page.keyboard.type(' Prior edit.');const prior=await snapshot();
  await page.locator('#insert-link').click();await page.locator('#link-search').fill(notes[2].title);await target.click();await dialog.waitFor({state:'hidden'});
  record('caret insertion includes the chosen note title',await writer.textContent()===`Gamma Delta Prior edit.${notes[2].title}`);
  await writer.press('Control+z');record('Undoing the local-note insertion preserves the prior edit',await snapshot()===prior);
  await open();await writer.evaluate(el=>el.editor.setEditable(false));const readonly=await snapshot();await target.click();await dialog.waitFor({state:'hidden'});
  record('a no-longer-editable note refuses the local-note link',await snapshot()===readonly);await writer.evaluate(el=>el.editor.setEditable(true));
  await open();await page.locator('#link-dialog [data-close]').click();
  record('Cancel clears the picker without changing the note',await snapshot()===prior&&await page.locator('#link-results [data-link]').count()===0);
  await open();const composingEscape=await page.locator('#link-search').evaluate(el=>{const event=new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;});
  record('composing Escape leaves the note-link picker open',!composingEscape&&await dialog.isVisible());
  await page.keyboard.press('Escape');record('Escape clears the picker without changing the note',await snapshot()===prior&&await page.locator('#link-results [data-link]').count()===0);
  if(!native){
    await page.evaluate(async()=>{const{api}=await import('/src/api.ts');const original=api.picker;window.__inlinePickerOriginal=original;window.__inlinePickerPending=[];api.picker=(...args)=>new Promise(resolve=>window.__inlinePickerPending.push(async()=>resolve(await original(...args))));});
    try{
      await writer.evaluate(el=>el.editor.commands.setTextSelection({from:1,to:6}));await page.locator('#insert-link').click();await dialog.waitFor({state:'visible'});
      await page.waitForFunction(()=>window.__inlinePickerPending.length>0);await page.locator('#link-dialog [data-close]').click();
      await page.evaluate(async()=>{const{api}=await import('/src/api.ts');api.picker=window.__inlinePickerOriginal;await Promise.all(window.__inlinePickerPending.map(resolve=>resolve()));});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      record('a late search reply cannot repopulate a closed picker',!await dialog.isVisible()&&await page.locator('#link-results [data-link]').count()===0&&await snapshot()===prior);
    }finally{await page.evaluate(async()=>{const{api}=await import('/src/api.ts');api.picker=window.__inlinePickerOriginal;delete window.__inlinePickerOriginal;delete window.__inlinePickerPending;});}
  }
  for(const mode of ['light','dark']){
    await page.evaluate(()=>document.documentElement.style.fontSize='');await page.setViewportSize({width:1280,height:900});
    await page.locator('#appearance-toggle').click();await page.locator('#appearance-mode').selectOption(mode);await page.keyboard.press('Escape');
    for(const[width,height,large]of[[1280,900,false],[800,560,false],[390,640,false],[800,360,false],[800,600,true]]){
      await page.setViewportSize({width,height});await page.evaluate(large=>document.documentElement.style.fontSize=large?'200%':'',large);
      await page.locator('#insert-link').click();await dialog.waitFor({state:'visible'});await page.locator(`[data-link="${notes[3].id}"]`).waitFor({state:'attached'});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const m=await dialog.evaluate(root=>{
        const targets=[...root.querySelectorAll('button,input')],r=root.getBoundingClientRect(),rgb=value=>value.match(/[\d.]+/g).map(Number),lum=values=>values.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0),background=el=>{for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length<4||c[3]===1)return c;}return[255,255,255];},contrast=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        const text=[...root.querySelectorAll('h2,p,button span,small,input,.dialog-actions button')];
        const input=root.querySelector('input'),list=root.querySelector('.link-results');
        return{minimumTargetHeight:Math.min(...targets.map(el=>el.getBoundingClientRect().height)),minimumTargetWidth:Math.min(...targets.map(el=>el.getBoundingClientRect().width)),minimumTextContrast:Math.min(...text.map(el=>contrast(lum(rgb(getComputedStyle(el).color)),lum(background(el))))),fieldBoundaryContrast:contrast(lum(rgb(getComputedStyle(input).borderTopColor)),lum(background(input))),queryFont:parseFloat(getComputedStyle(input).fontSize),overflow:root.scrollWidth>root.clientWidth+1||targets.some(el=>el.scrollWidth>el.clientWidth+1),outsideViewport:r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1,resultCount:list.querySelectorAll('button').length,dialogScrollable:root.scrollHeight>root.clientHeight+1,listScrollable:list.scrollHeight>list.clientHeight+1};
      });
      const okay=m.minimumTargetHeight>=43.9&&m.minimumTargetWidth>=43.9&&m.minimumTextContrast>=4.5&&m.fieldBoundaryContrast>=3&&!m.overflow&&!m.outsideViewport&&m.resultCount>0&&(!large||m.queryFont>=27.9);
      if(!okay)throw new Error(JSON.stringify({mode,width,height,large,...m}));record(`${mode} ${width}x${height}${large?' large text':''} picker targets, contrast and wrapping`,true);
      const list=page.locator('#link-results');if(m.listScrollable){await list.evaluate(el=>el.scrollTop=0);await list.focus();await list.press('PageDown');await page.waitForFunction(()=>document.querySelector('#link-results').scrollTop>0,null,{timeout:3000});record(`${mode} ${width}x${height} results scroll by keyboard`,true);}
      await page.locator(`[data-link="${notes[3].id}"]`).focus();await page.screenshot({path:`${screenshots}/note-link-${native?'native':'preview'}-${mode}-${width}-${height}${large?'-text-200':''}.png`});
      profiles.push({mode,width,height,large,...m});await page.locator('#link-dialog [data-close]').focus();await page.locator('#link-dialog [data-close]').click();
    }
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='');record('picker layout checks preserve the document',await snapshot()===prior);
  await writer.evaluate(el=>{el.editor.commands.setCodeBlock();el.editor.commands.setTextSelection({from:1,to:6});});const code=await snapshot();
  await page.locator('#insert-link').evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  record('unsupported code selections cannot open the note-link picker',!await dialog.isVisible()&&await snapshot()===code&&(await page.locator('#error-message').textContent()).toLowerCase().includes('ordinary text'));
  await writer.evaluate(el=>el.editor.commands.setParagraph());
  await page.keyboard.press('Control+s');record('no uncaught errors or open dialogs remain',errors.length===0&&!await page.locator('dialog[open]').count());
  return{passed:true,native,syntheticOnly:true,noGenerationRequested:true,lateResponseChecked:!native,checks,profiles,screenshots,errors};
}
