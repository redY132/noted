import type { Editor } from '@tiptap/core';
import { moveComponent, selectedComponent, updateComponent, wrapInPanel, canWrapInPanel, unwrapPanel, insertLocalImage, changeComponentLayer, insertPanel } from './note-components.ts';
import { initializeMotionControl } from './component-motion.ts';
import { normalizeNoteLink } from './note-links.ts';

export const componentMarkup = `<div class="component-toolbar" role="group" aria-label="Note components">
  <button type="button" id="make-panel" title="Group selected paragraphs into an editable panel">▧ Text panel</button>
  <button type="button" id="new-panel" title="Add an independent editable text panel">＋ New panel</button>
  <button type="button" id="insert-image" title="Import a PNG, JPEG, WebP, or GIF image">＋ Image / GIF</button>
  <input id="image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
  <button type="button" id="motion-control" aria-label="Pause motion">Pause motion</button>
  <span class="component-hint" id="component-hint">Select text to make a panel, then choose guided or free placement.</span>
  <div id="component-properties" class="component-properties" hidden>
    <label>Placement <select id="component-placement" aria-label="Component placement"><option value="flow">Guided flow</option><option value="free">Free placement</option></select></label>
    <span id="free-position-properties" class="free-position-properties" hidden><label>X <input id="component-x" aria-label="Component X" type="number" min="0" max="100000" step="10" /></label><label>Y <input id="component-y" aria-label="Component Y" type="number" min="0" max="100000" step="10" /></label><label>Layer <input id="component-z" aria-label="Component layer" type="number" min="0" max="10000" step="1" /></label><button type="button" id="component-backward" aria-label="Send component backward">Back</button><button type="button" id="component-forward" aria-label="Bring component forward">Forward</button></span>
    <label>Width <input id="component-width" aria-label="Component width" type="number" min="160" max="1200" step="10" /> px</label>
    <label><span class="sr-only">Component alignment</span><select id="component-align" aria-label="Component alignment"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
    <label id="component-tone-label"><span class="sr-only">Panel appearance</span><select id="component-tone" aria-label="Panel appearance"><option value="plain">Plain</option><option value="soft">Soft</option><option value="accent">Accent</option></select></label>
    <label id="component-alt-label">Description <input id="component-alt" aria-label="Image description" maxlength="2000" placeholder="Describe the image" /></label>
    <label id="component-link-label">Link <input id="component-link" aria-label="Image link" maxlength="2048" placeholder="https://… or noted://note/…" /></label>
    <label>Animation <select id="component-animation" aria-label="Component animation"><option value="none">None</option><option value="fade">Fade</option><option value="float">Float</option><option value="pulse">Pulse</option></select></label>
    <button type="button" id="component-up" aria-label="Move component up" title="Move component up">↑</button><button type="button" id="component-down" aria-label="Move component down" title="Move component down">↓</button>
    <button type="button" id="unwrap-panel">Unwrap panel</button>
  </div>
</div>`;

