import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { SchemaId } from './model.ts';
import { indentationHint, normalizeTextColor } from './editor-extensions.ts';
import { findInDocument, type Match } from './editor-search.ts';

const button = (action: string, label: string, content: string, shortcut = '') => `<button type="button" data-edit="${action}" aria-label="${label}" title="${label}${shortcut ? ` (${shortcut})` : ''}">${content}</button>`;
export const editingMarkup = `
<div class="formatbar" role="toolbar" aria-label="Formatting">
 <div class="format-row">
  <label class="format-select"><span class="sr-only">Text style</span><select id="block-type" aria-label="Text style"><option value="paragraph">Paragraph</option>${[1,2,3,4,5,6].map(n=>`<option value="h${n}">Heading ${n}</option>`).join('')}<option value="codeBlock" disabled>Code block</option><option value="mixed" disabled>Mixed styles</option></select></label>
  <div class="format-buttons" role="group" aria-label="Text formatting">
   ${button('bold','Bold','<b>B</b>','Ctrl+B')}${button('italic','Italic','<i>I</i>','Ctrl+I')}${button('underline','Underline','<u>U</u>','Ctrl+U')}${button('strike','Strikethrough','<s>S</s>','Ctrl+Shift+S')}${button('highlight','Highlight','<span class="highlight-icon">H</span>','Ctrl+Shift+H')}${button('code','Inline code','&lt;/&gt;','Ctrl+E')}${button('subscript','Subscript','x<sub>2</sub>')}${button('superscript','Superscript','x<sup>2</sup>')}
  </div>
  <label class="format-select"><span class="sr-only">Text color</span><select id="text-color" aria-label="Text color"><option value="">Default color</option><option value="#365b32">Green</option><option value="#275c98">Blue</option><option value="#98413b">Red</option><option value="#7950a1">Purple</option><option value="#855a14">Amber</option><option value="custom" disabled>Custom color</option><option value="mixed" disabled>Mixed colors</option></select></label>
  ${button('clear','Clear text formatting','T<span aria-hidden="true">×</span>')}
 </div>
 <div class="format-row">
  <div class="format-buttons" role="group" aria-label="Lists and indentation">
   ${button('bulletList','Bullet list','• List','Ctrl+Shift+8')}${button('orderedList','Numbered list','1. List','Ctrl+Shift+7')}${button('taskList','Checklist','☑ List','Ctrl+Shift+9')}${button('outdent','Decrease indent','⇤','Shift+Tab')}${button('indent','Increase indent','⇥','Tab')}
  </div>
  <label class="format-select"><span class="sr-only">Text alignment</span><select id="text-align" aria-label="Text alignment"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option><option value="mixed" disabled>Mixed alignment</option></select></label>
  <div class="format-buttons" role="group" aria-label="Blocks">
   ${button('blockquote','Block quote','❝')}${button('codeBlock','Code block','{ }')}${button('rule','Horizontal rule','―')}
  </div>
 </div>
 <div class="format-row">
  <div class="format-buttons" role="group" aria-label="Links and tables">
   ${button('url','Add or edit link','↗ Link','Ctrl+K')}${button('unlink','Remove link','Unlink')}
   <button type="button" id="insert-link" aria-label="Link another note" title="Link another note">↗ Note</button>
   <label class="format-select"><span class="sr-only">Table actions</span><select id="table-action" aria-label="Table actions"><option value="">Table…</option><option value="insertTable">Insert 3 × 3 table</option><option value="addRowBefore">Row above</option><option value="addRowAfter">Row below</option><option value="addColumnBefore">Column before</option><option value="addColumnAfter">Column after</option><option value="deleteRow">Delete row</option><option value="deleteColumn">Delete column</option><option value="toggleHeaderRow">Toggle header row</option><option value="mergeCells">Merge selected cells</option><option value="splitCell">Split cell</option><option value="deleteTable">Delete table</option></select></label>
  </div>
  <div class="format-buttons" role="group" aria-label="History and search">${button('undo','Undo','↶','Ctrl+Z')}${button('redo','Redo','↷','Ctrl+Shift+Z')}${button('find','Find and replace','Find','Ctrl+F')}</div>
  <label class="schema-control">Schema <select id="schema" aria-label="Note schema preset"><option value="default">Paper · free indent</option><option value="compact">Compact · free indent</option><option value="outline">Outline · hierarchy</option></select></label>
 </div>
 <p id="indent-policy" class="indent-policy"></p>
</div>
<section id="find-panel" class="find-panel" aria-label="Find and replace" hidden>
 <div><input id="find-query" aria-label="Find in note" placeholder="Find in this note" /><label><input type="checkbox" id="find-case" /> Match case</label><button id="find-prev" aria-label="Previous match">↑</button><button id="find-next" aria-label="Next match">↓</button><span id="find-count" role="status" aria-live="polite"></span><button id="find-close" aria-label="Close find">×</button></div>
 <div><input id="replace-text" aria-label="Replacement text" placeholder="Replace with" /><button id="replace-one">Replace</button><button id="replace-all">Replace all</button></div>
</section>
<dialog id="url-dialog"><form id="url-form"><span class="eyebrow">LINK TO A WEB PAGE</span><h2>Add or edit link</h2><label>URL<input id="url-value" type="url" required placeholder="https://example.com" /></label><label id="url-label-row">Link text<input id="url-label" placeholder="Use URL as text" /></label><p class="dialog-description">Links are stored locally. This prototype lets you copy external addresses; it does not open them automatically.</p><div class="dialog-actions"><button type="button" id="url-cancel">Cancel</button><button type="submit" class="primary">Apply link</button></div></form></dialog>
`;

