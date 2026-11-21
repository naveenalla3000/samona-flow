// Financial dates are PostgreSQL DATE values. Overdue checks must use the
// business's local date (PRD §FR-04 and §10.2), not the server's UTC date.
export function businessLocalDate(timeZone: string, now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // An invalid stored timezone must never break invoice rendering.
    return now.toISOString().slice(0, 10);
  }
}

export function dateAfter(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
