"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { useSidebar } from "@/context/SidebarContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import { Modal } from "@/components/ui/modal";
import Alert from "@/components/ui/alert/Alert";
import { Company } from "@/models/Company";
import {
  createCompany,
  deleteCompany,
  getCompanies,
  getCompanyStatus,
} from "@/services/companyService";
import { useLastCompany } from "@/hooks/useLastCompany";
import { issueCount, type StatusState } from "@/lib/companyStatus";
import StatusBadge from "@/components/companies/StatusBadge";

export default function CompaniesPage() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const router = useRouter();
  const { clear: clearLastCompany, get: getLastCompany } = useLastCompany();

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  const [companies, setCompanies] = useState<Company[]>([]);
  const [statuses, setStatuses] = useState<Record<number, StatusState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newModal, setNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    company: Company | null;
  }>({ isOpen: false, company: null });
  const [deleting, setDeleting] = useState(false);

  const loadStatuses = (list: Company[]) => {
    // Mark all as loading, then resolve each independently so one slow/failed
    // company never blocks the rest of the grid.
    setStatuses(Object.fromEntries(list.map((c) => [c.id, undefined])));
    list.forEach((c) => {
      getCompanyStatus(c.id)
        .then((s) => setStatuses((prev) => ({ ...prev, [c.id]: s })))
        .catch(() => setStatuses((prev) => ({ ...prev, [c.id]: null })));
    });
  };

  const fetchCompanies = async () => {
    try {
      const data = await getCompanies();
      setCompanies(data);
      setError(null);
      loadStatuses(data);
    } catch {
      setError("Échec du chargement des sociétés");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createCompany(name);
      setNewName("");
      setNewModal(false);
      await fetchCompanies();
    } catch {
      setError("Échec de la création de la société");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.company) return;
    const deletedId = deleteConfirm.company.id;
    setDeleting(true);
    try {
      await deleteCompany(deletedId);
      // If the deleted company was the "last opened" one, forget it so the
      // landing router doesn't try to reopen a company that no longer exists.
      if (getLastCompany() === deletedId) clearLastCompany();
      setDeleteConfirm({ isOpen: false, company: null });
      await fetchCompanies();
    } catch {
      setError("Échec de la suppression de la société");
    } finally {
      setDeleting(false);
    }
  };

  // Companies with unresolved issues, for the notification strip.
  const flagged = companies.filter((c) => {
    const s = statuses[c.id];
    return s && issueCount(s) > 0;
  });

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
            <PageBreadcrumb pageTitle="Sociétés" />

            {/* Notification strip */}
            {!loading && flagged.length > 0 && (
              <div className="mb-4">
                <Alert
                  variant="warning"
                  title="Attention requise"
                  message={`${flagged.length} société${flagged.length !== 1 ? "s ont" : " a"} des problèmes non résolus.`}
                  showLink={false}
                />
              </div>
            )}

            <div className="space-y-6">
              <ComponentCard
                title="Sociétés"
                headerAction={
                  <button
                    onClick={() => setNewModal(true)}
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg transition"
                  >
                    + Nouvelle société
                  </button>
                }
              >
                {error && (
                  <div className="mb-4">
                    <Alert variant="error" title="Erreur" message={error} showLink={false} />
                  </div>
                )}

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-28 animate-pulse rounded-lg bg-gray-100 dark:bg-white/5"
                      />
                    ))}
                  </div>
                ) : companies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <svg
                      className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                    <p className="text-gray-500 dark:text-gray-400">
                      Aucune société pour l&apos;instant. Créez-en une pour organiser vos fichiers.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {companies.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => router.push(`/companies/${c.id}`)}
                        className="flex flex-col p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg hover:border-brand-500 dark:hover:border-brand-500 transition-all bg-white dark:bg-gray-800 cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                              {c.name}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {c.upload_count} fichier{c.upload_count !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ isOpen: true, company: c });
                            }}
                            className="ml-2 p-2 text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20 rounded-lg transition"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-9l-1 1H5v2h14V4z" />
                            </svg>
                          </button>
                        </div>
                        <div className="mt-3">
                          <StatusBadge status={statuses[c.id]} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ComponentCard>
            </div>
          </div>
        </div>
      </div>

      {/* New company modal */}
      <Modal isOpen={newModal} onClose={() => setNewModal(false)} className="max-w-md">
        <div className="p-6 pt-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Nouvelle société
          </h3>
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !creating) handleCreate();
            }}
            placeholder="Nom de la société"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white mb-4"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setNewModal(false)}
              disabled={creating}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition disabled:opacity-50"
            >
              {creating ? "Création…" : "Créer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, company: null })}
        className="max-w-sm"
        showBackdrop={true}
      >
        <div className="p-4">
          <Alert
            variant="error"
            title="Supprimer la société ?"
            message={`« ${deleteConfirm.company?.name} » contient ${deleteConfirm.company?.upload_count} fichier${
              deleteConfirm.company?.upload_count !== 1 ? "s" : ""
            } qui seront également supprimés définitivement.`}
            showLink={false}
          />
          <div className="mt-4 flex gap-2 justify-end">
            <button
              onClick={() => setDeleteConfirm({ isOpen: false, company: null })}
              disabled={deleting}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 bg-error-500 hover:bg-error-600 text-white rounded-lg transition disabled:opacity-50"
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </button>
          </div>
        </div>
      </Modal>
    </AuthGuard>
  );
}
