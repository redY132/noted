import type { Folder, NoteSummary, Page } from './model.ts';

interface Options {
  search(query: string, cursor: number): Promise<Page<NoteSummary>>;
  indexing?(): Promise<boolean>;
  folders(): Folder[];
  current(): string | null;
  open(id: string): Promise<boolean>;
  focusEditor(): void;
}
export function initializeQuickOpen(host: HTMLElement, options: Options) {
  host.innerHTML = `<dialog class="quick-open-dialog" aria-labelledby="quick-open-title"><header><h2 id="quick-open-title">Open note</h2><button type="button" data-quick-close>Close</button></header><label for="quick-open-search">Find a saved note<input id="quick-open-search" type="search" autocomplete="off" aria-describedby="quick-open-help quick-open-status" placeholder="Search titles, text or tags"></label><p id="quick-open-help">Search stays on this device. Use arrow keys to browse results and Enter to open a note.</p><p id="quick-open-status" role="status" aria-live="polite"></p><div data-quick-results aria-label="Matching saved notes"></div><div class="quick-open-actions"><button type="button" data-quick-more hidden>Show more notes</button><button type="button" data-quick-retry hidden>Retry search</button></div></dialog>`;
  const $ = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const dialog = $<HTMLDialogElement>('dialog'), input = $<HTMLInputElement>('#quick-open-search'), results = $('[data-quick-results]');
  let ticket = 0, timer: ReturnType<typeof setTimeout> | undefined, items: NoteSummary[] = [], cursor: number | null = null, total = 0;
  let searching = false, opening = false, returnFocus: HTMLElement | null = null;
  function status(text: string) { $('#quick-open-status').textContent = text; }
  function folderPath(id: string | null) {
    const path: string[] = [], seen = new Set<string>(), folders = options.folders();
    while (id && !seen.has(id)) { seen.add(id); const folder = folders.find(f => f.id === id); if (!folder) return path.length ? `Folder unavailable / ${path.join(' / ')}` : 'Folder unavailable'; path.unshift(folder.name); id = folder.parentId; }
    return path.length ? path.join(' / ') : 'Unfiled';
  }
  function controls() {
    input.disabled = opening;
    $<HTMLButtonElement>('[data-quick-close]').disabled = opening;
    $<HTMLButtonElement>('[data-quick-more]').disabled = searching || opening;
    $<HTMLButtonElement>('[data-quick-retry]').disabled = searching || opening;
    for (const row of results.querySelectorAll<HTMLButtonElement>('button')) row.disabled = opening;
  }
  function render() {
    const focused = (host.ownerDocument.activeElement as HTMLElement | null)?.dataset.quickNote;
    results.replaceChildren();
    for (const note of items) {
      const button = host.ownerDocument.createElement('button'); button.type = 'button'; button.dataset.quickNote = note.id;
      if (note.id === options.current()) button.setAttribute('aria-current', 'page');
      const title = host.ownerDocument.createElement('strong'); title.textContent = note.title || 'Untitled';
      const location = host.ownerDocument.createElement('span'); location.textContent = folderPath(note.folderId);
      button.append(title, location); results.append(button);
    }
    if (focused) (Array.from(results.querySelectorAll<HTMLButtonElement>('button')).find(row => row.dataset.quickNote === focused) ?? input).focus({ preventScroll: true });
    $('[data-quick-more]').hidden = cursor === null;
    controls();
  }
  async function search(reset = true) {
    if (!dialog.open || opening || !reset && cursor === null) return;
    clearTimeout(timer);
    const request = ++ticket, query = input.value.trim(), pageCursor = reset ? 0 : cursor!;
    const pagingFocus = !reset && host.ownerDocument.activeElement === $('[data-quick-more]'), previousLength = items.length;
    searching = true; results.setAttribute('aria-busy', 'true'); $('[data-quick-retry]').hidden = true;
    if (reset) { items = []; cursor = null; results.replaceChildren(); $('[data-quick-more]').hidden = true; }
    status('Searching saved notes.'); controls();
    try {
      const [page, indexing] = await Promise.all([options.search(query, pageCursor), options.indexing?.() ?? false]);
      if (request !== ticket || !dialog.open) return;
      const seen = new Set(reset ? [] : items.map(note => note.id));
      items = [...(reset ? [] : items), ...page.items.filter(note => { if (seen.has(note.id)) return false; seen.add(note.id); return true; })];
      cursor = page.nextCursor; total = page.total; searching = false; results.removeAttribute('aria-busy'); render();
      if (pagingFocus) { const rows = results.querySelectorAll<HTMLButtonElement>('button'); rows[Math.min(previousLength, rows.length - 1)]?.focus(); }
      $('[data-quick-retry]').hidden = !indexing; $('[data-quick-retry]').textContent = indexing ? 'Refresh results' : 'Retry search';
      status(indexing ? `${total ? `${items.length} notes found so far. ` : ''}The search index is updating. ${total ? 'Refresh results to check for more notes.' : 'Results will refresh here.'}` : !total ? query ? 'No matching notes. Try another word.' : 'No saved notes yet. Close this dialog and create a note.' : `${items.length} of ${total} ${total === 1 ? 'note' : 'notes'}${query ? ' found' : ', recently written'}.`);
      if (indexing && !items.length) timer = setTimeout(() => void search(), 1000);
    } catch {
      if (request !== ticket || !dialog.open) return;
      searching = false; results.removeAttribute('aria-busy'); $('[data-quick-retry]').hidden = false; $('[data-quick-retry]').textContent = 'Retry search';
      status('Notes could not be searched. Your current note is unchanged. Retry the search.'); controls();
    }
  }
  async function openNote(id: string) {
    if (opening || !items.some(note => note.id === id)) return;
    opening = true; searching = false; ++ticket; clearTimeout(timer); results.removeAttribute('aria-busy'); controls(); status('Saving your current draft and opening the note.');
    try {
      if (!await options.open(id)) throw new Error('Navigation refused');
      dialog.close(); options.focusEditor();
    } catch { status('The note could not open. Your current draft is preserved. Check the save or recovery message, then try again.'); }
    finally { opening = false; controls(); if (dialog.open) Array.from(results.querySelectorAll<HTMLButtonElement>('button')).find(row => row.dataset.quickNote === id)?.focus(); }
  }
  input.oninput = () => {
    ++ticket; clearTimeout(timer); items = []; cursor = null; searching = true;
    results.replaceChildren(); results.setAttribute('aria-busy', 'true'); $('[data-quick-more]').hidden = true; $('[data-quick-retry]').hidden = true;
    status('Searching saved notes.'); controls(); timer = setTimeout(() => void search(), 140);
  };
  results.onclick = event => { const id = (event.target as Element).closest<HTMLElement>('[data-quick-note]')?.dataset.quickNote; if (id) void openNote(id); };
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); if (!opening) dialog.close(); return; }
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const rows = Array.from(results.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!rows.length) return;
    const at = rows.indexOf(host.ownerDocument.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') { event.preventDefault(); rows[Math.min(rows.length - 1, at + 1)].focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); if (at <= 0) input.focus(); else rows[at - 1].focus(); }
    if (event.key === 'Enter' && event.target === input && !searching) { event.preventDefault(); void openNote(rows[0].dataset.quickNote!); }
    if ((event.key === 'Home' || event.key === 'End') && at >= 0) { event.preventDefault(); rows[event.key === 'Home' ? 0 : rows.length - 1].focus(); }
  });
  $('[data-quick-close]').onclick = () => dialog.close();
  $('[data-quick-more]').onclick = () => void search(false);
  $('[data-quick-retry]').onclick = () => void search();
  dialog.addEventListener('cancel', event => { if (opening) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    ++ticket; clearTimeout(timer); searching = false;
    if (!opening) { if (returnFocus?.isConnected && !returnFocus.closest('[hidden],[inert]')) returnFocus.focus({ preventScroll: true }); else options.focusEditor(); }
  });
  return {
    show(returnTo?: HTMLElement) {
      if (dialog.open) { input.focus(); input.select(); return; }
      if (host.ownerDocument.querySelector('dialog[open]')) return;
      returnFocus = returnTo ?? host.ownerDocument.activeElement as HTMLElement | null; input.value = ''; dialog.showModal(); input.focus(); void search();
    },
    destroy() { ++ticket; clearTimeout(timer); if (dialog.open) dialog.close(); host.replaceChildren(); },
  };
}
