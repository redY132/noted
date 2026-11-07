import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {initializeBackupUI,type BackupAPI} from './workspace-backup-ui.ts';
import type {BackupSummary} from './workspace-backup-types.ts';
const summary:BackupSummary={formatVersion:1,createdAt:'2026-11-03',files:4,bytes:1024,notes:2,assets:1,definitions:1,pairs:1,warnings:[],path:'C:\\Backups\\saved.noted-backup',digest:'a'.repeat(64)};
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(native=true,overrides:Partial<BackupAPI>={},flush:()=>Promise<void>=async()=>{}){const dom=new JSDOM('<body><div id="host"></div></body>'),host=dom.window.document.querySelector<HTMLElement>('#host')!,calls:unknown[][]=[],errors:unknown[]=[];const api:BackupAPI={async backupDefaults(){return {backupPath:summary.path,restorePath:'C:\\Restored'};},async createBackup(path){calls.push(['create',path]);return summary;},async inspectBackup(path){calls.push(['inspect',path]);return summary;},async restoreBackup(path,target,digest){calls.push(['restore',path,target,digest]);return {...summary,path:target};},async revealBackup(path){calls.push(['reveal',path]);},async openRestoredWorkspace(path){calls.push(['open',path]);},...overrides};const ui=initializeBackupUI(host,{native,api,async flush(){calls.push(['flush']);await flush();},error:e=>errors.push(e)});return {dom,host,calls,errors,api,ui,$:<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!};}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
test('backup flushes first; restore requires a current inspection and opens only the separate restored copy',async()=>{
 const s=setup();try{await s.ui.ready;s.$('[data-backup-create]').click();await settle();assert.deepEqual(s.calls.slice(0,2),[['flush'],['create',summary.path]]);assert.equal(s.$<HTMLButtonElement>('[data-backup-restore]').disabled,true);
 s.$('[data-backup-inspect]').click();await settle();assert.equal(s.$<HTMLButtonElement>('[data-backup-restore]').disabled,false);
 const input=s.$<HTMLInputElement>('[data-restore-path]');input.value='C:\\Other.noted-backup';input.dispatchEvent(new s.dom.window.Event('input'));assert.equal(s.$<HTMLButtonElement>('[data-backup-restore]').disabled,true);
 s.$('[data-backup-inspect]').click();await settle();s.$('[data-backup-restore]').click();await settle();assert.deepEqual(s.calls.at(-1),['restore','C:\\Other.noted-backup','C:\\Restored',summary.digest]);assert.equal(s.$('[data-restored-open]').hidden,false);assert.match(s.$('[data-backup-status]').textContent!,/current workspace is unchanged/);s.$('[data-restored-open]').click();await settle();assert.deepEqual(s.calls.slice(-2),[['flush'],['open','C:\\Restored']]);assert.deepEqual(s.errors,[]);
 }finally{s.ui.destroy();s.dom.window.close();}
});
test('failed restore never exposes Open and browser preview cannot call native backup actions',async()=>{
 const s=setup();try{await s.ui.ready;s.api.restoreBackup=async()=>{throw new Error('Checksum mismatch');};s.$<HTMLInputElement>('[data-restore-path]').value=summary.path;s.$('[data-backup-inspect]').click();await settle();s.$('[data-backup-restore]').click();await settle();assert.equal(s.$('[data-restored-open]').hidden,true);assert.match(s.$('[data-backup-status]').textContent!,/Checksum mismatch/);assert.equal(s.errors.length,1);}finally{s.ui.destroy();s.dom.window.close();}
 const browser=setup(false);try{await browser.ui.ready;browser.$('[data-backup-create]').click();await settle();assert.deepEqual(browser.calls,[]);assert.match(browser.$('[data-backup-status]').textContent!,/desktop app/);}finally{browser.ui.destroy();browser.dom.window.close();}
});

test('initial setup disables operations and late defaults preserve chosen paths',async()=>{
 const pending=deferred<{backupPath:string;restorePath:string}>(),s=setup(true,{backupDefaults:()=>pending.promise});
 try{
  assert.equal(s.$<HTMLButtonElement>('[data-backup-create]').disabled,true);assert.equal(s.$('section').getAttribute('aria-busy'),'true');
  s.$('[data-backup-create]').click();assert.deepEqual(s.calls,[]);
  s.$<HTMLInputElement>('[data-backup-path]').value='C:\\Chosen.noted-backup';s.$<HTMLInputElement>('[data-restore-target]').value='C:\\Chosen copy';
  pending.resolve({backupPath:summary.path,restorePath:'C:\\Default copy'});await s.ui.ready;
  assert.equal(s.$<HTMLInputElement>('[data-backup-path]').value,'C:\\Chosen.noted-backup');assert.equal(s.$<HTMLInputElement>('[data-restore-target]').value,'C:\\Chosen copy');assert.equal(s.$<HTMLButtonElement>('[data-backup-create]').disabled,false);
  s.$('[data-backup-create]').click();await settle();assert.deepEqual(s.calls.slice(0,2),[['flush'],['create','C:\\Chosen.noted-backup']]);
 }finally{s.ui.destroy();s.dom.window.close();}
});

