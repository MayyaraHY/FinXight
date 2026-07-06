"use client";

import { Modal } from "@/components/ui/modal";
import { TimelinePeriod } from "@/models/Company";
import { KPI_DRILL_MAP } from "@/lib/kpiDrillMap";
import { ComponentLine } from "@/lib/metricComponents";
import { metricSourceHref, metricSourceActionLabel } from "@/lib/metricSource";
import SourceLink from "@/components/companies/SourceLink";

type Format = "currency" | "ratio" | "percent";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  kpiKey: string;
  label: string;
  period: TimelinePeriod;
  /** For calculated KPIs: pre-computed formula components to display instead of KPI_DRILL_MAP. */
  components?: ComponentLine[] | null;
}

function fmtVal(val: number | null | undefined, format: Format = "currency"): string {
  if (val == null || !Number.isFinite(val)) return "—";
  if (format === "percent") return `${(val * 100).toFixed(1)}%`;
  if (format === "ratio") return val.toFixed(2);
  return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(val);
}

export default function KpiDrillPanel({ isOpen, onClose, kpiKey, label, period, components }: Props) {
  // For direct KPIs: use the static drill map (reads from period fields).
  // For calculated KPIs: use the pre-computed formula components passed in.
  const drillEntries = KPI_DRILL_MAP[kpiKey];
  const useComponents = !drillEntries && components && components.length > 0;
  // Deep-link the KPI itself to its own source line (replaces the generic
  // "Voir le bilan complet" when this KPI is directly mapped to a statement line).
  const selfHref = metricSourceHref(period, kpiKey);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-sm" showBackdrop={true}>
      <div className="p-6 pt-8">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{label}</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          {useComponents ? "Détail du calcul" : "Détail des composantes"}
        </p>

        <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden mb-4">
          {useComponents
            ? components!.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-white/[0.03]"
                >
                  <SourceLink
                    href={metricSourceHref(period, c.key)}
                    className="text-sm text-gray-600 dark:text-gray-300"
                  >
                    {c.label}
                  </SourceLink>
                  <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
                    {fmtVal(c.value, c.format ?? "currency")}
                  </span>
                </div>
              ))
            : drillEntries
            ? drillEntries.map((entry) => {
                const val = (period as Record<string, unknown>)[entry.key] as number | null | undefined;
                return (
                  <div
                    key={entry.key}
                    className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-white/[0.03]"
                  >
                    <SourceLink
                      href={metricSourceHref(period, entry.key)}
                      className="text-sm text-gray-600 dark:text-gray-300"
                    >
                      {entry.label}
                    </SourceLink>
                    <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
                      {fmtVal(val, "currency")}
                    </span>
                  </div>
                );
              })
            : (
                <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
                  Aucune composante disponible.
                </div>
              )}
        </div>

        {selfHref ? (
          <a
            href={selfHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 transition"
          >
            {metricSourceActionLabel(kpiKey) ?? "Voir la source"}
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.5 6h7M6.5 2.5L10 6l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ) : (
          period.has_bilan && (
            <a
              href={`/uploads/${period.upload_id}/bilan`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 transition"
            >
              Voir le bilan complet
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2.5 6h7M6.5 2.5L10 6l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )
        )}
      </div>
    </Modal>
  );
}
