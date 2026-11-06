/** Keep note commands reachable without letting a wrapping action row hide writing. */
export function initializeNoteActions(workspace: HTMLElement, menu: HTMLElement) {
  const doc = workspace.ownerDocument, win = doc.defaultView!;
  const actions = workspace.querySelector<HTMLElement>('.note-product-actions')!, pane = workspace.querySelector<HTMLElement>('#note-pane')!, toggle = doc.querySelector<HTMLButtonElement>('#view-toggle')!;
  const group = doc.createElement('details'); group.className = 'shell-note-actions';
  const heading = doc.createElement('summary'); heading.textContent = 'Note actions'; group.append(heading); menu.append(group);
  const pairs = [...actions.querySelectorAll<HTMLButtonElement>('button')].map(source => {
    const button = doc.createElement('button'); button.type = 'button'; button.id = `shell-action-${source.id}`; button.textContent = source.textContent;
    button.onclick = () => {
      if (pane.hidden || pane.inert || source.disabled) return;
      group.open = false; menu.inert = true; menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); source.click();
    };
    group.append(button); return { source, button };
  });
  const sync = () => { for (const { source, button } of pairs) button.disabled = Boolean(pane.hidden || pane.inert || source.disabled); };
  const reflow = () => {
    const compact = workspace.clientHeight < 360;
    if (compact && actions.contains(doc.activeElement)) toggle.focus();
    actions.hidden = compact; actions.inert = compact;
  };
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(reflow) : null;
  resize?.observe(workspace); win.addEventListener('resize', reflow);
  const changes = new win.MutationObserver(sync);
  changes.observe(pane, { attributes: true, attributeFilter: ['hidden', 'inert'] });
  changes.observe(actions, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
  reflow(); sync();
  return { destroy() { resize?.disconnect(); changes.disconnect(); win.removeEventListener('resize', reflow); group.remove(); actions.hidden = false; actions.inert = false; } };
}
