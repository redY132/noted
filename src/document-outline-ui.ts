import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { documentHeadings, headingPosition, matchingHeadings, type DocumentHeading } from './document-outline.ts';
type Options = { menu: HTMLElement; editor(): Editor | null; noteId(): string | null; title(): string; busy(): boolean; scroll(): HTMLElement; beforeJump?(): void };
export function initializeDocumentOutline(host: HTMLElement, o: Options) {
  const doc = host.ownerDocument, win = doc.defaultView!, $ = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
  host.innerHTML = '<dialog class="document-outline-dialog" id="document-outline-dialog" aria-labelledby="document-outline-title"><header><h2 id="document-outline-title">Go to heading</h2><button type="button" data-outline-close>Close</button></header><p data-outline-note></p><label>Find a heading<input type="search" data-outline-search autocomplete="off" placeholder="Search heading titles"></label><p>Headings follow logical reading order. Choosing one moves within this note.</p><p role="status" data-outline-status></p><div data-outline-results role="region" aria-label="Headings in this note"></div><div class="document-outline-actions"><button type="button" data-outline-more hidden>Show more headings</button><button type="button" data-outline-refresh>Refresh headings</button></div></dialog>';
  const dialog = $<HTMLDialogElement>('dialog'); dialog.inert = true;
  const menuButton = doc.createElement('button'); menuButton.type = 'button'; menuButton.id = 'shell-go-heading'; menuButton.textContent = 'Go to heading'; menuButton.setAttribute('aria-haspopup', 'dialog'); menuButton.setAttribute('aria-controls', dialog.id); o.menu.append(menuButton);
  let headings: DocumentHeading[] = [], matches: DocumentHeading[] = [], shown = 40, snapshotEditor: Editor | null = null, snapshotDoc: Editor['state']['doc'] | null = null, snapshotId: string | null = null;
  let opener: HTMLElement | null = null, jumped = false, destroyed = false, savedScroll = { top: 0, left: 0 }, selection = 0;
  const status = (text: string) => { $('[data-outline-status]').textContent = text; };
  function sync() { menuButton.disabled = !o.editor() || !o.noteId() || o.busy(); }
  const close = () => { dialog.inert = true; dialog.close(); };
  function render(focusNew = -1) {
    const list = $('[data-outline-results]'); list.replaceChildren();
    for (let index = 0; index < Math.min(shown, matches.length); index++) {
      const item = matches[index], row = doc.createElement('button'); row.type = 'button'; row.dataset.outlineIndex = String(index); row.style.setProperty('--heading-depth', String(item.level - 1));
      const title = doc.createElement('strong'); title.textContent = item.label;
      const context = doc.createElement('span'); context.textContent = `Heading ${item.level}${selection >= item.position && selection < item.end ? ' · Current heading' : ''}`;
      if (selection >= item.position && selection < item.end) row.setAttribute('aria-current', 'location');
      row.append(title, context); row.onclick = () => go(item); list.append(row);
    }
    $('[data-outline-more]').hidden = shown >= matches.length;
    status(!headings.length ? 'No headings yet. Use a heading style in Text formatting, then refresh this list.' : !matches.length ? 'No matching headings. Try a different title or use Find to search the note.' : `Showing ${Math.min(shown, matches.length)} of ${matches.length} headings.`);
    if (focusNew >= 0) list.querySelector<HTMLElement>(`[data-outline-index="${focusNew}"]`)?.focus();
  }
  function refresh() {
    const editor = o.editor(), id = o.noteId();
    if (!editor || !id || o.busy()) { headings = []; matches = []; $('[data-outline-results]').replaceChildren(); $('[data-outline-more]').hidden = true; status('Open a note before choosing a heading.'); return; }
    snapshotEditor = editor; snapshotDoc = editor.state.doc; snapshotId = id; selection = editor.state.selection.from;
    headings = documentHeadings(snapshotDoc); matches = matchingHeadings(headings, $<HTMLInputElement>('[data-outline-search]').value); shown = 40;
    $('[data-outline-note]').textContent = o.title() || 'Untitled'; render();
  }
  function go(item: DocumentHeading) {
    const editor = o.editor();
    if (!editor || editor !== snapshotEditor || o.noteId() !== snapshotId || !snapshotDoc || o.busy()) { status('The open note changed. Refresh headings before choosing one.'); return; }
    const position = headingPosition(editor.state.doc, snapshotDoc, item);
    if (position === null) { status('That heading changed or was removed. Refresh headings and choose again.'); return; }
    o.beforeJump?.(); jumped = true; close(); editor.view.focus();
    const tr = editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(position + 1))).setMeta('addToHistory', false).scrollIntoView();
    editor.view.dispatch(tr);
  }
  function show(from = doc.activeElement instanceof win.HTMLElement ? doc.activeElement : null) {
    if (destroyed || !o.editor() || !o.noteId() || o.busy() || doc.querySelector('dialog[open]')) return;
    opener = from; jumped = false; const scroll = o.scroll(); savedScroll = { top: scroll.scrollTop, left: scroll.scrollLeft };
    $<HTMLInputElement>('[data-outline-search]').value = ''; refresh(); dialog.inert = false; dialog.showModal(); $('[data-outline-search]').focus();
  }
  menuButton.onclick = () => {
    if (menuButton.disabled) return;
    o.menu.inert = true; o.menu.hidden = true; const toggle = doc.querySelector<HTMLElement>('#view-toggle'); toggle?.setAttribute('aria-expanded', 'false'); toggle?.focus(); show(toggle);
  };
  $('[data-outline-close]').onclick = close;
  $('[data-outline-refresh]').onclick = () => { refresh(); $('[data-outline-search]').focus(); };
  $('[data-outline-more]').onclick = () => { const firstNew = shown; shown += 40; render(firstNew); };
  $('[data-outline-search]').oninput = () => { matches = matchingHeadings(headings, $<HTMLInputElement>('[data-outline-search]').value); shown = 40; render(); };
  dialog.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement, input = el.matches('[data-outline-search]'), row = el.closest<HTMLElement>('[data-outline-index]');
    if (!input && !row) return;
    const index = row ? Number(row.dataset.outlineIndex) : -1, count = Math.min(shown, matches.length);
    if (e.key === 'Enter') { e.preventDefault(); const item = matches[input ? 0 : index]; if (item) go(item); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (index + 1 < count) $(`[data-outline-index="${index + 1}"]`).focus(); else if (shown < matches.length) $('[data-outline-more]').focus(); }
    else if (e.key === 'ArrowUp' && row) { e.preventDefault(); if (index > 0) $(`[data-outline-index="${index - 1}"]`).focus(); else $('[data-outline-search]').focus(); }
    else if ((e.key === 'Home' || e.key === 'End') && row && count) { e.preventDefault(); $(`[data-outline-index="${e.key === 'Home' ? 0 : count - 1}"]`).focus(); }
  });
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    if (dialog.open || destroyed) return; dialog.inert = true;
    if (!jumped && snapshotEditor === o.editor() && snapshotId === o.noteId()) {
      if (opener?.isConnected && !opener.closest('[hidden],[inert]')) opener.focus(); else snapshotEditor?.view.focus();
      const scroll = o.scroll(); scroll.scrollTop = savedScroll.top; scroll.scrollLeft = savedScroll.left;
    }
    headings = []; matches = []; snapshotEditor = null; snapshotDoc = null; snapshotId = null; $('[data-outline-results]').replaceChildren();
  });
  sync();
  return { show, sync, destroy() { destroyed = true; menuButton.remove(); headings = []; matches = []; snapshotEditor = null; snapshotDoc = null; host.replaceChildren(); } };
}
