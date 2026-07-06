"use client";

import { Fragment, useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import { CustomMetric, TimelinePeriod } from "@/models/Company";
import { RATIO_CATALOG, RATIO_KEYS } from "@/components/companies/ratioCatalog";
import { useDashboardRatios } from "@/hooks/useDashboardRatios";
import { METRIC_VARIABLES, periodVars } from "@/components/companies/metricVariables";
import { getComponents, ComponentLine } from "@/lib/metricComponents";
import { metricSourceHref } from "@/lib/metricSource";
import SourceLink from "@/components/companies/SourceLink";

type Fmt = "ratio" | "percent" | "currency";

function fmtVal(v: number | null, format: Fmt): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (format === "percent") return `${(v * 100).toFixed(1)}%`;
  if (format === "currency") return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(v);
  return v.toFixed(2);
}

interface ResolvedRow {
  key: string;
  label: string;
  vN: number | null;
  vN1: number | null;
  healthy: boolean | null;
  higherBetter: boolean;
  format: Fmt;
  components: ComponentLine[] | null;
}

interface Props {
  periodN: TimelinePeriod;
  periodN1?: TimelinePeriod | null;
  /** The full custom-metric library — any of them can be shown as a ratio row,
   *  regardless of kind (placement is driven by the selection). */
  customMetrics: CustomMetric[];
  onCreateCustom: () => void;
  onEditCustom: (cm: CustomMetric) => void;
  /** Delete the definition server-side. Returns once removed. */
  onDeleteCustom: (cm: CustomMetric) => Promise<void>;
  companyId?: number;
}

