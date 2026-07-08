"use client";
import { useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { TimelinePeriod } from "@/models/Company";
import { periodLabel } from "@/lib/periodLabel";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type SeriesKey = "total_actif" | "capitaux_propres" | "resultat_net" | "produits_exploitation";

const SERIES_CONFIG: { key: SeriesKey; label: string; color: string }[] = [
  { key: "total_actif", label: "Total Actif", color: "#465FFF" },
  { key: "capitaux_propres", label: "Capitaux propres", color: "#10B981" },
  { key: "resultat_net", label: "Résultat net", color: "#F59E0B" },
  { key: "produits_exploitation", label: "Chiffre d'affaires", color: "#8B5CF6" },
];

function fmtTND(val: number): string {
  return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(val) + " TND";
}

interface Props {
  timeline: TimelinePeriod[];
}

export default function TimelineChart({ timeline }: Props) {
  const [visible, setVisible] = useState<Set<SeriesKey>>(
    new Set<SeriesKey>(["total_actif", "capitaux_propres", "resultat_net"])
  );

  const toggle = (key: SeriesKey) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const categories = timeline.map((p) =>
    periodLabel(p.period_year, p.period_month, p.display_filename)
  );

  const activeSeries = SERIES_CONFIG.filter((s) => visible.has(s.key));

  const series = activeSeries.map((s) => ({
    name: s.label,
    // Coerce undefined → null so ApexCharts' (number | null)[] is satisfied
    // while preserving gaps in the line where a period lacks the metric.
    data: timeline.map((p) => p[s.key] ?? null),
  }));

  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "line",
      height: 300,
      toolbar: { show: false },
    },
    colors: activeSeries.map((s) => s.color),
    stroke: {
      curve: "straight",
      width: 2,
    },
    markers: {
      size: 4,
      strokeColors: "#fff",
      strokeWidth: 2,
      hover: { size: 7 },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: {
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    xaxis: {
      type: "category",
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
      labels: {
        style: { fontSize: "12px", colors: "#6B7280" },
      },
    },
    yaxis: {
      labels: {
        style: { fontSize: "12px", colors: ["#6B7280"] },
        formatter: (val) => {
          if (val == null) return "—";
          if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
          if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
          return String(Math.round(val));
        },
      },
    },
    tooltip: {
      enabled: true,
      y: {
        formatter: (val) => (val == null ? "—" : fmtTND(val)),
      },
    },
  };

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {SERIES_CONFIG.map((s) => {
          const on = visible.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition ${
                on
                  ? "border-transparent text-white"
                  : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
              }`}
              style={on ? { backgroundColor: s.color, borderColor: s.color } : {}}
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </button>
          );
        })}
      </div>
      <div className="max-w-full overflow-x-auto">
        <div style={{ minWidth: Math.max(320, timeline.length * 90) }}>
          <ReactApexChart
            options={options}
            series={series}
            type="line"
            height={300}
          />
        </div>
      </div>
    </div>
  );
}
