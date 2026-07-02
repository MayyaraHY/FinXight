"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { useSidebar } from "@/context/SidebarContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import ComponentCard from "@/components/common/ComponentCard";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Company, CustomMetric, TimelinePeriod } from "@/models/Company";
import { getCompanies, getTimeline } from "@/services/companyService";
import { KPI_CATALOG, KPI_KEYS } from "@/components/companies/kpiCatalog";
import { RATIO_CATALOG, RATIO_KEYS } from "@/components/companies/ratioCatalog";
import { useDashboardKpis } from "@/hooks/useDashboardKpis";
import { useDashboardRatios } from "@/hooks/useDashboardRatios";
import { useMetricLibrary } from "@/hooks/useMetricLibrary";
import { generateMetric } from "@/services/metricLibraryService";
import CustomMetricModal from "@/components/companies/CustomMetricModal";
import { CustomMetricInput } from "@/services/customMetricService";

type Kind = "kpi" | "ratio";
type Fmt = "currency" | "ratio" | "percent";

function fmtVal(v: number | null | undefined, format: Fmt): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (format === "percent") return `${(v * 100).toFixed(1)}%`;
  if (format === "currency") return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(v);
  return v.toFixed(2);
}

interface Row {
  key: string; // builtin key or `custom:{id}`
  label: string;
  formula: string | null; // null for built-ins
  format: Fmt;
  threshold: number | null;
  isCustom: boolean;
  cm?: CustomMetric;
  liveValue: number | null;
}

