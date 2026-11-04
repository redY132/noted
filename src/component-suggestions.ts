import {validateComponentDefinition,resolveComponentFields,componentJSON,type ComponentDefinition,type ComponentRecord} from './component-runtime-types.ts';
export interface ComponentSuggestion {summary:string;definition:ComponentDefinition;properties:ComponentRecord}
export function validateComponentSuggestion(raw:unknown):ComponentSuggestion{
 componentJSON(raw,256*1024);const v=raw as ComponentSuggestion;if(!v||Object.keys(v).some(k=>!['summary','definition','properties'].includes(k))||typeof v.summary!=='string'||!v.summary.trim()||v.summary.length>2000)throw new Error('Invalid component proposal.');
 const definition=validateComponentDefinition(v.definition);if(new TextEncoder().encode(definition.source).length>64*1024)throw new Error('AI component source exceeds 64 KiB.');if(definition.manifest.animationFps!==undefined||definition.manifest.bindings?.length)throw new Error('AI component suggestions cannot request animation ticks or document bindings.');
 const properties=resolveComponentFields(definition.manifest.properties,v.properties);resolveComponentFields(definition.manifest.persistentState);resolveComponentFields(definition.manifest.transientState);return{summary:v.summary,definition,properties};
}
