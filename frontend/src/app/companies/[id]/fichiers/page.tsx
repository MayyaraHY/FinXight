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
import { Company, TimelinePeriod, TimelineWarning } from "@/models/Company";
import { Upload } from "@/models/Upload";
import { getCompany, getCompanies, getTimeline } from "@/services/companyService";
import {
  getUploads,
  patchUploadMetadata,
  uploadAndParseWithProgress,
} from "@/services/UploadService";
import { periodLabel } from "@/lib/periodLabel";
import Badge from "@/components/ui/badge/Badge";
import PeriodsTable from "@/components/companies/PeriodsTable";

const MONTHS_FULL = [
  { value: 1, label: "Janvier" },
  { value: 2, label: "Février" },
  { value: 3, label: "Mars" },
  { value: 4, label: "Avril" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Juin" },
  { value: 7, label: "Juillet" },
  { value: 8, label: "Août" },
  { value: 9, label: "Septembre" },
  { value: 10, label: "Octobre" },
  { value: 11, label: "Novembre" },
  { value: 12, label: "Décembre" },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2014 }, (_, i) => CURRENT_YEAR - i);

export default function CompanyFichiersPage() {
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

  const [addModal, setAddModal] = useState<{
    isOpen: boolean;
    file: File | null;
    displayName: string;
    companyId: number | null;
    periodYear: number | null;
    periodMonth: number | null;
    progress: number;
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
    } catch {
      setError("Échec du chargement des données de la société");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    getCompanies().then(setCompanies).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

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
    e.target.value = "";
    if (!isValidFileType(file)) {
      setAddModal((prev) => ({
        ...prev,
        file: null,
        error: `Type de fichier invalide « ${file.name} ». Veuillez téléverser uniquement des fichiers CSV ou Excel (.csv, .xls, .xlsx).`,
      }));
      return;
    }
    setAddModal((prev) => ({ ...prev, file, error: null }));
  };

  const handleConfirmAdd = async () => {
    if (!addModal.file) return;
    const displayName = addModal.displayName.trim() || undefined;
    try {
      const result = await uploadAndParseWithProgress(
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
      // Take the user straight to the parsed accounts of the new upload.
      router.push(`/uploads/${result.upload_id}/accounts`);
    } catch (err) {
      setAddModal((prev) => ({
        ...prev,
        progress: 0,
        error: err instanceof Error ? err.message : "Échec du téléversement",
      }));
    }
  };

  const handleCancelAdd = () => {
    setAddModal((prev) => ({ ...prev, isOpen: false, progress: 0 }));
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
      setError("Échec de l'enregistrement des métadonnées");
      setEditDrawer((prev) => ({ ...prev, saving: false }));
    }
  };

  const latestPeriod = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  const navTabs = [
    { label: "Tableau de bord", href: `/companies/${companyId}` },
    { label: "États financiers", href: `/companies/${companyId}/statements` },
    { label: "Comparaison des périodes", href: `/companies/${companyId}/period` },
    { label: "Synthèse", href: `/companies/${companyId}/synthese` },
    { label: "Fichiers", href: `/companies/${companyId}/fichiers` },
  ];

  return (
    <AuthGuard>
      <div className="min-h-screen xl:flex">
        <AppSidebar />
        <Backdrop />
        <div className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
          <AppHeader />
          <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
            <div className="flex flex-wrap items-center gap-3 mb-4">
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

            {/* Nav tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
              {navTabs.map((tab) => (
                <button
                  key={tab.href}
                  onClick={() => router.push(tab.href)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition -mb-px border-b-2 ${
                    tab.href === `/companies/${companyId}/fichiers`
                      ? "border-brand-500 text-brand-600 dark:text-brand-400"
                      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-4">
                <Alert variant="error" title="Erreur" message={error} showLink={false} />
              </div>
            )}

            {loading ? (
              <div className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />
            ) : (
              <div className="space-y-6">
                {timelineWarnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-yellow-800 dark:text-yellow-300"
                  >
                    <span className="flex-shrink-0">⚠</span>
                    <span>
                      Deux fichiers partagent la même période{" "}
                      <strong>{periodLabel(w.period_year, w.period_month)}</strong>{" "}
                      (upload #{w.upload_ids.join(", #")}). Modifiez la période d&apos;un des deux via le bouton Edit.
                    </span>
                  </div>
                ))}

                {uploads.length === 0 ? (
                  <ComponentCard title="Aucun fichier">
                    <div className="py-10 text-center">
                      <p className="text-gray-500 dark:text-gray-400 mb-4">
                        Aucun fichier chargé pour cette société.
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
                  <ComponentCard
                    title="Fichiers"
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
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add period modal */}
      <Modal isOpen={addModal.isOpen} onClose={handleCancelAdd} className="max-w-md" showBackdrop={true}>
        <div className="p-6 pt-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Téléverser un fichier</h3>
          <div className="space-y-4">
            {addModal.error && (
              <Alert variant="error" title="Type de fichier invalide" message={addModal.error} showLink={false} />
            )}
            {addModal.file ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 min-w-0">
                  <span className="font-medium">Nom du fichier d&apos;origine :</span>{" "}
                  <span className="break-all">{addModal.file.name}</span>
                </p>
                <label className="flex-shrink-0 text-xs text-brand-500 hover:text-brand-600 cursor-pointer underline">
                  Changer
                  <input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleAddFileChange} className="hidden" />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-xl cursor-pointer hover:border-brand-500 transition text-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Glissez-déposez un fichier CSV ou Excel (.csv, .xls, .xlsx) ou cliquez pour téléverser
                </span>
                <input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleAddFileChange} className="hidden" />
              </label>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nom affiché (facultatif)</label>
              <input
                type="text"
                value={addModal.displayName}
                onChange={(e) => setAddModal((prev) => ({ ...prev, displayName: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter" && addModal.file && addModal.progress === 0) handleConfirmAdd(); }}
                placeholder="Laisser vide pour utiliser le nom d'origine"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Société (facultatif)</label>
              <select
                value={addModal.companyId ?? ""}
                onChange={(e) => setAddModal((prev) => ({ ...prev, companyId: e.target.value ? Number(e.target.value) : null }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              >
                <option value="">— Aucune société —</option>
                {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Année (facultatif)</label>
                <select
                  value={addModal.periodYear ?? ""}
                  onChange={(e) => setAddModal((prev) => ({ ...prev, periodYear: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Année —</option>
                  {YEARS.map((y) => (<option key={y} value={y}>{y}</option>))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mois (facultatif)</label>
                <select
                  value={addModal.periodMonth ?? ""}
                  onChange={(e) => setAddModal((prev) => ({ ...prev, periodMonth: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Mois —</option>
                  {MONTHS_FULL.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleCancelAdd} disabled={addModal.progress > 0} className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
                Annuler
              </button>
              <button onClick={handleConfirmAdd} disabled={!addModal.file || addModal.progress > 0} className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
                {addModal.progress > 0 ? `Téléversement... ${addModal.progress}%` : "Téléverser"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Metadata edit modal */}
      <Modal isOpen={editDrawer.isOpen} onClose={() => setEditDrawer((prev) => ({ ...prev, isOpen: false }))} className="max-w-md" showBackdrop={true}>
        <div className="p-6 pt-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Modifier les métadonnées de la période</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {editDrawer.upload?.display_filename || editDrawer.upload?.filename}
          </p>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Année</label>
                <select
                  value={editDrawer.periodYear ?? ""}
                  onChange={(e) => setEditDrawer((prev) => ({ ...prev, periodYear: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Année —</option>
                  {YEARS.map((y) => (<option key={y} value={y}>{y}</option>))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mois</label>
                <select
                  value={editDrawer.periodMonth ?? ""}
                  onChange={(e) => setEditDrawer((prev) => ({ ...prev, periodMonth: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Mois —</option>
                  {MONTHS_FULL.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditDrawer((prev) => ({ ...prev, isOpen: false }))} disabled={editDrawer.saving} className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50">
                Annuler
              </button>
              <button onClick={handleSaveMetadata} disabled={editDrawer.saving} className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition disabled:opacity-50">
                {editDrawer.saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </AuthGuard>
  );
}
