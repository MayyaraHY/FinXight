export const MONTHS_SHORT = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function periodLabel(
  year: number | null,
  month: number | null,
  fallback?: string
): string {
  if (!year) return fallback ?? "—";
  if (month == null || month < 1 || month > 12) return String(year);
  return `${year} · ${MONTHS_SHORT[month]}`;
}
