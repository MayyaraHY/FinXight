"use client";

import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { TimelinePeriod } from "@/models/Company";
import { RATIO_CATALOG, DEFAULT_RATIOS } from "@/components/companies/ratioCatalog";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

// Per-ratio display cap: the ratio value that fills the gauge to 100%. Purely a
// presentation choice so ratios on different scales read comparably.
const GAUGE_CAP: Record<string, number> = {
  autonomie: 1,
  liquidite_generale: 3,
  endettement: 3,
  roa: 0.2,
  roe: 0.3,
};

const HEALTHY = "#12B76A";
const UNHEALTHY = "#F79009";
const NEUTRAL = "#9CA3AF";

function fmtRatio(v: number | null, format: "ratio" | "percent"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return format === "percent" ? `${(v * 100).toFixed(1)}%` : v.toFixed(2);
}

interface Props {
  periodN: TimelinePeriod;
  periodN1?: TimelinePeriod | null;
}

/**
 * Radial-gauge summary of the key financial ratios, colored by their health
 * thresholds. Reuses RATIO_CATALOG (definitions, thresholds, formats) — it is a
 * visual echo of the RatioAnalysis table, not an independent computation.
 */
export default function RatioGauges({ periodN, periodN1 }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {DEFAULT_RATIOS.map((key) => {
        const def = RATIO_CATALOG[key];
        const v = def.value(periodN);
        const vN1 = periodN1 ? def.value(periodN1) : null;
        const healthy = v != null && def.healthy ? def.healthy(v) : null;
        const color = healthy == null ? NEUTRAL : healthy ? HEALTHY : UNHEALTHY;

        const cap = GAUGE_CAP[key] ?? 1;
        const fill = v == null ? 0 : Math.max(0, Math.min(100, (v / cap) * 100));

        const options: ApexOptions = {
          chart: { fontFamily: "Outfit, sans-serif", type: "radialBar", sparkline: { enabled: true } },
          colors: [color],
          plotOptions: {
            radialBar: {
              hollow: { size: "58%" },
              track: { background: "#E5E7EB" },
              dataLabels: {
                name: { show: false },
                value: {
                  offsetY: 6,
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#374151",
                  formatter: () => fmtRatio(v, def.format),
                },
              },
            },
          },
          stroke: { lineCap: "round" },
        };

        let trend: "up" | "down" | null = null;
        let trendPct: number | null = null;
        if (v != null && vN1 != null && v !== vN1) {
          trend = (def.higherBetter ? v > vN1 : v < vN1) ? "up" : "down";
          trendPct = vN1 !== 0 ? ((v - vN1) / Math.abs(vN1)) * 100 : null;
        }

        return (
          <div key={key} className="flex flex-col items-center rounded-xl border border-gray-200 p-3 dark:border-gray-800">
            <ReactApexChart options={options} series={[fill]} type="radialBar" height={130} />
            <p className="mt-1 text-center text-xs text-gray-600 dark:text-gray-300 leading-tight">
              {def.label}
            </p>
            {trend && (
              <span className={`mt-1 text-xs ${trend === "up" ? "text-success-600 dark:text-success-500" : "text-error-600 dark:text-error-500"}`}>
                {trend === "up" ? "▲" : "▼"}{" "}
                {trendPct != null ? `${trendPct > 0 ? "+" : ""}${trendPct.toFixed(1)}%` : "vs N-1"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