test('failed defaults allow manual paths instead of leaving the form unavailable',async()=>{
 const s=setup(true,{async backupDefaults(){throw new Error('Synthetic defaults failure');}});
 try{await s.ui.ready;assert.equal(s.errors.length,1);assert.match(s.$('[data-backup-status]').textContent!,/Enter your own/);assert.equal(s.$<HTMLInputElement>('[data-backup-path]').disabled,false);
  s.$<HTMLInputElement>('[data-backup-path]').value='C:\\Manual.noted-backup';s.$('[data-backup-create]').click();await settle();assert.deepEqual(s.calls.slice(0,2),[['flush'],['create','C:\\Manual.noted-backup']]);
 }finally{s.ui.destroy();s.dom.window.close();}
});

test('every failed restore consumes its inspection and retry requires a new one',async()=>{
 const s=setup();try{await s.ui.ready;s.$<HTMLInputElement>('[data-restore-path]').value=summary.path;s.api.restoreBackup=async()=>{throw new Error('Synthetic changed backup');};
  s.$('[data-backup-inspect]').click();await settle();s.$('[data-backup-restore]').click();await settle();assert.equal(s.$<HTMLButtonElement>('[data-backup-restore]').disabled,true);assert.equal(s.$('[data-restored-open]').hidden,true);
  s.$('[data-backup-inspect]').click();await settle();assert.equal(s.$<HTMLButtonElement>('[data-backup-restore]').disabled,false);
  s.api.restoreBackup=async(_path,target)=>({...summary,path:target});s.$('[data-backup-restore]').click();await settle();assert.equal(s.$('[data-restored-open]').hidden,false);assert.equal(s.$<HTMLButtonElement>('[data-backup-restore]').disabled,true);
 }finally{s.ui.destroy();s.dom.window.close();}
});

test('duplicate backup actions wait for the draft, and a failed draft save never creates an archive',async()=>{
 const pending=deferred<void>(),s=setup(true,{},()=>pending.promise);try{await s.ui.ready;s.$('[data-backup-create]').click();await settle();s.$('[data-backup-create]').click();assert.deepEqual(s.calls,[['flush']]);pending.reject(new Error('Synthetic unsaved draft'));await settle();assert.equal(s.errors.length,1);assert.equal(s.$<HTMLButtonElement>('[data-backup-create]').disabled,false);assert.equal(s.$('[data-backup-reveal]').hidden,true);assert.deepEqual(s.calls,[['flush']]);
 }finally{s.ui.destroy();s.dom.window.close();}
});

test('disposal ignores late defaults and prevents starting a backup after an awaited draft save',async()=>{
 const defaults=deferred<{backupPath:string;restorePath:string}>(),first=setup(true,{backupDefaults:()=>defaults.promise});first.ui.destroy();defaults.resolve({backupPath:summary.path,restorePath:'C:\\Restored'});await first.ui.ready;assert.equal(first.host.childElementCount,0);assert.deepEqual(first.errors,[]);first.dom.window.close();
 const saving=deferred<void>(),second=setup(true,{},()=>saving.promise);await second.ui.ready;second.$('[data-backup-create]').click();await settle();second.ui.destroy();saving.resolve();await settle();assert.deepEqual(second.calls,[['flush']]);assert.deepEqual(second.errors,[]);assert.equal(second.host.childElementCount,0);second.dom.window.close();
});

test('disposal ignores an in-flight inspection or completed native backup without UI errors',async()=>{
 for(const kind of ['inspect','create'] as const){const pending=deferred<BackupSummary>(),s=setup(true,kind==='inspect'?{inspectBackup:()=>pending.promise}:{createBackup:()=>pending.promise});await s.ui.ready;s.$<HTMLInputElement>('[data-restore-path]').value=summary.path;s.$(`[data-backup-${kind}]`).click();await settle();s.ui.destroy();pending.resolve(summary);await settle();assert.deepEqual(s.errors,[]);assert.equal(s.host.childElementCount,0);s.dom.window.close();}
});
