import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('output/playwright',{recursive:true});
await writeFile('output/validation-harness.html',`<!doctype html><html data-theme="light"><meta charset="utf-8"><title>Disposable rendered validation harness</title><body><article class="document" style="width:800px;padding:0;margin:20px" data-schema="default"><div id="editing"></div></article><div id="preview"></div><script type="module">
import {Editor} from '@tiptap/core';import {createEditorExtensions} from '/src/editor-extensions.ts';import {validateRenderedDocument} from '/src/render-validation.ts';import {documentFromEditor,documentToEditor} from '/src/document-model.ts';
import '/src/style.css';import '/src/editing.css';import '/src/components.css';import '/src/shell-ui.css';import '/src/theme.css';
const id='00000000-0000-4000-8000-000000000001';const editor=new Editor({element:document.querySelector('#editing'),extensions:createEditorExtensions(),content:{type:'doc',content:[{type:'paragraph',attrs:{id:'original'},content:[{type:'text',text:'Original live document'}]}]}});
window.validationHarness={editor,id,validate:validateRenderedDocument,documentFromEditor,documentToEditor};window.ready=true;
</script></body></html>`);
