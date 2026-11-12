import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { normalizeTextColor } from './editor-extensions.ts';
import { contrastRatio } from './appearance.ts';

export const textColorMarkup = `<dialog id="text-color-dialog" aria-labelledby="text-color-title" inert>
 <form id="text-color-form" novalidate><header><h2 id="text-color-title">Custom text color</h2><button type="button" data-color-close>Cancel</button></header>
 <p>Apply to selected text, or choose the color for what you type next. Cancel keeps your formatting.</p>
 <div class="text-color-fields"><label>Color picker<input id="custom-color-picker" type="color" value="#365b32" /></label><label>Hex color<input id="custom-color-value" type="text" maxlength="7" placeholder="#365b32" spellcheck="false" autocomplete="off" aria-describedby="custom-color-help custom-color-error" /></label></div>
 <p id="custom-color-help">Use #rgb or #rrggbb. These samples use plain light and dark paper; your note background and highlights may differ.</p>
 <div class="text-color-samples"><section><h3>On light paper</h3><p data-color-sample="light">A few words in your chosen color.</p><span data-color-ratio="light"></span></section><section><h3>On dark paper</h3><p data-color-sample="dark">A few words in your chosen color.</p><span data-color-ratio="dark"></span></section></div>
 <p id="custom-color-error" role="status" aria-live="polite"></p><footer><button type="button" data-color-default>Use default color</button><button type="submit" data-color-apply>Apply color</button></footer></form>
</dialog>`;

export function initializeTextColor(o: { getEditor(): Editor | null; sync(): void; error(reason: unknown): void }) {
 const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
 const dialog=$<HTMLDialogElement>('#text-color-dialog'),field=$<HTMLInputElement>('#custom-color-value'),picker=$<HTMLInputElement>('#custom-color-picker');
 let context:{editor:Editor;doc:Editor['state']['doc'];from:number;to:number}|null=null,applied=false;
 const message=(value:string)=>{$('#custom-color-error').textContent=value;};
 function preview(){
  const color=normalizeTextColor(field.value);field.setAttribute('aria-invalid',String(!color));$<HTMLButtonElement>('[data-color-apply]').disabled=!color;
  if(!color){message('Enter a hex color such as #365b32 or #abc.');return;}
  picker.value=color;message('');
  for(const [theme,background] of [['light','#ffffff'],['dark','#202124']]){
   $('[data-color-sample="'+theme+'"]').style.color=color;
   const ratio=contrastRatio(color,background);
   $('[data-color-ratio="'+theme+'"]').textContent=ratio.toFixed(2)+':1 contrast'+(ratio<4.5?' · Below 4.5:1 for normal text':' · Meets 4.5:1 for normal text');
  }
 }
 function close(){dialog.inert=true;dialog.close();}
 function apply(color:string|null){
  const saved=context,editor=o.getEditor();
  if(!saved||!editor||editor!==saved.editor||editor.isDestroyed||!editor.isEditable||!editor.state.doc.eq(saved.doc)){
   close();o.error('The note changed. Select the text and open Custom color again.');return;
  }
  editor.view.dispatch(closeHistory(editor.state.tr));
  const chain=editor.chain().setTextSelection({from:saved.from,to:saved.to});
  const success=color?chain.setColor(color).run():chain.unsetColor().run();editor.view.dispatch(closeHistory(editor.state.tr));
  if(!success){message('This selection cannot use a text color. Choose ordinary text.');return;}
  applied=true;close();editor.view.focus();o.sync();
 }
 field.oninput=preview;picker.oninput=()=>{field.value=picker.value;preview();};
 $('[data-color-close]').onclick=close;$('[data-color-default]').onclick=()=>apply(null);
 $('#text-color-form').onsubmit=e=>{e.preventDefault();const color=normalizeTextColor(field.value);if(color)apply(color);else{preview();field.focus();}};
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.addEventListener('close',()=>{if(dialog.open)return;const editor=context?.editor;context=null;dialog.inert=true;o.sync();if(applied&&editor===o.getEditor()&&!editor?.isDestroyed)editor?.view.focus();else $('#custom-color-open').focus();});
 return{open(){
  const editor=o.getEditor();if(!editor||editor.isDestroyed||!editor.isEditable||!editor.can().setMark('textStyle')||document.querySelector('dialog[open]')){o.sync();return;}
  applied=false;const {from,to}=editor.state.selection;context={editor,doc:editor.state.doc,from,to};field.value=normalizeTextColor(editor.getAttributes('textStyle').color)??'#365b32';
  preview();dialog.inert=false;dialog.showModal();field.focus();field.select();
 }};
}
