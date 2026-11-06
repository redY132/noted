/** Session-only navigation metadata. Never retain note bodies or persist visits. */
export type NoteViewState = {
  revisionToken: string;
  selection: { type: string; anchor?: number; head?: number };
  scrollTop: number;
  scrollLeft: number;
};
export type VisitMetadata = { id: string; title: string; folderId: string | null };
export type NoteVisit = VisitMetadata & { available: boolean; view: NoteViewState | null };
export type HistoryTarget = { index: number; id: string; generation: number; view: NoteViewState | null };
const copy = <T>(value: T): T => structuredClone(value);

export class NavigationHistory {
  private visits: NoteVisit[] = [];
  private cursor = -1;
  private active = false;
  private generation = 0;
  private readonly limit: number;
  constructor(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('History limit must be a positive integer.');
    this.limit = limit;
  }
  snapshot() { return { visits: copy(this.visits), cursor: this.cursor, active: this.active }; }
  record(note: VisitMetadata) {
    this.update(note);
    for (const visit of this.visits) if (visit.id === note.id) visit.available = true;
    if (this.active && this.visits[this.cursor]?.id === note.id) return;
    this.visits.splice(this.cursor + 1);
    this.visits.push({ id: note.id, title: note.title, folderId: note.folderId, available: true, view: null });
    if (this.visits.length > this.limit) this.visits.splice(0, this.visits.length - this.limit);
    this.cursor = this.visits.length - 1;
    this.active = true;
    this.generation++;
  }
  update(note: VisitMetadata) {
    for (const visit of this.visits) if (visit.id === note.id) {
      visit.title = note.title; visit.folderId = note.folderId;
    }
  }
  capture(id: string, view: NoteViewState) {
    if (this.active && this.visits[this.cursor]?.id === id) this.visits[this.cursor].view = copy(view);
  }
  target(index: number): HistoryTarget | null {
    const visit = this.visits[index];
    if (!visit?.available || (this.active && index === this.cursor)) return null;
    return { index, id: visit.id, generation: this.generation, view: copy(visit.view) };
  }
  step(direction: -1 | 1): HistoryTarget | null {
    for (let index = this.cursor + (this.active ? direction : 0); index >= 0 && index < this.visits.length; index += direction) {
      const target = this.target(index); if (target) return target;
    }
    return null;
  }
  valid(target: HistoryTarget) {
    return target.generation === this.generation && this.visits[target.index]?.id === target.id && this.visits[target.index].available;
  }
  commit(target: HistoryTarget, note: VisitMetadata) {
    if (note.id !== target.id || !this.valid(target)) return false;
    this.cursor = target.index; this.active = true; this.update(note); this.generation++;
    return true;
  }
  unavailable(id: string) {
    for (const visit of this.visits) if (visit.id === id) visit.available = false;
    if (this.visits[this.cursor]?.id === id) this.active = false;
    this.generation++;
  }
  restored(note: VisitMetadata) {
    this.update(note);
    for (const visit of this.visits) if (visit.id === note.id) visit.available = true;
    this.generation++;
  }
  clearPrevious() {
    this.visits = this.active && this.cursor >= 0 ? [this.visits[this.cursor]] : [];
    this.cursor = this.visits.length - 1; this.generation++;
  }
}
