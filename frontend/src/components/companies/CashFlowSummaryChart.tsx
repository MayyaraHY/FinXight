"use client";

import { useEffect, useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { getCashFlow } from "@/services/cashFlowService";
import { CashFlowResponse } from "@/models/Company";
import { fmtTND } from "@/lib/formatMoney";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type InventoryMethod = "permanent" | "intermittent";

interface Props {
  companyId: number;
  year: number;
}

/**
 * Dashboard cash-flow summary: shows the three section totals (operating,
 * investing, financing) and net variation as a horizontal bar chart.
 * Allows toggling inventory method when the default fails.
 */
export default function CashFlowSummaryChart({ companyId, year }: Props) {
  const [method, setMethod] = useState<InventoryMethod>("permanent");
  const [data, setData] = useState<CashFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getCashFlow(companyId, year, method).then((res) => {
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else {
        setData(null);
        setError(res.message);
      }
      setLoading(false);
    });
  }, [companyId, year, method]);

  if (loading) {
    return <div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />;
  }

  if (error || !data) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{error ?? "Données indisponibles."}</p>
        <div className="flex justify-center gap-2">
          {(["permanent", "intermittent"] as InventoryMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`text-xs px-3 py-1 rounded-full border transition ${
                method === m
                  ? "border-transparent bg-brand-500 text-white"
                  : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
              }`}
            >
              {m === "permanent" ? "Inventaire permanent" : "Inventaire intermittent"}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const bars = [
    ...data.sections.map((s) => ({ label: s.label, value: s.total_n })),
    { label: "Variation nette", value: data.variation_tresorerie_n },
  ];

  const colors = bars.map((b) => (b.value >= 0 ? "#10B981" : "#EF4444"));

  const options: ApexOptions = {
    chart: { fontFamily: "Outfit, sans-serif", type: "bar", toolbar: { show: false } },
    colors,
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        distributed: true,
        dataLabels: { position: "top" },
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (v) => (v as number) == null ? "—" : fmtTND(v as number).replace(" TND", ""),
      style: { fontSize: "11px", colors: ["#6B7280"] },
      offsetX: 5,
    },
    legend: { show: false },
    grid: { xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
    xaxis: {
      labels: {
        style: { fontSize: "11px", colors: "#6B7280" },
        formatter: (v) => {
          const n = Number(v);
          if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
          if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
          return String(Math.round(n));
        },
      },
    },
    yaxis: {
      labels: { style: { fontSize: "11px", colors: ["#374151"] }, maxWidth: 180 },
    },
    tooltip: { y: { formatter: (v) => fmtTND(v) } },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-2">
          {(["permanent", "intermittent"] as InventoryMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`text-xs px-3 py-1 rounded-full border transition ${
                method === m
                  ? "border-transparent bg-brand-500 text-white"
                  : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
              }`}
            >
              {m === "permanent" ? "Permanent" : "Intermittent"}
            </button>
          ))}
        </div>
        {!data.reconciliation_ok_n && (
          <span className="text-xs text-warning-600 dark:text-warning-400">
            ⚠ Écart : {fmtTND(data.reconciliation_ecart_n)}
          </span>
        )}
      </div>
      <ReactApexChart
        options={options}
        series={[{ data: bars.map((b) => b.value) }]}
        type="bar"
        height={Math.max(160, bars.length * 45)}
      />
      <div className="flex gap-4 mt-1 flex-wrap justify-end">
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#10B981]" /> Positif
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#EF4444]" /> Négatif
        </span>
      </div>
    </div>
  );
}
