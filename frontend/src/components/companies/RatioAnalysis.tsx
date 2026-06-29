"use client";

import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { TimelinePeriod } from "@/models/Company";

// Health thresholds + sense (whether a higher value is better). Adjust here.
const RATIOS: {
  label: string;
  compute: (p: TimelinePeriod) => number | null;
  healthy: (v: number) => boolean;
  /** true → higher is better (green when N > N-1). */
  higherBetter: boolean;
  /** "ratio" → 2 decimals; "pct" → percentage. */
  format: "ratio" | "pct";
}[] = [
  {
    label: "Autonomie financière",
    compute: (p) => safeRatio(p.capitaux_propres, p.total_passif),
    healthy: (v) => v >= 0.3,
    higherBetter: true,
    format: "pct",
  },
  {
    label: "Liquidité générale",
    compute: (p) => safeRatio(p.actifs_courants, p.passifs_courants),
    healthy: (v) => v >= 1.5,
    higherBetter: true,
    format: "ratio",
  },
  {
    label: "Endettement (D/E)",
    compute: (p) => safeRatio(sumOrNull(p.passifs_non_courants, p.passifs_courants), p.capitaux_propres),
    healthy: (v) => v <= 1,
    higherBetter: false,
    format: "ratio",
  },
  {
    label: "ROA",
    compute: (p) => safeRatio(p.resultat_net, p.total_actif),
    healthy: (v) => v >= 0.05,
    higherBetter: true,
    format: "pct",
  },
  {
    label: "ROE",
    compute: (p) => safeRatio(p.resultat_net, p.capitaux_propres),
    healthy: (v) => v >= 0.1,
    higherBetter: true,
    format: "pct",
  },
];

function sumOrNull(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function safeRatio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

function fmtRatio(v: number | null, format: "ratio" | "pct"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return format === "pct" ? `${(v * 100).toFixed(1)}%` : v.toFixed(2);
}

interface Props {
  periodN: TimelinePeriod;
  periodN1?: TimelinePeriod | null;
}

/** N-1 / N ratio table with health colouring and a trend arrow per ratio. */
export default function RatioAnalysis({ periodN, periodN1 }: Props) {
  const cellTh = "py-2 font-medium text-gray-500 text-theme-xs dark:text-gray-400";
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="border-y border-gray-100 dark:border-gray-800">
          <TableRow>
            <TableCell isHeader className={`${cellTh} text-left`}>Ratio</TableCell>
            {periodN1 && (
              <TableCell isHeader className={`${cellTh} text-right`}>N-1</TableCell>
            )}
            <TableCell isHeader className={`${cellTh} text-right`}>N</TableCell>
            <TableCell isHeader className={`${cellTh} text-right`}>Tendance</TableCell>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
          {RATIOS.map((r) => {
            const vN = r.compute(periodN);
            const vN1 = periodN1 ? r.compute(periodN1) : null;
            const healthy = vN != null && r.healthy(vN);
            let trend: "up" | "down" | null = null;
            if (vN != null && vN1 != null && vN !== vN1) {
              const improved = r.higherBetter ? vN > vN1 : vN < vN1;
              trend = improved ? "up" : "down";
            }
            return (
              <TableRow key={r.label}>
                <TableCell className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                  {r.label}
                </TableCell>
                {periodN1 && (
                  <TableCell className="py-2.5 pr-4 text-right text-gray-500 dark:text-gray-400">
                    {fmtRatio(vN1, r.format)}
                  </TableCell>
                )}
                <TableCell
                  className={`py-2.5 pr-4 text-right font-medium ${
                    vN == null
                      ? "text-gray-400 dark:text-gray-500"
                      : healthy
                      ? "text-success-600 dark:text-success-500"
                      : "text-warning-600 dark:text-warning-500"
                  }`}
                >
                  {fmtRatio(vN, r.format)}
                </TableCell>
                <TableCell className="py-2.5 text-right">
                  {trend == null ? (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  ) : trend === "up" ? (
                    <span className="text-success-600 dark:text-success-500">▲</span>
                  ) : (
                    <span className="text-error-600 dark:text-error-500">▼</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
