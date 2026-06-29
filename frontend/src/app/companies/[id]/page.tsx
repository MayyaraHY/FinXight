"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { useSidebar } from "@/context/SidebarContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import ComponentCard from "@/components/common/ComponentCard";
import { Modal } from "@/components/ui/modal";
import Alert from "@/components/ui/alert/Alert";
import { Company, TimelinePeriod, TimelineWarning, TimelineComparison } from "@/models/Company";
import { Upload } from "@/models/Upload";
import { getCompany, getCompanies, getTimeline, compareTimeline } from "@/services/companyService";
import {
  getUploads,
  patchUploadMetadata,
  uploadAndParseWithProgress,
} from "@/services/UploadService";
import { periodLabel } from "@/lib/periodLabel";
import Badge from "@/components/ui/badge/Badge";
import TimelineChart from "@/components/companies/TimelineChart";
import PeriodCompare from "@/components/companies/PeriodCompare";
import KpiCard from "@/components/companies/KpiCard";
import ExecutiveSummary from "@/components/companies/ExecutiveSummary";
import RatioAnalysis from "@/components/companies/RatioAnalysis";
import PeriodsTable from "@/components/companies/PeriodsTable";
import { KPI_CATALOG, KPI_KEYS } from "@/components/companies/kpiCatalog";
import { useDashboardKpis } from "@/hooks/useDashboardKpis";
import { useCustomMetrics } from "@/hooks/useCustomMetrics";
import CustomMetricModal from "@/components/companies/CustomMetricModal";
import { periodVars } from "@/components/companies/metricVariables";
import { evalFormula } from "@/lib/formula";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";

const MONTHS_FULL = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2014 }, (_, i) => CURRENT_YEAR - i);

