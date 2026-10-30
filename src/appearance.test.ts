import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeAppearance, accentForeground, contrastRatio, DEFAULT_ACCENT, ACCENT_SWATCHES } from './appearance.ts';

function setup(initial?:string, dark = false) {
  const dom = new JSDOM('<!doctype html><html><body><p style="color:#98413b">Original words</p></body></html>', {url:'http://localhost'});
  if(initial!==undefined) dom.window.localStorage.setItem('noted-appearance-v1',initial);
  const listeners = new Set<()=>void>();
  const media = {matches:dark, addEventListener(_type:string,listener:()=>void){listeners.add(listener);},removeEventListener(_type:string,listener:()=>void){listeners.delete(listener);}};
  const create = () => initializeAppearance({root:dom.window.document.documentElement,storage:dom.window.localStorage,media:media as unknown as MediaQueryList});
  return {dom,media,listeners,create};
}

test('appearance follows system immediately, persists user overrides and resets independently',()=>{
  const fixture=setup(undefined,true); const root=fixture.dom.window.document.documentElement;
  const original=fixture.dom.window.document.body.innerHTML;
  const appearance=fixture.create();
  assert.deepEqual(appearance.get(),{mode:'system',accent:DEFAULT_ACCENT,resolvedTheme:'dark'});
  assert.equal(root.dataset.theme,'dark');
  appearance.setMode('light');appearance.setAccent('#EFAB12');
  assert.equal(root.dataset.theme,'light');assert.equal(root.style.getPropertyValue('--accent'),'#efab12');
  fixture.media.matches=false;for(const listener of fixture.listeners)listener();
  assert.equal(appearance.get().mode,'light');
  appearance.destroy();
  const restored=fixture.create();
  assert.deepEqual(restored.get(),{mode:'light',accent:'#efab12',resolvedTheme:'light'});
  fixture.dom.window.localStorage.setItem('noted-layout-v1','keep this');
  restored.reset();
  assert.equal(restored.get().mode,'system');assert.equal(restored.get().accent,DEFAULT_ACCENT);
  assert.equal(fixture.dom.window.localStorage.getItem('noted-layout-v1'),'keep this');
  assert.equal(fixture.dom.window.document.body.innerHTML,original);
  restored.destroy();assert.equal(fixture.listeners.size,0);
});

test('system updates notify listeners while explicit modes ignore system changes',()=>{
  const fixture=setup();const appearance=fixture.create();const changes:string[]=[];
  const unsubscribe=appearance.subscribe(state=>changes.push(state.resolvedTheme));
  fixture.media.matches=true;for(const listener of fixture.listeners)listener();
  assert.equal(appearance.get().resolvedTheme,'dark');
  appearance.setMode('light');
  fixture.media.matches=false;for(const listener of fixture.listeners)listener();
  assert.deepEqual(changes,['dark','light']);unsubscribe();appearance.setMode('dark');
  assert.deepEqual(changes,['dark','light']);appearance.destroy();
});

test('invalid and unavailable preferences use defaults; invalid accent input never becomes CSS',()=>{
  for(const initial of ['invalid',JSON.stringify({version:1,mode:{toString:'dark'},accent:'url(https://example.com)'}),JSON.stringify({version:2,mode:'dark',accent:'#123456'})]){
    const fixture=setup(initial);const appearance=fixture.create();
    assert.deepEqual(appearance.get(),{mode:'system',accent:DEFAULT_ACCENT,resolvedTheme:'light'});
    for(const color of ['red','#abc','#123456; background:red','url(foo)'])assert.throws(()=>appearance.setAccent(color),TypeError);
    assert.throws(()=>appearance.setMode('invalid' as 'system'),TypeError);appearance.destroy();
  }
  const dom=new JSDOM('<!doctype html><html></html>');
  const appearance=initializeAppearance({root:dom.window.document.documentElement,storage:{getItem(){throw Error('unavailable');},setItem(){throw Error('unavailable');}},media:{matches:false,addEventListener(){},removeEventListener(){}} as unknown as MediaQueryList});
  appearance.setAccent('#ffffff');assert.equal(appearance.get().accent,'#ffffff');appearance.destroy();
});

test('accent-filled controls always choose a readable foreground and links remain readable in both modes',()=>{
  const fixture=setup();const appearance=fixture.create();
  const colors=[...ACCENT_SWATCHES.map(s=>s.color),'#000000','#ffffff','#777777','#ff00ff','#00ffff','#ffff00','#808080'];
  for(const color of colors){
    assert.ok(contrastRatio(color,accentForeground(color))>=4.5,color);
    for(const mode of ['light','dark'] as const){appearance.setMode(mode);appearance.setAccent(color);
      const accent=fixture.dom.window.document.documentElement.style.getPropertyValue('--accent-text');
      assert.ok(contrastRatio(accent,mode==='dark'?'#202024':'#f7f7f8')>=4.5,`${mode} ${color}`);
    }
  }
  appearance.destroy();
});
