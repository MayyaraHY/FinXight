"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHeader } from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import { TimelinePeriod } from "@/models/Company";
import { Upload } from "@/models/Upload";
import { MONTHS_SHORT } from "@/lib/periodLabel";
import { fmtCompact } from "@/lib/formatMoney";

type SortKey = "file" | "year" | "month" | "status" | "actif" | "resultat";
type Dir = "asc" | "desc";

type Status = { label: string; color: "success" | "error" | "warning" };

function periodStatus(period?: TimelinePeriod): Status {
  if (!period || !period.has_bilan) return { label: "Sans bilan", color: "warning" };
  if (!period.has_cr) return { label: "Sans CR", color: "warning" };
  if (
    period.total_actif != null &&
    period.total_passif != null &&
    Math.abs(period.total_actif - period.total_passif) < 1
  ) {
    return { label: "Équilibré", color: "success" };
  }
  return { label: "Déséquilibré", color: "error" };
}

interface Props {
  uploads: Upload[];
  timeline: TimelinePeriod[];
  onEdit: (u: Upload) => void;
  onRowClick: (u: Upload) => void;
}

/** Sortable periods table with financial summary columns. */
export default function PeriodsTable({ uploads, timeline, onEdit, onRowClick }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "year", dir: "desc" });

  const byUpload = (id: number) => timeline.find((t) => t.upload_id === id);

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );

  const sorted = [...uploads].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const pa = byUpload(a.id);
    const pb = byUpload(b.id);
    switch (sort.key) {
      case "file":
        return dir * (a.display_filename || a.filename).localeCompare(b.display_filename || b.filename);
      case "year":
        return dir * ((a.period_year ?? 0) - (b.period_year ?? 0));
      case "month":
        return dir * ((a.period_month ?? 0) - (b.period_month ?? 0));
      case "status":
        return dir * periodStatus(pa).label.localeCompare(periodStatus(pb).label);
      case "actif":
        return dir * ((pa?.total_actif ?? 0) - (pb?.total_actif ?? 0));
      case "resultat":
        return dir * ((pa?.resultat_net ?? 0) - (pb?.resultat_net ?? 0));
      default:
        return 0;
    }
  });

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
  const headBtn =
    "flex items-center font-medium text-gray-500 text-theme-xs dark:text-gray-400 hover:text-brand-500 transition";

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <TableCell isHeader className={`py-3 ${right ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => toggle(k)} className={`${headBtn} ${right ? "ml-auto" : ""}`}>
        {label}
        {arrow(k)}
      </button>
    </TableCell>
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="border-y border-gray-100 dark:border-gray-800">
          <tr>
            <Th k="file" label="Fichier" />
            <Th k="year" label="Année" />
            <Th k="month" label="Mois" />
            <Th k="actif" label="Total Actif" right />
            <Th k="resultat" label="Résultat net" right />
            <Th k="status" label="Statut" />
            <TableCell isHeader className="py-3">
              <span className="sr-only">Actions</span>
            </TableCell>
          </tr>
        </TableHeader>
        <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
          {sorted.map((u) => {
            const period = byUpload(u.id);
            const status = periodStatus(period);
            const resultat = period?.resultat_net ?? null;
            return (
              <tr
                key={u.id}
                onClick={() => onRowClick(u)}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <TableCell className="py-3 pr-4 font-medium text-gray-900 dark:text-white">
                  {u.display_filename || u.filename}
                </TableCell>
                <TableCell className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                  {u.period_year ?? "—"}
                </TableCell>
                <TableCell className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                  {u.period_month && u.period_month >= 1 && u.period_month <= 12
                    ? MONTHS_SHORT[u.period_month]
                    : "—"}
                </TableCell>
                <TableCell className="py-3 pr-4 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                  {fmtCompact(period?.total_actif)}
                </TableCell>
                <TableCell className={`py-3 pr-4 text-right tabular-nums font-medium ${
                  resultat == null ? "text-gray-400" : resultat >= 0 ? "text-success-600 dark:text-success-500" : "text-error-600 dark:text-error-500"
                }`}>
                  {fmtCompact(resultat)}
                </TableCell>
                <TableCell className="py-3 pr-4">
                  <Badge color={status.color} size="sm">
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="py-3 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(u); }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 transition hover:text-brand-500 dark:border-gray-700"
                  >
                    Edit
                  </button>
                </TableCell>
              </tr>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
