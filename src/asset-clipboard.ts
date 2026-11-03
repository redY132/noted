import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';

/** Clipboard HTML carries ownership only in transit; it is never persisted in note content. */
export const AssetClipboard = Extension.create<{noteId?:string;copyAsset?:(source:string,target:string,asset:string)=>Promise<{id:string}>;error?:(error:unknown)=>void}>({
  name:'assetClipboard',addOptions:()=>({}),
  addProseMirrorPlugins(){
    const options=this.options,editor=this.editor;
    return [new Plugin({props:{handlePaste(view,event,slice){
      const html=event.clipboardData?.getData('text/html');if(!html||!options.noteId||!options.copyAsset)return false;
      const parsed=new DOMParser().parseFromString(html,'text/html'),owners=new Map<string,string>();
      for(const element of parsed.querySelectorAll('[data-local-asset][data-asset-owner]')){
        const owner=element.getAttribute('data-asset-owner')!,asset=element.getAttribute('data-local-asset')!;
        if(owner!==options.noteId&&/^[a-f0-9-]{36}$/.test(owner)&&/^[a-f0-9-]{36}$/.test(asset))owners.set(asset,owner);
      }
      if(!owners.size)return false;
      const baseline=view.state.doc,selection=view.state.selection;
      void (async()=>{
        const replacements=new Map<string,string>();
        for(const [asset,owner] of owners)replacements.set(asset,(await options.copyAsset!(owner,options.noteId!,asset)).id);
        if(editor.isDestroyed||!editor.isEditable||view.state.doc!==baseline||!view.state.selection.eq(selection))throw new Error('The note changed while copying images. Paste again to keep your new edits.');
        const map=(node:PMNode):PMNode=>{
          const content=Fragment.fromArray(Array.from({length:node.childCount},(_,index)=>map(node.child(index))));
          if(node.type.name==='localImage'&&replacements.has(node.attrs.assetId))return node.type.create({...node.attrs,id:crypto.randomUUID(),assetId:replacements.get(node.attrs.assetId)},content,node.marks);
          return node.isText?node:node.copy(content);
        };
        const content=Fragment.fromArray(Array.from({length:slice.content.childCount},(_,index)=>map(slice.content.child(index))));
        view.dispatch(closeHistory(view.state.tr).replaceSelection(new Slice(content,slice.openStart,slice.openEnd)).scrollIntoView());
      })().catch(reason=>options.error?.(reason));
      return true;
    }}})];
  },
});
