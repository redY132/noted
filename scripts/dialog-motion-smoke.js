async page => {
  if (page.url() !== 'http://127.0.0.1:1436/experiments/ai-activity/' || await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__))) throw new Error('Browser-only synthetic fixture required');
  // A same-origin stylesheet document unloads the app without loading any app JS.
  await page.goto('http://127.0.0.1:1436/src/theme.css');
  const names = ['quick-open','document-outline','note-history','help','review','previous-save'];
  await page.setContent(`<!doctype html><html><head>${['theme','shell-motion',...names.map(name=>name==='review'?'review-ui':name)].map(name=>`<link rel="stylesheet" href="http://127.0.0.1:1436/src/${name}.css">`).join('')}<style>*{box-sizing:border-box}body{margin:0;background:var(--ui-background);color:var(--ui-text);font:14px/1.5 system-ui}dialog{border:1px solid var(--ui-border);border-radius:8px}button,input{font:inherit;color:inherit}button{background:var(--ui-subtle);border:1px solid var(--ui-border)}.synthetic-list{max-height:180px;overflow:auto}.synthetic-list p{padding:6px}</style></head><body><button id="opener">Synthetic layout fixture</button><main id="fixture"></main></body></html>`);
  await page.waitForFunction(()=>[...document.querySelectorAll('link[rel=stylesheet]')].every(link=>link.sheet)&&getComputedStyle(document.documentElement).getPropertyValue('--ui-surface').trim());
  const profiles=[];
  for(const theme of ['light','dark'])for(const [width,height,large]of [[1200,800,false],[800,560,false],[390,840,false],[390,840,true]])for(const reduced of [false,true]){
    await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
    await page.evaluate(({theme,large})=>{document.documentElement.dataset.theme=theme;document.documentElement.style.fontSize=large?'200%':'';},{theme,large});
    for(const name of names){
      await page.evaluate(name=>{
        const host=document.querySelector('#fixture');host.innerHTML=`<dialog class="${name}-dialog" aria-label="Synthetic ${name}"><header><h2>Synthetic dialog</h2><button type="button">Close</button></header><label>Find a saved item<input value="Synthetic search"></label><p>Generated content for closing-layout verification.</p><div class="synthetic-list">${Array.from({length:12},(_,index)=>`<p>Synthetic result ${index+1}</p>`).join('')}</div></dialog>`;
        const dialog=host.querySelector('dialog');dialog.querySelector('button').onclick=()=>dialog.close();document.querySelector('#opener').focus();dialog.showModal();
      },name);
      await page.waitForTimeout(reduced?30:400);
      const result=await page.locator('dialog').evaluate(async dialog=>{
        const describe=()=>{const style=getComputedStyle(dialog),rect=dialog.getBoundingClientRect(),children=[...dialog.children].map(child=>{const r=child.getBoundingClientRect();return{top:(r.top-rect.top)/rect.height,left:(r.left-rect.left)/rect.width,width:r.width/rect.width,height:r.height/rect.height};});return{display:style.display,direction:style.flexDirection,gap:style.gap,width:rect.width,height:rect.height,children};};
        const before=describe();dialog.close();await new Promise(requestAnimationFrame);const closing=describe();await new Promise(resolve=>setTimeout(resolve,420));
        return{before,closing,hidden:getComputedStyle(dialog).display==='none',focusReturned:document.activeElement?.id==='opener'};
      });
      const cssStable=result.before.direction===result.closing.direction&&result.before.gap===result.closing.gap;
      const delta=Math.max(...result.before.children.flatMap((child,index)=>['top','left','width','height'].map(key=>Math.abs(child[key]-result.closing.children[index][key]))));
      if(!result.hidden||!result.focusReturned||!reduced&&(!cssStable||delta>.025))throw new Error(JSON.stringify({theme,width,height,large,reduced,name,cssStable,delta,result}));
      profiles.push({theme,width,height,large,reduced,name,cssStable,maximumNormalizedClosingLayoutChange:reduced?null:delta,hidden:result.hidden,focusReturned:result.focusReturned});
    }
  }
  return{passed:true,browserOnly:true,syntheticMarkupOnly:true,noApplicationAPI:true,profiles};
}