export default function CompanyDetailPage() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const params = useParams();
  const router = useRouter();
  const companyId = Number(params.id);

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  const [company, setCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [timeline, setTimeline] = useState<TimelinePeriod[]>([]);
  const [timelineWarnings, setTimelineWarnings] = useState<TimelineWarning[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<TimelineComparison | null>(null);
  const kpis = useDashboardKpis(companyId);
  const customMetrics = useCustomMetrics(companyId);
  const [editingKpis, setEditingKpis] = useState(false);
  const [addKpiOpen, setAddKpiOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [metricModal, setMetricModal] = useState<{ open: boolean; kind: "kpi" | "ratio" }>({
    open: false,
    kind: "kpi",
  });

  const [addModal, setAddModal] = useState<{
    isOpen: boolean;
    file: File | null;
    displayName: string;
    companyId: number | null;
    periodYear: number | null;
    periodMonth: number | null;
    progress: number; // 0 = idle
    error: string | null;
  }>({
    isOpen: false,
    file: null,
    displayName: "",
    companyId: companyId,
    periodYear: null,
    periodMonth: null,
    progress: 0,
    error: null,
  });

  const [editDrawer, setEditDrawer] = useState<{
    isOpen: boolean;
    upload: Upload | null;
    companyId: number | null;
    periodYear: number | null;
    periodMonth: number | null;
    saving: boolean;
  }>({
    isOpen: false,
    upload: null,
    companyId: companyId,
    periodYear: null,
    periodMonth: null,
    saving: false,
  });

  const fetchAll = async () => {
    try {
      const [comp, tlRes, allUploads] = await Promise.all([
        getCompany(companyId),
        getTimeline(companyId),
        getUploads(),
      ]);
      setCompany(comp);
      setTimeline(tlRes.periods);
      setTimelineWarnings(tlRes.warnings);
      setUploads(allUploads.filter((u: Upload) => u.company_id === companyId));
      setError(null);

      // KPI deltas: compare the latest period against the previous one
      // (A=prev, B=latest ⇒ delta = latest − prev). Backend stays the source of sign.
      const periods = tlRes.periods;
      const prev = periods[periods.length - 2];
      const latest = periods[periods.length - 1];
      if (periods.length >= 2 && prev?.period_year && latest?.period_year) {
        try {
          setComparison(
            await compareTimeline(
              companyId,
              prev.period_year,
              latest.period_year,
              prev.period_month ?? undefined,
              latest.period_month ?? undefined
            )
          );
        } catch {
          setComparison(null);
        }
      } else {
        setComparison(null);
      }
    } catch {
      setError("Failed to load company data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    getCompanies().then(setCompanies).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Only CSV / Excel files are accepted.
  const isValidFileType = (file: File): boolean => {
    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (validTypes.includes(file.type)) return true;
    const name = file.name.toLowerCase();
    return [".csv", ".xls", ".xlsx"].some((ext) => name.endsWith(ext));
  };

  const openAddModal = () => {
    setAddModal({
      isOpen: true,
      file: null,
      displayName: "",
      companyId: companyId,
      periodYear: null,
      periodMonth: null,
      progress: 0,
      error: null,
    });
  };

  const handleAddFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!isValidFileType(file)) {
      setAddModal((prev) => ({
        ...prev,
        file: null,
        error: `Invalid file type "${file.name}". Please upload only CSV or Excel files (.csv, .xls, .xlsx).`,
      }));
      return;
    }
    setAddModal((prev) => ({ ...prev, file, error: null }));
  };

  const handleConfirmAdd = async () => {
    if (!addModal.file) return;
    const displayName = addModal.displayName.trim() || undefined;
    try {
      await uploadAndParseWithProgress(
        addModal.file,
        {
          displayName,
          companyId: addModal.companyId,
          periodYear: addModal.periodYear,
          periodMonth: addModal.periodMonth,
        },
        (progress) => setAddModal((prev) => ({ ...prev, progress }))
      );
      setAddModal((prev) => ({ ...prev, isOpen: false, progress: 0 }));
      await fetchAll();
    } catch (err) {
      setAddModal((prev) => ({
        ...prev,
        progress: 0,
        error: err instanceof Error ? err.message : "Upload failed",
      }));
    }
  };

  const handleCancelAdd = () => {
    setAddModal((prev) => ({ ...prev, isOpen: false, progress: 0 }));
  };

  const latestPeriod = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  // Resolve a KPI selection key (builtin catalog key or `custom:{id}`) to a card.
  const customKpis = customMetrics.metrics.filter((m) => m.kind === "kpi");
  const customRatios = customMetrics.metrics.filter((m) => m.kind === "ratio");
  const customKpiById = new Map(customKpis.map((m) => [`custom:${m.id}`, m]));

  const resolveKpi = (key: string) => {
    const cat = KPI_CATALOG[key as keyof typeof KPI_CATALOG];
    if (cat) {
      return {
        label: cat.label,
        value: cat.value(latestPeriod),
        delta: cat.delta(comparison),
        pct: cat.pct(comparison),
        format: "currency" as const,
      };
    }
    const cm = customKpiById.get(key);
    if (!cm) return null;
    const value = evalFormula(cm.formula, periodVars(latestPeriod));
    let delta: number | null = null;
    let pct: number | null = null;
    if (comparison) {
      const a = evalFormula(cm.formula, periodVars(comparison.period_a));
      const b = evalFormula(cm.formula, periodVars(comparison.period_b));
      if (a != null && b != null) {
        delta = b - a;
        pct = a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null;
      }
    }
    return { label: cm.name, value, delta, pct, format: (cm.format ?? "currency") as "currency" | "ratio" | "percent" };
  };

  const openEditDrawer = (upload: Upload) => {
    setEditDrawer({
      isOpen: true,
      upload,
      companyId: upload.company_id ?? companyId,
      periodYear: upload.period_year ?? null,
      periodMonth: upload.period_month ?? null,
      saving: false,
    });
  };

  const handleSaveMetadata = async () => {
    if (!editDrawer.upload) return;
    setEditDrawer((prev) => ({ ...prev, saving: true }));
    try {
      await patchUploadMetadata(editDrawer.upload.id, {
        company_id: editDrawer.companyId,
        period_year: editDrawer.periodYear,
        period_month: editDrawer.periodMonth,
      });
      setEditDrawer((prev) => ({ ...prev, isOpen: false, saving: false }));
      await fetchAll();
    } catch {
      setError("Failed to save metadata");
      setEditDrawer((prev) => ({ ...prev, saving: false }));
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen xl:flex">
        <AppSidebar />
        <Backdrop />
        <div
          className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}
        >
          <AppHeader />
          <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
            <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <button
                  onClick={() => router.push("/companies")}
                  className="text-sm text-gray-500 hover:text-brand-500 transition"
                >
                  ← Companies
                </button>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    {company?.name ?? "…"}
                  </h1>
                  {latestPeriod && (
                    <Badge color="light" size="sm">
                      Dernière période :{" "}
                      {periodLabel(
                        latestPeriod.period_year,
                        latestPeriod.period_month,
                        latestPeriod.display_filename
                      )}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 self-start">
                <button
                  onClick={() => router.push(`/companies/${companyId}/statements`)}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm rounded-lg transition"
                >
                  États financiers
                </button>
                <button
                  onClick={openAddModal}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg transition"
                >
                  + Ajouter une période
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4">
                <Alert variant="error" title="Error" message={error} showLink={false} />
              </div>
            )}

            {loading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-12 gap-4 md:gap-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="col-span-12 sm:col-span-6 xl:col-span-3 h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5"
                    />
                  ))}
                </div>
                <div className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* KPI cards (customisable) */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                      Indicateurs clés
                    </p>
                    <div className="flex items-center gap-2">
                      {editingKpis && (
                        <button
                          onClick={() => kpis.reset()}
                          className="text-xs text-gray-500 hover:text-brand-500 transition"
                        >
                          Réinitialiser
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingKpis((v) => !v);
                          setAddKpiOpen(false);
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                      >
                        {editingKpis ? "Terminer" : "Personnaliser"}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-4 md:gap-6">
                    {kpis.keys.map((key, i) => {
                      const r = resolveKpi(key);
                      if (!r) return null;
                      return (
                        <div
                          key={key}
                          className={`col-span-12 sm:col-span-6 xl:col-span-3 ${
                            editingKpis ? "cursor-move" : ""
                          } ${dragIndex === i ? "opacity-50" : ""}`}
                          draggable={editingKpis}
                          onDragStart={() => setDragIndex(i)}
                          onDragOver={(e) => {
                            if (editingKpis) e.preventDefault();
                          }}
                          onDrop={() => {
                            if (dragIndex != null) kpis.move(dragIndex, i);
                            setDragIndex(null);
                          }}
                          onDragEnd={() => setDragIndex(null)}
                        >
                          <KpiCard
                            label={r.label}
                            value={r.value}
                            delta={r.delta}
                            pct={r.pct}
                            format={r.format}
                            editing={editingKpis}
                            onRemove={() => kpis.remove(key)}
                          />
                        </div>
                      );
                    })}

                    {editingKpis && (
                      <div className="col-span-12 sm:col-span-6 xl:col-span-3">
                        <div className="relative h-full">
                          <button
                            onClick={() => setAddKpiOpen((v) => !v)}
                            className="dropdown-toggle flex h-full min-h-[7rem] w-full items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-500 transition dark:border-gray-700"
                          >
                            + Ajouter un KPI
                          </button>
                          <Dropdown
                            isOpen={addKpiOpen}
                            onClose={() => setAddKpiOpen(false)}
                            className="left-0 w-64 p-1 max-h-72 overflow-y-auto"
                          >
                            {KPI_KEYS.filter((k) => !kpis.keys.includes(k)).map((k) => (
                              <DropdownItem
                                key={k}
                                onClick={() => {
                                  kpis.add(k);
                                  setAddKpiOpen(false);
                                }}
                              >
                                {KPI_CATALOG[k].label}
                              </DropdownItem>
                            ))}
                            {customKpis
                              .filter((m) => !kpis.keys.includes(`custom:${m.id}`))
                              .map((m) => (
                                <DropdownItem
                                  key={m.id}
                                  onClick={() => {
                                    kpis.add(`custom:${m.id}`);
                                    setAddKpiOpen(false);
                                  }}
                                >
                                  {m.name}
                                </DropdownItem>
                              ))}
                            <DropdownItem
                              className="text-brand-500 border-t border-gray-100 dark:border-gray-800 mt-1"
                              onClick={() => {
                                setAddKpiOpen(false);
                                setMetricModal({ open: true, kind: "kpi" });
                              }}
                            >
                              + Créer un KPI personnalisé…
                            </DropdownItem>
                          </Dropdown>
                        </div>
                      </div>
                    )}

                    {kpis.keys.length === 0 && !editingKpis && (
                      <div className="col-span-12">
                        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                          Aucun KPI affiché. Cliquez sur « Personnaliser » pour en ajouter.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Duplicate period warnings */}
                {timelineWarnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-yellow-800 dark:text-yellow-300"
                  >
                    <span className="flex-shrink-0">⚠</span>
                    <span>
                      Deux fichiers partagent la même période{" "}
                      <strong>
                        {periodLabel(w.period_year, w.period_month)}
                      </strong>{" "}
                      (upload #{w.upload_ids.join(", #")}). Modifiez la période d&apos;un des deux via le bouton Edit.
                    </span>
                  </div>
                ))}

                {uploads.length === 0 ? (
                  <ComponentCard title="Aucune donnée">
                    <div className="py-10 text-center">
                      <p className="text-gray-500 dark:text-gray-400 mb-4">
                        Aucune période pour cette société.
                      </p>
                      <button
                        onClick={openAddModal}
                        className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg transition"
                      >
                        + Ajouter la première période
                      </button>
                    </div>
                  </ComponentCard>
                ) : (
                  <>
                    {/* Trend chart + period comparison */}
                    <div className="grid grid-cols-12 gap-4 md:gap-6">
                      <div className="col-span-12 xl:col-span-8">
                        <ComponentCard title="Tendances">
                          {timeline.length < 2 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                              Ajoutez une 2ᵉ période pour afficher les tendances.
                            </p>
                          ) : (
                            <TimelineChart timeline={timeline} />
                          )}
                        </ComponentCard>
                      </div>
                      <div className="col-span-12 xl:col-span-4">
                        {timeline.length >= 2 ? (
                          <PeriodCompare companyId={companyId} timeline={timeline} />
                        ) : (
                          <ComponentCard title="Comparaison de périodes">
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                              Ajoutez une 2ᵉ période pour comparer.
                            </p>
                          </ComponentCard>
                        )}
                      </div>
                    </div>

                    {/* Financial ratios */}
                    {latestPeriod && (
                      <ComponentCard title="Ratios financiers">
                        <RatioAnalysis
                          companyId={companyId}
                          periodN={comparison?.period_b ?? latestPeriod}
                          periodN1={comparison?.period_a ?? null}
                          customRatios={customRatios}
                          onCreateCustom={() => setMetricModal({ open: true, kind: "ratio" })}
                        />
                      </ComponentCard>
                    )}

                    {/* Periods table */}
                    <ComponentCard
                      title="Périodes"
                      headerAction={
                        <button
                          onClick={openAddModal}
                          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg transition"
                        >
                          + Ajouter une période
                        </button>
                      }
                    >
                      <PeriodsTable
                        uploads={uploads}
                        timeline={timeline}
                        onEdit={openEditDrawer}
                        onRowClick={(u) => router.push(`/uploads/${u.id}/accounts`)}
                      />
                    </ComponentCard>

                    {/* Executive summary (bottom) */}
                    {latestPeriod && (
                      <ComponentCard title="Synthèse">
                        <ExecutiveSummary latest={latestPeriod} comparison={comparison} />
                      </ComponentCard>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add period (upload) modal */}
      <Modal
        isOpen={addModal.isOpen}
        onClose={handleCancelAdd}
        className="max-w-md"
        showBackdrop={true}
      >
        <div className="p-6 pt-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Upload File
          </h3>

          <div className="space-y-4">
            {addModal.error && (
              <Alert
                variant="error"
                title="Invalid File Type"
                message={addModal.error}
                showLink={false}
              />
            )}

            {/* Upload area / selected file */}
            {addModal.file ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 min-w-0">
                  <span className="font-medium">Original filename:</span>{" "}
                  <span className="break-all">{addModal.file.name}</span>
                </p>
                <label className="flex-shrink-0 text-xs text-brand-500 hover:text-brand-600 cursor-pointer underline">
                  Change
                  <input
                    type="file"
                    accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleAddFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-xl cursor-pointer hover:border-brand-500 transition text-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Drag &amp; drop a CSV or Excel file (.csv, .xls, .xlsx) or click to upload
                </span>
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleAddFileChange}
                  className="hidden"
                />
              </label>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Display Name (Optional)
              </label>
              <input
                type="text"
                value={addModal.displayName}
                onChange={(e) =>
                  setAddModal((prev) => ({ ...prev, displayName: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && addModal.file && addModal.progress === 0)
                    handleConfirmAdd();
                }}
                placeholder="Leave empty to use original filename"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Company (Optional)
              </label>
              <select
                value={addModal.companyId ?? ""}
                onChange={(e) =>
                  setAddModal((prev) => ({
                    ...prev,
                    companyId: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              >
                <option value="">— No company —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Year (Optional)
                </label>
                <select
                  value={addModal.periodYear ?? ""}
                  onChange={(e) =>
                    setAddModal((prev) => ({
                      ...prev,
                      periodYear: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Year —</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Month (Optional)
                </label>
                <select
                  value={addModal.periodMonth ?? ""}
                  onChange={(e) =>
                    setAddModal((prev) => ({
                      ...prev,
                      periodMonth: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Month —</option>
                  {MONTHS_FULL.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancelAdd}
                disabled={addModal.progress > 0}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={!addModal.file || addModal.progress > 0}
                className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addModal.progress > 0 ? `Uploading... ${addModal.progress}%` : "Upload"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Metadata edit modal */}
      <Modal
        isOpen={editDrawer.isOpen}
        onClose={() => setEditDrawer((prev) => ({ ...prev, isOpen: false }))}
        className="max-w-md"
        showBackdrop={true}
      >
        <div className="p-6 pt-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Edit period metadata
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {editDrawer.upload?.display_filename || editDrawer.upload?.filename}
          </p>

          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Year
                </label>
                <select
                  value={editDrawer.periodYear ?? ""}
                  onChange={(e) =>
                    setEditDrawer((prev) => ({
                      ...prev,
                      periodYear: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Year —</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Month
                </label>
                <select
                  value={editDrawer.periodMonth ?? ""}
                  onChange={(e) =>
                    setEditDrawer((prev) => ({
                      ...prev,
                      periodMonth: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Month —</option>
                  {MONTHS_FULL.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditDrawer((prev) => ({ ...prev, isOpen: false }))}
                disabled={editDrawer.saving}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMetadata}
                disabled={editDrawer.saving}
                className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition disabled:opacity-50"
              >
                {editDrawer.saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Custom KPI / ratio builder */}
      <CustomMetricModal
        isOpen={metricModal.open}
        onClose={() => setMetricModal((m) => ({ ...m, open: false }))}
        defaultKind={metricModal.kind}
        latestPeriod={latestPeriod}
        onSubmit={async (body) => {
          const created = await customMetrics.create(body);
          if (created.kind === "kpi") kpis.add(`custom:${created.id}`);
          // ratio selection is managed inside RatioAnalysis (its own hook); the new
          // ratio appears in its add-menu. KPIs are added here so they show immediately.
        }}
      />
    </AuthGuard>
  );
}
