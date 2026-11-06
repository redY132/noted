async page => {
  const native = await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__));
  if (native) {
    const workspace = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('workspace_status'));
    if (!workspace.path.includes('noted-sidebar-ui-')) throw new Error('Synthetic workflow workspace required');
  } else if (new URL(page.url()).origin !== 'http://127.0.0.1:1436') throw new Error('Synthetic preview required');
  if (!await page.evaluate(() => localStorage.getItem('noted-sidebar-fixture'))) throw new Error('Synthetic fixture required');
  await page.reload(); await page.waitForFunction(() => document.querySelector('#note-title')?.value);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (let visit=0;visit<6;visit++) {
    await page.keyboard.press('Control+p'); await page.locator('#quick-open-search').fill(visit%2?'Synthetic observation 105':'Synthetic trail map');
    await page.locator('[data-quick-note]').first().click(); await page.locator('.quick-open-dialog').waitFor({state:'hidden'});
  }
  const openHistory=async()=>{await page.locator('#view-toggle').click();await page.locator('#shell-note-history').click();};
  const openAI=async()=>{if(await page.locator('#open-ai-formatting').isVisible())await page.locator('#open-ai-formatting').click();else{await page.locator('#view-toggle').click();if(!await page.locator('.shell-note-actions').evaluate(el=>el.open))await page.locator('.shell-note-actions summary').click();await page.locator('#shell-action-open-ai-formatting').click();}};
  const measure = async selector => page.locator(selector).evaluate(root => {
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true }); canvas.width = canvas.height = 1;
    const color = value => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
    const luminance = rgb => rgb.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const background = element => { for (let el = element; el; el = el.parentElement) { const rgba = color(getComputedStyle(el).backgroundColor); if (rgba[3] === 255) return rgba; } return color(getComputedStyle(document.body).backgroundColor); };
    const visible = element => {
      if (!element.getClientRects().length || element.closest('[hidden]') || element.closest(':disabled')) return false;
      const r = element.getBoundingClientRect(), s = getComputedStyle(element), bounds = root.getBoundingClientRect();
      if (!r.width || !r.height || s.visibility === 'hidden' || r.bottom <= bounds.top || r.top >= bounds.bottom) return false;
      for (let p=element.parentElement;p&&p!==root;p=p.parentElement) { const style=getComputedStyle(p);if(/auto|scroll|hidden/.test(style.overflowY)){const clip=p.getBoundingClientRect();if(r.bottom<=clip.top||r.top>=clip.bottom)return false;} }
      return true;
    };
    const failures=[], ratios=[], targets=[]; const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){const node=walker.currentNode,el=node.parentElement;if(!node.textContent.trim()||!visible(el))continue;const ratio=contrast(color(getComputedStyle(el).color),background(el));ratios.push(ratio);if(ratio<4.5)failures.push({kind:'text',tag:el.tagName,ratio});}
    for(const element of root.querySelectorAll('button,input,select,textarea,summary')){
      if(!visible(element))continue;const target=element.matches('[type=checkbox]')?element.closest('label')??element:element,r=target.getBoundingClientRect(),style=getComputedStyle(element);targets.push({width:r.width,height:r.height});
      if(r.width<43.9||r.height<43.9)failures.push({kind:'target',tag:element.tagName,width:r.width,height:r.height});
      if(element.matches('input:not([type=checkbox]),select,textarea')&&parseFloat(style.borderTopWidth)&&contrast(color(style.borderTopColor),background(element))<3)failures.push({kind:'field-boundary',tag:element.tagName});
      if(style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)&&contrast(color(style.outlineColor),background(element))<3)failures.push({kind:'focus',tag:element.tagName});
    }
    const r=root.getBoundingClientRect();
    if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1||root.scrollWidth>root.clientWidth+1)failures.push({kind:'overflow',rect:r.toJSON(),scroll:root.scrollWidth,client:root.clientWidth});
    return {minimumTextContrast:Math.min(...ratios),textPairs:ratios.length,targets:targets.length,failures};
  });
  const profiles=[];
  for(const mode of ['light','dark']){
    await page.setViewportSize({width:1200,height:800}); await page.locator('#appearance-toggle').click(); await page.locator('#appearance-mode').selectOption(mode); await page.keyboard.press('Escape');
    for(const [width,height]of [[1200,800],[800,560],[390,840]]){
      await page.setViewportSize({width,height});
      await page.keyboard.press('Control+p'); await page.waitForFunction(()=>document.querySelectorAll('[data-quick-note]').length>0); await page.locator('[data-quick-note]').first().focus();
      const quick=await measure('.quick-open-dialog');if(quick.failures.length)throw new Error(JSON.stringify({mode,width,quick}));
      await page.screenshot({path:`output/playwright/workflow-picker-${mode}-${width}.png`}); await page.keyboard.press('Escape');
      await openAI(); await page.locator('.ai-request-summary:not([hidden])').waitFor(); await page.locator('[data-ai-prompt]').focus();
      const ai=await measure('.ai-formatting-dialog');if(ai.failures.length)throw new Error(JSON.stringify({mode,width,ai}));
      await page.screenshot({path:`output/playwright/workflow-ai-${mode}-${width}.png`}); await page.locator('[data-ai-close]').click();
      await openHistory(); await page.locator('[data-history-close]').focus();
      const history=await measure('.note-history-dialog');if(history.failures.length)throw new Error(JSON.stringify({mode,width,history}));
      await page.screenshot({path:`output/playwright/workflow-history-${mode}-${width}.png`});await page.keyboard.press('Escape');
      profiles.push({mode,width,height,quick,ai,history});
    }
  }
  await page.setViewportSize({width:800,height:600}); await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await page.keyboard.press('Control+p'); await page.waitForFunction(()=>document.querySelectorAll('[data-quick-note]').length>0); await page.locator('[data-quick-note]').first().focus();
  const zoomQuick=await measure('.quick-open-dialog'); if(zoomQuick.failures.some(f=>f.kind==='overflow'))throw new Error('Picker failed large-text reflow');
  await page.screenshot({path:'output/playwright/workflow-picker-text-200.png'}); await page.keyboard.press('Escape');
  await openAI(); await page.locator('.ai-request-summary:not([hidden])').waitFor(); await page.locator('[data-ai-prompt]').focus();
  const zoomAI=await measure('.ai-formatting-dialog');if(zoomAI.failures.some(f=>f.kind==='overflow'))throw new Error('AI dialog failed large-text reflow');
  await page.screenshot({path:'output/playwright/workflow-ai-text-200.png'}); await page.locator('[data-ai-close]').click();await page.evaluate(()=>{document.documentElement.style.fontSize='';});
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await openHistory();
  const zoomHistory=await measure('.note-history-dialog');if(zoomHistory.failures.length)throw new Error(JSON.stringify({zoomHistory}));
  await page.screenshot({path:'output/playwright/workflow-history-text-200.png'});await page.keyboard.press('Escape');await page.evaluate(()=>{document.documentElement.style.fontSize='';});
  const primaryStyleProbes=[];
  for(const mode of ['light','dark']){
    await page.locator('#appearance-toggle').click();await page.locator('#appearance-mode').selectOption(mode);const original=await page.locator('#appearance-accent').inputValue();
    for(const accent of ['#000000','#ffffff','#777777']){
      await page.locator('#appearance-accent').fill(accent);await page.keyboard.press('Escape');
      await openAI();await page.locator('.ai-request-summary:not([hidden])').waitFor();
      await page.locator('.ai-formatting-dialog .tool-actions').first().evaluate(host=>{const probe=document.createElement('button');probe.type='button';probe.className='primary';probe.dataset.workflowContrastProbe='true';probe.textContent='Contrast probe';host.append(probe);});
      const probe=page.locator('[data-workflow-contrast-probe]');await probe.hover();await probe.focus();await page.keyboard.press('ArrowRight');
      const result=await probe.evaluate(element=>{
        const s=getComputedStyle(element),l=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0),contrast=(a,b)=>(Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05);
        return{contrast:contrast(s.color,s.backgroundColor),focusContrast:contrast(s.outlineColor,s.backgroundColor),filter:s.filter,focusVisible:element.matches(':focus-visible')};
      });
      if(result.contrast<4.5||result.focusContrast<3||result.filter!=='none'||!result.focusVisible)throw new Error(JSON.stringify({mode,accent,result}));
      primaryStyleProbes.push({mode,accent,...result});await probe.evaluate(element=>element.remove());await page.locator('[data-ai-close]').click();await page.locator('#appearance-toggle').click();
    }
    await page.locator('#appearance-accent').fill(original);await page.keyboard.press('Escape');
  }
  return {passed:true,native,syntheticOnly:true,profiles,textZoom200Percent:{quick:zoomQuick,ai:zoomAI,history:zoomHistory},primaryStyleProbes};
}
