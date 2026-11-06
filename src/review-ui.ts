import type { Folder, NoteSummary } from './model.ts';
import { localCalendarDate } from './review-calendar.ts';

export interface ReviewItem { note: NoteSummary; reasons: string[] }
const actionMessages = { reviewed: 'Marked as reviewed.', snooze: 'Snoozed for 24 hours.', dismiss: 'Excluded from review.', reset: 'Review choices reset.' };
type Options = {
  api: { reviewFeed(folder: string | null, tag: string, hidden: boolean): Promise<ReviewItem[]>; reviewAction(id: string, action: string): Promise<void> };
  folders(): Folder[]; open(id: string): Promise<boolean>; focusEditor(): void; now?(): Date;
};
export function initializeReview(host: HTMLElement, o: Options) {
  const doc = host.ownerDocument, win = doc.defaultView!, now = o.now ?? (() => new Date());
  host.innerHTML = `<dialog class="review-dialog" data-library="review" aria-labelledby="review-title"><header><h2 id="review-title">Review your notes</h2><button type="button" data-review-close>Close</button></header><p>A daily selection of your original notes, prioritizing those least recently reviewed. This review works offline.</p><p>Reviewed today follows this device's local calendar, like Today's note. Snooze lasts 24 hours.</p><div class="review-filters"><label>Folder<select data-review-folder></select></label><label>Tag<input type="search" data-review-tag maxlength="100" placeholder="Any tag" autocomplete="off"></label></div><label class="review-hidden"><input type="checkbox" data-review-hidden> Include reviewed, snoozed and excluded notes</label><div class="review-refresh"><button type="button" data-review-refresh>Refresh</button><p role="status" aria-live="polite" data-review-queue-status></p></div><div data-review-list role="region" aria-label="Review queue"></div></dialog>`;
  const $ = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
  const dialog = $<HTMLDialogElement>('dialog'), list = $('[data-review-list]'), folder = $<HTMLSelectElement>('[data-review-folder]'), tag = $<HTMLInputElement>('[data-review-tag]'), hidden = $<HTMLInputElement>('[data-review-hidden]');
  dialog.inert = true;
  let epoch = 0, loading = false, mutating = false, opening = false, destroyed = false, openedNote = false;
  let debounce: number | undefined, dayTimer: number | undefined, lastClock = '', opener: HTMLElement | null = null;
  const status = (text: string) => { $('[data-review-queue-status]').textContent = text; };
  const clockKey = () => { const date = now(); return `${localCalendarDate(date)}|${date.getTimezoneOffset()}`; };
  function controls() {
    folder.disabled = tag.disabled = hidden.disabled = mutating || opening;
    $<HTMLButtonElement>('[data-review-refresh]').disabled = loading || mutating || opening;
    $<HTMLButtonElement>('[data-review-close]').disabled = opening;
    list.inert = loading || mutating || opening;
    list.setAttribute('aria-busy', String(loading || mutating || opening));
    for (const button of list.querySelectorAll<HTMLButtonElement>('button')) button.disabled = loading || mutating || opening;
  }
  function close() { if (opening) return; dialog.inert = true; dialog.close(); }
  function folderChoices() {
    const selected = folder.value, folders = o.folders(), names = new Map(folders.map(f => [f.id, f]));
    folder.replaceChildren(new win.Option('All folders', ''));
    for (const f of folders) {
      const path: string[] = [], seen = new Set<string>(); let current: Folder | undefined = f;
      while (current && !seen.has(current.id)) { seen.add(current.id); path.unshift(current.name); current = current.parentId ? names.get(current.parentId) : undefined; }
      folder.append(new win.Option(path.join(' / '), f.id));
    }
    if (folders.some(f => f.id === selected)) folder.value = selected;
  }
  function render(items: ReviewItem[]) {
    list.replaceChildren();
    if (!items.length) {
      const empty = doc.createElement('p'); empty.textContent = hidden.checked ? 'No saved notes match these filters. Try another folder or tag.' : 'No notes due in this selection. Include reviewed, snoozed and excluded notes to restore a choice, or check again tomorrow.'; list.append(empty); return;
    }
    for (const { note, reasons } of items) {
      const row = doc.createElement('article'); row.dataset.reviewNote = note.id;
      const title = doc.createElement('h3'); title.textContent = note.title || 'Untitled';
      const detail = doc.createElement('p'); detail.textContent = reasons.join(' · ');
      const actions = doc.createElement('div'); actions.className = 'review-actions';
      for (const [action, label] of [['open', 'Open note'], ['reviewed', 'Reviewed today'], ['snooze', 'Snooze 24 hours'], ['dismiss', 'Exclude'], ...(hidden.checked ? [['reset', 'Reset review']] : [])]) {
        const button = doc.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.id = note.id;
        if (action === 'open') button.dataset.reviewOpen = note.id; else button.dataset.reviewAction = action;
        button.onclick = () => void act(button); actions.append(button);
      }
      row.append(title, detail, actions); list.append(row);
    }
  }
  async function read(prefix = '', restore?: { index: number; action: string }) {
    if (destroyed || !dialog.open || mutating || opening) return;
    win.clearTimeout(debounce); const ticket = ++epoch; loading = true; lastClock = clockKey();
    list.replaceChildren(); controls(); status(prefix ? `${prefix} Updating queue…` : 'Loading review queue…');
    try {
      const items = await o.api.reviewFeed(folder.value || null, tag.value.trim(), hidden.checked);
      if (ticket !== epoch || !dialog.open || destroyed) return;
      render(items); loading = false; controls();
      status(`${prefix ? prefix + ' ' : ''}${items.length ? `Showing ${items.length} ${items.length === 1 ? 'note' : 'notes'}. Up to 30 notes are shown.` : 'The queue is empty for these filters.'}`);
      if (restore) {
        const rows = list.querySelectorAll<HTMLElement>('[data-review-note]'), row = rows[Math.min(restore.index, rows.length - 1)];
        const next = row?.querySelector<HTMLElement>(`[data-review-action="${restore.action}"]`) ?? row?.querySelector<HTMLElement>('button') ?? $('[data-review-refresh]');
        next.focus(); next.scrollIntoView({ block: 'nearest' });
      }
    } catch (error) {
      if (ticket !== epoch || !dialog.open || destroyed) return;
      loading = false; controls(); status(`${prefix ? prefix + ' ' : ''}Could not load the review queue: ${error instanceof Error ? error.message : String(error)}. Use Refresh to retry.`);
      if (restore) $('[data-review-refresh]').focus();
    }
  }
  async function act(button: HTMLButtonElement) {
    if (destroyed || !dialog.open || loading || mutating || opening || button.disabled || !list.contains(button)) return;
    const id = button.dataset.id!, action = button.dataset.reviewAction, ticket = epoch;
    if (button.dataset.reviewOpen) {
      opening = true; controls(); status('Saving your draft and opening the note…');
      try {
        const opened = await o.open(id);
        if (destroyed || ticket !== epoch || !dialog.open) return;
        opening = false; controls();
        if (opened) { openedNote = true; close(); o.focusEditor(); }
        else { status('The note could not be opened. Your current draft stays open. Try Open note again.'); button.focus(); }
      } catch (error) {
        if (!destroyed && ticket === epoch && dialog.open) { opening = false; controls(); status(`Could not open the note: ${error instanceof Error ? error.message : String(error)}. Your draft stays open.`); button.focus(); }
      } finally { opening = false; }
      return;
    }
    if (!action || !['reviewed', 'snooze', 'dismiss', 'reset'].includes(action)) return;
    const index = [...list.querySelectorAll('[data-review-note]')].indexOf(button.closest('[data-review-note]')!);
    mutating = true; controls(); status('Saving review choice…');
    try {
      await o.api.reviewAction(id, action);
      mutating = false;
      if (!destroyed && dialog.open) await read(actionMessages[action as keyof typeof actionMessages], { index, action });
    } catch (error) {
      mutating = false;
      if (!destroyed && dialog.open) {
        controls(); status(`Could not confirm the review choice: ${error instanceof Error ? error.message : String(error)}. Use Refresh to check its saved state or try again. The note was not edited.`);
        if (ticket === epoch && button.isConnected) button.focus(); else void read();
      }
    }
  }
  function filterChanged(delayed = false) {
    if (!dialog.open || mutating || opening) return;
    epoch++; loading = true; list.replaceChildren(); controls(); win.clearTimeout(debounce);
    status('Updating filters…'); if (delayed) debounce = win.setTimeout(() => void read(), 200); else void read();
  }
  function dayChanged() { if (dialog.open && doc.visibilityState !== 'hidden' && !mutating && !opening && clockKey() !== lastClock) void read('The local review day changed.'); }
  function scheduleDayCheck() { win.clearTimeout(dayTimer); if (!dialog.open || destroyed) return; dayTimer = win.setTimeout(() => { dayChanged(); scheduleDayCheck(); }, 60000); }
  folder.onchange = hidden.onchange = () => filterChanged(); tag.oninput = () => filterChanged(true);
  $('[data-review-refresh]').onclick = () => void read(); $('[data-review-close]').onclick = close;
  dialog.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'Enter' && e.target === tag) { e.preventDefault(); void read(); } });
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    if (dialog.open || destroyed) return;
    dialog.inert = true; epoch++; loading = false; win.clearTimeout(debounce); win.clearTimeout(dayTimer); list.replaceChildren();
    if (!openedNote && opener?.isConnected && !opener.closest('[hidden],[inert]')) opener.focus();
  });
  win.addEventListener('focus', dayChanged); doc.addEventListener('visibilitychange', dayChanged);
  return {
    show() {
      if (destroyed || doc.querySelector('dialog[open]')) return;
      opener = doc.activeElement instanceof win.HTMLElement ? doc.activeElement : null; openedNote = false; folderChoices();
      dialog.inert = false; dialog.showModal(); controls(); $('[data-review-close]').focus();
      if (mutating) status('Finishing the previous review change…'); else void read(); scheduleDayCheck();
    },
    destroy() { destroyed = true; epoch++; win.clearTimeout(debounce); win.clearTimeout(dayTimer); win.removeEventListener('focus', dayChanged); doc.removeEventListener('visibilitychange', dayChanged); host.replaceChildren(); },
  };
}
