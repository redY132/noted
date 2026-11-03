import { Editor, type JSONContent } from '@tiptap/core';
import { createEditorExtensions } from './editor-extensions.ts';
import { documentFromEditor, type LayoutNode, type NotedDocumentV2 } from './document-model.ts';
import { accentForeground, contrastRatio, readableAccent } from './appearance.ts';
import type { SchemaId } from './model.ts';

export interface Box { left:number;top:number;right:number;bottom:number }
export function intersects(a:Box,b:Box) { return Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5; }
export function outside(a:Box,b:Box) { return a.left < b.left-1 || a.top < b.top-1 || a.right > b.right+1 || a.bottom > b.bottom+1; }
export const minimumTextContrast=(size:number,weight:number)=>size>=24||size>=18.6666666667&&weight>=700?3:4.5;
export interface RenderReport { version:1; profiles:{theme:string;width:number;textBoxes:number}[]; checkedObjects:number }
type Region={box:Box;element:Element;kind:'text'|'surface';owner:string};
const MAX_REGIONS=50000,MAX_COMPARISONS=200000;

function scopedStyles() {
  let text='';
  for(const sheet of document.styleSheets) {
    try { text += [...sheet.cssRules].map(rule=>rule.cssText).join('\n'); }
    catch { throw new Error('The preview could not read the bundled styles. Reload the app before validating.'); }
  }
  if(!text)throw new Error('Rendered validation requires the real browser and bundled styles.');
  return text.replace(/:root(\[[^\]]+\])?/g,(_match,attribute)=>attribute?`:host(${attribute})`:':host')+
    '\n:host{display:block;color:var(--ui-text);background:var(--ui-surface)} .document{padding:0;max-width:none;margin:0;width:100%} .tiptap{outline:0} *,*::before,*::after{animation:none!important;transition:none!important} .component-move,.component-resize{display:none!important}';
}
function projectionCheck(editor:Editor,candidate:NotedDocumentV2,noteId:string) {
  const projected=documentFromEditor(editor.getJSON(),noteId,candidate);
  if(JSON.stringify(projected.readingOrder)!==JSON.stringify(candidate.readingOrder))throw new Error('The editor cannot preserve this proposal’s reading order.');
  const nodes=new Map<string,LayoutNode>();
  const collect=(node:LayoutNode)=>{nodes.set(node.contentId??node.id,node);node.children?.forEach(collect);};collect(projected.layout);
  const check=(node:LayoutNode)=>{
    const key=node.contentId??node.id,actual=nodes.get(key),expected={...node.style,...(node.contentId?candidate.styles[node.contentId]:{})};
    if(!actual||actual.kind!==node.kind)throw new Error('Unsupported layout projection: '+key);
    for(const [property,value] of Object.entries(expected))if(actual.style?.[property as keyof typeof expected]!==value)throw new Error(`The editor does not support ${property} on ${key}. Put ordinary text in a layout box before arranging it.`);
    node.children?.forEach(check);
  };check(candidate.layout);
}
function measure(editor:Editor,host:HTMLElement,root:ShadowRoot):number {
  const regions:Region[]=[],origin=editor.view.dom.getBoundingClientRect(),canvas={left:origin.left,top:origin.top,right:origin.left+100000,bottom:origin.top+100000};
  const canvasElement=document.createElement('canvas');canvasElement.width=canvasElement.height=1;
  const context=canvasElement.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Color validation is unavailable.');
  const colors=new Map<string,number[]>();
  const rgba=(value:string)=>{
    let color=colors.get(value);if(color)return color;
    context.clearRect(0,0,1,1);context.fillStyle='#000';context.fillStyle=value;context.fillRect(0,0,1,1);color=[...context.getImageData(0,0,1,1).data];colors.set(value,color);return color;
  };
  const blend=(top:number[],bottom:number[])=>[0,1,2].map(i=>top[i]*(top[3]/255)+bottom[i]*(1-top[3]/255));
  const hex=(color:number[])=>'#'+color.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
  const background=(element:Element)=>{
    const chain:Element[]=[];for(let value:Element|null=element;value;value=value.parentElement)chain.unshift(value);
    let color=rgba(getComputedStyle(host).backgroundColor);
    for(const item of chain)color=[...blend(rgba(getComputedStyle(item).backgroundColor),color),255];
    return color;
  };
  const owner=(element:Element)=>element.closest<HTMLElement>('[data-validation-object]')?.dataset.validationObject??'';
  const add=(region:Region)=>{if(regions.length>=MAX_REGIONS)throw new Error('This note exceeds the bounded rendered-preview limit. Split the proposal or use manual editing.');regions.push(region);};
  editor.state.doc.descendants((node,position)=>{
    if(!node.attrs.id)return;
    const element=editor.view.nodeDOM(position);if(!(element instanceof HTMLElement))return;
    element.dataset.validationObject=node.attrs.id;
    if(['notePanel','localImage'].includes(node.type.name)){
      const box=element.getBoundingClientRect();
      if(outside(box,canvas))throw new Error('A rendered component is outside the reachable canvas: '+node.attrs.id);
      if(node.type.name==='localImage'||rgba(getComputedStyle(element).backgroundColor)[3]>0)add({box,element,kind:'surface',owner:node.attrs.id});
    }
  });
  const walker=document.createTreeWalker(editor.view.dom,NodeFilter.SHOW_TEXT);
  let text:Node|null,textBoxes=0;
  while((text=walker.nextNode())){
    if(!text.textContent?.trim())continue;
    const parent=text.parentElement!;if(parent.closest('.component-move,.component-resize,.image-status'))continue;
    const style=getComputedStyle(parent),range=document.createRange();range.selectNodeContents(text);
    const boxes=[...range.getClientRects()].filter(box=>box.width>.1&&box.height>.1);
    if(!boxes.length||style.visibility!=='visible'||style.display==='none')throw new Error('The proposal hides authored text.');
    let opacity=1;
    for(let element:Element|null=parent;element;element=element.parentElement)opacity*=Number(getComputedStyle(element).opacity);
    if(opacity<.99)throw new Error('The proposal makes authored text translucent.');
    const foreground=rgba(style.color),back=background(parent),color=blend(foreground,back);
    const size=parseFloat(style.fontSize),threshold=minimumTextContrast(size,Number(style.fontWeight)||400);
    if(size<10||contrastRatio(hex(color),hex(back))<threshold)throw new Error(`Unreadable text contrast or size near “${text.textContent.trim().slice(0,50)}”. Use at least ${threshold}:1 contrast and 10 px text.`);
    for(const box of boxes){
      if(outside(box,canvas))throw new Error('Authored text extends outside the reachable canvas.');
      for(let ancestor:Element|null=parent;ancestor&&ancestor!==editor.view.dom;ancestor=ancestor.parentElement){
        const s=getComputedStyle(ancestor),bounds=ancestor.getBoundingClientRect();
        if(/hidden|clip/.test(s.overflowX)&& (box.left<bounds.left-1||box.right>bounds.right+1) || /hidden|clip/.test(s.overflowY)&& (box.top<bounds.top-1||box.bottom>bounds.bottom+1))throw new Error('A container clips authored text.');
      }
      add({box,element:parent,kind:'text',owner:owner(parent)});textBoxes++;
    }
  }
  // Spatial buckets bound work without comparing every line to every other line.
  const buckets=new Map<string,number[]>();let comparisons=0,entries=0;
  for(let index=0;index<regions.length;index++){
    const item=regions[index],seen=new Set<number>();
    for(let x=Math.floor((item.box.left-origin.left)/256);x<=Math.floor((item.box.right-origin.left)/256);x++)for(let y=Math.floor((item.box.top-origin.top)/128);y<=Math.floor((item.box.bottom-origin.top)/128);y++){
      if(++entries>250000)throw new Error('The proposal exceeds the bounded geometry-validation budget.');
      const key=x+','+y,list=buckets.get(key)??[];
      for(const otherIndex of list){
        if(seen.has(otherIndex))continue;seen.add(otherIndex);
        const other=regions[otherIndex];
        if(item.owner===other.owner||item.element.contains(other.element)||other.element.contains(item.element))continue;
        if(++comparisons>MAX_COMPARISONS)throw new Error('The proposal is too dense to validate safely.');
        if(intersects(item.box,other.box))throw new Error(`Rendered content overlaps: ${item.owner} and ${other.owner}. Separate the boxes before applying.`);
      }
      list.push(index);buckets.set(key,list);
    }
  }
  void root;return textBoxes;
}

