import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {initializeHelp} from './help-ui.ts';import {helpEntries,matchingHelp} from './help-reference.ts';
function setup(mac=false){
  const dom=new JSDOM('<button id="view-toggle" aria-expanded="true">View</button><section id="view-popover"></section><div id="host"></div><div id="writer" tabindex="0">Synthetic writer</div>');
  Object.assign(dom.window.HTMLDialogElement.prototype,{showModal(this:HTMLDialogElement){this.setAttribute('open','');},close(this:HTMLDialogElement){this.removeAttribute('open');this.dispatchEvent(new dom.window.Event('close'));}});
  const $=<T extends HTMLElement>(s:string)=>dom.window.document.querySelector<T>(s)!;
  const ui=initializeHelp($('#host'),{menu:$('#view-popover'),mac,focusEditor:()=>$('#writer').focus()});
  const search=(value:string)=>{const input=$<HTMLInputElement>('[data-help-search]');input.value=value;input.dispatchEvent(new dom.window.Event('input'));};
  return {dom,$,ui,search,close(){ui.destroy();dom.window.close();}};
}
test('reference matches literal key chords before descriptive substrings and respects the platform modifier',()=>{
  assert.deepEqual(matchingHelp(helpEntries(false),'CTRL+P').map(entry=>entry.id),['open']);
  assert.deepEqual(matchingHelp(helpEntries(true),'cmd p').map(entry=>entry.id),['open']);
  assert.equal(helpEntries(true).find(entry=>entry.id==='history')?.keys,undefined);
  assert.deepEqual(matchingHelp(helpEntries(false),'ctrl shift z').map(entry=>entry.id),['undo']);
  assert.deepEqual(matchingHelp(helpEntries(false),'schema consent').map(entry=>entry.id),['ai-guide']);
});
test('help is available without note or account state and search/Clear update the plain reference',()=>{
  const h=setup();try{
    h.ui.show();assert.equal(h.$('[data-help-search]'),h.dom.window.document.activeElement);assert.equal(h.$('[data-help-results]').getAttribute('role'),'region');
    h.search('ctrl+p');assert.equal(h.$('[data-help-results]').querySelectorAll('[data-help-entry]').length,1);assert.ok(h.$('[data-help-entry="open"]'));
    h.$('[data-help-clear]').click();assert.equal(h.$('[data-help-search]'),h.dom.window.document.activeElement);assert.ok(h.$('[data-help-entry="agent-request"]'));assert.equal(h.$('[data-help-clear]').hidden,true);
  }finally{h.close();}
});
test('empty matches offer recovery and typed markup remains search text',()=>{
  const h=setup();try{h.ui.show();h.search('<script>synthetic</script>');assert.match(h.$('[data-help-results]').textContent!,/No matching commands/);assert.equal(h.$('script'),null);assert.equal(h.$('[data-help-clear]').hidden,false);
    h.$('[data-help-clear]').click();assert.ok(h.$('[data-help-entry="previous"]'));
  }finally{h.close();}
});
test('one Escape closes a populated search, makes the dialog inert and restores the opener',()=>{
  const h=setup();try{h.$('#view-toggle').focus();h.ui.show();h.search('schema');h.$('[data-help-search]').dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(h.$<HTMLDialogElement>('dialog').open,false);assert.equal(h.$<HTMLDialogElement>('dialog').inert,true);assert.equal(h.dom.window.document.activeElement,h.$('#view-toggle'));
    h.ui.show();assert.equal(h.$<HTMLInputElement>('[data-help-search]').value,'');assert.equal(h.$<HTMLDialogElement>('dialog').inert,false);
  }finally{h.close();}
});
test('another modal is respected and stale close events cannot disable reopened help',()=>{
  const h=setup();try{const other=h.dom.window.document.createElement('dialog');other.setAttribute('open','');h.dom.window.document.body.append(other);h.ui.show();assert.equal(h.$<HTMLDialogElement>('.help-dialog').open,false);other.remove();
    h.ui.show();h.$('dialog').dispatchEvent(new h.dom.window.Event('close'));assert.equal(h.$<HTMLDialogElement>('dialog').inert,false);assert.equal(h.$<HTMLDialogElement>('dialog').open,true);
  }finally{h.close();}
});
test('View command closes its menu and hidden opener falls back to the editor',()=>{
  const h=setup();try{h.$('#shell-help').click();assert.equal(h.$('#view-popover').hidden,true);assert.equal(h.$('#view-toggle').getAttribute('aria-expanded'),'false');
    h.$('#view-toggle').hidden=true;h.$('[data-help-close]').click();assert.equal(h.dom.window.document.activeElement,h.$('#writer'));
  }finally{h.close();}
});