type Options = { getEditor: () => Editor | null; getSchema: () => SchemaId; error: (message: unknown) => void };
export function initializeEditingUI({getEditor, getSchema, error}: Options) {
 const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
 const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-edit]')];
 let linkRange: {from:number;to:number} | null = null;
 let matches: Match[] = []; let current = -1; let truncated = false;
 let searchTimer: ReturnType<typeof setTimeout> | undefined;
 const marks = ['bold','italic','underline','strike','highlight','code','subscript','superscript'];
 function tableCommand(editor: Editor, command: string, dry = false): boolean {
   const chain = dry ? editor.can().chain() : editor.chain().focus();
   switch(command) {
    case 'insertTable': return !editor.isActive('table') && chain.insertTable({rows:3,cols:3,withHeaderRow:true}).run();
    case 'addRowBefore': return chain.addRowBefore().run();
    case 'addRowAfter': return chain.addRowAfter().run();
    case 'addColumnBefore': return chain.addColumnBefore().run();
    case 'addColumnAfter': return chain.addColumnAfter().run();
    case 'deleteRow': return chain.deleteRow().run();
    case 'deleteColumn': return chain.deleteColumn().run();
    case 'toggleHeaderRow': return chain.toggleHeaderRow().run();
    case 'mergeCells': return chain.mergeCells().run();
    case 'splitCell': return chain.splitCell().run();
    case 'deleteTable': return chain.deleteTable().run();
    default: return false;
   }
 }
 function openURL() {
   const editor = getEditor(); if (!editor) return;
   if (editor.isActive('link')) editor.commands.extendMarkRange('link');
   linkRange = {from:editor.state.selection.from,to:editor.state.selection.to};
   const href = editor.getAttributes('link').href ?? '';
   $('#url-label-row').hidden = linkRange.from !== linkRange.to;
   $<HTMLInputElement>('#url-value').value = /^https?:/.test(href) ? href : '';
   $<HTMLInputElement>('#url-label').value = '';
   $<HTMLDialogElement>('#url-dialog').showModal();
   $('#url-value').focus();
 }
 function refreshMatches(select = false) {
   const editor = getEditor(); if (!editor || $('#find-panel').hidden) return;
   const result = findInDocument(editor.state.doc, $<HTMLInputElement>('#find-query').value, $<HTMLInputElement>('#find-case').checked);
   matches = result.matches; truncated = result.truncated;
   current = matches.length ? Math.min(Math.max(current, 0),matches.length-1) : -1;
   updateFindControls();
   if(select) revealMatch();
 }
 function updateFindControls() {
   $('#find-count').textContent = truncated ? '10,000+ matches · refine search' : matches.length ? `${current+1} of ${matches.length}` : 'No matches';
   for(const id of ['#find-prev','#find-next','#replace-one']) $<HTMLButtonElement>(id).disabled = !matches.length;
   $<HTMLButtonElement>('#replace-all').disabled = !matches.length || truncated;
 }
 function revealMatch() {
   const editor=getEditor(), match=matches[current]; if(!editor || !match) return;
   editor.chain().setTextSelection(match).scrollIntoView().run(); updateFindControls();
 }
 function openFind() { $('#find-panel').hidden=false; refreshMatches(); $('#find-query').focus(); $<HTMLInputElement>('#find-query').select(); }
 function closeFind() { $('#find-panel').hidden=true; clearTimeout(searchTimer); getEditor()?.commands.focus(); }
 function replacement(all: boolean) {
   const editor=getEditor(); if(!editor) return;
   refreshMatches();
   if(all && truncated) return;
   const targets = all ? matches : matches[current] ? [matches[current]] : [];
   if(!targets.length) return;
   const text=$<HTMLInputElement>('#replace-text').value;
   const tr=closeHistory(editor.state.tr);
   for(const match of [...targets].reverse()) tr.insertText(text,match.from,match.to);
   editor.view.dispatch(tr);
   editor.view.dispatch(closeHistory(editor.state.tr));
   refreshMatches(true);
 }
 for(const b of buttons) {
  b.onmousedown=e=>e.preventDefault();
  b.onclick=()=>{
   const editor=getEditor(); if(!editor) return;
   const chain=editor.chain().focus();
   switch(b.dataset.edit) {
    case 'bold': chain.toggleBold().run(); break;
    case 'italic': chain.toggleItalic().run(); break;
    case 'underline': chain.toggleUnderline().run(); break;
    case 'strike': chain.toggleStrike().run(); break;
    case 'highlight': chain.toggleHighlight().run(); break;
    case 'code': chain.toggleCode().run(); break;
    case 'subscript': chain.toggleSubscript().run(); break;
    case 'superscript': chain.toggleSuperscript().run(); break;
    case 'bulletList': chain.toggleBulletList().run(); break;
    case 'orderedList': chain.toggleOrderedList().run(); break;
    case 'taskList': chain.toggleTaskList().run(); break;
    case 'indent': chain.indent().run(); break;
    case 'outdent': chain.outdent().run(); break;
    case 'blockquote': chain.toggleBlockquote().run(); break;
    case 'codeBlock': chain.toggleCodeBlock().run(); break;
    case 'rule': chain.setHorizontalRule().run(); break;
    case 'clear': chain.unsetAllMarks().run(); break;
    case 'undo': chain.undo().run(); break;
    case 'redo': chain.redo().run(); break;
    case 'url': openURL(); break;
    case 'unlink': chain.extendMarkRange('link').unsetLink().run(); break;
    case 'find': openFind(); break;
   }
   sync();
  };
 }
 $('#block-type').onchange=()=>{
   const editor=getEditor(), value=$<HTMLSelectElement>('#block-type').value; if(!editor) return;
   if(value==='paragraph') editor.chain().focus().setParagraph().run();
   else if(/^h[1-6]$/.test(value)) editor.chain().focus().setHeading({level:Number(value.slice(1)) as 1|2|3|4|5|6}).run();
   sync();
 };
 $('#text-align').onchange=()=>{getEditor()?.chain().focus().setTextAlign($<HTMLSelectElement>('#text-align').value).run();sync();};
 $('#text-color').onchange=()=>{const editor=getEditor(),value=$<HTMLSelectElement>('#text-color').value;if(!editor)return; if(value) editor.chain().focus().setColor(value).run();else editor.chain().focus().unsetColor().run(); sync();};
 $('#table-action').onchange=()=>{const editor=getEditor(), select=$<HTMLSelectElement>('#table-action');if(editor)tableCommand(editor,select.value);select.value='';sync();};
 $('#url-cancel').onclick=()=>{$<HTMLDialogElement>('#url-dialog').close();getEditor()?.commands.focus();};
 $('#url-value').oninput=()=> $<HTMLInputElement>('#url-value').setCustomValidity('');
 $('#url-form').onsubmit=event=>{
   event.preventDefault(); const editor=getEditor(); if(!editor || !linkRange) return;
   try {
     const value=$<HTMLInputElement>('#url-value').value.trim(); const url=new URL(value);
     if(!['http:','https:'].includes(url.protocol) || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Use an http:// or https:// web address.');
     const chain=editor.chain().focus().setTextSelection(linkRange);
     if(linkRange.from===linkRange.to) chain.insertContent({type:'text',text:$<HTMLInputElement>('#url-label').value || value,marks:[{type:'link',attrs:{href:value}}]}).run();
     else chain.setLink({href:value}).run();
     $<HTMLDialogElement>('#url-dialog').close();sync();
   } catch(reason) {
     const field=$<HTMLInputElement>('#url-value');
     field.setCustomValidity(reason instanceof Error ? reason.message : 'Enter a valid web address.');
     field.reportValidity();
   }
 };
 $('#find-query').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{current=0;refreshMatches(true);},150);};
 $('#find-case').onchange=()=>{current=0;refreshMatches(true);};
 $('#find-next').onclick=()=>{refreshMatches();if(matches.length){current=(current+1)%matches.length;revealMatch();}};
 $('#find-prev').onclick=()=>{refreshMatches();if(matches.length){current=(current-1+matches.length)%matches.length;revealMatch();}};
 $('#replace-one').onclick=()=>replacement(false); $('#replace-all').onclick=()=>replacement(true); $('#find-close').onclick=closeFind;
 $('#find-query').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();(event.shiftKey ? $('#find-prev') : $('#find-next')).click();}};
 document.addEventListener('keydown',event=>{
   if(!getEditor() || document.querySelector('dialog[open]')) return;
   if(!event.defaultPrevented && !event.shiftKey && !event.altKey && (event.ctrlKey||event.metaKey) && ['f','h','k'].includes(event.key.toLowerCase())) {
     event.preventDefault();if(event.key.toLowerCase()==='k') openURL();else openFind();
   }
   if(event.key==='Escape' && !$('#find-panel').hidden) {event.preventDefault();closeFind();}
 });
 function sync(editor: Editor | null = getEditor(), docChanged=false) {
   if(!editor || editor.isDestroyed) return;
   const nearestList=(position: typeof editor.state.selection.$from)=>{
     for(let depth=position.depth;depth>0;depth--) if(['bulletList','orderedList','taskList'].includes(position.node(depth).type.name)) return position.node(depth).type.name;
     return null;
   };
   for(const b of buttons) {
    const action=b.dataset.edit!;
    let active: boolean | 'mixed'=false;
    if(marks.includes(action)) {
     active=editor.isActive(action);
     if(!active && !editor.state.selection.empty && editor.state.doc.rangeHasMark(editor.state.selection.from,editor.state.selection.to,editor.schema.marks[action])) active='mixed';
    } else if(['bulletList','orderedList','taskList'].includes(action)) active=editor.isActive(action) && nearestList(editor.state.selection.$from)===action && nearestList(editor.state.selection.$to)===action;
    else if(['blockquote','codeBlock'].includes(action)) active=editor.isActive(action);
    if(marks.includes(action) || ['bulletList','orderedList','taskList','blockquote','codeBlock'].includes(action)) b.setAttribute('aria-pressed',String(active));
    b.classList.toggle('is-active',active===true);b.classList.toggle('is-mixed',active==='mixed');
    let enabled=editor.isEditable;
    if(action==='undo') enabled &&= editor.can().undo();
    if(action==='redo') enabled &&= editor.can().redo();
    if(action==='indent') enabled &&= editor.can().indent();
    if(action==='outdent') enabled &&= editor.can().outdent();
    if(action==='unlink') enabled &&= editor.isActive('link');
    if(marks.includes(action)) enabled &&= editor.can().toggleMark(action);
    b.disabled=!enabled;
   }
   const styles=new Set<string>(), alignments=new Set<string>(), colors=new Set<string>();
   const {from,to,empty,$from}=editor.state.selection;
   const readColor=(nodeMarks: typeof editor.state.storedMarks)=>normalizeTextColor(nodeMarks?.find(mark=>mark.type.name==='textStyle')?.attrs.color) ?? '';
   if(empty) colors.add(readColor(editor.state.storedMarks ?? $from.marks()));
   editor.state.doc.nodesBetween(from,to,node=>{
     if(node.isTextblock) styles.add(node.type.name==='heading' ? `h${node.attrs.level}` : node.type.name);
     if(['paragraph','heading'].includes(node.type.name)) alignments.add(node.attrs.textAlign ?? 'left');
     if(node.isText && !empty) colors.add(readColor(node.marks));
   });
   $<HTMLSelectElement>('#block-type').value=styles.size===1 ? [...styles][0] : 'mixed';
   $<HTMLSelectElement>('#text-align').value=alignments.size>1 ? 'mixed' : [...alignments][0] ?? 'left';
   $<HTMLSelectElement>('#text-align').disabled=!editor.isEditable || alignments.size===0;
   const color=colors.size>1 ? 'mixed' : [...colors][0] ?? '';
   const palette=$<HTMLSelectElement>('#text-color');palette.value=[...palette.options].some(o=>o.value===color) ? color : 'custom';
   for(const option of $<HTMLSelectElement>('#table-action').options) if(option.value) option.disabled=!tableCommand(editor,option.value,true);
   $('#indent-policy').textContent=indentationHint(getSchema());
   if(docChanged && !$('#find-panel').hidden){clearTimeout(searchTimer);searchTimer=setTimeout(()=>refreshMatches(),150);}
 }
 return {sync, reset:()=>{current=-1;refreshMatches();}};
}
