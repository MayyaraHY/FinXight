"use client";

import { useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { TimelinePeriod } from "@/models/Company";
import { RATIO_CATALOG, RATIO_KEYS } from "@/components/companies/ratioCatalog";
import { periodLabel } from "@/lib/periodLabel";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const COLORS = ["#465FFF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

interface Props {
  timeline: TimelinePeriod[];
}

/**
 * Multi-period ratio trend: shows how the key financial ratios evolved over time
 * as a toggleable line chart. Values are computed client-side from RATIO_CATALOG.
 */
export default function RatioTrend({ timeline }: Props) {
  const [visible, setVisible] = useState<Set<string>>(new Set(RATIO_KEYS));

  const toggle = (key: string) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const categories = timeline.map((p) =>
    periodLabel(p.period_year, p.period_month, p.display_filename)
  );

  const activeSeries = RATIO_KEYS.filter((k) => visible.has(k)).map((key, i) => {
    const def = RATIO_CATALOG[key];
    return {
      key,
      name: def.label,
      color: COLORS[i % COLORS.length],
      data: timeline.map((p) => {
        const v = def.value(p);
        if (v == null || !Number.isFinite(v)) return null;
        return def.format === "percent" ? parseFloat((v * 100).toFixed(2)) : parseFloat(v.toFixed(3));
      }),
    };
  });

  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "line",
      height: 280,
      toolbar: { show: false },
    },
    colors: activeSeries.map((s) => s.color),
    stroke: { curve: "straight", width: 2 },
    markers: { size: 4, strokeColors: "#fff", strokeWidth: 2, hover: { size: 7 } },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    xaxis: {
      type: "category",
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
      labels: { style: { fontSize: "12px", colors: "#6B7280" } },
    },
    yaxis: {
      labels: {
        style: { fontSize: "12px", colors: ["#6B7280"] },
        formatter: (v) => (v == null ? "—" : `${v}`),
      },
    },
    tooltip: {
      enabled: true,
      y: {
        formatter: (val, { seriesIndex }) => {
          if (val == null) return "—";
          const key = activeSeries[seriesIndex]?.key;
          const def = key ? RATIO_CATALOG[key] : null;
          return def?.format === "percent" ? `${val.toFixed(1)}%` : val.toFixed(2);
        },
      },
    },
  };

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {RATIO_KEYS.map((key, i) => {
          const on = visible.has(key);
          const color = COLORS[i % COLORS.length];
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition ${
                on ? "border-transparent text-white" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
              }`}
              style={on ? { backgroundColor: color, borderColor: color } : {}}
            >
              <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              {RATIO_CATALOG[key].label}
            </button>
          );
        })}
      </div>
      <div className="max-w-full overflow-x-auto">
        <div style={{ minWidth: Math.max(320, timeline.length * 90) }}>
          <ReactApexChart
            options={options}
            series={activeSeries.map((s) => ({ name: s.name, data: s.data }))}
            type="line"
            height={280}
          />
        </div>
      </div>
    </div>
  );
}
