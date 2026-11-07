import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeNoteTitle } from './note-title.ts';
function setup() {
  const dom = new JSDOM('<textarea aria-label="Note title" maxlength="300"></textarea><div id="writer" tabindex="0"></div>', { pretendToBeVisual: true });
  const field = dom.window.document.querySelector('textarea')!, writer = dom.window.document.querySelector<HTMLElement>('#writer')!;
  let focused = 0;
  const ui = initializeNoteTitle(field, () => { focused++; writer.focus(); });
  return { dom, field, writer, ui, focused: () => focused, close() { ui.destroy(); dom.window.close(); } };
}
test('title Enter moves into writing while composition and command chords remain untouched', () => {
  const h = setup();
  try {
    h.ui.set('Synthetic title'); h.field.focus();
    for (const extra of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      const event = new h.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...extra });
      h.field.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
    }
    assert.equal(h.focused(), 0);
    const enter = new h.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    h.field.dispatchEvent(enter); assert.equal(enter.defaultPrevented, true); assert.equal(h.dom.window.document.activeElement, h.writer); assert.equal(h.field.value, 'Synthetic title');
  } finally { h.close(); }
});
test('virtual-keyboard line breaks move into writing without changing the title', () => {
  const h = setup();
  try {
    h.ui.set('Synthetic mobile title'); h.field.focus();
    const composing = new h.dom.window.InputEvent('beforeinput', { inputType: 'insertLineBreak', isComposing: true, cancelable: true });
    h.field.dispatchEvent(composing); assert.equal(composing.defaultPrevented, false); assert.equal(h.focused(), 0);
    const enter = new h.dom.window.InputEvent('beforeinput', { inputType: 'insertLineBreak', cancelable: true });
    h.field.dispatchEvent(enter); assert.equal(enter.defaultPrevented, true); assert.equal(h.focused(), 1); assert.equal(h.field.value, 'Synthetic mobile title');
  } finally { h.close(); }
});
test('pasted line breaks become spaces before saving and keep the selection', () => {
  const h = setup();
  try {
    let saved = '';
    h.field.addEventListener('input', () => { saved = h.field.value; });
    h.field.value = 'First\nsecond'; h.field.setSelectionRange(2, 8, 'backward');
    h.field.dispatchEvent(new h.dom.window.InputEvent('input', { inputType: 'insertFromPaste' }));
    assert.equal(saved, 'First second'); assert.equal(h.field.selectionStart, 2); assert.equal(h.field.selectionEnd, 8); assert.equal(h.field.selectionDirection, 'backward');
  } finally { h.close(); }
});
test('loading unchanged metadata preserves selection and does not create an edit', () => {
  const h = setup();
  try {
    let changes = 0; h.field.addEventListener('input', () => { changes++; });
    h.ui.set('Existing synthetic title'); h.field.setSelectionRange(3, 7); h.ui.set('Existing synthetic title');
    assert.equal(changes, 0); assert.equal(h.field.selectionStart, 3); assert.equal(h.field.selectionEnd, 7);
    h.ui.destroy(); h.field.focus(); h.field.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Enter', cancelable: true })); assert.equal(h.focused(), 0);
  } finally { h.close(); }
});
test('composition text is left intact until commit and final line breaks normalize before saving', () => {
  const h = setup();
  try {
    let saved = '';
    h.field.addEventListener('input', () => { saved = h.field.value; });
    h.field.value = 'Composing\nsynthetic title';
    h.field.dispatchEvent(new h.dom.window.InputEvent('input', { isComposing: true }));
    assert.equal(h.field.value, 'Composing\nsynthetic title');
    h.field.dispatchEvent(new h.dom.window.CompositionEvent('compositionend'));
    assert.equal(saved, 'Composing synthetic title'); assert.equal(h.focused(), 0);
  } finally { h.close(); }
});
