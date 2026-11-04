import {applyEditorProjection} from './document-editor.ts';
import {documentFromEditor} from './document-model.ts';
import type { JSONContent } from '@tiptap/core';
import type {Note} from './model.ts';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { applySchema, schemaProjection, needsFreePlacement, sameDocumentSchema, bindSchemaRegistry, BUILTIN_SCHEMAS, previewSchema, SCHEMA_STYLE_KEYS, SCHEMA_TARGETS, SchemaRegistry, schemaStyleCSS, setSchemaReference, validSchemaPolicy, validSchemaReference, validateDocumentSchema, type DocumentSchema, type SchemaPolicy, type SchemaReference, type SchemaStyle, type SchemaStyleKey, type SchemaTarget } from './document-schema.ts';

export const schemaEditorMarkup = `<button type="button" data-schema-open aria-haspopup="dialog" title="Edit reusable note schemas">Schemas…</button>
<dialog class="schema-editor" aria-label="Note schemas">
 <form method="dialog"><div class="schema-editor-heading"><strong>Note schemas</strong><button type="submit" aria-label="Close schema editor">×</button></div></form>
 <p>Choose a saved version for this note. Suggestions preserve explicit formatting; automatic rules are optional.</p>
 <div class="schema-fields"><label>Saved version<select data-schema-version aria-label="Saved schema version"></select></label><button type="button" data-schema-pin>Use this version</button><button type="button" data-schema-new>New schema</button></div>
 <div class="schema-fields"><label>Name<input data-schema-name maxlength="100" /></label><label>Rule<select data-schema-target aria-label="Schema rule">${SCHEMA_TARGETS.map(target => `<option value="${target}">${target === 'body' ? 'Body text' : `Heading ${target.slice(-1)}`}</option>`).join('')}</select></label></div>
 <div class="schema-fields schema-style-fields">
  <label>Typeface<select data-style="fontFamily"><option value="">Inherit</option><option value="system">System sans serif</option><option value="serif">Serif</option><option value="mono">Monospace</option></select></label>
  <label>Size (px)<input data-style="fontSize" type="number" min="10" max="96" step="1" placeholder="Inherit" /></label>
  <label>Line height<input data-style="lineHeight" type="number" min="1" max="3" step="0.05" placeholder="Inherit" /></label>
  <label>Text color<input data-style="color" pattern="#[0-9a-fA-F]{6}" maxlength="7" placeholder="Default / #rrggbb" /></label>
  <label>Block spacing (px)<input data-style="spacing" type="number" min="0" max="96" step="1" placeholder="Inherit" /></label>
  <label>Indent level<input data-style="indent" type="number" min="0" max="8" step="1" placeholder="Inherit" /></label>
 </div>
 <label>Layout policy<select data-schema-layout aria-label="Schema layout policy"><option value="">Typography rules only</option><option value="free">Free placement</option></select></label><p>Free placement creates independent movable panels when Preview / Apply is accepted. It never continuously rearranges your writing.</p><div class="schema-fields"><button type="button" data-schema-capture>Use this whole document as guidance</button><button type="button" data-schema-ai>AI adherence suggestions</button></div><p data-schema-guide-status></p><details><summary>Editable text definition</summary><textarea data-schema-source aria-label="Schema JSON definition" rows="10" spellcheck="false"></textarea></details>
 <div class="schema-fields"><button type="button" data-schema-publish>Save as new version</button><span data-schema-pin-label></span></div>
 <fieldset><legend>Automatic rules for this note</legend><label><input data-schema-auto type="checkbox" /> Enforce selected rules automatically</label><div class="schema-rule-checks">${SCHEMA_STYLE_KEYS.map(key => `<label><input type="checkbox" data-enforce="${key}" /> ${({ fontFamily: 'Typeface', fontSize: 'Size', lineHeight: 'Line height', color: 'Color', spacing: 'Spacing', indent: 'Indentation' } as Record<string, string>)[key]}</label>`).join('')}</div><button type="button" data-schema-policy>Save rule preferences</button></fieldset>
 <div class="schema-fields"><button type="button" data-schema-preview>Preview suggestions</button><button type="button" data-schema-apply disabled>Apply preview</button></div>
 <div class="rendered-proposal-preview" role="region" tabindex="0" aria-label="Schema proposal preview" data-schema-preview-content></div>
 <p data-schema-status role="status" aria-live="polite"></p>
</dialog>`;

