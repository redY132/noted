export const WRITING_WIDTHS = { full: 'Full width', narrow: 'Narrow (600 px)', comfortable: 'Comfortable (760 px)', wide: 'Wide (960 px)' } as const;
export type WritingWidth = keyof typeof WRITING_WIDTHS;
const key='noted-writing-width-v1';
const valid=(value:unknown):value is WritingWidth=>typeof value==='string'&&Object.hasOwn(WRITING_WIDTHS,value);
const pixels:Record<WritingWidth,string>={full:'100%',narrow:'600px',comfortable:'760px',wide:'960px'};

/** A reading preference on this device; never changes saved note geometry. */
export function initializeWritingWidth(host:HTMLElement,options:{root?:HTMLElement;storage?:Pick<Storage,'getItem'|'setItem'>|null}={}){
 const doc=host.ownerDocument,root=options.root??doc.documentElement;
 let storage=options.storage;
 if(storage===undefined){try{storage=doc.defaultView!.localStorage;}catch{storage=null;}}
 let width:WritingWidth='full';
 try{const saved=JSON.parse(storage?.getItem(key)??'null');if(saved?.version===1&&valid(saved.width))width=saved.width;}catch{}
 const label=doc.createElement('label');label.textContent='Writing width';label.htmlFor='writing-width';
 const select=doc.createElement('select');select.id='writing-width';select.setAttribute('aria-describedby','writing-width-help');
 for(const [value,name]of Object.entries(WRITING_WIDTHS)){const option=doc.createElement('option');option.value=value;option.textContent=name;select.append(option);}
 label.append(select);
 const help=doc.createElement('p');help.id='writing-width-help';help.className='writing-width-help';help.textContent='This device only. Note formatting is unchanged; free-placement content remains scrollable.';
 const status=doc.createElement('p');status.className='writing-width-help';status.setAttribute('role','status');
 const resetButton=host.querySelector('#reset-appearance');
 for(const element of [label,help,status])host.insertBefore(element,resetButton);
 status.hidden=true;
 const apply=()=>{root.style.setProperty('--writing-column-width',pixels[width]);select.value=width;};apply();
 const change=()=>{
  if(!valid(select.value)){apply();return;}
  width=select.value;apply();let saved=false;
  try{if(storage){storage.setItem(key,JSON.stringify({version:1,width}));saved=true;}}catch{}
  status.hidden=false;status.textContent=saved?'Writing width saved on this device.':'Writing width applied for this session. Device storage is unavailable.';
 };
 select.onchange=change;
 const reset=()=>{select.value='full';change();};resetButton?.addEventListener('click',reset);
 return{get:()=>width,destroy(){select.onchange=null;resetButton?.removeEventListener('click',reset);label.remove();help.remove();status.remove();root.style.removeProperty('--writing-column-width');}};
}
