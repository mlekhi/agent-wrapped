/** validate calendar days before date.parse can silently roll them forward. */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !isCalendarDay(value.slice(0, 10))) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

export function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** utc ordinals represent local calendar labels, independent of dst day lengths. */
export const dayOrdinal = (day: string): number => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

export function calendarMonths(from: string, to: string): string[] {
  const result: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  while (true) {
    const label = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    if (label > end) break;
    result.push(label);
    if (++month === 13) { year++; month = 1; }
  }
  return result;
}
