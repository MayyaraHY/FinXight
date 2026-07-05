// Money / number formatting helpers shared across dashboard charts.

/** Full TND amount, e.g. "1 234 567 TND". */
export function fmtTND(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(val) + " TND";
}

/** Compact axis label: 1.2M / 340K / 512. */
export function fmtCompact(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return String(Math.round(val));
}
