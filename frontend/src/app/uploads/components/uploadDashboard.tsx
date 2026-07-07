"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Modal } from "@/components/ui/modal";
import Alert from "@/components/ui/alert/Alert";
import { getCompanies } from "@/services/companyService";
import { Company } from "@/models/Company";

import { useUploads } from "../hooks/useUploads";

type SortOrder = "newest" | "oldest";
type ViewMode = "card" | "table";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2014 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = [
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

export default function UploadDashboard({ defaultCompanyId }: { defaultCompanyId?: number }) {
  const router = useRouter();
  const {
    uploads,
    uploadParse,
    uploadProgress,
    patch,
    remove,
  } = useUploads();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState<number | "">("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; fileId: number | null; fileName: string }>({
    isOpen: false,
    fileId: null,
    fileName: "",
  });

  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    uploadId: number | null;
    displayName: string;
    companyId: number | null;
    periodYear: number | null;
    periodMonth: number | null;
  }>({
    isOpen: false,
    uploadId: null,
    displayName: "",
    companyId: null,
    periodYear: null,
    periodMonth: null,
  });

  const [fileError, setFileError] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: "",
  });

  const [displayNameInput, setDisplayNameInput] = useState<{
    isOpen: boolean;
    file: File | null;
    displayName: string;
    companyId: number | null;
    periodYear: number | null;
    periodMonth: number | null;
  }>({
    isOpen: false,
    file: null,
    displayName: "",
    companyId: defaultCompanyId ?? null,
    periodYear: null,
    periodMonth: null,
  });

  // Tracks the name of the file currently being uploaded so the ghost card can display it.
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);

  useEffect(() => {
    getCompanies().then(setCompanies).catch(() => {});
  }, []);

  // When defaultCompanyId is provided (from URL ?company_id=X), pre-select it in the modal
  useEffect(() => {
    if (defaultCompanyId) {
      setDisplayNameInput((prev) => ({ ...prev, companyId: defaultCompanyId }));
    }
  }, [defaultCompanyId]);

  const filteredUploads = useMemo(() => {
    let result = [...uploads];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          (u.display_filename || u.filename).toLowerCase().includes(q) ||
          u.filename.toLowerCase().includes(q)
      );
    }

    if (filterCompanyId !== "") {
      result = result.filter((u) => u.company_id === filterCompanyId);
    }

    // uploads from useUploads are already newest-first; reverse for oldest-first
    if (sortOrder === "oldest") {
      result = result.slice().reverse();
    }

    return result;
  }, [uploads, searchQuery, filterCompanyId, sortOrder]);

  // Validate file type - only CSV and Excel files allowed
  const isValidFileType = (file: File): boolean => {
    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    const validExtensions = [".csv", ".xls", ".xlsx"];

    // Check by MIME type
    if (validTypes.includes(file.type)) return true;

    // Check by file extension
    const fileName = file.name.toLowerCase();
    return validExtensions.some((ext) => fileName.endsWith(ext));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    const file = e.target.files[0];

    if (!isValidFileType(file)) {
      setFileError({
        isOpen: true,
        message: `Type de fichier invalide "${file.name}". Veuillez importer uniquement des fichiers CSV ou Excel (.csv, .xls, .xlsx).`,
      });
      // Reset input
      e.target.value = "";
      return;
    }

    // File is valid, show display name input
    setFileError({ isOpen: false, message: "" });
    setDisplayNameInput((prev) => ({ ...prev, isOpen: true, file, displayName: "" }));
  };

  const handleConfirmUpload = async () => {
    if (displayNameInput.file) {
      const displayName = displayNameInput.displayName.trim() || undefined;
      setUploadingFileName(displayName || displayNameInput.file.name);
      setDisplayNameInput({ isOpen: false, file: null, displayName: "", companyId: defaultCompanyId ?? null, periodYear: null, periodMonth: null });
      await uploadParse(displayNameInput.file, {
        displayName,
        companyId: displayNameInput.companyId,
        periodYear: displayNameInput.periodYear,
        periodMonth: displayNameInput.periodMonth,
      });
      setUploadingFileName(null);
    }
  };

  const handleCancelUpload = () => {
    setDisplayNameInput({ isOpen: false, file: null, displayName: "", companyId: defaultCompanyId ?? null, periodYear: null, periodMonth: null });
  };

  const handleDeleteClick = (fileId: number, fileName: string) => {
    setDeleteConfirm({ isOpen: true, fileId, fileName });
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirm.fileId !== null) {
      await remove(deleteConfirm.fileId);
      setDeleteConfirm({ isOpen: false, fileId: null, fileName: "" });
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirm({ isOpen: false, fileId: null, fileName: "" });
  };

  const handleEditClick = (u: { id: number; display_filename?: string; filename: string; company_id?: number | null; period_year?: number | null; period_month?: number | null }, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditModal({
      isOpen: true,
      uploadId: u.id,
      displayName: u.display_filename || u.filename,
      companyId: u.company_id ?? null,
      periodYear: u.period_year ?? null,
      periodMonth: u.period_month ?? null,
    });
  };

  const handleConfirmEdit = async () => {
    if (editModal.uploadId === null) return;
    await patch(editModal.uploadId, {
      display_filename: editModal.displayName.trim() || null,
      company_id: editModal.companyId,
      period_year: editModal.periodYear,
      period_month: editModal.periodMonth,
    });
    setEditModal({ isOpen: false, uploadId: null, displayName: "", companyId: null, periodYear: null, periodMonth: null });
  };

  const handleCancelEdit = () => {
    setEditModal({ isOpen: false, uploadId: null, displayName: "", companyId: null, periodYear: null, periodMonth: null });
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Imports" />

      <div className="space-y-6">

        {/* Upload Section */}
        <ComponentCard title="Importer des fichiers">
          <div className="space-y-4">

        {/* File Error Alert */}
        {fileError.isOpen && (
          <div className="mb-4">
            <Alert
              variant="error"
              title="Type de fichier invalide"
              message={fileError.message}
              showLink={false}
            />
          </div>
        )}

        {/* Display Name Modal */}
        <Modal
          isOpen={displayNameInput.isOpen}
          onClose={handleCancelUpload}
          className="max-w-md"
          showBackdrop={true}
        >
          <div className="p-6 pt-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Importer un fichier
            </h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span className="font-medium">Nom du fichier original :</span> {displayNameInput.file?.name}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nom d'affichage (facultatif)
                </label>
                <input
                  type="text"
                  autoFocus
                  value={displayNameInput.displayName}
                  onChange={(e) =>
                    setDisplayNameInput({ ...displayNameInput, displayName: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && uploadProgress === 0) handleConfirmUpload();
                  }}
                  placeholder="Laisser vide pour utiliser le nom d'origine"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Société (facultatif)
                </label>
                <select
                  value={displayNameInput.companyId ?? ""}
                  onChange={(e) =>
                    setDisplayNameInput({
                      ...displayNameInput,
                      companyId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Aucune société —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Année (facultatif)
                  </label>
                  <select
                    value={displayNameInput.periodYear ?? ""}
                    onChange={(e) =>
                      setDisplayNameInput({
                        ...displayNameInput,
                        periodYear: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  >
                    <option value="">— Année —</option>
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mois (facultatif)
                  </label>
                  <select
                    value={displayNameInput.periodMonth ?? ""}
                    onChange={(e) =>
                      setDisplayNameInput({
                        ...displayNameInput,
                        periodMonth: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  >
                    <option value="">— Mois —</option>
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCancelUpload}
                  disabled={uploadProgress > 0}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmUpload}
                  disabled={uploadProgress > 0}
                  className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadProgress > 0 ? `Importation... ${uploadProgress}%` : "Importer"}
                </button>
              </div>
            </div>
          </div>
        </Modal>

        {/* Dropzone */}
            <label className="flex flex-col items-center justify-center w-full p-10 border-2 border-dashed rounded-xl cursor-pointer hover:border-brand-500 transition">
              <span className="text-gray-600 dark:text-gray-400">
                Glissez-déposez des fichiers CSV ou Excel (.csv, .xls, .xlsx) ou cliquez pour importer
              </span>
              <input
                type="file"
                accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

          </div>
        </ComponentCard>

        {/* Cards / Table Section */}
        <ComponentCard title="Fichiers importés">

          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 mb-5">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input
                type="text"
                placeholder="Rechercher des fichiers…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Company filter */}
            <select
              value={filterCompanyId}
              onChange={(e) => setFilterCompanyId(e.target.value === "" ? "" : Number(e.target.value))}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-brand-500"
            >
              <option value="">Toutes les sociétés</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Sort order */}
            <button
              onClick={() => setSortOrder((s) => s === "newest" ? "oldest" : "newest")}
              title={sortOrder === "newest" ? "Tri : plus récent d'abord" : "Tri : plus ancien d'abord"}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L4 7m3-3l3 3M17 8v12m0 0l3-3m-3 3l-3-3" />
              </svg>
              <span className="text-xs font-medium">
                {sortOrder === "newest" ? "Récent" : "Ancien"}
              </span>
            </button>

            {/* View toggle */}
            <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("card")}
                title="Vue en cartes"
                className={`px-3 py-2 transition ${viewMode === "card" ? "bg-brand-500 text-white" : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("table")}
                title="Vue en tableau"
                className={`px-3 py-2 transition ${viewMode === "table" ? "bg-brand-500 text-white" : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 4v16M3 6a1 1 0 011-1h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6z" />
                </svg>
              </button>
            </div>
          </div>

          {uploads.length === 0 && uploadProgress === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500 dark:text-gray-400 text-center">Aucun fichier importé. Importez un fichier CSV ou Excel pour commencer.</p>
            </div>
          ) : filteredUploads.length === 0 && uploadProgress === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-gray-500 dark:text-gray-400 text-center">Aucun fichier ne correspond aux filtres.</p>
            </div>
          ) : viewMode === "card" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Ghost card */}
              {uploadProgress > 0 && (
                <div className="flex flex-col p-4 border-2 border-dashed border-brand-300 dark:border-brand-700 rounded-lg bg-brand-50/40 dark:bg-brand-900/10">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm">
                        {uploadingFileName ?? "Importation…"}
                      </h3>
                      <p className="text-xs text-brand-500 dark:text-brand-400 mt-1">
                        Importation &amp; analyse…
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 ml-2 flex-shrink-0">
                      {uploadProgress}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {filteredUploads.map((u) => (
                <div
                  key={u.id}
                  onClick={() => router.push(`/uploads/${u.id}/accounts`)}
                  className="flex flex-col p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg hover:border-brand-500 dark:hover:border-brand-500 transition-all bg-white dark:bg-gray-800 cursor-pointer relative"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm" title={u.display_filename || u.filename}>
                        {u.display_filename || u.filename}
                      </h3>
                      {u.display_filename && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate" title={u.filename}>
                          ({u.filename})
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(u.created_at).toLocaleDateString()}
                      </p>
                      {u.company_id && (
                        <p className="text-xs text-brand-500 dark:text-brand-400 mt-0.5">
                          {companies.find((c) => c.id === u.company_id)?.name ?? `Société #${u.company_id}`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto flex justify-end gap-2 pt-4">
                    <button
                      onClick={(e) => handleEditClick(u, e)}
                      className="flex items-center justify-center w-8 h-8 bg-warning-500 hover:bg-warning-600 text-white rounded-lg transition"
                      title="Modifier"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.5-9.5a2 2 0 012.828 0l.672.672a2 2 0 010 2.828L9 13z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(u.id, u.filename);
                      }}
                      className="flex items-center justify-center w-8 h-8 bg-error-500 hover:bg-error-600 text-white rounded-lg transition"
                      title="Supprimer"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-9l-1 1H5v2h14V4z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Table view */
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/[0.05]">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50 dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nom</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Société</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Période</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Statut</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {uploadProgress > 0 && (
                    <tr>
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                        {uploadingFileName ?? "Importation…"}
                      </td>
                      <td colSpan={4} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-500 transition-all duration-300 rounded-full" style={{ width: `${uploadProgress}%` }} />
                          </div>
                          <span className="text-xs text-brand-500 font-semibold">{uploadProgress}%</span>
                        </div>
                      </td>
                      <td />
                    </tr>
                  )}
                  {filteredUploads.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => router.push(`/uploads/${u.id}/accounts`)}
                      className="hover:bg-gray-50 dark:hover:bg-white/[0.02] cursor-pointer transition"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-white" title={u.display_filename || u.filename}>
                          {u.display_filename || u.filename}
                        </span>
                        {u.display_filename && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{u.filename}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {u.company_id
                          ? companies.find((c) => c.id === u.company_id)?.name ?? `#${u.company_id}`
                          : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {u.period_year || u.period_month
                          ? [u.period_year, u.period_month ? MONTHS.find(m => m.value === u.period_month)?.label : null].filter(Boolean).join(" / ")
                          : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-1 rounded-full text-xs bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400">
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => handleEditClick(u, e)}
                            className="flex items-center justify-center w-8 h-8 bg-warning-500 hover:bg-warning-600 text-white rounded-lg transition"
                            title="Modifier"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.5-9.5a2 2 0 012.828 0l.672.672a2 2 0 010 2.828L9 13z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(u.id, u.filename);
                            }}
                            className="flex items-center justify-center w-8 h-8 bg-error-500 hover:bg-error-600 text-white rounded-lg transition"
                            title="Supprimer"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-9l-1 1H5v2h14V4z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ComponentCard>

      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={editModal.isOpen}
        onClose={handleCancelEdit}
        className="max-w-md"
        showBackdrop={true}
      >
        <div className="p-6 pt-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Modifier le fichier
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nom d'affichage
              </label>
              <input
                type="text"
                autoFocus
                value={editModal.displayName}
                onChange={(e) => setEditModal({ ...editModal, displayName: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirmEdit(); }}
                placeholder="Nom d'affichage"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Société
              </label>
              <select
                value={editModal.companyId ?? ""}
                onChange={(e) => setEditModal({ ...editModal, companyId: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              >
                <option value="">— Aucune société —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Année
                </label>
                <select
                  value={editModal.periodYear ?? ""}
                  onChange={(e) => setEditModal({ ...editModal, periodYear: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Année —</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Mois
                </label>
                <select
                  value={editModal.periodMonth ?? ""}
                  onChange={(e) => setEditModal({ ...editModal, periodMonth: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  <option value="">— Mois —</option>
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancelEdit}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmEdit}
                className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={handleCancelDelete}
        className="max-w-sm"
        showBackdrop={true}
      >
        <div className="p-4">
          <Alert
            variant="error"
            title="Supprimer le fichier ?"
            message={`Êtes-vous sûr de vouloir supprimer "${deleteConfirm.fileName}" ? Cette action est irréversible.`}
            showLink={false}
          />
          <div className="mt-4 flex gap-2 justify-end">
            <button
              onClick={handleCancelDelete}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-4 py-2 bg-error-500 hover:bg-error-600 text-white rounded-lg transition"
            >
              Supprimer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}