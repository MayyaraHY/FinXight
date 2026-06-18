"use client";
import { useState } from "react";
import { TimelineComparison, TimelinePeriod } from "@/models/Company";
import { compareTimeline } from "@/services/companyService";
import { periodLabel } from "@/lib/periodLabel";

function fmtTND(val: number | null): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(val);
}

function fmtDelta(val: number | null): string {
  if (val == null) return "—";
  const sign = val > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(val)}`;
}

function fmtPct(val: number | null): string {
  if (val == null) return "—";
  return `${val > 0 ? "+" : ""}${val.toFixed(1)}%`;
}

const METRICS: { key: keyof TimelineComparison["comparison"]; label: string }[] = [
  { key: "total_actif", label: "Total Actif" },
  { key: "total_passif", label: "Total Passif" },
  { key: "capitaux_propres", label: "Capitaux propres" },
  { key: "resultat_net", label: "Résultat net" },
];

function encodePeriod(p: TimelinePeriod): string {
  return `${p.period_year ?? "null"}_${p.period_month ?? "null"}_${p.upload_id}`;
}

interface Props {
  companyId: number;
  timeline: TimelinePeriod[];
}

export default function PeriodCompare({ companyId, timeline }: Props) {
  const [selA, setSelA] = useState("");
  const [selB, setSelB] = useState("");
  const [result, setResult] = useState<TimelineComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decodePeriod = (val: string) => timeline.find((p) => encodePeriod(p) === val);

  const fetchComparison = async (valA: string, valB: string) => {
    if (!valA || !valB) {
      setResult(null);
      setError(null);
      return;
    }
    const pA = decodePeriod(valA);
    const pB = decodePeriod(valB);
    if (!pA?.period_year || !pB?.period_year) {
      setResult(null);
      setError("Impossible de comparer des périodes sans année définie.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await compareTimeline(
        companyId,
        pA.period_year,
        pB.period_year,
        pA.period_month ?? undefined,
        pB.period_month ?? undefined
      );
      setResult(data);
    } catch (e: unknown) {
      const status =
        (e as { status?: number })?.status ??
        (e as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setError("Une ou les deux périodes sont introuvables.");
      } else {
        setError("Erreur lors de la comparaison.");
      }
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
        Comparaison de périodes
      </h3>
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Période A</label>
          <select
            value={selA}
            onChange={(e) => {
              setSelA(e.target.value);
              fetchComparison(e.target.value, selB);
            }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          >
            <option value="">— Sélectionner —</option>
            {timeline.map((p) => (
              <option key={encodePeriod(p)} value={encodePeriod(p)}>
                {periodLabel(p.period_year, p.period_month, p.display_filename)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Période B</label>
          <select
            value={selB}
            onChange={(e) => {
              setSelB(e.target.value);
              fetchComparison(selA, e.target.value);
            }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          >
            <option value="">— Sélectionner —</option>
            {timeline.map((p) => (
              <option key={encodePeriod(p)} value={encodePeriod(p)}>
                {periodLabel(p.period_year, p.period_month, p.display_filename)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Chargement…</p>
      )}

      {error && !loading && (
        <p className="text-sm text-error-500 dark:text-error-400 py-2">{error}</p>
      )}

      {result && !loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 font-medium">Indicateur</th>
                <th className="pb-2 font-medium text-right">
                  {periodLabel(
                    result.period_a.period_year,
                    result.period_a.period_month,
                    result.period_a.display_filename
                  )}
                </th>
                <th className="pb-2 font-medium text-right">
                  {periodLabel(
                    result.period_b.period_year,
                    result.period_b.period_month,
                    result.period_b.display_filename
                  )}
                </th>
                <th className="pb-2 font-medium text-right">Δ</th>
                <th className="pb-2 font-medium text-right">Δ%</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map(({ key, label }) => {
                const cv = result.comparison[key];
                return (
                  <tr
                    key={key}
                    className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                  >
                    <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{label}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-900 dark:text-white">
                      {fmtTND(cv.a)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-gray-900 dark:text-white">
                      {fmtTND(cv.b)}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-medium text-gray-700 dark:text-gray-300">
                      {fmtDelta(cv.delta)}
                    </td>
                    <td className="py-2.5 text-right text-gray-600 dark:text-gray-400">
                      {fmtPct(cv.pct)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