/** Trusted inert render: no component runtime, code execution, or live editor transactions. */
export async function validateRenderedDocument(options:{editor:Editor;document:NotedDocumentV2;content:JSONContent;noteId:string;schemaId:SchemaId;resolveAsset?:(id:string)=>Promise<string>;releaseAsset?:(url:string)=>void;previewHost?:HTMLElement}) {
  // Future component states cannot be certified by a static render. Fail closed.
  options.editor.schema.nodeFromJSON(options.content).check();
  let nodes=0,characters=0;const budget=(node:JSONContent)=>{nodes++;characters+=node.text?.length??0;if(nodes>20000||characters>2000000)throw new Error('This note exceeds the bounded rendered-preview budget. Use manual editing.');node.content?.forEach(budget);};budget(options.content);
  if(Object.keys(options.document.objects).length>5000)throw new Error('Too many objects for a bounded rendered preview.');
  let hasInteractive=false,hasMotion=false;
  const visit=(node:JSONContent)=>{if(node.type==='interactiveComponent')hasInteractive=true;if(node.attrs?.animation&&node.attrs.animation!=='none')hasMotion=true;node.content?.forEach(visit);};visit(options.content);
  if(hasMotion)throw new Error('Automated proposals with motion presets are not supported. Set the affected presets to None or edit the layout manually.');
  if(hasInteractive)throw new Error('Automated document proposals containing interactive components are not supported. Edit those notes manually; custom code is never run to validate a proposal.');
  const width=Math.max(160,Math.round(options.editor.view.dom.getBoundingClientRect().width));
  const widths=[...new Set([Math.min(width,360),width,Math.max(width,1200)])];
  const theme=document.documentElement.dataset.theme==='dark'?'dark':'light',themes=['light','dark'];
  const styles=scopedStyles(),assets=new Map<string,Promise<string>>(),report:RenderReport={version:1,profiles:[],checkedObjects:Object.keys(options.document.objects).length};
  let retained:{host:HTMLElement;editor:Editor}|undefined;
  const dispose=()=>{retained?.editor.destroy();retained?.host.remove();retained=undefined;for(const promise of assets.values())void promise.then(url=>options.releaseAsset?.(url),()=>{});assets.clear();};
  try{
    for(const candidateTheme of themes)for(const candidateWidth of widths){
      const host=document.createElement('div');host.dataset.theme=candidateTheme;host.style.cssText=`position:fixed;left:-200000px;top:0;width:${candidateWidth}px;pointer-events:none;z-index:-1`;
      const accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#52525b';
      host.style.setProperty('--accent',accent);host.style.setProperty('--accent-foreground',accentForeground(accent));host.style.setProperty('--accent-text',readableAccent(accent,candidateTheme==='dark'?'#202024':'#f7f7f8',candidateTheme==='dark'));
      const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');style.textContent=styles;shadow.append(style);
      const article=document.createElement('article');article.className='document';article.dataset.schema=options.schemaId;
      const element=document.createElement('div');article.append(element);shadow.append(article);document.body.append(host);
      const preview=new Editor({element,extensions:createEditorExtensions(()=>options.schemaId),content:options.content,editable:false});
      try{
        projectionCheck(preview,options.document,options.noteId);
        const pending:Promise<void>[]=[];
        preview.state.doc.descendants((node,position)=>{
          if(node.type.name!=='localImage')return;
          if(!options.resolveAsset)throw new Error('Images must be available before validating this proposal.');
          let request=assets.get(node.attrs.assetId);if(!request){request=options.resolveAsset(node.attrs.assetId);assets.set(node.attrs.assetId,request);}
          const image=(preview.view.nodeDOM(position) as HTMLElement).querySelector('img')!;
          pending.push(request.then(async url=>{image.loading="eager";image.src=url;await image.decode();(image.closest(".local-image")!.querySelector(".image-status") as HTMLElement).hidden=true;}));
        });
        await Promise.all(pending);await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        report.profiles.push({theme:candidateTheme,width:candidateWidth,textBoxes:measure(preview,host,shadow)});
        if(candidateTheme===theme&&candidateWidth===width&&options.previewHost){retained={host,editor:preview};}else{preview.destroy();host.remove();}
      }catch(error){preview.destroy();host.remove();throw error;}
    }
    if(retained&&options.previewHost){retained.host.style.cssText=`width:${width}px;max-width:none;pointer-events:none`;options.previewHost.replaceChildren(retained.host);}
    return {report,dispose};
  }catch(error){dispose();throw error;}
}
