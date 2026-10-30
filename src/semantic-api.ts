import { invoke } from '@tauri-apps/api/core';
import { browserPreview } from './api';
export interface SemanticSettings { enabled:boolean; paused:boolean; allowBattery:boolean }
export interface SemanticStatus { experimental:boolean; settings:SemanticSettings; modelReady:boolean; modelBytes:number; downloadBytes:number; downloading:boolean; indexed:number; total:number; generation:number; onBattery:boolean; busy:boolean; error:string|null }
export interface SemanticMatch { noteId:string; score:number }
const previewStatus:SemanticStatus={experimental:true,settings:{enabled:false,paused:false,allowBattery:false},modelReady:false,modelBytes:23685172,downloadBytes:0,downloading:false,indexed:0,total:0,generation:0,onBattery:false,busy:false,error:null};
export const semanticAPI={
  status:()=>browserPreview?Promise.resolve(structuredClone(previewStatus)):invoke<SemanticStatus>('semantic_status'),
  settings:(settings:SemanticSettings)=>{if(browserPreview){previewStatus.settings={...settings};return Promise.resolve(structuredClone(previewStatus));}return invoke<SemanticStatus>('semantic_settings',{settings});},
  download:()=>browserPreview?Promise.reject(new Error('Install the desktop app to download and run the local model.')):invoke<SemanticStatus>('semantic_download_model'),
  installPack:(path:string)=>browserPreview?Promise.reject(new Error('Offline model installation is available in the desktop app.')):invoke<SemanticStatus>('semantic_install_pack',{path}),
  activity:(noteId:string|null,typing:boolean)=>browserPreview?Promise.resolve():invoke<void>('semantic_activity',{noteId,typing}),
  remove:()=>browserPreview?Promise.resolve(structuredClone(previewStatus)):invoke<SemanticStatus>('semantic_remove_data'),
  related:(noteId:string)=>browserPreview?Promise.resolve([]):invoke<SemanticMatch[]>('semantic_related',{noteId}),
};
