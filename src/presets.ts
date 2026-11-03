import type {Editor,JSONContent} from '@tiptap/core';
import {schemaProjection,BUILTIN_SCHEMAS,SCHEMA_STYLE_KEYS} from './document-schema.ts';
export const NOTE_PRESETS=[
 {id:'lecture',name:'Lecture',description:'Clear headings and a spacious reading column.',schema:'outline',layout:'column',tone:'plain',gap:12,padding:16},
 {id:'project',name:'Project',description:'Compact text arranged in two columns. Reading order stays the same.',schema:'compact',layout:'grid',tone:'soft',gap:16,padding:16},
 {id:'journal',name:'Journal',description:'Serif writing in a quiet, roomy column.',schema:'default',layout:'column',tone:'soft',gap:16,padding:24},
] as const;
export function presetProjection(editor:Editor,id:string):JSONContent{
 const p=NOTE_PRESETS.find(p=>p.id===id);if(!p)throw new Error('Unknown note preset.');
 const candidate=schemaProjection(editor,BUILTIN_SCHEMAS.find(s=>s.id===p.schema)!,{mode:'automatic',enabledRules:[...SCHEMA_STYLE_KEYS]});
 candidate.attrs={...candidate.attrs,schemaReference:{id:p.schema,version:1},schemaPolicy:{mode:'suggest',enabledRules:[]}};
 const children=candidate.content??[];if(!children.length)throw new Error('Write something before applying a preset.');
 candidate.content=[{type:'notePanel',attrs:{id:crypto.randomUUID(),layoutKind:p.layout,tone:p.tone,gap:p.gap,padding:p.padding,gridColumns:2,placement:'flow',animation:'none'},content:children}];return candidate;
}