export default function RatioAnalysis({
  periodN,
  periodN1,
  customMetrics,
  onCreateCustom,
  onEditCustom,
  onDeleteCustom,
  companyId,
}: Props) {
  const sel = useDashboardRatios(companyId);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const vars = periodVars(periodN);

  const customById = new Map(customMetrics.map((m) => [`custom:${m.id}`, m]));

  const resolve = (key: string): ResolvedRow | null => {
    const builtin = RATIO_CATALOG[key];
    if (builtin) {
      const vN = builtin.value(periodN);
      const vN1 = periodN1 ? builtin.value(periodN1) : null;
      return {
        key,
        label: builtin.label,
        vN,
        vN1,
        healthy: vN != null && builtin.healthy ? builtin.healthy(vN) : null,
        higherBetter: builtin.higherBetter,
        format: builtin.format,
        components: getComponents(builtin.formula, vars, METRIC_VARIABLES),
      };
    }
    const cm = customById.get(key);
    if (cm) {
      // Authoritative values computed server-side (period.metric_values).
      const vN = periodN.metric_values?.[String(cm.id)] ?? null;
      const vN1 = periodN1 ? periodN1.metric_values?.[String(cm.id)] ?? null : null;
      const format: Fmt = (cm.format as Fmt) ?? "ratio";
      let healthy: boolean | null = null;
      if (vN != null && cm.threshold != null)
        healthy = cm.higher_better ? vN >= cm.threshold : vN <= cm.threshold;
      return {
        key,
        label: cm.name,
        vN,
        vN1,
        healthy,
        higherBetter: cm.higher_better,
        format,
        components: getComponents(cm.formula, vars, METRIC_VARIABLES),
      };
    }
    return null;
  };

  const rows = sel.keys.map(resolve).filter((r): r is ResolvedRow => r !== null);

  // Delete a custom ratio: drop it from the selection, then remove the definition.
  const handleDelete = async (cm: CustomMetric) => {
    sel.remove(`custom:${cm.id}`);
    await onDeleteCustom(cm);
  };

  const availableBuiltins = RATIO_KEYS.filter((k) => !sel.keys.includes(k));
  const availableCustoms = customMetrics.filter((m) => !sel.keys.includes(`custom:${m.id}`));

  const cellTh = "py-2 font-medium text-gray-500 text-theme-xs dark:text-gray-400";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 dark:text-gray-500">{rows.length} ratio(s)</span>
        <div className="flex items-center gap-2">
          {editing && (
            <>
              <button onClick={() => sel.reset()} className="text-xs text-gray-500 hover:text-brand-500 transition">
                Réinitialiser
              </button>
              <div className="relative">
                <button
                  onClick={() => setAddOpen((v) => !v)}
                  className="dropdown-toggle text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  + Ajouter
                </button>
                <Dropdown isOpen={addOpen} onClose={() => setAddOpen(false)} className="w-64 p-1 max-h-72 overflow-y-auto">
                  {availableBuiltins.map((k) => (
                    <DropdownItem key={k} onClick={() => { sel.add(k); setAddOpen(false); }}>
                      {RATIO_CATALOG[k].label}
                    </DropdownItem>
                  ))}
                  {availableCustoms.map((m) => (
                    <DropdownItem key={m.id} onClick={() => { sel.add(`custom:${m.id}`); setAddOpen(false); }}>
                      {m.name}
                    </DropdownItem>
                  ))}
                  <DropdownItem
                    className="text-brand-500 border-t border-gray-100 dark:border-gray-800 mt-1"
                    onClick={() => { setAddOpen(false); onCreateCustom(); }}
                  >
                    + Créer un ratio personnalisé…
                  </DropdownItem>
                </Dropdown>
              </div>
            </>
          )}
          <button
            onClick={() => { setEditing((v) => !v); setAddOpen(false); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {editing ? "Terminer" : "Personnaliser"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell isHeader className={`${cellTh} text-left`}>Ratio</TableCell>
              {periodN1 && <TableCell isHeader className={`${cellTh} text-right`}>N-1</TableCell>}
              <TableCell isHeader className={`${cellTh} text-right`}>N</TableCell>
              <TableCell isHeader className={`${cellTh} text-right`}>Tendance</TableCell>
              {editing && (
                <TableCell isHeader className={cellTh}>
                  <span className="sr-only">Actions</span>
                </TableCell>
              )}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r, i) => {
              let trend: "up" | "down" | null = null;
              if (r.vN != null && r.vN1 != null && r.vN !== r.vN1) {
                trend = (r.higherBetter ? r.vN > r.vN1 : r.vN < r.vN1) ? "up" : "down";
              }
              const nCls =
                r.vN == null
                  ? "text-gray-400 dark:text-gray-500"
                  : r.healthy == null
                  ? "text-gray-900 dark:text-white"
                  : r.healthy
                  ? "text-success-600 dark:text-success-500"
                  : "text-warning-600 dark:text-warning-500";
              const isExpanded = expandedKey === r.key;
              const hasComponents = r.components != null && r.components.length > 0;
              const colSpan = (periodN1 ? 1 : 0) + (editing ? 1 : 0) + 3;
              return (
                <Fragment key={r.key}>
                  <tr
                    className={`${editing ? "cursor-move" : ""} ${dragIndex === i ? "opacity-50" : ""}`}
                    draggable={editing}
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => { if (editing) e.preventDefault(); }}
                    onDrop={() => { if (dragIndex != null) sel.move(dragIndex, i); setDragIndex(null); }}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    <TableCell className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                      <div className="flex items-center gap-1.5">
                        {hasComponents && (
                          <button
                            type="button"
                            onClick={() => setExpandedKey(isExpanded ? null : r.key)}
                            aria-label={isExpanded ? "Masquer" : "Détail"}
                            className="text-gray-300 hover:text-brand-500 transition dark:text-gray-600 dark:hover:text-brand-400 flex-shrink-0"
                          >
                            <svg
                              className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              viewBox="0 0 12 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        )}
                        {r.label}
                      </div>
                    </TableCell>
                    {periodN1 && (
                      <TableCell className="py-2.5 pr-4 text-right text-gray-500 dark:text-gray-400">
                        {fmtVal(r.vN1, r.format)}
                      </TableCell>
                    )}
                    <TableCell className={`py-2.5 pr-4 text-right font-medium ${nCls}`}>
                      {fmtVal(r.vN, r.format)}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      {trend == null ? (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      ) : trend === "up" ? (
                        <span className="text-success-600 dark:text-success-500">▲</span>
                      ) : (
                        <span className="text-error-600 dark:text-error-500">▼</span>
                      )}
                    </TableCell>
                    {editing && (
                      <TableCell className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(() => {
                            const cm = customById.get(r.key);
                            if (!cm) return null;
                            return (
                              <>
                                <button
                                  onClick={() => onEditCustom(cm)}
                                  aria-label={`Modifier ${r.label}`}
                                  className="text-gray-400 hover:text-brand-500"
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => handleDelete(cm)}
                                  aria-label={`Supprimer ${r.label}`}
                                  className="text-gray-400 hover:text-error-500"
                                >
                                  🗑
                                </button>
                              </>
                            );
                          })()}
                          <button
                            onClick={() => sel.remove(r.key)}
                            aria-label={`Retirer ${r.label}`}
                            className="text-gray-400 hover:text-error-500"
                          >
                            ×
                          </button>
                        </div>
                      </TableCell>
                    )}
                  </tr>
                  {hasComponents && isExpanded && (
                    <tr className="bg-gray-50 dark:bg-white/[0.02]">
                      <td colSpan={colSpan} className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-x-6 gap-y-1">
                          {r.components!.map((c) => (
                            <div key={c.key} className="flex items-center gap-1.5 text-xs">
                              <SourceLink
                                href={metricSourceHref(periodN, c.key)}
                                className="text-gray-500 dark:text-gray-400"
                              >
                                {c.label}
                              </SourceLink>
                              <span className="font-medium text-gray-800 dark:text-white/80 tabular-nums">
                                {fmtVal(c.value, c.format ?? "currency")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <TableCell className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  Aucun ratio. Cliquez sur « Personnaliser » pour en ajouter.
                </TableCell>
              </tr>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
