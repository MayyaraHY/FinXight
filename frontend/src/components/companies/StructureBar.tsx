"use client";

import { useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { TimelinePeriod } from "@/models/Company";
import { periodLabel } from "@/lib/periodLabel";
import { fmtTND, fmtCompact } from "@/lib/formatMoney";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Side = "actif" | "passif";

const STACKS: Record<Side, { key: keyof TimelinePeriod; label: string; color: string }[]> = {
  actif: [
    { key: "actifs_courants", label: "Actifs courants", color: "#465FFF" },
    { key: "actifs_non_courants", label: "Actifs non courants", color: "#9CB9FF" },
  ],
  passif: [
    { key: "capitaux_propres", label: "Capitaux propres", color: "#10B981" },
    { key: "passifs_non_courants", label: "Passifs non courants", color: "#F59E0B" },
    { key: "passifs_courants", label: "Passifs courants", color: "#FB6E52" },
  ],
};

interface Props {
  timeline: TimelinePeriod[];
}

/**
 * Stacked-bar view of the balance-sheet structure across periods, so the mix
 * (courant vs non-courant, or equity vs debt) can be read at a glance over time.
 * Toggle between the asset and liability side.
 */
export default function StructureBar({ timeline }: Props) {
  const [side, setSide] = useState<Side>("actif");

  const categories = timeline.map((p) =>
    periodLabel(p.period_year, p.period_month, p.display_filename)
  );

  const series = STACKS[side].map((s) => ({
    name: s.label,
    // Pass raw value including negatives — ApexCharts renders them below the baseline,
    // which correctly surfaces negative equity rather than hiding it.
    data: timeline.map((p) => (p[s.key] as number | null) ?? null),
  }));

  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      stacked: true,
      toolbar: { show: false },
    },
    colors: STACKS[side].map((s) => s.color),
    plotOptions: {
      bar: { horizontal: false, columnWidth: "45%", borderRadius: 4, borderRadiusApplication: "end" },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { fontSize: "12px", colors: "#6B7280" } },
    },
    yaxis: {
      labels: {
        style: { fontSize: "12px", colors: ["#6B7280"] },
        formatter: (v) => fmtCompact(v),
      },
    },
    tooltip: { y: { formatter: (v) => fmtTND(v) } },
    fill: { opacity: 1 },
  };

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {(["actif", "passif"] as Side[]).map((s) => {
          const on = side === s;
          return (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`text-xs font-medium px-3 py-1 rounded-full border transition ${
                on
                  ? "border-transparent bg-brand-500 text-white"
                  : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
              }`}
            >
              {s === "actif" ? "Actif" : "Passif"}
            </button>
          );
        })}
      </div>
      <div className="flex gap-3 mb-2 flex-wrap">
        {STACKS[side].map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="max-w-full overflow-x-auto">
        <div style={{ minWidth: Math.max(320, timeline.length * 90) }}>
          <ReactApexChart options={options} series={series} type="bar" height={300} />
        </div>
      </div>
    </div>
  );
}
