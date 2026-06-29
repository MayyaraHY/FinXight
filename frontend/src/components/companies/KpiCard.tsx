"use client";

import Badge from "@/components/ui/badge/Badge";
import { ArrowDownIcon, ArrowUpIcon } from "@/icons";

function fmtTND(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(val);
}

interface Props {
  label: string;
  value: number | null | undefined;
  /** Period-over-period change (latest − previous). null when no comparison. */
  delta?: number | null;
  /** Percentage change. null when the base is 0 (avoids NaN%). */
  pct?: number | null;
}

/**
 * KPI card: latest value + signed period-over-period delta badge
 * (green up / red down). Renders "—" instead of a badge when there is no
 * comparison or the base is null, never "NaN%".
 */
export default function KpiCard({ label, value, delta, pct }: Props) {
  const hasDelta = delta != null && Number.isFinite(delta) && delta !== 0;
  const up = (delta ?? 0) > 0;
  const pctText =
    pct != null && Number.isFinite(pct) ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <div className="mt-2 flex items-end justify-between gap-2">
        <h4 className="font-bold text-gray-800 text-title-sm dark:text-white/90">
          {fmtTND(value)}
        </h4>
        {hasDelta ? (
          <Badge color={up ? "success" : "error"}>
            {up ? <ArrowUpIcon /> : <ArrowDownIcon className="text-error-500" />}
            {pctText ?? fmtTND(Math.abs(delta as number))}
          </Badge>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
        )}
      </div>
    </div>
  );
}