type Options = { getEditor: () => Editor | null; getNoteId: () => string | null; importAsset: (noteId: string, file: File) => Promise<{ id: string }>; error: (reason: unknown) => void };
export function initializeComponentUI({ getEditor, getNoteId, importAsset, error }: Options) {
  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const run = (action: (editor: Editor) => void) => { const editor = getEditor(); if (editor) { action(editor); editor.view.focus(); sync(); } };
  initializeMotionControl($<HTMLButtonElement>('#motion-control'));
  $('#make-panel').addEventListener('click', () => run(editor => { if (!wrapInPanel(editor)) error('Select ordinary paragraphs outside a list, table, or existing panel to create a panel.'); }));
  $('#new-panel').addEventListener('click', () => run(editor => { insertPanel(editor); }));
  $('#insert-image').addEventListener('click', () => $('#image-file').click());
  $('#image-file').addEventListener('change', async () => {
    const input = $<HTMLInputElement>('#image-file'); const file = input.files?.[0]; input.value = '';
    const editor = getEditor(); const noteId = getNoteId();
    if (!file || !editor || !noteId) return;
    $('#insert-image').setAttribute('disabled', '');
    try {
      const asset = await importAsset(noteId, file);
      // File reads and durable imports are async. Never redirect their result to another note.
      if (editor.isDestroyed || getEditor() !== editor || getNoteId() !== noteId || !editor.isEditable) return;
      insertLocalImage(editor, asset.id, file.name); editor.view.focus();
    } catch (reason) { error(reason); }
    finally { $('#insert-image').removeAttribute('disabled'); sync(); }
  });
  $('#component-width').addEventListener('change', () => run(editor => {
    const width = Number($<HTMLInputElement>('#component-width').value);
    if (selectedComponent(editor)?.node.attrs.width === width) return;
    if (!updateComponent(editor, { width })) error('Choose a component width between 160 and 1200 pixels.');
  }));
  $('#component-align').addEventListener('change', () => run(editor => updateComponent(editor, { align: $<HTMLSelectElement>('#component-align').value as 'left' | 'center' | 'right' })));
  $('#component-tone').addEventListener('change', () => run(editor => updateComponent(editor, { tone: $<HTMLSelectElement>('#component-tone').value as 'plain' | 'soft' | 'accent' })));
  $('#component-alt').addEventListener('change', () => run(editor => updateComponent(editor, { alt: $<HTMLInputElement>('#component-alt').value })));
  $('#component-link').addEventListener('change', () => run(editor => {
    const value = $<HTMLInputElement>('#component-link').value.trim(); const href = normalizeNoteLink(value);
    if (value && !href) { error('Use an http, https, or local note link.'); return; }
    updateComponent(editor, { href });
  }));
  $('#component-placement').addEventListener('change', () => run(editor => updateComponent(editor, { placement: $<HTMLSelectElement>('#component-placement').value as 'flow' | 'free' })));
  $('#component-animation').addEventListener('change', () => run(editor => updateComponent(editor, { animation: $<HTMLSelectElement>('#component-animation').value as 'none' | 'fade' | 'float' | 'pulse' })));
  for (const key of ['x', 'y', 'z'] as const) $(`#component-${key}`).addEventListener('change', () => run(editor => {
    const value = Number($<HTMLInputElement>(`#component-${key}`).value);
    if (selectedComponent(editor)?.node.attrs[key] === value) return;
    if (!updateComponent(editor, { [key]: value })) error(key === 'z' ? 'Choose a layer from 0 to 10000.' : 'Choose a position from 0 to 100000 pixels.');
  }));
  $('#component-backward').addEventListener('click', () => run(editor => { changeComponentLayer(editor, -1); }));
  $('#component-forward').addEventListener('click', () => run(editor => { changeComponentLayer(editor, 1); }));
  $('#component-up').addEventListener('click', () => run(editor => { moveComponent(editor, -1); }));
  $('#component-down').addEventListener('click', () => run(editor => { moveComponent(editor, 1); }));
  $('#unwrap-panel').addEventListener('click', () => run(editor => { unwrapPanel(editor); }));
  function sync() {
    const editor = getEditor(); const component = editor && selectedComponent(editor);
    $('#component-properties').hidden = !component; $('#component-hint').hidden = Boolean(component);
    $<HTMLButtonElement>('#make-panel').disabled = !editor || !canWrapInPanel(editor);
    if (!component || !editor) return;
    // Preserve an in-progress field edit while selection/transactions update toolbar state.
    const setValue = (id: string, value: string) => { const input = $<HTMLInputElement>(id); if (document.activeElement !== input) input.value = value; };
    setValue('#component-width', String(component.node.attrs.width)); setValue('#component-align', component.node.attrs.align);
    setValue('#component-placement', component.node.attrs.placement); setValue('#component-animation', component.node.attrs.animation);
    const free = component.node.attrs.placement === 'free';
    $('#free-position-properties').hidden = !free;
    for (const key of ['x', 'y', 'z']) setValue(`#component-${key}`, String(component.node.attrs[key]));
    $<HTMLButtonElement>('#component-backward').disabled = component.node.attrs.z <= 0;
    $<HTMLButtonElement>('#component-forward').disabled = component.node.attrs.z >= 10000;
    $<HTMLSelectElement>('#component-align').disabled = free;
    const image = component.node.type.name === 'localImage';
    $('#component-tone-label').hidden = image; $('#component-alt-label').hidden = !image; $('#component-link-label').hidden = !image; $('#unwrap-panel').hidden = image;
    setValue('#component-tone', component.node.attrs.tone ?? 'soft'); setValue('#component-alt', component.node.attrs.alt ?? ''); setValue('#component-link', component.node.attrs.href ?? '');
    const position = editor.state.doc.resolve(component.position);
    $<HTMLButtonElement>('#component-up').disabled = position.index() === 0;
    $<HTMLButtonElement>('#component-down').disabled = position.index() === position.parent.childCount - 1;
  }
  return { sync };
}
