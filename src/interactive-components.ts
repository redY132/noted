import { Node, type Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { NodeSelection } from '@tiptap/pm/state';
import { applyLayout, layoutAttributes, moveHandle, resizeHandle, trackExtent } from './note-components.ts';
import { installedComponentDefinitions, type ComponentRuntimeHost, type ComponentMountHandle } from './component-runtime.ts';
import { builtinComponentDefinitions } from './component-runtime-examples.ts';
import { componentJSON, resolveComponentFields, type ComponentRecord, type ComponentDefinition } from './component-runtime-types.ts';

export function availableComponents(): ComponentDefinition[] {
  const definitions = new Map(builtinComponentDefinitions.map(def => [`${def.manifest.id}@${def.manifest.version}`, def]));
  for (const def of installedComponentDefinitions()) definitions.set(`${def.manifest.id}@${def.manifest.version}`, def);
  return [...definitions.values()];
}
export const InteractiveComponent = Node.create<{ runtime?: ComponentRuntimeHost; resolveAsset?: (id: string) => Promise<string> }>({
  name: 'interactiveComponent', group: 'block', atom: true, draggable: true,
  addOptions: () => ({}),
  addAttributes: () => ({ ...layoutAttributes(480), definitionId: {default:''}, definitionVersion:{default:1},properties:{default:{}},state:{default:{}},fallback:{default:'Interactive component unavailable'} }),
  // Arbitrary pasted HTML cannot import or activate code.
  parseHTML: () => [],
  renderHTML: ({node}) => ['section', {'data-interactive-component':node.attrs.definitionId},node.attrs.fallback],
  addNodeView() {
    return ({node,editor,getPos}) => {
      let current = node, disposed = false;
      const dom = document.createElement('section'); dom.className='note-component interactive-component';dom.contentEditable='false';
      const body = document.createElement('div');body.className='interactive-component-body';dom.append(body);
      const extent = trackExtent(editor,dom,()=>current);
      let definition: ComponentDefinition | undefined, mounted: ComponentMountHandle | undefined, lastInput = '';
      const inputs = () => {
        const bindings:Record<string,string>={};
        if(definition?.manifest.bindings?.length) editor.state.doc.descendants(value=>{if(definition!.manifest.bindings!.includes(value.attrs.id))bindings[value.attrs.id]=value.textContent.slice(0,8192);});
        return {properties:current.attrs.properties as ComponentRecord,state:current.attrs.state as ComponentRecord,bindings};
      };
      const refreshInput = () => {
        if (disposed || !mounted) return;
        const input = inputs(), serialized = JSON.stringify(input);
        if (serialized !== lastInput) { lastInput = serialized; mounted.update(input); }
      };
      const mountDefinition = () => {
        if (disposed) return;
        definition = availableComponents().find(def=>def.manifest.id===current.attrs.definitionId&&def.manifest.version===current.attrs.definitionVersion);
        const input = inputs(); lastInput = JSON.stringify(input);
        mounted = definition && this.options.runtime?.mount({id:current.attrs.id,element:body,definition,input,fallback:current.attrs.fallback,resolveAsset:this.options.resolveAsset,onState:state=>{
          if(disposed||editor.isDestroyed||!editor.isEditable)return;
          componentJSON(state);
          const position=getPos();if(position===undefined)return;
          const value=editor.state.doc.nodeAt(position);
          if(value?.type.name!=='interactiveComponent'||value.attrs.id!==current.attrs.id)return;
          editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(position,undefined,{...value.attrs,state}));
        }});
        if(!mounted){body.textContent=current.attrs.fallback||'Interactive component unavailable';const message=document.createElement('small');message.textContent=definition?'Enable this exact code version in Interactive settings.':'Definition missing. Import its saved version to recover this component.';body.append(message);}
      };
      const definitionsChanged = () => { if (!definition) mountDefinition(); };
      mountDefinition();
      editor.on('update',refreshInput);
      document.addEventListener('noted-component-definitions-changed',definitionsChanged);
      applyLayout(dom,node);
      const cleanupMove=moveHandle(editor,dom,getPos,()=>current,extent.update),cleanupResize=resizeHandle(editor,dom,getPos,()=>current,extent.update);
      return {dom,update(next){
        if(next.type!==current.type||next.attrs.id!==current.attrs.id||next.attrs.definitionId!==current.attrs.definitionId||next.attrs.definitionVersion!==current.attrs.definitionVersion||next.attrs.fallback!==current.attrs.fallback)return false;
        current=next;applyLayout(dom,next);extent.update();refreshInput();return true;
      },destroy(){disposed=true;editor.off('update',refreshInput);document.removeEventListener('noted-component-definitions-changed',definitionsChanged);mounted?.destroy();extent.destroy();cleanupMove();cleanupResize();},stopEvent:()=>true,ignoreMutation:()=>true};
    };
  },
});
export function insertInteractive(editor:Editor,definition:ComponentDefinition):boolean{
  if(!editor.isEditable)return false;
  const props=resolveComponentFields(definition.manifest.properties),state=resolveComponentFields(definition.manifest.persistentState);
  const value=editor.schema.nodes.interactiveComponent.create({id:crypto.randomUUID(),definitionId:definition.manifest.id,definitionVersion:definition.manifest.version,properties:props,state,fallback:definition.manifest.fallback});
  const position=editor.state.selection.$to.depth?editor.state.selection.$to.after(1):editor.state.selection.to;
  const tr=closeHistory(editor.state.tr).insert(position,value);tr.setSelection(NodeSelection.create(tr.doc,position));editor.view.dispatch(tr);return true;
}
