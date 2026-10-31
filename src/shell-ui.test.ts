import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeAppearance } from './appearance.ts';
import { initializeShell, readLayout, shellTopbar, shellPopovers, layoutKey } from './shell-ui.ts';
function setup(){
 const dom=new JSDOM(`<div id="app"><aside id="navigation-panel"><button>Folder</button></aside><aside id="notes-panel"><input id="search"></aside><main>${shellTopbar}<div id="note-kicker"></div><div id="note-details"><input></div><div id="formatting-tools"><button>Bold</button></div><div id="layout-tools"></div><div id="editor" tabindex="0">Original words</div><div id="find-panel" hidden></div><footer id="note-footer"></footer></main><aside id="connections-panel"></aside>${shellPopovers}</div>`,{url:'http://localhost',pretendToBeVisual:true});
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Event:dom.window.Event,innerWidth:1200}))Object.defineProperty(globalThis,key,{value,configurable:true});
 const appearance=initializeAppearance();let calls=0,closed=0;
 const ui=initializeShell({appearance,getEditor:()=>({view:{focus(){document.querySelector<HTMLElement>('#editor')!.focus();},dom:document.querySelector<HTMLElement>('#editor')!}}),newNote:()=>{calls++;},workspace:()=>{calls++;},closeTransient:()=>{closed++;}});
 return{dom,appearance,ui,get calls(){return calls;},get closed(){return closed;}};
}
test('minimal defaults and independent collapsed panels persist without recreating note content',()=>{
 const h=setup(),editor=document.querySelector('#editor');
 assert.equal(document.querySelector<HTMLElement>('#navigation-panel')!.hidden,true);assert.equal(document.querySelector<HTMLElement>('#notes-panel')!.hidden,false);
 assert.equal(document.querySelector<HTMLElement>('#formatting-tools')!.hidden,true);assert.equal(document.querySelector('#connections-toggle'),null);assert.equal(document.querySelector('[data-panel-choice=connections]'),null);
 h.ui.setPanel('navigation',true);h.ui.setPanel('notes',false);h.ui.setPanel('formatting',true);
 assert.equal(document.querySelector('#editor'),editor);assert.equal(editor!.textContent,'Original words');
 assert.deepEqual(readLayout(),h.ui.getPanels());assert.equal(document.querySelector('[data-panel-toggle="formatting"]')!.getAttribute('aria-controls'),'formatting-tools');
 h.appearance.destroy();h.dom.window.close();
});
test('focus mode restores the normal layout and does not overwrite persisted panel choices',()=>{
 const h=setup();h.ui.setPanel('navigation',true);h.ui.setPanel('formatting',true);const stored=localStorage.getItem(layoutKey);
 document.querySelector<HTMLElement>('#view-toggle')!.click();assert.equal(document.querySelector<HTMLElement>('#view-popover')!.hidden,false);
 document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'F8',bubbles:true}));
 assert.equal(document.querySelector<HTMLElement>('#view-popover')!.hidden,true);
 assert.equal(h.ui.isFocus(),true);assert.ok(Object.keys(h.ui.getPanels()).every(p=>!h.ui.isOpen(p as keyof ReturnType<typeof h.ui.getPanels>)));
 assert.equal(h.closed,1,'focus mode closes transient connection graphs');
 assert.equal(localStorage.getItem(layoutKey),stored);
 document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'F8',bubbles:true}));
 assert.equal(h.ui.isOpen('navigation'),true);assert.equal(h.ui.isOpen('formatting'),true);assert.equal(h.ui.isOpen('notes'),true);
 h.appearance.destroy();h.dom.window.close();
});
test('restricted storage falls back to default layout without preventing startup',()=>{
 assert.deepEqual(readLayout({getItem(){throw Error('Blocked');}}),{navigation:false,notes:true,formatting:false,components:false,details:false,footer:false});
});
test('theme reset and layout reset are independent; malformed stored layouts fall back safely',()=>{
 const h=setup();h.appearance.setMode('dark');h.appearance.setAccent('#ffffff');h.ui.setPanel('notes',false);
 document.querySelector<HTMLElement>('#reset-layout')!.click();assert.equal(h.ui.isOpen('notes'),true);assert.equal(h.appearance.get().mode,'dark');
 h.ui.setPanel('navigation',true);document.querySelector<HTMLElement>('#reset-appearance')!.click();assert.equal(h.ui.isOpen('navigation'),true);assert.equal(h.appearance.get().mode,'system');
 localStorage.setItem(layoutKey,'{"version":1,"panels":{"notes":"false","navigation":true}}');assert.equal(readLayout().notes,true);assert.equal(readLayout().navigation,true);
 h.appearance.destroy();h.dom.window.close();
});
test('hiding a focused toolbar restores editor focus without changing transient graphs',()=>{
 const h=setup();
 h.ui.setPanel('formatting',true);document.querySelector<HTMLElement>('#formatting-tools button')!.focus();h.ui.setPanel('formatting',false);
 assert.equal(document.activeElement,document.querySelector('#editor'));assert.equal(h.closed,0);
 assert.equal(document.querySelector<HTMLElement>('#formatting-tools')!.inert,true);
 h.ui.setPanel('formatting',true);assert.equal(document.querySelector<HTMLElement>('#formatting-tools')!.inert,false);
 assert.equal(document.querySelector<HTMLElement>('#find-panel')!.hidden,true);assert.ok(!document.querySelector('#formatting-tools')!.contains(document.querySelector('#find-panel')));
 h.appearance.destroy();h.dom.window.close();
});

test('legacy layout preferences preserve unrelated panels and discard obsolete connection visibility',()=>{
 const h=setup();localStorage.setItem('noted-layout-v1',JSON.stringify({version:1,panels:{navigation:true,notes:false,formatting:true,connections:true}}));
 assert.deepEqual(readLayout(),{navigation:true,notes:false,formatting:true,components:false,details:false,footer:false});
 assert.equal('connections' in readLayout(),false);
 h.ui.setPanel('details',true);const saved=JSON.parse(localStorage.getItem(layoutKey)!);assert.equal(saved.version,2);assert.equal('connections' in saved.panels,false);
 h.appearance.destroy();h.dom.window.close();
});
test('formatting toggle preserves mouse selection and exiting popovers become inert during motion',()=>{
 const h=setup(),button=document.querySelector<HTMLElement>('[data-panel-toggle=formatting]')!;
 const mouse=new window.MouseEvent('mousedown',{bubbles:true,cancelable:true});button.dispatchEvent(mouse);assert.equal(mouse.defaultPrevented,true);
 document.querySelector<HTMLElement>('#appearance-toggle')!.click();assert.equal(document.querySelector<HTMLElement>('#appearance-popover')!.inert,false);
 document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(document.querySelector<HTMLElement>('#appearance-popover')!.inert,true);assert.equal(document.activeElement,document.querySelector('#appearance-toggle'));
 h.appearance.destroy();h.dom.window.close();
});
