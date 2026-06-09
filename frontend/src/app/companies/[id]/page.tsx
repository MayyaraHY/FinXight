"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { useSidebar } from "@/context/SidebarContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import { Modal } from "@/components/ui/modal";
import Alert from "@/components/ui/alert/Alert";
import { Company, TimelinePeriod } from "@/models/Company";
import { Upload } from "@/models/Upload";
import { getCompany, getTimeline } from "@/services/companyService";
import { getUploads, patchUploadMetadata } from "@/services/UploadService";

const MONTHS_SHORT = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

function fmt(val: number | null | undefined): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(val);
}

function SummaryCard({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(value)}</p>
    </div>
  );
}

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
  const [timeline, setTimeline] = useState<TimelinePeriod[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Metadata edit drawer
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
      const [comp, tl, allUploads] = await Promise.all([
        getCompany(companyId),
        getTimeline(companyId),
        getUploads(),
      ]);
      setCompany(comp);
      setTimeline(tl);
      setUploads(allUploads.filter((u: Upload) => u.company_id === companyId));
      setError(null);
    } catch {
      setError("Failed to load company data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const latestPeriod = timeline.length > 0 ? timeline[timeline.length - 1] : null;

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
            {/* Breadcrumb + back */}
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => router.push("/companies")}
                className="text-sm text-gray-500 hover:text-brand-500 transition"
              >
                ← Companies
              </button>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {company?.name ?? "…"}
              </h1>
            </div>

            {error && (
              <div className="mb-4">
                <Alert variant="error" title="Error" message={error} showLink={false} />
              </div>
            )}

            {loading ? (
              <p className="text-gray-500 dark:text-gray-400 py-12 text-center">Loading…</p>
            ) : (
              <div className="space-y-6">
                {/* Summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <SummaryCard label="Total Actif" value={latestPeriod?.total_actif} />
                  <SummaryCard label="Total Passif" value={latestPeriod?.total_passif} />
                  <SummaryCard label="Capitaux propres" value={latestPeriod?.capitaux_propres} />
                  <SummaryCard label="Résultat net" value={latestPeriod?.resultat_net} />
                </div>

                {latestPeriod && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Summary from latest period:{" "}
                    {latestPeriod.period_year
                      ? `${latestPeriod.period_year}${latestPeriod.period_month ? ` · ${MONTHS_SHORT[latestPeriod.period_month]}` : ""}`
                      : latestPeriod.display_filename}
                  </p>
                )}

                {/* Uploads table */}
                <ComponentCard
                  title="Periods"
                  headerAction={
                    <button
                      onClick={() => router.push(`/uploads?add=1&company_id=${companyId}`)}
                      className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg transition"
                    >
                      + Add period
                    </button>
                  }
                >
                  {uploads.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 py-8 text-center">
                      No uploads for this company yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                            <th className="pb-3 font-medium">File</th>
                            <th className="pb-3 font-medium">Year</th>
                            <th className="pb-3 font-medium">Month</th>
                            <th className="pb-3 font-medium">Status</th>
                            <th className="pb-3 font-medium">Bilan</th>
                            <th className="pb-3 font-medium">CR</th>
                            <th className="pb-3 font-medium"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {uploads.map((u) => {
                            const period = timeline.find((t) => t.upload_id === u.id);
                            return (
                              <tr
                                key={u.id}
                                onClick={() => router.push(`/uploads/${u.id}/accounts`)}
                                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                              >
                                <td className="py-3 pr-4 font-medium text-gray-900 dark:text-white">
                                  {u.display_filename || u.filename}
                                </td>
                                <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                                  {u.period_year ?? "—"}
                                </td>
                                <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                                  {u.period_month ? MONTHS_SHORT[u.period_month] : "—"}
                                </td>
                                <td className="py-3 pr-4">
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                    {u.status}
                                  </span>
                                </td>
                                <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                                  {period?.has_bilan ? (
                                    <span className="text-success-500">✓</span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                                  {period?.has_cr ? (
                                    <span className="text-success-500">✓</span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="py-3 text-right">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditDrawer(u);
                                    }}
                                    className="px-2 py-1 text-xs text-gray-500 hover:text-brand-500 border border-gray-200 dark:border-gray-700 rounded transition"
                                  >
                                    Edit
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </ComponentCard>
              </div>
            )}
          </div>
        </div>
      </div>

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
    </AuthGuard>
  );
}
