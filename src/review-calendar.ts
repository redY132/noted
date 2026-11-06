/** The device calendar is shared by Today's note and daily review. */
export function localCalendarDate(date = new Date()): string | null {
  if (!Number.isFinite(date.getTime())) return null;
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timestamp(value: string | undefined | null): number {
  // Saved timestamps describe instants. A date without an offset is not one.
  return value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? Date.parse(value) : NaN;
}
export function reviewTiming(state: { reviewedAt?: string | null; snoozeUntil?: string | null }, now = new Date()) {
  const today = localCalendarDate(now), reviewed = new Date(timestamp(state.reviewedAt));
  return {
    reviewedToday: today !== null && localCalendarDate(reviewed) === today,
    sleeping: timestamp(state.snoozeUntil) > now.getTime(),
  };
}
