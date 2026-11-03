import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {initializeBackupUI,type BackupAPI} from './workspace-backup-ui.ts';
import type {BackupSummary} from './workspace-backup-types.ts';
const summary:BackupSummary={formatVersion:1,createdAt:'2026-11-03',files:4,bytes:1024,notes:2,assets:1,definitions:1,pairs:1,warnings:[],path:'C:\\Backups\\saved.noted-backup',digest:'a'.repeat(64)};
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(native=true){const dom=new JSDOM('<body><div id="host"></div></body>'),host=dom.window.document.querySelector<HTMLElement>('#host')!,calls:unknown[][]=[],errors:unknown[]=[];const api:BackupAPI={async backupDefaults(){return {backupPath:summary.path,restorePath:'C:\\Restored'};},async createBackup(path){calls.push(['create',path]);return summary;},async inspectBackup(path){calls.push(['inspect',path]);return summary;},async restoreBackup(path,target,digest){calls.push(['restore',path,target,digest]);return {...summary,path:target};},async revealBackup(path){calls.push(['reveal',path]);},async openRestoredWorkspace(path){calls.push(['open',path]);}};const ui=initializeBackupUI(host,{native,api,async flush(){calls.push(['flush']);},error:e=>errors.push(e)});return {dom,host,calls,errors,api,ui,$:<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!};}
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
