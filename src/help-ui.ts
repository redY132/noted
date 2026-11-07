import { helpEntries, matchingHelp } from './help-reference.ts';
export function initializeHelp(host: HTMLElement, o: { menu: HTMLElement; focusEditor(): void; mac?: boolean }) {
  const doc=host.ownerDocument,win=doc.defaultView!,$=<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!;
  const mac=o.mac??/Mac|iPhone|iPad/.test(`${win.navigator.platform} ${win.navigator.userAgent}`),entries=helpEntries(mac);
  host.innerHTML='<dialog class="help-dialog" id="help-dialog" aria-labelledby="help-title"><header><h2 id="help-title">Help &amp; shortcuts</h2><button type="button" data-help-close>Close</button></header><p>Find commands for writing, navigation, recovery and AI proposals.</p><label>Find a command, key or workflow<input type="search" data-help-search autocomplete="off" placeholder="For example: Ctrl P, previous save, schema"></label><div class="help-search-status"><p data-help-status role="status" aria-live="polite"></p><button type="button" data-help-clear hidden>Clear search</button></div><div data-help-results role="region" aria-label="Commands and workflows" tabindex="0"></div></dialog>';
  const dialog=$<HTMLDialogElement>('dialog');dialog.inert=true;
  $<HTMLInputElement>('[data-help-search]').placeholder=`For example: ${mac?'Cmd':'Ctrl'} P, previous save, schema`;
  const menu=doc.createElement('button');menu.type='button';menu.id='shell-help';menu.textContent='Help & shortcuts';menu.setAttribute('aria-haspopup','dialog');menu.setAttribute('aria-controls',dialog.id);o.menu.append(menu);
  let opener:HTMLElement|null=null,destroyed=false;
  function render(){
    const input=$<HTMLInputElement>('[data-help-search]'),matches=matchingHelp(entries,input.value),list=$('[data-help-results]');list.replaceChildren();list.scrollTop=0;
    for(const group of [...new Set(matches.map(entry=>entry.group))]){
      const section=doc.createElement('section'),heading=doc.createElement('h3');heading.textContent=group;section.append(heading);
      for(const entry of matches.filter(entry=>entry.group===group)){
        const row=doc.createElement('article');row.dataset.helpEntry=entry.id;const title=doc.createElement('h4');title.textContent=entry.title;
        const command=doc.createElement(entry.keys?'kbd':'p');command.className='help-command';command.textContent=entry.keys??entry.route??'';
        const detail=doc.createElement('p');detail.textContent=entry.detail;row.append(title,command,detail);section.append(row);
      }
      list.append(section);
    }
    if(!matches.length){const empty=doc.createElement('p');empty.textContent='No matching commands. Try a different word or clear the search.';list.append(empty);}
    $('[data-help-clear]').hidden=!input.value;
    $('[data-help-status]').textContent=`${matches.length} ${matches.length===1?'command or workflow':'commands and workflows'} shown.`;
  }
  function close(){dialog.inert=true;dialog.close();}
  function show(from:HTMLElement|null=doc.activeElement instanceof win.HTMLElement?doc.activeElement:null){
    if(destroyed||doc.querySelector('dialog[open]'))return;
    opener=from;$<HTMLInputElement>('[data-help-search]').value='';render();dialog.inert=false;dialog.showModal();dialog.scrollTop=0;$('[data-help-search]').focus();
  }
  menu.onclick=()=>{o.menu.hidden=true;o.menu.inert=true;const toggle=doc.querySelector<HTMLElement>('#view-toggle');toggle?.setAttribute('aria-expanded','false');toggle?.focus();show(toggle);};
  $('[data-help-close]').onclick=close;$('[data-help-clear]').onclick=()=>{$<HTMLInputElement>('[data-help-search]').value='';render();$('[data-help-search]').focus();};$('[data-help-search]').oninput=render;
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing){e.preventDefault();close();}});dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(dialog.open||destroyed)return;dialog.inert=true;if(opener?.isConnected&&!opener.closest('[hidden],[inert]'))opener.focus();else o.focusEditor();});
  return{show,destroy(){destroyed=true;menu.remove();host.replaceChildren();}};
}
