"use client";

import { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import { CashFlowResponse, TimelinePeriod } from "@/models/Company";
import { getCashFlow } from "@/services/cashFlowService";
import { formatCurrency, formatCurrencyRounded } from "@/utils/formatters";

type InventoryMethod = "permanent" | "intermittent";

interface Props {
  companyId: number;
  timeline: TimelinePeriod[];
}

function amountCell(value: number | null, rounded: boolean) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }
  const text = rounded ? formatCurrencyRounded(value) : formatCurrency(value);
  const cls = value < 0 ? "text-error-600 dark:text-error-400" : "text-gray-900 dark:text-white";
  return <span className={cls}>{value < 0 ? `(${text.replace("-", "")})` : text}</span>;
}

export default function CashFlowSection({ companyId, timeline }: Props) {
  const years = Array.from(
    new Set(timeline.map((p) => p.period_year).filter((y): y is number => y != null))
  ).sort((a, b) => b - a);

  const [year, setYear] = useState<number | null>(years[0] ?? null);
  const [method, setMethod] = useState<InventoryMethod>("intermittent");
  const [data, setData] = useState<CashFlowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (year == null) return;
    setLoading(true);
    setError(null);
    const res = await getCashFlow(companyId, year, method);
    if (res.ok) {
      setData(res.data);
    } else {
      setData(null);
      setError(res.message);
    }
    setLoading(false);
  }, [companyId, year, method]);

  useEffect(() => {
    load();
  }, [load]);

  const showN1 = data?.has_n_1_column ?? false;

  return (
    <ComponentCard title="Flux de trésorerie">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Exercice</label>
          <select
            value={year ?? ""}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          >
            {years.length === 0 && <option value="">—</option>}
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Méthode d&apos;inventaire</label>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {(["intermittent", "permanent"] as InventoryMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`px-3 py-2 text-sm capitalize transition ${
                  method === m
                    ? "bg-brand-500 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">Chargement…</p>
      )}

      {!loading && error && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
          {error.includes("consécutives") ? "Deux périodes consécutives requises." : error}
        </p>
      )}

      {!loading && !error && data && (
        <div className="space-y-4">
          {/* Reconciliation banner */}
          <div
            className={`rounded-xl px-4 py-3 text-sm border ${
              data.reconciliation_ok_n
                ? "border-success-300 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
                : "border-error-300 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
            }`}
          >
            {data.reconciliation_ok_n
              ? "✓ Réconciliation équilibrée (résidu ventilé en « Autres postes du bilan »)."
              : `⚠ Écart de réconciliation : ${formatCurrencyRounded(data.reconciliation_ecart_n)} (flux ≠ variation de trésorerie).`}
          </div>

          {data.warnings.length > 0 && (
            <ul className="rounded-xl px-4 py-3 text-xs bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400 space-y-1">
              {data.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 font-medium">Libellé</th>
                  <th className="pb-2 font-medium text-right">{data.label_n}</th>
                  {showN1 && <th className="pb-2 font-medium text-right">{data.label_n_1}</th>}
                </tr>
              </thead>
              <tbody>
                {data.sections.map((section) => (
                  <SectionRows key={section.label} section={section} showN1={showN1} />
                ))}

                {/* Bottom block */}
                <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                  <td className="py-2.5 font-semibold text-gray-900 dark:text-white">
                    Variation de trésorerie
                  </td>
                  <td className="py-2.5 text-right font-semibold">
                    {amountCell(data.variation_tresorerie_n, true)}
                  </td>
                  {showN1 && (
                    <td className="py-2.5 text-right font-semibold">
                      {amountCell(data.variation_tresorerie_n_1, true)}
                    </td>
                  )}
                </tr>
                <tr>
                  <td className="py-2 text-gray-600 dark:text-gray-400">Trésorerie d&apos;ouverture</td>
                  <td className="py-2 text-right">{amountCell(data.tresorerie_debut_n, true)}</td>
                  {showN1 && <td className="py-2 text-right">{amountCell(data.tresorerie_debut_n_1, true)}</td>}
                </tr>
                <tr>
                  <td className="py-2 text-gray-600 dark:text-gray-400">Trésorerie de clôture</td>
                  <td className="py-2 text-right">{amountCell(data.tresorerie_fin_n, true)}</td>
                  {showN1 && <td className="py-2 text-right">{amountCell(data.tresorerie_fin_n_1, true)}</td>}
                </tr>
              </tbody>
            </table>
            {!showN1 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                Colonne {data.year_n_1} indisponible : exercice {data.year_n - 1} sans période précédente.
              </p>
            )}
          </div>
        </div>
      )}
    </ComponentCard>
  );
}

function SectionRows({
  section,
  showN1,
}: {
  section: CashFlowResponse["sections"][number];
  showN1: boolean;
}) {
  const colCount = showN1 ? 3 : 2;
  return (
    <>
      <tr className="bg-gray-50 dark:bg-white/[0.02]">
        <td
          colSpan={colCount}
          className="px-1 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest"
        >
          {section.label}
        </td>
      </tr>
      {section.lines.map((line, i) => (
        <tr key={`${section.label}-${i}`} className="border-b border-gray-100 dark:border-gray-800">
          <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{line.label}</td>
          <td className="py-2 text-right">{amountCell(line.amount_n, false)}</td>
          {showN1 && <td className="py-2 text-right">{amountCell(line.amount_n_1, false)}</td>}
        </tr>
      ))}
      <tr className="border-b border-gray-200 dark:border-gray-700 font-medium">
        <td className="py-2 pr-4 text-gray-900 dark:text-white">Sous-total {section.label.toLowerCase()}</td>
        <td className="py-2 text-right">{amountCell(section.total_n, true)}</td>
        {showN1 && <td className="py-2 text-right">{amountCell(section.total_n_1, true)}</td>}
      </tr>
    </>
  );
}
