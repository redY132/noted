async page => {
 const state=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('workspace_status'));
 if(!state.path.includes('noted-private-ui-'))throw new Error('Synthetic fixture required');
 const results=[];
 for(const mode of ['light','dark']){
  await page.emulateMedia({colorScheme:mode,reducedMotion:'reduce'});
  await page.waitForFunction(mode=>document.documentElement.dataset.theme===mode,mode);
  const result=await page.locator('#editor [data-note-background=blue]').first().evaluate(element=>{
   const style=getComputedStyle(element),rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
   const luminance=value=>rgb(value).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
   const b=luminance(style.backgroundColor);
   const contrasts=[element,...element.querySelectorAll('a')].map(node=>{const a=luminance(getComputedStyle(node).color);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
   return{contrast:Math.min(...contrasts),linksChecked:element.querySelectorAll('a').length,background:style.backgroundColor};
  });
  if(result.contrast<4.5)throw new Error('Imported palette contrast failed');
  await page.screenshot({path:`output/playwright/private-palette-${mode}.png`});
  results.push({mode,...result});
 }
 return{passed:true,syntheticOnly:true,profiles:results};
}