export default function MetricsPage() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  const library = useMetricLibrary();
  const kpiSel = useDashboardKpis();
  const ratioSel = useDashboardRatios();

  // Preview company: powers the live-value column + the modal formula preview.
  const [companies, setCompanies] = useState<Company[]>([]);
  const [previewCompanyId, setPreviewCompanyId] = useState<number | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState<TimelinePeriod | null>(null);

  const [modal, setModal] = useState<{ open: boolean; kind: Kind; editing: CustomMetric | null }>({
    open: false,
    kind: "kpi",
    editing: null,
  });

  useEffect(() => {
    getCompanies()
      .then((list) => {
        setCompanies(list);
        if (list.length && previewCompanyId == null) setPreviewCompanyId(list[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (previewCompanyId == null) {
      setPreviewPeriod(null);
      return;
    }
    getTimeline(previewCompanyId)
      .then((res) => setPreviewPeriod(res.periods.at(-1) ?? null))
      .catch(() => setPreviewPeriod(null));
  }, [previewCompanyId, library.metrics]);

  const customKpis = useMemo(() => library.metrics.filter((m) => m.kind === "kpi"), [library.metrics]);
  const customRatios = useMemo(() => library.metrics.filter((m) => m.kind === "ratio"), [library.metrics]);

  const liveCustom = (cm: CustomMetric): number | null =>
    previewPeriod?.metric_values?.[String(cm.id)] ?? null;

  const kpiRows: Row[] = [
    ...KPI_KEYS.map((k) => ({
      key: k,
      label: KPI_CATALOG[k].label,
      formula: KPI_CATALOG[k].formula,
      format: "currency" as Fmt,
      threshold: null,
      isCustom: false,
      liveValue: previewPeriod ? KPI_CATALOG[k].value(previewPeriod) : null,
    })),
    ...customKpis.map((cm) => ({
      key: `custom:${cm.id}`,
      label: cm.name,
      formula: cm.formula,
      format: (cm.format ?? "currency") as Fmt,
      threshold: cm.threshold,
      isCustom: true,
      cm,
      liveValue: liveCustom(cm),
    })),
  ];

  const ratioRows: Row[] = [
    ...RATIO_KEYS.map((k) => ({
      key: k,
      label: RATIO_CATALOG[k].label,
      formula: RATIO_CATALOG[k].formula,
      format: RATIO_CATALOG[k].format as Fmt,
      threshold: null,
      isCustom: false,
      liveValue: previewPeriod ? RATIO_CATALOG[k].value(previewPeriod) : null,
    })),
    ...customRatios.map((cm) => ({
      key: `custom:${cm.id}`,
      label: cm.name,
      formula: cm.formula,
      format: (cm.format ?? "ratio") as Fmt,
      threshold: cm.threshold,
      isCustom: true,
      cm,
      liveValue: liveCustom(cm),
    })),
  ];

  const openCreate = (kind: Kind) => setModal({ open: true, kind, editing: null });
  const openEdit = (cm: CustomMetric) => setModal({ open: true, kind: cm.kind, editing: cm });

  const handleSubmit = async (body: CustomMetricInput) => {
    if (modal.editing) {
      await library.update(modal.editing.id, body);
      return;
    }
    const created = await library.create(body);
    // Show new metrics on dashboards by default.
    (created.kind === "kpi" ? kpiSel : ratioSel).add(`custom:${created.id}`);
  };

  const handleDelete = async (cm: CustomMetric) => {
    (cm.kind === "kpi" ? kpiSel : ratioSel).remove(`custom:${cm.id}`);
    await library.remove(cm.id);
  };

  const cellTh = "py-2 px-3 font-medium text-gray-500 text-theme-xs dark:text-gray-400";

  const renderSection = (
    title: string,
    kind: Kind,
    rows: Row[],
    sel: ReturnType<typeof useDashboardKpis>
  ) => (
    <ComponentCard
      title={title}
      desc="Les indicateurs cochés apparaissent sur le tableau de bord de chaque entreprise."
      headerAction={
        <button
          onClick={() => openCreate(kind)}
          className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition"
        >
          + Nouveau {kind === "kpi" ? "KPI" : "ratio"}
        </button>
      }
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell isHeader className={`${cellTh} text-left`}>Nom</TableCell>
              <TableCell isHeader className={`${cellTh} text-left`}>Formule</TableCell>
              <TableCell isHeader className={`${cellTh} text-left`}>Format</TableCell>
              <TableCell isHeader className={`${cellTh} text-right`}>Seuil</TableCell>
              <TableCell isHeader className={`${cellTh} text-right`}>Valeur (aperçu)</TableCell>
              <TableCell isHeader className={`${cellTh} text-center`}>Tableau de bord</TableCell>
              <TableCell isHeader className={cellTh}><span className="sr-only">Actions</span></TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => {
              const idx = sel.keys.indexOf(r.key);
              const shown = idx !== -1;
              return (
                <TableRow key={r.key}>
                  <TableCell className="py-2.5 px-3 text-gray-700 dark:text-gray-300">
                    {r.label}
                    {!r.isCustom && (
                      <span className="ml-2 text-[10px] text-gray-400">intégré</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5 px-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {r.formula ?? "—"}
                  </TableCell>
                  <TableCell className="py-2.5 px-3 text-gray-500 dark:text-gray-400">{r.format}</TableCell>
                  <TableCell className="py-2.5 px-3 text-right text-gray-500 dark:text-gray-400">
                    {r.threshold ?? "—"}
                  </TableCell>
                  <TableCell className="py-2.5 px-3 text-right font-medium text-gray-800 dark:text-white/90">
                    {fmtVal(r.liveValue, r.format)}
                  </TableCell>
                  <TableCell className="py-2.5 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={shown}
                      onChange={() => (shown ? sel.remove(r.key) : sel.add(r.key))}
                      aria-label={`Afficher ${r.label} sur le tableau de bord`}
                    />
                  </TableCell>
                  <TableCell className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {shown && (
                        <>
                          <button
                            onClick={() => sel.move(idx, idx - 1)}
                            disabled={idx <= 0}
                            aria-label={`Monter ${r.label}`}
                            className="text-gray-400 hover:text-brand-500 disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => sel.move(idx, idx + 1)}
                            disabled={idx === sel.keys.length - 1}
                            aria-label={`Descendre ${r.label}`}
                            className="text-gray-400 hover:text-brand-500 disabled:opacity-30"
                          >
                            ▼
                          </button>
                        </>
                      )}
                      {r.isCustom && r.cm && (
                        <>
                          <button
                            onClick={() => openEdit(r.cm!)}
                            aria-label={`Modifier ${r.label}`}
                            className="text-gray-400 hover:text-brand-500"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => handleDelete(r.cm!)}
                            aria-label={`Supprimer ${r.label}`}
                            className="text-gray-400 hover:text-error-500"
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </ComponentCard>
  );

  return (
    <AuthGuard>
      <div className="min-h-screen xl:flex">
        <AppSidebar />
        <Backdrop />
        <div className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
          <AppHeader />
          <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
            <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">KPI &amp; Ratios</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Bibliothèque globale d&apos;indicateurs — définis une fois, disponibles pour toutes
                  vos entreprises.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 dark:text-gray-400">Aperçu entreprise</label>
                <select
                  value={previewCompanyId ?? ""}
                  onChange={(e) => setPreviewCompanyId(e.target.value ? Number(e.target.value) : null)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">—</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-6">
              {renderSection("KPIs", "kpi", kpiRows, kpiSel)}
              {renderSection("Ratios", "ratio", ratioRows, ratioSel)}
            </div>
          </div>
        </div>
      </div>

      <CustomMetricModal
        isOpen={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false, editing: null }))}
        defaultKind={modal.kind}
        editing={modal.editing}
        latestPeriod={previewPeriod}
        onGenerate={(name) => generateMetric(name)}
        onSubmit={handleSubmit}
      />
    </AuthGuard>
  );
}
