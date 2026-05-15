/**
 * Date math utilities — no external deps.
 */

export function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

export function daysDiff(current: Date, previous: Date): number {
  return Math.floor((current.getTime() - previous.getTime()) / 86_400_000);
}
