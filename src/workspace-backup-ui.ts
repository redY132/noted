import type { BackupSummary } from './workspace-backup-types.ts';
export interface BackupAPI {
 backupDefaults():Promise<{backupPath:string;restorePath:string}>;
 createBackup(path:string):Promise<BackupSummary>;
 inspectBackup(path:string):Promise<BackupSummary>;
 restoreBackup(path:string,target:string,digest:string):Promise<BackupSummary>;
 revealBackup(path:string):Promise<void>;
 openRestoredWorkspace(path:string):Promise<void>;
}
export function initializeBackupUI(host:HTMLElement,options:{native:boolean;api:BackupAPI;flush:()=>Promise<void>;error:(error:unknown)=>void}){
 host.innerHTML=`<section class="backup-tools" aria-label="Workspace backup and restore"><h3>Backup and restore</h3><p>A backup includes notes, images, schemas, components and saved connections. Restoring creates a separate workspace. Your current workspace stays intact. Component execution approvals and search/model caches are excluded.</p><label>Backup file<input data-backup-path aria-label="Backup file path" placeholder="Full path ending in .noted-backup"></label><button data-backup-create>Create backup</button><button data-backup-reveal hidden>Show backup in folder</button><hr><label>Restore from backup<input data-restore-path aria-label="Restore backup file path" placeholder="Full path of a .noted-backup file"></label><label>New workspace folder<input data-restore-target aria-label="New restored workspace folder" placeholder="A folder that does not already exist"></label><div class="backup-actions"><button data-backup-inspect>Inspect backup</button><button data-backup-restore disabled>Restore as new workspace</button><button data-restored-open hidden>Open restored copy</button></div><p data-backup-status role="status" aria-live="polite"></p></section>`;
 const $=<T extends HTMLElement>(selector:string)=>host.querySelector<T>(selector)!;
 let reviewed:{path:string;summary:BackupSummary}|null=null,restored='',lastBackup='',defaultBackup='',busy=false,initializing=options.native,destroyed=false;
 const status=(text:string)=>{if(!destroyed)$('[data-backup-status]').textContent=text;};
 const summary=(s:BackupSummary)=>`${s.notes} notes, ${s.assets} images, ${s.definitions} definitions, ${s.pairs} saved relationships; ${(s.bytes/1048576).toFixed(1)} MiB. ${s.warnings.length?s.warnings.length+' recovery warning(s): '+s.warnings.slice(0,3).join('; '):'All checksums verified.'}`;
 function sync(){
  if(destroyed)return;
  const disabled=busy||initializing||!options.native;$('section').setAttribute('aria-busy',String(busy||initializing));
  for(const button of host.querySelectorAll<HTMLButtonElement>('button'))button.disabled=disabled;
  $<HTMLButtonElement>('[data-backup-restore]').disabled=disabled||!reviewed;
  for(const input of host.querySelectorAll<HTMLInputElement>('input'))input.disabled=disabled;
 }
 async function run(action:()=>Promise<void>){
  if(busy||destroyed||!options.native)return;
  busy=true;sync();
  try{await action();}catch(error){if(!destroyed){status(error instanceof Error?error.message:String(error));options.error(error);}}
  finally{busy=false;sync();}
 }
 const ready=options.native?options.api.backupDefaults().then(defaults=>{
  if(destroyed)return;
  const backup=$<HTMLInputElement>('[data-backup-path]'),target=$<HTMLInputElement>('[data-restore-target]');
  if(!backup.value)backup.value=defaults.backupPath;
  if(!target.value)target.value=defaults.restorePath;
  defaultBackup=defaults.backupPath;status('Create a backup, or inspect an existing backup before restoring.');
 }).catch(error=>{if(!destroyed){status('Default paths could not be prepared. Enter your own full backup and new workspace paths.');options.error(error);}}).finally(()=>{initializing=false;sync();}):Promise.resolve();
 $('[data-backup-create]').onclick=()=>void run(async()=>{
  await ready;if(destroyed)return;
  status('Saving a consistent snapshot.');await options.flush();if(destroyed)return;
  const input=$<HTMLInputElement>('[data-backup-path]');
  if(lastBackup&&input.value.trim()===defaultBackup){
   const next=await options.api.backupDefaults();if(destroyed)return;
   input.value=defaultBackup=next.backupPath;
   if($<HTMLInputElement>('[data-restore-target]').value.trim()===restored)$<HTMLInputElement>('[data-restore-target]').value=next.restorePath;
  }
  const result=await options.api.createBackup(input.value.trim());if(destroyed)return;
  lastBackup=result.path;$<HTMLInputElement>('[data-restore-path]').value=result.path;reviewed=null;$('[data-backup-reveal]').hidden=false;
  status('Backup created at '+result.path+'. '+summary(result));
 });
 $('[data-backup-reveal]').onclick=()=>void run(()=>options.api.revealBackup(lastBackup));
 $('[data-backup-inspect]').onclick=()=>void run(async()=>{
  reviewed=null;const path=$<HTMLInputElement>('[data-restore-path]').value.trim();status('Checking the backup and rebuilding a disposable preview.');
  const result=await options.api.inspectBackup(path);if(destroyed)return;
  reviewed={path,summary:result};status('Ready to restore a separate copy. '+summary(result));
 });
 $<HTMLInputElement>('[data-restore-path]').oninput=()=>{reviewed=null;sync();status('Inspect this backup before restoring.');};
 $('[data-backup-restore]').onclick=()=>void run(async()=>{
  const next=reviewed;reviewed=null;
  if(!next||next.path!==$<HTMLInputElement>('[data-restore-path]').value.trim())throw new Error('Inspect this backup again before restoring.');
  status('Restoring and verifying a new workspace.');
  const result=await options.api.restoreBackup(next.path,$<HTMLInputElement>('[data-restore-target]').value.trim(),next.summary.digest);if(destroyed)return;
  restored=result.path;$('[data-restored-open]').hidden=false;status('Restored to '+restored+'. Your current workspace is unchanged. '+summary(result));
 });
 $('[data-restored-open]').onclick=()=>void run(async()=>{await options.flush();if(destroyed)return;await options.api.openRestoredWorkspace(restored);status('Opened the restored copy in a separate window. Its components start disabled.');});
 sync();status(options.native?'Preparing default backup paths.':'Workspace backups are available in the desktop app. Browser preview data is separate.');
 return {ready,destroy(){destroyed=true;host.replaceChildren();}};
}
