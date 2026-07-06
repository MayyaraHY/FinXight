"use client";

import { useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import { ArrowDownIcon, ArrowUpIcon } from "@/icons";
import { ComponentLine } from "@/lib/metricComponents";
import { metricSourceHref } from "@/lib/metricSource";
import SourceLink from "@/components/companies/SourceLink";
import { TimelinePeriod } from "@/models/Company";

type KpiFormat = "currency" | "ratio" | "percent";

export function fmtValue(val: number | null | undefined, format: KpiFormat): string {
  if (val == null || !Number.isFinite(val)) return "—";
  if (format === "percent") return `${(val * 100).toFixed(1)}%`;
  if (format === "ratio") return val.toFixed(2);
  return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(val);
}

interface Props {
  label: string;
  value: number | null | undefined;
  /** Period-over-period change (latest − previous). null when no comparison. */
  delta?: number | null;
  /** Percentage change. null when the base is 0 (avoids NaN%). */
  pct?: number | null;
  /** Display format of the main value. Defaults to currency. */
  format?: KpiFormat;
  /** When true, shows a remove (×) button. */
  editing?: boolean;
  onRemove?: () => void;
  /** When true (custom metric), also shows edit + delete controls in editing mode. */
  isCustom?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Named sub-lines that make up this KPI (shown in expandable detail). */
  components?: ComponentLine[];
  /** Latest period — used to build source deep-links for the operands. */
  period?: TimelinePeriod | null;
  /** When provided, renders a drill-down icon button (hidden in editing mode). */
  onDrill?: () => void;
}

/**
 * KPI card: latest value + signed period-over-period delta badge
 * (green up / red down). Renders "—" instead of a badge when there is no
 * comparison or the base is null, never "NaN%".
 *
 * Optional expansions:
 * - `components`: formula breakdown, toggled with a chevron button
 * - `onDrill`: opens a source drill panel via a loupe icon (hidden in edit mode)
 */
export default function KpiCard({
  label,
  value,
  delta,
  pct,
  format = "currency",
  editing,
  onRemove,
  isCustom,
  onEdit,
  onDelete,
  components,
  period,
  onDrill,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const hasDelta = delta != null && Number.isFinite(delta) && delta !== 0;
  const up = (delta ?? 0) > 0;
  const pctText =
    pct != null && Number.isFinite(pct) ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : null;

  const hasComponents = components != null && components.length > 0;

  return (
    <div className="relative flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      {editing && (
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {isCustom && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Modifier ${label}`}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-xs text-gray-500 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:bg-gray-800"
            >
              ✎
            </button>
          )}
          {isCustom && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Supprimer ${label}`}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-xs text-gray-500 hover:border-error-300 hover:text-error-500 dark:border-gray-700 dark:bg-gray-800"
            >
              🗑
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Retirer ${label}`}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:border-error-300 hover:text-error-500 dark:border-gray-700 dark:bg-gray-800"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-1">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        {!editing && onDrill && (
          <button
            type="button"
            onClick={onDrill}
            aria-label={`Voir le détail de ${label}`}
            title="Voir le détail"
            className="flex-shrink-0 text-gray-300 hover:text-brand-500 transition dark:text-gray-600 dark:hover:text-brand-400"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L13.5 13.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        <h4 className="font-bold text-gray-800 text-title-sm dark:text-white/90">
          {fmtValue(value, format)}
        </h4>
        <div className="flex items-center gap-1.5">
          {hasComponents && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Masquer le détail" : "Afficher le détail"}
              className="text-gray-300 hover:text-brand-500 transition dark:text-gray-600 dark:hover:text-brand-400"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {hasDelta ? (
            <Badge color={up ? "success" : "error"}>
              {up ? <ArrowUpIcon /> : <ArrowDownIcon className="text-error-500" />}
              {pctText ?? fmtValue(Math.abs(delta as number), format)}
            </Badge>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
          )}
        </div>
      </div>

      {hasComponents && expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
          {components!.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2">
              <SourceLink
                href={period ? metricSourceHref(period, c.key) : null}
                className="text-xs text-gray-500 dark:text-gray-400 truncate"
              >
                {c.label}
              </SourceLink>
              <span className="text-xs font-medium text-gray-800 dark:text-white/80 tabular-nums flex-shrink-0">
                {fmtValue(c.value, c.format ?? "currency")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
