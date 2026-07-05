"use client";

import { useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { TimelinePeriod } from "@/models/Company";
import { periodLabel } from "@/lib/periodLabel";
import { fmtTND, fmtCompact } from "@/lib/formatMoney";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type View = "exploitation" | "bfr" | "jours";

interface Props {
  timeline: TimelinePeriod[];
}

/** BFR (working-capital requirement) = stocks + clients − fournisseurs. Null when no component present. */
function bfrOf(p: TimelinePeriod): number | null {
  if (p.stocks == null && p.clients == null && p.fournisseurs == null) return null;
  return (p.stocks ?? 0) + (p.clients ?? 0) - (p.fournisseurs ?? 0);
}

/**
 * Operating view for the P&L / working-capital lines that live on enriched
 * timelines. Two toggles: "Exploitation" (Produits vs Charges columns +
 * Résultat line) and "BFR" (working-capital trend). Each toggle only appears
 * when its underlying data is present; falls back to an empty state otherwise.
 */
export default function OperatingChart({ timeline }: Props) {
  const hasExploitation = timeline.some(
    (p) => p.produits_exploitation != null || p.charges_exploitation != null || p.resultat_exploitation != null
  );
  const hasBfr = timeline.some((p) => bfrOf(p) != null);
  const hasJours = timeline.some(
    (p) => (p.clients != null || p.stocks != null || p.fournisseurs != null) &&
           (p.produits_exploitation != null || p.charges_exploitation != null)
  );

  const [view, setView] = useState<View>(hasExploitation ? "exploitation" : hasBfr ? "bfr" : "jours");

  const categories = timeline.map((p) =>
    periodLabel(p.period_year, p.period_month, p.display_filename)
  );

  if (!hasExploitation && !hasBfr && !hasJours) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-10 text-center">
        Données d&apos;exploitation (compte de résultat / BFR) indisponibles pour ces périodes.
      </p>
    );
  }

  const active: View =
    view === "exploitation" && !hasExploitation
      ? hasBfr ? "bfr" : "jours"
      : view === "bfr" && !hasBfr
      ? hasExploitation ? "exploitation" : "jours"
      : view;

  const joursData = timeline.map((p) => {
    const rev = p.produits_exploitation ?? null;
    const cos = p.charges_exploitation ?? null;
    return {
      dso: rev && rev !== 0 ? (p.clients ?? null) != null ? ((p.clients ?? 0) / rev) * 365 : null : null,
      dio: cos && cos !== 0 ? (p.stocks ?? null) != null ? ((p.stocks ?? 0) / cos) * 365 : null : null,
      dpo: cos && cos !== 0 ? (p.fournisseurs ?? null) != null ? ((p.fournisseurs ?? 0) / cos) * 365 : null : null,
    };
  });

  const series =
    active === "exploitation"
      ? [
          { name: "Produits d'exploitation", type: "column", data: timeline.map((p) => p.produits_exploitation ?? null) },
          { name: "Charges d'exploitation", type: "column", data: timeline.map((p) => p.charges_exploitation ?? null) },
          { name: "Résultat d'exploitation", type: "line", data: timeline.map((p) => p.resultat_exploitation ?? null) },
        ]
      : active === "bfr"
      ? [{ name: "BFR", type: "area", data: timeline.map((p) => bfrOf(p)) }]
      : [
          { name: "DSO (clients)", type: "line", data: joursData.map((d) => d.dso != null ? parseFloat(d.dso.toFixed(1)) : null) },
          { name: "DIO (stocks)", type: "line", data: joursData.map((d) => d.dio != null ? parseFloat(d.dio.toFixed(1)) : null) },
          { name: "DPO (fournisseurs)", type: "line", data: joursData.map((d) => d.dpo != null ? parseFloat(d.dpo.toFixed(1)) : null) },
        ];

  const colors =
    active === "exploitation"
      ? ["#465FFF", "#FB6E52", "#10B981"]
      : active === "bfr"
      ? ["#465FFF"]
      : ["#465FFF", "#F59E0B", "#10B981"];

  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: active === "exploitation" ? "line" : "area",
      stacked: false,
      toolbar: { show: false },
    },
    colors,
    stroke: {
      width: active === "exploitation" ? [0, 0, 2] : 2,
      curve: "straight",
    },
    plotOptions: {
      bar: { columnWidth: "55%", borderRadius: 4, borderRadiusApplication: "end" },
    },
    fill: {
      type: active === "exploitation" ? "solid" : "gradient",
      opacity: active === "exploitation" ? 1 : 0.25,
    },
    markers: { size: active === "exploitation" ? 0 : 4, strokeColors: "#fff", strokeWidth: 2, hover: { size: 6 } },
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
    tooltip: {
      y: {
        formatter: (v) => {
          if (v == null) return "—";
          return active === "jours" ? `${v.toFixed(1)} j` : fmtTND(v);
        },
      },
    },
  };

  const legendItems =
    active === "exploitation"
      ? [
          { label: "Produits", color: "#465FFF" },
          { label: "Charges", color: "#FB6E52" },
          { label: "Résultat", color: "#10B981" },
        ]
      : active === "bfr"
      ? [{ label: "BFR (stocks + clients − fournisseurs)", color: "#465FFF" }]
      : [
          { label: "DSO — jours clients", color: "#465FFF" },
          { label: "DIO — jours stocks", color: "#F59E0B" },
          { label: "DPO — jours fournisseurs", color: "#10B981" },
        ];

  const availableViews = ([
    hasExploitation && "exploitation",
    hasBfr && "bfr",
    hasJours && "jours",
  ] as (View | false)[]).filter(Boolean) as View[];

  const VIEW_LABELS: Record<View, string> = { exploitation: "Exploitation", bfr: "BFR", jours: "Jours (DSO/DIO/DPO)" };

  return (
    <div>
      {availableViews.length > 1 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {availableViews.map((v) => {
            const on = active === v;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`text-xs font-medium px-3 py-1 rounded-full border transition ${
                  on
                    ? "border-transparent bg-brand-500 text-white"
                    : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-3 mb-2 flex-wrap">
        {legendItems.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
      <div className="max-w-full overflow-x-auto">
        <div style={{ minWidth: Math.max(320, timeline.length * 90) }}>
          <ReactApexChart options={options} series={series} type={active === "exploitation" ? "line" : "area"} height={300} />
        </div>
      </div>
    </div>
  );
}
