"use client";

import { useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { TimelinePeriod } from "@/models/Company";
import { fmtTND } from "@/lib/formatMoney";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Side = "actif" | "passif";

interface Slice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  period: TimelinePeriod;
}

/**
 * Composition donut for the latest period: breaks the balance sheet down into
 * Actif (courant / non-courant) or Passif (capitaux propres / dettes) slices.
 * Purely presentational — reads values already on the period. Null slices are
 * skipped so a partial balance sheet still renders.
 */
export default function CompositionDonut({ period }: Props) {
  const [side, setSide] = useState<Side>("actif");

  const buildSlices = (s: Side): Slice[] => {
    const raw: Slice[] =
      s === "actif"
        ? [
            { label: "Actifs courants", value: period.actifs_courants ?? 0, color: "#465FFF" },
            { label: "Actifs non courants", value: period.actifs_non_courants ?? 0, color: "#9CB9FF" },
          ]
        : [
            { label: "Capitaux propres", value: period.capitaux_propres ?? 0, color: "#10B981" },
            { label: "Passifs non courants", value: period.passifs_non_courants ?? 0, color: "#F59E0B" },
            { label: "Passifs courants", value: period.passifs_courants ?? 0, color: "#FB6E52" },
          ];
    // Donut slices must be positive; negatives are surfaced via the warning banner below.
    return raw.filter((sl) => sl.value > 0);
  };

  const slices = buildSlices(side);
  // Use the authoritative period total rather than summing visible slices so that
  // negative equity (which is filtered out of the donut) doesn't silently corrupt it.
  const total = side === "actif"
    ? (period.total_actif ?? slices.reduce((acc, s) => acc + s.value, 0))
    : (period.total_passif ?? slices.reduce((acc, s) => acc + s.value, 0));

  const negativeEquity =
    side === "passif" && period.capitaux_propres != null && period.capitaux_propres < 0;

  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "donut",
    },
    labels: slices.map((s) => s.label),
    colors: slices.map((s) => s.color),
    stroke: { show: false },
    dataLabels: { enabled: false },
    legend: { show: false },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            total: {
              show: true,
              label: side === "actif" ? "Total Actif" : "Total Passif",
              fontSize: "12px",
              color: "#6B7280",
              formatter: () => fmtTND(total),
            },
            value: {
              fontSize: "16px",
              fontWeight: 600,
              formatter: (v) => fmtTND(Number(v)),
            },
          },
        },
      },
    },
    tooltip: {
      y: { formatter: (v) => fmtTND(v) },
    },
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
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

      {negativeEquity && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-400">
          <span className="flex-shrink-0">⚠</span>
          <span>
            Capitaux propres négatifs ({fmtTND(period.capitaux_propres)}) — non représentés dans le graphique.
          </span>
        </div>
      )}

      {slices.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-10 text-center">
          Données de bilan indisponibles pour cette période.
        </p>
      ) : (
        <>
          <ReactApexChart options={options} series={slices.map((s) => s.value)} type="donut" height={240} />
          <ul className="mt-4 space-y-2">
            {slices.map((s) => (
              <li key={s.label} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="truncate text-gray-600 dark:text-gray-300">{s.label}</span>
                </span>
                <span className="flex-shrink-0 text-gray-500 dark:text-gray-400">
                  {total > 0 ? `${((s.value / total) * 100).toFixed(0)}%` : "—"}
                </span>
              </li>
            ))}
            {negativeEquity && (
              <li className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 bg-error-500" />
                  <span className="truncate text-error-600 dark:text-error-400">Capitaux propres</span>
                </span>
                <span className="flex-shrink-0 text-error-600 dark:text-error-400">
                  {fmtTND(period.capitaux_propres)}
                </span>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
