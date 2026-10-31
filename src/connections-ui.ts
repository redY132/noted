import { noteLinkTarget } from './note-links.ts';
import { createRayMotion, retractRayPath, updateRayMotion, type RayMotion } from './connection-ray.ts';
import { initializeFloatingGraph, floatingMarkup, esc, type FloatingOptions } from './connections-floating.ts';
export type { ConnectionAPI } from './connections-floating.ts';
export const connectionHandle=(id:string,title:string)=>`<button type="button" class="connection-handle" data-connect-source="${esc(id)}" data-source-title="${esc(title||'Untitled')}" aria-label="Connections for ${esc(title||'Untitled')}" aria-expanded="false" aria-controls="connections-panel" aria-haspopup="dialog" title="Click for connections; drag to connect">⤳</button>`;
export const connectionsMarkup=floatingMarkup+`<div id="connection-toast" class="connection-toast" role="status" hidden><span></span><button type="button" id="connection-undo">Undo</button></div><div id="connection-announcement" class="sr-only" aria-live="polite"></div><svg id="connection-ray" class="connection-ray" aria-hidden="true" hidden><defs><marker id="connection-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></marker></defs><path class="connection-ray-path" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" marker-end="url(#connection-arrow)" /></svg>`;
/** Every target carries a real note ID; arbitrary document text is never a target. */
export function targetNote(element:Element|null):string|null {
  if(element?.closest('[data-note-unavailable]'))return null;
  const target=element?.closest<HTMLElement>('[data-note-target],[data-note],a[href]');if(!target)return null;
  const value=target.dataset.noteTarget||target.dataset.note;if(value)return value;
  const link=noteLinkTarget(target.getAttribute('href'));return link?.kind==='note'?link.destination:null;
}
export function initializeConnectionsUI(options:FloatingOptions){
  const graph=initializeFloatingGraph(options),ray=document.querySelector<HTMLElement>('#connection-ray')!;
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const mutate=graph.mutate;
  let dragging:{id:number;source:string;title:string;startX:number;startY:number;x:number;y:number;handle:HTMLElement;active:boolean;target:Element|null;frame:number;motion:RayMotion;time:number}|null=null;
  let suppressedDragClick:{handle:HTMLElement;until:number}|null=null,retractionFrame=0;
  function stopRetraction() {
    cancelAnimationFrame(retractionFrame); retractionFrame=0; ray.setAttribute('hidden','');
  }
  function retract(drag: NonNullable<typeof dragging>) {
    const curve=drag.motion.curve;
    if(!curve||reducedMotion?.matches){stopRetraction();return;}
    const start=performance.now(),path=ray.querySelector('.connection-ray-path')!;
    const step=(now:number)=>{
      if(reducedMotion?.matches){stopRetraction();return;}
      const progress=Math.max(0,Math.min(1,(now-start)/400));
      const rect=drag.handle.isConnected?drag.handle.getBoundingClientRect():null;
      const anchor=rect?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:curve.source;
      path.setAttribute('d',retractRayPath(curve,(1+Math.cos(progress*Math.PI))/2,anchor));
      if(progress>=1){stopRetraction();return;}
      retractionFrame=requestAnimationFrame(step);
    };
    retractionFrame=requestAnimationFrame(step);
  }
  function finishDrag(mode: 'drop'|'cancel'|'leave'='drop') {
    const cancel=mode==='cancel';
    if(cancel)stopRetraction();
    const drag=dragging; if(!drag) return;
    dragging=null; cancelAnimationFrame(drag.frame);
    if(drag.active&&!cancel)retract(drag);else stopRetraction();
    drag.target?.classList.remove('connection-drop-target'); document.body.classList.remove('connection-dragging');
    try {drag.handle.releasePointerCapture?.(drag.id);} catch { /* element may have rerendered */ }
    if(drag.active||mode==='leave')suppressedDragClick={handle:drag.handle,until:mode==='leave'?Infinity:Date.now()+400};
    if(drag.active&&mode==='drop'){const id=targetNote(document.elementFromPoint(drag.x,drag.y));if(id&&id!==drag.source)void mutate(drag.source,id,true);}
  }
  function frame(now=performance.now()) {
    const drag=dragging; if(!drag?.active) return;
    const rect=drag.handle.getBoundingClientRect(), path=ray.querySelector('.connection-ray-path')!;
    path.setAttribute('d',updateRayMotion(drag.motion,{x:rect.left+rect.width/2,y:rect.top+rect.height/2},{x:drag.x,y:drag.y},now-drag.time,reducedMotion?.matches??false));
    drag.time=now;
    const hit=document.elementFromPoint(drag.x,drag.y), id=targetNote(hit);
    const target=id&&id!==drag.source?hit?.closest('[data-note-target],[data-note],a[href]')??null:null;
    if(target!==drag.target){drag.target?.classList.remove('connection-drop-target');target?.classList.add('connection-drop-target');drag.target=target;}
    let container=hit as HTMLElement|null;
    while(container && container!==document.body){
      const style=getComputedStyle(container),r=container.getBoundingClientRect();
      const scrollY=/auto|scroll/.test(style.overflowY)&&container.scrollHeight>container.clientHeight;
      const scrollX=/auto|scroll/.test(style.overflowX)&&container.scrollWidth>container.clientWidth;
      if(scrollY||scrollX){const dy=scrollY?(drag.y<r.top+28?-10:drag.y>r.bottom-28?10:0):0;const dx=scrollX?(drag.x<r.left+28?-10:drag.x>r.right-28?10:0):0;if(dy)container.scrollTop+=dy;if(dx)container.scrollLeft+=dx;break;}
      container=container.parentElement;
    }
    drag.frame=requestAnimationFrame(frame);
  }
  document.addEventListener('pointerdown',event=>{
    const handle=(event.target as Element).closest<HTMLElement>('[data-connect-source]');
    if(!handle||event.button!==0||!handle.dataset.connectSource)return;
    event.preventDefault(); event.stopPropagation();
    stopRetraction();
    suppressedDragClick=null;
    dragging={id:event.pointerId,source:handle.dataset.connectSource,title:handle.dataset.sourceTitle||'Untitled',startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,handle,active:false,target:null,frame:0,motion:createRayMotion({x:event.clientX,y:event.clientY}),time:performance.now()};
    handle.setPointerCapture?.(event.pointerId);
  },true);
  document.addEventListener('pointermove',event=>{
    const drag=dragging;if(!drag||event.pointerId!==drag.id)return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(drag.x<0||drag.y<0||drag.x>=innerWidth||drag.y>=innerHeight){finishDrag('leave');return;}
    if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>6){drag.active=true;ray.removeAttribute('hidden');document.body.classList.add('connection-dragging');frame();}
    if(drag.active)event.preventDefault();
  },true);
  document.addEventListener('pointerup',event=>{if(dragging?.id===event.pointerId){dragging.x=event.clientX;dragging.y=event.clientY;finishDrag();}},true);
  document.addEventListener('pointerout',event=>{if(event.relatedTarget===null&&dragging?.id===event.pointerId)finishDrag('leave');},true);
  document.addEventListener('pointerleave',event=>{if((event.target===document||event.target===document.documentElement)&&dragging?.id===event.pointerId)finishDrag('leave');},true);
  document.addEventListener('pointercancel',()=>finishDrag('cancel'),true);
  document.addEventListener('lostpointercapture',event=>{if(dragging?.id===event.pointerId)finishDrag('leave');},true);
  window.addEventListener('blur',()=>finishDrag('leave'));

  document.addEventListener('mousedown',event=>{if((event.target as Element).closest('[data-connect-source]'))event.preventDefault();},true);
  document.addEventListener('click',event=>{
    const handle=(event.target as Element).closest<HTMLElement>('[data-connect-source]');
    if(suppressedDragClick&&Date.now()<suppressedDragClick.until&&handle===suppressedDragClick.handle&&event.detail!==0){suppressedDragClick=null;event.preventDefault();event.stopImmediatePropagation();return;}
    if(handle){event.preventDefault();event.stopPropagation();graph.open(handle,event.detail===0);}
  },true);
  document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(dragging){event.preventDefault();finishDrag('cancel');}else if(retractionFrame){event.preventDefault();stopRetraction();}if(graph.isOpen()){event.preventDefault();if(graph.dismissPopup()){event.stopPropagation();}else graph.close();}},true);
  return{...graph,isDragging:()=>Boolean(dragging)};
}
