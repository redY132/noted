/** Wrap the title visually while retaining the existing single metadata value. */
export function initializeNoteTitle(field: HTMLTextAreaElement, focusEditor: () => void) {
  const win = field.ownerDocument.defaultView!;
  const nativeSizing = win.CSS?.supports?.('field-sizing', 'content') ?? false;
  let destroyed = false, frame = 0, measured = '';
  if (!nativeSizing) field.style.setProperty('field-sizing', 'fixed');
  function resize() {
    if (destroyed || nativeSizing || !field.clientWidth) return;
    const style = win.getComputedStyle(field);
    const key = [field.clientWidth, style.font, style.lineHeight, field.value].join('\0');
    if (key === measured) return;
    measured = key;
    field.style.height = '0px';
    const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    const line = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.3;
    field.style.height = `${Math.ceil(Math.max(line + border, field.scrollHeight + border))}px`;
  }
  function input(event: Event) {
    if (!(event as InputEvent).isComposing && /[\r\n]/.test(field.value)) {
      const start = field.selectionStart, end = field.selectionEnd, direction = field.selectionDirection;
      field.value = field.value.replace(/[\r\n]/g, ' ');
      field.setSelectionRange(start, end, direction);
    }
    resize();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault(); focusEditor();
  }
  function beforeInput(event: InputEvent) {
    if (!event.cancelable || event.isComposing || !['insertParagraph', 'insertLineBreak'].includes(event.inputType)) return;
    event.preventDefault(); focusEditor();
  }
  function compositionEnd() {
    if (/[\r\n]/.test(field.value)) field.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertCompositionText' }));
    resize();
  }
  field.addEventListener('input', input);
  field.addEventListener('keydown', keydown);
  field.addEventListener('beforeinput', beforeInput);
  field.addEventListener('compositionend', compositionEnd);
  const observer = !nativeSizing && typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null;
  observer?.observe(field);
  if (!nativeSizing) win.addEventListener('resize', resize);
  return {
    set(value: string) {
      if (destroyed) return;
      if (field.value !== value) field.value = value;
      resize();
      if (!nativeSizing) { win.cancelAnimationFrame(frame); frame = win.requestAnimationFrame(resize); }
    },
    destroy() {
      destroyed = true; observer?.disconnect(); win.cancelAnimationFrame(frame); win.removeEventListener('resize', resize);
      field.removeEventListener('input', input); field.removeEventListener('keydown', keydown); field.removeEventListener('beforeinput', beforeInput); field.removeEventListener('compositionend', compositionEnd);
    },
  };
}