const styles = `.schema-editor{width:660px;max-height:calc(100dvh - 36px);overflow:auto;font:13px system-ui,sans-serif;padding:20px;background:var(--ui-surface,#fff);color:var(--ui-text,#222);border:1px solid var(--ui-border,#ccc)}.schema-editor-heading,.schema-fields{display:flex;align-items:end;gap:10px;flex-wrap:wrap}.schema-editor-heading{align-items:center;justify-content:space-between}.schema-editor p{line-height:1.5;color:var(--ui-muted,#777)}.schema-editor label{display:flex;flex-direction:column;gap:5px}.schema-editor input,.schema-editor select,.schema-editor textarea{font:inherit;padding:6px;border:1px solid var(--ui-border,#bbb);border-radius:5px;background:var(--ui-subtle,#fff);color:inherit;max-width:100%}.schema-editor input[type=checkbox]{padding:0}.schema-editor input[type=number]{width:105px}.schema-editor button{padding:7px 10px;border:1px solid var(--ui-border,#ccc);border-radius:5px}.schema-fields{margin:12px 0}.schema-style-fields{align-items:start}.schema-editor textarea{box-sizing:border-box;width:100%;font:12px Consolas,monospace;resize:vertical}.schema-editor details{margin-block:12px}.schema-editor summary{cursor:pointer}.schema-editor fieldset{border:1px solid var(--ui-border,#ccc);border-radius:6px;margin:15px 0;padding:10px}.schema-editor fieldset label{display:flex;flex-direction:row;align-items:center}.schema-rule-checks{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.schema-preview{max-height:180px;overflow:auto}.schema-preview>div{border:1px solid var(--ui-border,#ccc);padding:10px;border-radius:5px}.schema-preview small{display:block;color:var(--ui-muted,#777);margin-top:6px}`;
const LOCAL_KEY = 'noted-schema-library-v1';
export function localSchemaRegistry(storage: Pick<Storage, 'getItem' | 'setItem'>): SchemaRegistry {
  let definitions: DocumentSchema[] = [];
  const saved = storage.getItem(LOCAL_KEY);
  if (saved) { const value: unknown = JSON.parse(saved); if (!Array.isArray(value) || value.length > 1000) throw new Error('Invalid local schema library.'); definitions = value; }
  return new SchemaRegistry(definitions, schemas => storage.setItem(LOCAL_KEY, JSON.stringify(schemas)));
}
interface Options {
  getEditor: () => Editor | null;
  getNote?:()=>Note|null;
  askAI?:()=>void;
  registry: SchemaRegistry;
  /** Legacy preset used when an old note has no explicit pinned version. */
  getLegacySchema?: () => string;
  error: (error: unknown) => void;
  validate?:(editor:Editor,content:JSONContent,previewHost?:HTMLElement)=>Promise<void|{dispose:()=>void}>;
  changed?: (reference: SchemaReference, policy: SchemaPolicy) => void;
}
/** Mount outside collapsible toolbar regions so an open dialog stays usable. */
export function initializeSchemaUI(host: HTMLElement, options: Options) {
  host.innerHTML = schemaEditorMarkup;
  const style = document.createElement('style'); style.textContent = styles; host.append(style);
  const $ = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const dialog = $<HTMLDialogElement>('dialog'), picker = $<HTMLSelectElement>('[data-schema-version]');
  let draft = structuredClone(BUILTIN_SCHEMAS[0]), target: SchemaTarget = 'body';
  let sourceDirty = false, preview: { doc: PMNode; editor: Editor; schema: DocumentSchema; policy: SchemaPolicy;content:JSONContent;count:number } | null = null;
  let previewEpoch=0;
  let boundEditor: Editor | null = null;
  const status = (message: string) => { $('[data-schema-status]').textContent = message; };
  const run = (fn: () => void | Promise<void>) => Promise.resolve().then(fn).catch(options.error);
  const reference = (editor: Editor): SchemaReference => validSchemaReference(editor.state.doc.attrs.schemaReference)
    ? editor.state.doc.attrs.schemaReference : { id: options.getLegacySchema?.() ?? 'default', version: 1 };
  const policy = (editor: Editor): SchemaPolicy => validSchemaPolicy(editor.state.doc.attrs.schemaPolicy)
    ? editor.state.doc.attrs.schemaPolicy : { mode: 'suggest', enabledRules: [] };
  let renderedPreview:{dispose:()=>void}|void;
  function invalidatePreview() { renderedPreview?.dispose();renderedPreview=undefined; previewEpoch++;preview = null; $<HTMLButtonElement>('[data-schema-apply]').disabled = true; $('[data-schema-preview-content]').replaceChildren(); }
  function writeSource() { $<HTMLTextAreaElement>('[data-schema-source]').value = JSON.stringify(draft, null, 2); sourceDirty = false; invalidatePreview(); }
  function readSource() {
    if (sourceDirty) { const value: unknown = JSON.parse($<HTMLTextAreaElement>('[data-schema-source]').value); validateDocumentSchema(value); draft = structuredClone(value); fillForm(); sourceDirty = false; }
    draft.name = $<HTMLInputElement>('[data-schema-name]').value.trim();
    validateDocumentSchema(draft); return structuredClone(draft);
  }
  function fillForm() {
    $<HTMLInputElement>('[data-schema-name]').value = draft.name;
    $<HTMLSelectElement>('[data-schema-layout]').value=draft.layout??'';$('[data-schema-guide-status]').textContent=draft.guide?`Full document guide: ${draft.guide.title}. This is a local immutable snapshot. Sending it to AI requires fresh consent for each request.`:'No document guide attached.';
    const rule = draft.rules[target] ?? {};
    for (const input of host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-style]')) input.value = String(rule[input.dataset.style as SchemaStyleKey] ?? '');
  }
  function fillPicker(ref?: SchemaReference) {
    const selected = ref ? `${ref.id}@${ref.version}` : picker.value;
    picker.replaceChildren();
    for (const schema of options.registry.list()) { const option = document.createElement('option'); option.value = `${schema.id}@${schema.version}`; option.textContent = `${schema.name} · v${schema.version}`; picker.append(option); }
    if (selected && [...picker.options].some(option => option.value === selected)) picker.value = selected;
  }
  function chooseDraft() {
    const definition = options.registry.list().find(schema => `${schema.id}@${schema.version}` === picker.value);
    if (!definition) return;
    draft = structuredClone(definition); fillForm(); writeSource();
  }
  function show() {
    const editor = options.getEditor(); if (!editor) return;
    bindSchemaRegistry(editor, options.registry); boundEditor = editor;
    const ref = reference(editor), selectedPolicy = policy(editor);
    fillPicker(ref); chooseDraft();
    $<HTMLInputElement>('[data-schema-auto]').checked = selectedPolicy.mode === 'automatic';
    for (const input of host.querySelectorAll<HTMLInputElement>('[data-enforce]')) input.checked = selectedPolicy.enabledRules.includes(input.dataset.enforce as SchemaStyleKey);
    const pinned = options.registry.get(ref);
    $('[data-schema-pin-label]').textContent = pinned ? `This note: ${pinned.name} v${pinned.version}` : `Unavailable schema: ${ref.id} v${ref.version}. Saved formatting is preserved.`;
    status(''); dialog.showModal();
  }
  function selectedPolicy(): SchemaPolicy {
    return { mode: $<HTMLInputElement>('[data-schema-auto]').checked ? 'automatic' : 'suggest', enabledRules: [...host.querySelectorAll<HTMLInputElement>('[data-enforce]:checked')].map(input => input.dataset.enforce as SchemaStyleKey) };
  }
  $('[data-schema-open]').addEventListener('mousedown', event => event.preventDefault());
  $('[data-schema-open]').addEventListener('click', () => run(show));
  dialog.addEventListener('close', () => { invalidatePreview(); options.getEditor()?.view.focus(); });
  picker.addEventListener('change', chooseDraft);
  $('[data-schema-target]').addEventListener('change', () => run(() => { if (sourceDirty) readSource(); target = $<HTMLSelectElement>('[data-schema-target]').value as SchemaTarget; fillForm(); }));
  $('[data-schema-name]').addEventListener('input', () => { draft.name = $<HTMLInputElement>('[data-schema-name]').value; writeSource(); });
  for (const input of host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-style]')) input.addEventListener('change', () => run(() => {
    if (sourceDirty) readSource();
    const key = input.dataset.style as SchemaStyleKey, rule = { ...(draft.rules[target] ?? {}) }, value = input.value.trim();
    if (!value) delete rule[key]; else Object.assign(rule, { [key]: ['fontFamily', 'color'].includes(key) ? value : Number(value) });
    const next = { ...draft, rules: { ...draft.rules, [target]: rule } }; validateDocumentSchema(next); draft = next; writeSource();
  }));
  $('[data-schema-layout]').onchange=()=>run(()=>{if(sourceDirty)readSource();if($<HTMLSelectElement>('[data-schema-layout]').value){draft.layout='free';draft.formatVersion=2;}else delete draft.layout;writeSource();});
  $('[data-schema-capture]').onclick=()=>run(()=>{const editor=options.getEditor();if(!editor)return;const note=options.getNote?.();const document=documentFromEditor(editor.getJSON(),note?.id??crypto.randomUUID(),note?.document);draft={...readSource(),formatVersion:2,id:`schema-${crypto.randomUUID()}`,version:1,name:((note?.title??'Document')+' guide').slice(0,100),guide:{title:(note?.title||'Document guide').slice(0,240),document}};validateDocumentSchema(draft);fillForm();writeSource();status('Document captured locally. Save this new schema version, then select it on the target note. Nothing was sent to AI.');});
  $('[data-schema-ai]').onclick=()=>run(()=>{const editor=options.getEditor();if(!editor)return;const selected=readSource(),ref=reference(editor);if(ref.id!==selected.id||ref.version!==selected.version||!sameDocumentSchema(options.registry.get(selected),selected))throw new Error('Use this version on the target note before asking for adherence suggestions.');dialog.close();options.askAI?.();});
  $('[data-schema-source]').addEventListener('input', () => { sourceDirty = true; invalidatePreview(); });
  $('[data-schema-new]').addEventListener('click', () => run(() => {
    draft = { ...readSource(), id: `schema-${crypto.randomUUID()}`, version: 1, name: 'New schema' }; fillForm(); writeSource(); status('Edit this definition, then save its first version.');
  }));
  $('[data-schema-publish]').addEventListener('click', () => run(async () => {
    const definition = readSource(); definition.version = options.registry.nextVersion(definition.id);
    await options.registry.publish(definition); draft = structuredClone(definition); fillPicker(definition); fillForm(); writeSource();
    status(`Saved ${definition.name} v${definition.version}. Existing notes keep their selected versions. Choose “Use this version” to update this note.`);
  }));
  $('[data-schema-pin]').addEventListener('click', () => run(async () => {
    const editor = options.getEditor(); if (!editor) return;
    const definition = readSource(), saved = options.registry.get(definition);
    if (!saved || !sameDocumentSchema(saved,definition)) throw new Error('Save this definition as a new version before using it.');
    const ref = { id: saved.id, version: saved.version }, nextPolicy = selectedPolicy();
    if(nextPolicy.mode==='automatic'){const baseline=editor.state.doc,ticket=previewEpoch;await options.validate?.(editor,schemaProjection(editor,saved,nextPolicy));if(ticket!==previewEpoch||editor!==options.getEditor()||editor.state.doc!==baseline)throw new Error('The note changed. Preview the schema again.');}
    setSchemaReference(editor, ref, nextPolicy); options.changed?.(ref, nextPolicy);
    $('[data-schema-pin-label]').textContent = `This note: ${saved.name} v${saved.version}`; invalidatePreview(); status('Version selected. Preview its suggestions before applying them.');
  }));
  $('[data-schema-policy]').addEventListener('click', () => run(async () => {
    const editor = options.getEditor(); if (!editor) return;
    const ref = reference(editor), nextPolicy = selectedPolicy();
    if (nextPolicy.mode === 'automatic' && !nextPolicy.enabledRules.length) throw new Error('Select at least one rule to enforce automatically.');
    if(nextPolicy.mode==='automatic'){const schema=options.registry.get(ref);if(!schema)throw new Error('The selected schema definition is unavailable.');const baseline=editor.state.doc;await options.validate?.(editor,schemaProjection(editor,schema,nextPolicy));if(editor!==options.getEditor()||editor.state.doc!==baseline)throw new Error('The note changed. Check the rules again.');}
    setSchemaReference(editor, ref, nextPolicy); options.changed?.(ref, nextPolicy); invalidatePreview();
    status(nextPolicy.mode === 'automatic' ? 'Only the selected rules will be enforced after edits. Use Preview to apply them to the existing note.' : 'Suggestion mode enabled. Explicit formatting is preserved.');
  }));
  $('[data-schema-preview]').addEventListener('click', () => run(async () => {
    const editor = options.getEditor(); if (!editor) return;
    const definition = readSource(), nextPolicy = selectedPolicy();
    const saved = options.registry.get(definition);
    if (!saved || !sameDocumentSchema(saved,definition)) throw new Error('Save the definition before applying its suggestions.');
    invalidatePreview();const content = $('[data-schema-preview-content]');content.replaceChildren();const baseline=editor.state.doc,ticket=previewEpoch,candidate=schemaProjection(editor,saved,nextPolicy);const checked=await options.validate?.(editor,candidate,content);if(ticket!==previewEpoch||editor!==options.getEditor()||editor.state.doc!==baseline){checked?.dispose();throw new Error('The note changed during rendered validation. Preview again.');}renderedPreview=checked;
    const changes = previewSchema(editor, saved, nextPolicy);
    for (const change of (renderedPreview?[]:changes.slice(0, 5))) {
      const sample = document.createElement('div'), label = document.createElement('small');
      const node = editor.state.doc.nodeAt(change.position); sample.textContent = node?.textContent.slice(0, 200) || '(Empty block)';
      sample.style.cssText = schemaStyleCSS(change.after, false); label.textContent = `${change.target}: ${change.rules.join(', ')}`; sample.append(label); content.append(sample);
    }
    preview = { editor, doc: editor.state.doc, schema: saved, policy: nextPolicy,content:candidate,count:changes.length+(needsFreePlacement(editor,saved)?1:0) };
    $<HTMLButtonElement>('[data-schema-apply]').disabled = preview.count === 0;
    status(`${preview.count} block${preview.count === 1 ? '' : 's'} would change. Words, links, assets, and reading order stay the same. Undo restores the previous formatting.`);
  }));
  $('[data-schema-apply]').addEventListener('click', () => run(async () => {
    if (!preview || preview.editor !== options.getEditor()) throw new Error('Preview this note again before applying.');
    const next=preview;await options.validate?.(next.editor,next.content);if(preview!==next||next.editor!==options.getEditor())throw new Error('Preview the current note again.');
    if(next.editor.state.doc!==next.doc)throw new Error('The note changed after preview. Preview again.');const changes = next.schema.layout==='free'?(applyEditorProjection(next.editor,next.content)?next.count:0):applySchema(next.editor, next.schema, next.policy, next.doc); invalidatePreview(); status(`Applied to ${changes} blocks. Undo is available in the editor.`);
  }));
  return {
    open: show,
    sync() { const editor = options.getEditor(); if (editor !== boundEditor) { boundEditor = editor; if (editor) bindSchemaRegistry(editor, options.registry); if (dialog.open) dialog.close(); } },
    close() { if (dialog.open) dialog.close(); },
    destroy() { if (dialog.open) dialog.close(); host.replaceChildren(); },
  };
}
