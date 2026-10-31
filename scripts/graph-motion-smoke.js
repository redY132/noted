async page => {
  // Disposable graph fixture only. Verify release momentum with real pointer events.
  await page.setViewportSize({width:1200,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  if(!await page.locator('#connections-panel').evaluate(el=>el.hidden))await page.locator('#connections-close').click();
  if(await page.locator('[data-panel-toggle=notes]').getAttribute('aria-expanded')!=='true')await page.locator('[data-panel-toggle=notes]').click();
  await page.locator('#search').fill('Orchard notebook');
  await page.locator('[data-note="10000000-0000-4000-8000-000000000001"]').click();
  await page.waitForFunction(()=>document.querySelector('#note-title')?.value==='Orchard notebook');
  await page.locator('#search').fill('');
  await page.locator('#header-connection-handle button').click();
  await page.waitForFunction(()=>document.querySelector('#connection-graph').dataset.layoutState==='settled');
  const surfaces=await page.evaluate(()=>{
    const panel=getComputedStyle(document.querySelector('#connections-panel')),stage=getComputedStyle(document.querySelector('.connection-graph-stage'));
    const rect=document.querySelector('#connection-graph').getBoundingClientRect();
    return {panel:panel.backgroundColor,stage:stage.backgroundColor,contentOpacity:getComputedStyle(document.querySelector('.document-scroll')).opacity,width:rect.width,height:rect.height,viewport:{width:innerWidth,height:innerHeight}};
  });
  if(surfaces.panel!=='rgba(0, 0, 0, 0)'||surfaces.stage!=='rgba(0, 0, 0, 0)'||surfaces.contentOpacity!=='1'||surfaces.width!==surfaces.viewport.width||surfaces.height<surfaces.viewport.height-40)throw Error('Graph is not fully transparent/full-screen: '+JSON.stringify(surfaces));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(()=>document.querySelector('#connection-graph').dataset.layoutState==='settled');
  const transform=()=>page.locator('#connection-viewport').getAttribute('transform');
  const pan=async()=>{await page.mouse.move(85,690);await page.mouse.down();for(let i=1;i<=5;i++){await page.mouse.move(85+i*20,690+i*3);await page.waitForTimeout(20);}await page.mouse.up();};
  await pan();const release=await transform();await page.waitForTimeout(100);const tail=await transform();await page.waitForTimeout(2400);const resting=await transform();await page.waitForTimeout(120);const still=await transform();
  if(release===tail)throw Error('Panning stopped immediately');if(resting!==still)throw Error('Panning did not stop');
  await page.locator('[data-graph-action=reset]').click();
  const node=page.locator('[data-graph-node="10000000-0000-4000-8000-000000000001"]');
  const bounds=await node.locator('circle').boundingBox(),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
  await page.mouse.move(x,y);await page.mouse.down();for(let i=1;i<=5;i++){await page.mouse.move(x+i*15,y-i*3);await page.waitForTimeout(20);}await page.mouse.up();
  const nodeReleased=await node.getAttribute('transform');await page.waitForTimeout(100);const nodeCoasted=await node.getAttribute('transform');
  if(nodeReleased===nodeCoasted)throw Error('Released node stopped immediately');
  await page.waitForFunction(()=>document.querySelector('#connection-graph').dataset.layoutState==='settled');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#connection-graph').dataset.layoutState==='settled');
  await pan();const reducedRelease=await transform();await page.waitForTimeout(120);if(reducedRelease!==await transform())throw Error('Reduced motion panning coasted');
  await page.emulateMedia({reducedMotion:'no-preference'});await pan();await page.locator('#connections-close').click();
  const closed=await transform();await page.waitForTimeout(160);if(closed!==await transform())throw Error('Closed graph kept panning');
  return {passed:true,transparent:true,fullScreen:true,panMomentum:true,nodeMomentum:true,reducedMotion:true,closeCancels:true,surfaces};
}
