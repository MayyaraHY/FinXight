"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import DismissControls from "@/components/warnings/DismissControls";
import { useDismissibleWarnings } from "@/hooks/useDismissibleWarnings";

import { getAccountsByUpload, updateAccount, deleteAccount } from "@/services/accountService";
import { getBilan } from "@/services/bilanService";
import { getUpload } from "@/services/UploadService";
import { getValidationReport, runValidation, ValidationLine } from "@/services/validationService";
import { Account } from "@/models/account";
import { Upload } from "@/models/Upload";
import { formatCurrency } from "@/utils/formatters";

// ===== RECONCILIATION TYPES (from bilan data_quality) =====

type ReconStatus = "ok" | "discrepancy" | "unmapped" | "compte_resultat";

interface ReconLine {
  code: string;
  label: string | null;
  category: string | null;
  source_rubrique: string | null;
  status: ReconStatus;
  warning: string | null;
}

type ReconMap = Map<string, ReconLine>;

// ===== STATUS FILTER =====

type StatusFilter = "all" | "ok" | "discrepancy" | "unmapped" | "compte_resultat";

// ===== STATUS BADGE =====

function StatusBadge({ status, warning }: { status: ReconStatus; warning: string | null }) {
  const config: Record<ReconStatus, { label: string; cls: string }> = {
    ok: {
      label: "OK",
      cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
    },
    discrepancy: {
      label: "Incohérence",
      cls: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
    },
    unmapped: {
      label: "Non répertorié",
      cls: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
    },
    compte_resultat: {
      label: "Compte résultat",
      cls: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    },
  };

  const { label, cls } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${cls} ${
        warning ? "cursor-help" : ""
      }`}
      title={warning ?? undefined}
    >
      {status === "discrepancy" && (
        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      )}
      {status === "unmapped" && (
        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
      )}
      {status === "ok" && (
        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
      {status === "compte_resultat" && (
        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 1h6v1H7V5zm0 3h6v1H7V8zm0 3h4v1H7v-1z" clipRule="evenodd" />
        </svg>
      )}
      {label}
    </span>
  );
}

// ===== ROW BG BY STATUS =====

function rowBg(status: ReconStatus | undefined): string {
  if (status === "discrepancy")
    return "bg-error-50/30 dark:bg-error-500/5 hover:bg-error-50/60 dark:hover:bg-error-500/10";
  if (status === "unmapped")
    return "bg-warning-50/30 dark:bg-warning-500/5 hover:bg-warning-50/60 dark:hover:bg-warning-500/10";
  if (status === "compte_resultat")
    return "bg-blue-50/20 dark:bg-blue-500/5 hover:bg-blue-50/40 dark:hover:bg-blue-500/10";
  return "hover:bg-gray-50 dark:hover:bg-gray-800";
}

// ===== PAGE =====

export default function UploadDetailsPage() {
  const params = useParams();
  const uploadId = Number(params.id);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [reconMap, setReconMap] = useState<ReconMap>(new Map());
  const [hasRecon, setHasRecon] = useState(false);   // bilan data_quality available
  // Map of account_code → ValidationLine for codes flagged invalid by PCGT check
  const [invalidMap, setInvalidMap] = useState<Map<string, ValidationLine>>(new Map());
  const [validationStatus, setValidationStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 🔍 Filters
  const [search, setSearch] = useState("");
  const [prefix, setPrefix] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const warnings = useDismissibleWarnings(`accounts:${uploadId}`);

  // ✏️ EDIT & DELETE
  const [editingCell, setEditingCell] = useState<{ accountId: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [contextMenu, setContextMenu] = useState<{
    accountId: number;
    x: number;
    y: number;
    code: string;
    label: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    accountId: number;
    code: string;
    label: string;
  } | null>(null);

  // ===== VALIDATION — two modes =====
  // loadValidation(id, false) → read cached result (called on mount, non-blocking)
  // loadValidation(id, true)  → re-run now via POST /run (called by button)
  const loadValidation = async (id: number, forceRerun = false) => {
    setValidationStatus("loading");
    try {
      const valRes = forceRerun
        ? await runValidation(id)           // POST — fresh run, always current
        : await getValidationReport(id);    // GET  — cached result on mount

      if (valRes.status === "done") {
        const map = new Map<string, ValidationLine>();
        (valRes.data?.lines ?? []).forEach((l) => map.set(l.source_code, l));
        setInvalidMap(map);
        setValidationStatus("done");
      } else {
        setInvalidMap(new Map());
        setValidationStatus("idle");
      }
    } catch {
      setValidationStatus("error");
    }
  };

  // ===== FETCH =====
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [uploadRes, accountsRes] = await Promise.all([
          getUpload(uploadId),
          getAccountsByUpload(uploadId),
        ]);
        setUpload(uploadRes);
        setAccounts(accountsRes.data || []);

        // Try to load bilan reconciliation data (non-blocking — bilan may not exist yet)
        try {
          const bilanRes = await getBilan(uploadId);
          const lines: ReconLine[] = bilanRes?.data?.data_quality?.lines ?? [];
          if (lines.length > 0) {
            const map = new Map<string, ReconLine>();
            lines.forEach((l) => map.set(l.code, l));
            setReconMap(map);
            setHasRecon(true);
          }
        } catch {
          // Bilan not generated yet — reconciliation columns stay hidden
        }

        // Try to load PCGT validation report (non-blocking — may still be pending)
        loadValidation(uploadId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load data";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    if (uploadId) fetchData();
  }, [uploadId]);

  // ===== FILTERED DATA =====
  const filteredAccounts = useMemo(() => {
    return accounts
      .filter((acc) => {
        const matchesSearch =
          acc.account_code.toLowerCase().includes(search.toLowerCase()) ||
          (acc.label ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (acc.source_rubrique ?? "").toLowerCase().includes(search.toLowerCase());

        const matchesPrefix = prefix ? acc.account_code.startsWith(prefix) : true;

        const recon = reconMap.get(acc.account_code);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "ok" && (!recon || recon.status === "ok")) ||
          (statusFilter === "discrepancy" && recon?.status === "discrepancy") ||
          (statusFilter === "unmapped" && recon?.status === "unmapped") ||
          (statusFilter === "compte_resultat" && recon?.status === "compte_resultat");

        return matchesSearch && matchesPrefix && matchesStatus;
      })
      // PCGT order: lexicographic on the account code reproduces the
      // plan_comptable_tunisien.json tree order (101 < 1011 < 105 < 541 …).
      .sort((a, b) =>
        a.account_code < b.account_code ? -1 : a.account_code > b.account_code ? 1 : 0
      );
  }, [accounts, search, prefix, statusFilter, reconMap]);

  // ===== DETECT ACTIVE COLUMNS =====
  const activeColumns = useMemo(() => ({
    source_rubrique: filteredAccounts.some((acc) => acc.source_rubrique),
    opening_debit: filteredAccounts.some((acc) => acc.opening_debit !== null && acc.opening_debit !== undefined),
    opening_credit: filteredAccounts.some((acc) => acc.opening_credit !== null && acc.opening_credit !== undefined),
    debit: filteredAccounts.some((acc) => acc.debit !== null && acc.debit !== undefined),
    credit: filteredAccounts.some((acc) => acc.credit !== null && acc.credit !== undefined),
    solde_debit: filteredAccounts.some((acc) => acc.solde_debit !== null && acc.solde_debit !== undefined),
    solde_credit: filteredAccounts.some((acc) => acc.solde_credit !== null && acc.solde_credit !== undefined),
    solde_final_debit: filteredAccounts.some((acc) => acc.solde_final_debit !== null && acc.solde_final_debit !== undefined),
    solde_final_credit: filteredAccounts.some((acc) => acc.solde_final_credit !== null && acc.solde_final_credit !== undefined),
    solde_final: filteredAccounts.some((acc) => acc.solde_final !== null && acc.solde_final !== undefined),
  }), [filteredAccounts]);

  // ===== WARNING COUNTS (for the summary bar) =====
  const warnCounts = useMemo(() => {
    let discrepancy = 0;
    let unmapped = 0;
    accounts.forEach((acc) => {
      const r = reconMap.get(acc.account_code);
      if (r?.status === "discrepancy") discrepancy++;
      else if (r?.status === "unmapped") unmapped++;
    });
    return { discrepancy, unmapped };
  }, [accounts, reconMap]);

  // ✏️ EDIT HANDLERS
  const handleCellDoubleClick = (accountId: number, field: string, value: unknown) => {
    setEditingCell({ accountId, field });
    setEditValue(String(value || ""));
  };

  const handleRightClick = (e: React.MouseEvent, accountId: number, code: string, label: string) => {
    e.preventDefault();
    setContextMenu({ accountId, x: e.clientX, y: e.clientY, code, label });
  };

  const handleSaveEdit = async () => {
    if (!editingCell) return;
    try {
      const updates: Record<string, string | number | null> = {};
      const numericFields = ["debit", "credit", "solde_debit", "solde_credit", "solde_final_debit", "solde_final_credit", "solde_final", "opening_debit", "opening_credit"];
      updates[editingCell.field] = numericFields.includes(editingCell.field)
        ? (editValue === "" ? null : parseFloat(editValue))
        : (editValue === "" ? null : editValue);
      await updateAccount(editingCell.accountId, updates);
      const newValue = numericFields.includes(editingCell.field)
        ? (editValue === "" ? null : parseFloat(editValue))
        : (editValue === "" ? null : editValue);
      setAccounts(accounts.map((acc) =>
        acc.id === editingCell.accountId ? { ...acc, [editingCell.field]: newValue } : acc
      ));
      setEditingCell(null);
      setEditValue("");
    } catch (err) {
      alert("Failed to update account: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteAccount(deleteConfirm.accountId);
      setAccounts(accounts.filter((acc) => acc.id !== deleteConfirm.accountId));
      setDeleteConfirm(null);
      setContextMenu(null);
    } catch (err) {
      alert("Failed to delete account: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSaveEdit();
    else if (e.key === "Escape") { setEditingCell(null); setEditValue(""); }
  };

  // ===== RENDER =====
  return (
    <div>
      <ComponentCard
        title={`Accounts — ${upload?.display_filename || upload?.filename || "Loading…"}`}
        headerAction={
          <button
            onClick={() => loadValidation(uploadId, true)}
            disabled={validationStatus === "loading"}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
          >
            {validationStatus === "loading" ? (
              <>
                <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Vérification…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Validation PCGT
                {invalidMap.size > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-error-500 text-white text-[10px] font-bold">
                    {invalidMap.size}
                  </span>
                )}
              </>
            )}
          </button>
        }
      >

        {loading && (
          <div className="flex justify-center py-10">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        )}

        {error && <Alert variant="error" title="Error" message={error} showLink={false} />}

        {!loading && !error && (
          <div className="space-y-4">

            {/* ── Reconciliation warning bar ── */}
            {hasRecon && (warnCounts.discrepancy > 0 || warnCounts.unmapped > 0) &&
              !warnings.isDismissed("reconciliation") && (
              <div className="rounded-xl border border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10 px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                <svg className="w-4 h-4 text-warning-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span className="text-warning-700 dark:text-warning-400 font-medium">
                  Anomalies de classification détectées :
                </span>
                {warnCounts.discrepancy > 0 && (
                  <button
                    onClick={() => setStatusFilter("discrepancy")}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-error-100 text-error-700 dark:bg-error-500/20 dark:text-error-400 hover:opacity-80 transition-opacity"
                  >
                    {warnCounts.discrepancy} incohérence{warnCounts.discrepancy > 1 ? "s" : ""}
                  </button>
                )}
                {warnCounts.unmapped > 0 && (
                  <button
                    onClick={() => setStatusFilter("unmapped")}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-400 hover:opacity-80 transition-opacity"
                  >
                    {warnCounts.unmapped} non répertorié{warnCounts.unmapped > 1 ? "s" : ""}
                  </button>
                )}
                <span className="text-xs text-warning-600/70 dark:text-warning-400/60 ml-auto">
                  Cliquez sur un badge pour filtrer · Les montants sont calculés selon les règles SCE
                </span>
                <DismissControls
                  className="text-warning-600 dark:text-warning-400"
                  onHide={() => warnings.hide("reconciliation")}
                  onIgnore={() =>
                    warnings.ignore("reconciliation", {
                      message: "Comptes — anomalies de classification",
                      href: `/uploads/${uploadId}/accounts`,
                    })
                  }
                />
              </div>
            )}

            {/* ── PCGT validation summary ── */}
            {validationStatus === "done" && invalidMap.size === 0 && (
              <div className="rounded-xl border border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10 px-4 py-2.5 flex items-center gap-2 text-xs text-success-700 dark:text-success-400">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Tous les codes sont valides selon le PCGT tunisien.
              </div>
            )}
            {validationStatus === "done" && invalidMap.size > 0 &&
              !warnings.isDismissed("pcgt-invalid") && (
              <div className="rounded-xl border border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10 px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                <svg className="w-4 h-4 text-error-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span className="text-error-700 dark:text-error-400 font-medium">
                  {invalidMap.size} code{invalidMap.size > 1 ? "s" : ""} absent{invalidMap.size > 1 ? "s" : ""} du PCGT
                </span>
                <span className="text-xs text-error-600/70 dark:text-error-400/60 ml-auto">
                  Survolez le badge ⚠ invalide pour voir la suggestion de correction
                </span>
                <DismissControls
                  className="text-error-600 dark:text-error-400"
                  onHide={() => warnings.hide("pcgt-invalid")}
                  onIgnore={() =>
                    warnings.ignore("pcgt-invalid", {
                      message: "Comptes — codes absents du PCGT",
                      href: `/uploads/${uploadId}/accounts`,
                    })
                  }
                />
              </div>
            )}

            {/* ── Filters ── */}
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                placeholder="Rechercher par code, libellé ou rubrique…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 border rounded-lg w-full md:w-1/2 dark:bg-gray-800 dark:border-gray-700 text-sm"
              />
              <input
                type="text"
                placeholder="Filtrer par préfixe (ex : 1, 401)"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="px-3 py-2 border rounded-lg w-full md:w-1/4 dark:bg-gray-800 dark:border-gray-700 text-sm"
              />
              {/* Status filter — only shown when reconciliation data exists */}
              {hasRecon && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="px-3 py-2 border rounded-lg w-full md:w-auto dark:bg-gray-800 dark:border-gray-700 text-sm"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="ok">✓ OK</option>
                  <option value="discrepancy">⚠ Incohérence</option>
                  <option value="unmapped">ℹ Non répertorié</option>
                  <option value="compte_resultat">📄 Compte résultat</option>
                </select>
              )}
            </div>

            {/* ── Count ── */}
            <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
              {filteredAccounts.length} compte{filteredAccounts.length !== 1 ? "s" : ""} affiché{filteredAccounts.length !== 1 ? "s" : ""}
              {statusFilter !== "all" && (
                <button
                  onClick={() => setStatusFilter("all")}
                  className="ml-2 underline hover:text-gray-600 dark:hover:text-gray-300"
                >
                  Effacer le filtre
                </button>
              )}
            </p>

            {/* ── Table ── */}
            <div className="overflow-auto max-h-[600px] border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Libellé</th>

                    {/* Rubrique source — shown when any row has a value */}
                    {activeColumns.source_rubrique && (
                      <th className="px-3 py-2 text-left border-l border-gray-300 dark:border-gray-600 whitespace-nowrap">
                        Rubrique source
                      </th>
                    )}

                    {/* Reconciliation status — shown when bilan data_quality loaded */}
                    {hasRecon && (
                      <th className="px-3 py-2 text-left border-l border-gray-300 dark:border-gray-600 whitespace-nowrap">
                        Statut SCE
                      </th>
                    )}

                    {activeColumns.opening_debit && <th className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 whitespace-nowrap">Ouv. Dbt</th>}
                    {activeColumns.opening_credit && <th className="px-3 py-2 text-right whitespace-nowrap">Ouv. Cdt</th>}
                    {activeColumns.debit && <th className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600">Débit</th>}
                    {activeColumns.credit && <th className="px-3 py-2 text-right">Crédit</th>}
                    {activeColumns.solde_debit && <th className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 whitespace-nowrap">Solde Pér Dbt</th>}
                    {activeColumns.solde_credit && <th className="px-3 py-2 text-right whitespace-nowrap">Solde Pér Cdt</th>}
                    {activeColumns.solde_final_debit && <th className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 whitespace-nowrap">Solde Fin Dbt</th>}
                    {activeColumns.solde_final_credit && <th className="px-3 py-2 text-right whitespace-nowrap">Solde Fin Cdt</th>}
                    {activeColumns.solde_final && <th className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 whitespace-nowrap">Solde Final</th>}
                  </tr>
                </thead>

                <tbody>
                  {filteredAccounts.map((acc) => {
                    const recon = reconMap.get(acc.account_code);
                    return (
                      <tr
                        key={acc.id}
                        className={`border-b border-gray-200 dark:border-gray-700 transition-colors ${rowBg(recon?.status)}`}
                        onContextMenu={(e) => handleRightClick(e, acc.id, acc.account_code, acc.label || "")}
                      >
                        {/* Code */}
                        <td
                          className="px-3 py-2 font-mono font-medium cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "account_code", acc.account_code)}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "account_code" ? (
                            <input autoFocus type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded" />
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              {acc.account_code}
                              {invalidMap.has(acc.account_code) && (() => {
                                const inv = invalidMap.get(acc.account_code)!;
                                const tip = inv.suggested_code
                                  ? `Code absent du PCGT — suggestion : ${inv.suggested_code} (${inv.suggested_label ?? ""})`
                                  : "Code absent du PCGT";
                                return (
                                  <span
                                    title={tip}
                                    className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium
                                               bg-error-100 text-error-700 dark:bg-error-500/20 dark:text-error-400
                                               cursor-help whitespace-nowrap"
                                  >
                                    ⚠ invalide
                                  </span>
                                );
                              })()}
                            </span>
                          )}
                        </td>

                        {/* Label */}
                        <td
                          className="px-3 py-2 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "label", acc.label || "")}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "label" ? (
                            <input autoFocus type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded" />
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">{acc.label || "—"}</span>
                          )}
                        </td>

                        {/* Rubrique source */}
                        {activeColumns.source_rubrique && (
                          <td className="px-3 py-2 border-l border-gray-200 dark:border-gray-700">
                            {acc.source_rubrique ? (
                              <span
                                className={`inline-block max-w-[200px] truncate text-xs px-2 py-0.5 rounded ${
                                  recon?.status === "discrepancy"
                                    ? "bg-error-100 text-error-700 dark:bg-error-500/20 dark:text-error-300 font-medium"
                                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                }`}
                                title={
                                  recon?.status === "discrepancy" && recon.category
                                    ? `Source : "${acc.source_rubrique}" → SCE : "${recon.category}"`
                                    : acc.source_rubrique
                                }
                              >
                                {acc.source_rubrique}
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                            )}
                          </td>
                        )}

                        {/* Statut SCE */}
                        {hasRecon && (
                          <td className="px-3 py-2 border-l border-gray-200 dark:border-gray-700">
                            {recon ? (
                              <StatusBadge status={recon.status} warning={recon.warning} />
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                            )}
                          </td>
                        )}

                        {/* Numeric columns — unchanged from original */}
                        {activeColumns.opening_debit && (
                          <td className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30" onDoubleClick={() => handleCellDoubleClick(acc.id, "opening_debit", acc.opening_debit)}>
                            {editingCell?.accountId === acc.id && editingCell.field === "opening_debit" ? (
                              <input autoFocus type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded text-right" />
                            ) : formatCurrency(acc.opening_debit)}
                          </td>
                        )}
                        {activeColumns.opening_credit && (
                          <td className="px-3 py-2 text-right cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30" onDoubleClick={() => handleCellDoubleClick(acc.id, "opening_credit", acc.opening_credit)}>
                            {editingCell?.accountId === acc.id && editingCell.field === "opening_credit" ? (
                              <input autoFocus type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded text-right" />
                            ) : formatCurrency(acc.opening_credit)}
                          </td>
                        )}
                        {activeColumns.debit && (
                          <td className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30" onDoubleClick={() => handleCellDoubleClick(acc.id, "debit", acc.debit)}>
                            {editingCell?.accountId === acc.id && editingCell.field === "debit" ? (
                              <input autoFocus type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded text-right" />
                            ) : formatCurrency(acc.debit)}
                          </td>
                        )}
                        {activeColumns.credit && (
                          <td className="px-3 py-2 text-right cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30" onDoubleClick={() => handleCellDoubleClick(acc.id, "credit", acc.credit)}>
                            {editingCell?.accountId === acc.id && editingCell.field === "credit" ? (
                              <input autoFocus type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded text-right" />
                            ) : formatCurrency(acc.credit)}
                          </td>
                        )}
                        {activeColumns.solde_debit && (
                          <td className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30" onDoubleClick={() => handleCellDoubleClick(acc.id, "solde_debit", acc.solde_debit)}>
                            {editingCell?.accountId === acc.id && editingCell.field === "solde_debit" ? (
                              <input autoFocus type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded text-right" />
                            ) : formatCurrency(acc.solde_debit)}
                          </td>
                        )}
                        {activeColumns.solde_credit && (
                          <td className="px-3 py-2 text-right cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30" onDoubleClick={() => handleCellDoubleClick(acc.id, "solde_credit", acc.solde_credit)}>
                            {editingCell?.accountId === acc.id && editingCell.field === "solde_credit" ? (
                              <input autoFocus type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded text-right" />
                            ) : formatCurrency(acc.solde_credit)}
                          </td>
                        )}
                        {activeColumns.solde_final_debit && (
                          <td className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30" onDoubleClick={() => handleCellDoubleClick(acc.id, "solde_final_debit", acc.solde_final_debit)}>
                            {editingCell?.accountId === acc.id && editingCell.field === "solde_final_debit" ? (
                              <input autoFocus type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded text-right" />
                            ) : formatCurrency(acc.solde_final_debit)}
                          </td>
                        )}
                        {activeColumns.solde_final_credit && (
                          <td className="px-3 py-2 text-right cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30" onDoubleClick={() => handleCellDoubleClick(acc.id, "solde_final_credit", acc.solde_final_credit)}>
                            {editingCell?.accountId === acc.id && editingCell.field === "solde_final_credit" ? (
                              <input autoFocus type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded text-right" />
                            ) : formatCurrency(acc.solde_final_credit)}
                          </td>
                        )}
                        {activeColumns.solde_final && (
                          <td className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30" onDoubleClick={() => handleCellDoubleClick(acc.id, "solde_final", acc.solde_final)}>
                            {editingCell?.accountId === acc.id && editingCell.field === "solde_final" ? (
                              <input autoFocus type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSaveEdit} className="w-full px-2 py-1 border border-blue-500 rounded text-right" />
                            ) : formatCurrency(acc.solde_final)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredAccounts.length === 0 && (
                <div className="text-center py-6 text-gray-500 text-sm">
                  Aucun compte trouvé
                </div>
              )}
            </div>

            {/* Legend (only when recon columns visible) */}
            {hasRecon && (
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 pt-1">
                <span className="font-medium">Légende :</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-success-100 dark:bg-success-500/20 border border-success-300 dark:border-success-500/30" />
                  OK — classification conforme aux règles SCE
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-warning-100 dark:bg-warning-500/20 border border-warning-300 dark:border-warning-500/30" />
                  Non répertorié — compte absent des règles SCE
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-error-100 dark:bg-error-500/20 border border-error-300 dark:border-error-500/30" />
                  Incohérence — rubrique source ≠ règle SCE (règle appliquée)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-100 dark:bg-blue-500/20 border border-blue-300 dark:border-blue-500/30" />
                  Compte résultat — classe 6/7, exclu du bilan
                </span>
              </div>
            )}
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <div
            className="fixed bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={() => setContextMenu(null)}
          >
            <button
              className="block w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
              onClick={() => setDeleteConfirm({ isOpen: true, accountId: contextMenu.accountId, code: contextMenu.code, label: contextMenu.label })}
            >
              Supprimer
            </button>
          </div>
        )}

        {/* Delete confirmation modal */}
        {deleteConfirm?.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Supprimer ce compte ?</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Cette action est irréversible.<br />
                <strong>Code :</strong> {deleteConfirm.code}<br />
                <strong>Libellé :</strong> {deleteConfirm.label}
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                  Annuler
                </button>
                <button onClick={handleDeleteAccount} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}
      </ComponentCard>
    </div>
  );
}
