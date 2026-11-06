import type { HistoryTarget, NavigationHistory } from './navigation-history';
type Options = {
  history: NavigationHistory;
  busy(): boolean;
  folder(id: string | null): string;
  go(target: HistoryTarget): Promise<boolean>;
  focusEditor(): void;
};
export function initializeNoteHistory(host: HTMLElement, o: Options) {
  const doc = host.ownerDocument, win = doc.defaultView!;
  const $ = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  host.innerHTML = '<dialog class="note-history-dialog" aria-labelledby="note-history-title"><header><h2 id="note-history-title">Note history</h2><button type="button" data-history-close aria-label="Close note history">Close</button></header><p>Visits in this session. Back and Forward restore your reading position. Nothing is added to your note files.</p><div data-history-list></div><p role="status" data-history-status></p><button type="button" data-history-clear>Clear previous visits</button></dialog>';
  const dialog = $<HTMLDialogElement>('dialog'); dialog.inert = true;
  const controls = doc.createElement('div'); controls.className = 'note-history-controls'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Note navigation');
  const button = (label: string) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = label; return b; };
  const back = button('Back'), forward = button('Forward');
  for (const [b, label, path] of [[back, 'Back', 'm14 6-6 6 6 6'], [forward, 'Forward', 'm10 6 6 6-6 6']] as const) {
    b.className = 'shell-icon'; b.setAttribute('aria-label', `${label} to note`); b.title = `${label} to note (Alt ${label === 'Back' ? 'Left' : 'Right'})`;
    b.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="${path}"/></svg>`;
    b.onmousedown = e => e.preventDefault(); controls.append(b);
  }
  doc.querySelector('.shell-controls')!.prepend(controls);
  const menu = doc.querySelector<HTMLElement>('#view-popover')!, viewToggle = doc.querySelector<HTMLButtonElement>('#view-toggle')!;
  const menuBack = button('Back to note'), menuForward = button('Forward to note'), menuHistory = button('Note history');
  menuBack.id = 'shell-history-back'; menuForward.id = 'shell-history-forward'; menuHistory.id = 'shell-note-history';
  menu.append(menuBack, menuForward, menuHistory);
  const closeMenu = () => { menu.inert = true; menu.hidden = true; viewToggle.setAttribute('aria-expanded', 'false'); };
  let opening = false, opener: HTMLElement | null = null, destroyed = false;
  function render() {
    const state = o.history.snapshot(), list = $('[data-history-list]'); list.replaceChildren();
    for (let index = state.visits.length - 1; index >= 0; index--) {
      const visit = state.visits[index], current = state.active && index === state.cursor;
      const row = button(''); row.dataset.historyIndex = String(index);
      row.disabled = opening || o.busy() || !visit.available || current;
      if (current) row.setAttribute('aria-current', 'page');
      const title = doc.createElement('strong'); title.textContent = visit.title || 'Untitled';
      const context = doc.createElement('span'); context.textContent = `${o.folder(visit.folderId)}${!visit.available ? ' · In Trash' : current ? ' · Current note' : ''}`;
      row.append(title, context); row.onclick = () => { const target = o.history.target(index); if (target) void go(target, true); }; list.append(row);
    }
    if (!state.visits.length) list.textContent = 'No notes visited in this session.';
    $<HTMLButtonElement>('[data-history-clear]').disabled = opening || o.busy() || state.visits.length <= (state.active ? 1 : 0);
  }
  function sync() {
    back.disabled = menuBack.disabled = opening || o.busy() || !o.history.step(-1);
    forward.disabled = menuForward.disabled = opening || o.busy() || !o.history.step(1);
    menuHistory.disabled = opening || o.busy();
    if (dialog.open) render();
  }
  function close() { dialog.inert = true; dialog.close(); }
  async function go(target: HistoryTarget, fromDialog = false) {
    if (opening || o.busy() || !o.history.valid(target)) return;
    opening = true; sync(); if (fromDialog) $('[data-history-status]').textContent = 'Saving your draft and opening note…';
    try {
      const opened = await o.go(target);
      if (fromDialog && opened) close();
      else if (fromDialog) $('[data-history-status]').textContent = 'Could not open that visit. Your current draft is kept open. Retry or choose another visit.';
      if (opened) o.focusEditor();
    } catch (reason) {
      if (fromDialog) $('[data-history-status]').textContent = String(reason instanceof Error ? reason.message : reason);
    } finally { opening = false; if (!destroyed) sync(); }
  }
  const step = (direction: -1 | 1) => { const t = o.history.step(direction); if (t) void go(t); };
  back.onclick = () => step(-1);
  forward.onclick = () => step(1);
  menuBack.onclick = () => { closeMenu(); step(-1); };
  menuForward.onclick = () => { closeMenu(); step(1); };
  function show(from = doc.activeElement instanceof win.HTMLElement ? doc.activeElement : null) {
    if (opening || o.busy() || doc.querySelector('dialog[open]')) return;
    opener = from; $('[data-history-status]').textContent = ''; render(); dialog.inert = false; dialog.showModal(); $('[data-history-close]').focus();
  }
  menuHistory.onclick = () => { closeMenu(); show(viewToggle); };
  $('[data-history-close]').onclick = close;
  $('[data-history-clear]').onclick = () => { o.history.clearPrevious(); sync(); $('[data-history-status]').textContent = 'Previous visits cleared. Your note files are unchanged.'; $('[data-history-close]').focus(); };
  dialog.addEventListener('cancel', e => { e.preventDefault(); if (!opening) close(); });
  dialog.addEventListener('close', () => { if (dialog.open) return; dialog.inert = true; if (!opening && opener?.isConnected && !opener.closest('[hidden],[inert]')) opener.focus(); });
  const keydown = (e: KeyboardEvent) => {
    // Alt+Arrow moves by words on macOS. Keep the native editing gesture there.
    if (/Mac|iPhone|iPad/.test(win.navigator.platform) || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); if (doc.querySelector('dialog[open]') || opening || o.busy()) return;
    closeMenu(); const target = o.history.step(e.key === 'ArrowLeft' ? -1 : 1); if (target) void go(target);
  };
  doc.addEventListener('keydown', keydown);
  const topbar = doc.querySelector<HTMLElement>('.shell-topbar')!;
  const resize = () => { const hidden = topbar.clientWidth < 440; if (hidden && controls.contains(doc.activeElement)) viewToggle.focus(); controls.hidden = hidden; };
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null;
  observer?.observe(topbar); win.addEventListener('resize', resize); resize(); sync();
  return { sync, show, destroy() { destroyed = true; observer?.disconnect(); win.removeEventListener('resize', resize); doc.removeEventListener('keydown', keydown); controls.remove(); menuBack.remove(); menuForward.remove(); menuHistory.remove(); host.replaceChildren(); } };
}
