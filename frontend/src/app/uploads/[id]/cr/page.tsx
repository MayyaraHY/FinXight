"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { generateCR, getCR, analyzeCR } from "@/services/compteResultatService";
import { formatCurrency } from "@/utils/formatters";
import Button from "@/components/ui/button/Button";
import ExportModal from "@/components/export/ExportModal";
import { useModal } from "@/hooks/useModal";
import { useDismissibleWarnings } from "@/hooks/useDismissibleWarnings";
import DismissControls from "@/components/warnings/DismissControls";

// ── Constants ──

const SUBTOTAL_LINE_IDS = new Set([4, 11, 17, 19]);
const RESULT_LINE_IDS = new Set([12, 21, 23]);
const SECTION_HEADERS: Record<number, string> = {
  1: "Produits d'exploitation",
  5: "Charges d'exploitation",
  13: "Éléments financiers",
  18: "Impôt sur les bénéfices",
  20: "Éléments extraordinaires",
  22: "Modifications comptables",
};

// ── Types ──

interface AccountDetail {
  code: string;
  label?: string | null;
  amount: number;
}

interface CRLine {
  line_id: number;
  label: string;
  amount: number;
  accounts: string[];
  account_breakdown?: AccountDetail[];
}

interface CRTotals {
  total_produits_exploitation: number;
  total_charges_exploitation: number;
  resultat_exploitation: number;
  resultat_ordinaire_avant_impot: number;
  resultat_ordinaire_apres_impot: number;
  resultat_net: number;
  resultat_apres_modifications: number;
}

interface CRData {
  lines: Record<string, CRLine>;
  totals: CRTotals;
  warnings: string[];
  cr_diagnosis?: string;
}

interface CRResponse {
  success: boolean;
  message?: string;
  data: CRData;
}

type InventoryMethod = "permanent" | "intermittent";

// ── Page ──

export default function CompteResultatPage() {
  const params = useParams();
  const uploadId = Number(params.id);

  const [crData, setCRData] = useState<CRData | null>(null);
  const [inventoryMethod, setInventoryMethod] = useState<InventoryMethod>("intermittent");
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());
  const { isOpen: exportOpen, openModal: openExport, closeModal: closeExport } = useModal();
  const warnings = useDismissibleWarnings(`cr:${uploadId}`);

  const toggleLine = (lineId: number) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      next.has(lineId) ? next.delete(lineId) : next.add(lineId);
      return next;
    });
  };

  const loadCR = useCallback(async () => {
    try {
      const res = (await getCR(uploadId)) as CRResponse;
      if (!res.success) {
        const generated = (await generateCR(uploadId, inventoryMethod)) as CRResponse;
        setCRData(generated.data);
      } else {
        setCRData(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load compte de résultat");
    } finally {
      setLoading(false);
    }
  }, [uploadId, inventoryMethod]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    setExpandedLines(new Set());
    try {
      const res = (await generateCR(uploadId, inventoryMethod)) as CRResponse;
      if (res.success) {
        setCRData(res.data);
        setError(null);
      } else {
        setError(res.message ?? "Failed to regenerate");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate compte de résultat");
    } finally {
      setRegenerating(false);
    }
  };

  const handleDiagnose = async () => {
    setDiagnosing(true);
    try {
      const res = await analyzeCR(uploadId);
      if (res.success) {
        setCRData((prev) => (prev ? { ...prev, ...res.data } : prev));
        setError(null);
      } else {
        setError(res.message || "Diagnostic IA échoué");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnostic IA échoué");
    } finally {
      setDiagnosing(false);
    }
  };

  useEffect(() => {
    loadCR();
  }, [loadCR]);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Chargement du compte de résultat…
        </p>
      </div>
    );

  if (error)
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15 p-5">
        <p className="text-sm font-medium text-error-700 dark:text-error-400">{error}</p>
      </div>
    );

  if (!crData)
    return (
      <p className="py-20 text-center text-sm text-gray-500 dark:text-gray-400">
        Aucune donnée disponible
      </p>
    );

  const orderedLines = Object.values(crData.lines).sort((a, b) => a.line_id - b.line_id);
  const resultatNet = crData.totals.resultat_net;
  const isProfit = resultatNet >= 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Compte de Résultat
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            État des performances financières
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5">
            {(["permanent", "intermittent"] as InventoryMethod[]).map((method) => (
              <button
                key={method}
                onClick={() => setInventoryMethod(method)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  inventoryMethod === method
                    ? "bg-brand-500 text-white shadow-theme-xs"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {method}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={openExport}>
            Exporter .xlsx
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating || diagnosing}
          >
            {regenerating ? "Recalcul…" : "Recalculer"}
          </Button>
          <Button
            size="sm"
            onClick={handleDiagnose}
            disabled={diagnosing || regenerating}
            className="bg-brand-600 hover:bg-brand-700 text-white border-brand-600 flex items-center gap-1.5"
          >
            {diagnosing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Analyse…
              </>
            ) : (
              <>✦ Diagnostic IA</>
            )}
          </Button>
        </div>
      </div>

      {/* ── Export Modal ── */}
      <ExportModal
        isOpen={exportOpen}
        onClose={closeExport}
        uploadId={uploadId}
        available={{ bilan: false, cr: true }}
      />

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Total Produits d'Exploitation"
          value={crData.totals.total_produits_exploitation}
          accent="blue"
        />
        <MetricCard
          label="Total Charges d'Exploitation"
          value={crData.totals.total_charges_exploitation}
          accent="neutral"
        />
        <MetricCard
          label="Résultat Net"
          value={resultatNet}
          accent={isProfit ? "brand" : "error"}
        />
      </div>

      {/* ── Warnings ── */}
      {crData.warnings.filter((w) => !warnings.isDismissed(w)).length > 0 && (
        <div className="rounded-2xl border border-warning-300 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/15 p-4">
          <p className="text-xs font-semibold text-warning-700 dark:text-warning-400 uppercase tracking-wide mb-2">
            Avertissements
          </p>
          <ul className="space-y-1">
            {crData.warnings
              .filter((w) => !warnings.isDismissed(w))
              .map((w, i) => (
                <li
                  key={`${w}-${i}`}
                  className="flex items-start justify-between gap-3 text-sm text-warning-700 dark:text-warning-300"
                >
                  <span className="min-w-0">{w}</span>
                  <DismissControls
                    onHide={() => warnings.hide(w)}
                    onIgnore={() =>
                      warnings.ignore(w, {
                        message: w,
                        href: `/uploads/${uploadId}/cr`,
                      })
                    }
                  />
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* ── AI CR Diagnosis ── */}
      {crData.cr_diagnosis && (
        <div className="rounded-2xl border border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15 p-5">
          <p className="text-xs font-semibold text-error-600 dark:text-error-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <span>⚠</span> Diagnostic IA — Erreurs du compte de résultat
          </p>
          <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed space-y-1">
            {crData.cr_diagnosis?.split("\n").map((line, i) => (
              <p
                key={i}
                dangerouslySetInnerHTML={{
                  __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Lines table ── */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-white/[0.02]">
              <th className="w-10 px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                N°
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Libellé
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Montant (DT)
              </th>
            </tr>
          </thead>
          <tbody>
            {orderedLines.map((line) => (
              <React.Fragment key={line.line_id}>
                {SECTION_HEADERS[line.line_id] && (
                  <tr className="bg-gray-50 dark:bg-white/[0.02] border-t border-gray-100 dark:border-gray-800">
                    <td />
                    <td
                      colSpan={2}
                      className="px-4 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest"
                    >
                      {SECTION_HEADERS[line.line_id]}
                    </td>
                  </tr>
                )}
                <LineRow
                  line={line}
                  expanded={expandedLines.has(line.line_id)}
                  onToggle={() => toggleLine(line.line_id)}
                />
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── LineRow ──

interface LineRowProps {
  line: CRLine;
  expanded: boolean;
  onToggle: () => void;
}

function LineRow({ line, expanded, onToggle }: LineRowProps) {
  const isResult = RESULT_LINE_IDS.has(line.line_id);
  const isSubtotal = SUBTOTAL_LINE_IDS.has(line.line_id);

  // Formula lines (subtotals/results) have no direct accounts — no toggle
  const hasBreakdown = (line.account_breakdown?.length ?? 0) > 0;

  const chevron = hasBreakdown ? (
    <svg
      className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${
        expanded ? "rotate-90" : ""
      }`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  ) : (
    // Placeholder so columns stay aligned
    <span className="w-3.5 h-3.5 flex-shrink-0 inline-block" />
  );

  // Breakdown panel shared by all row variants
  const breakdownPanel =
    hasBreakdown && expanded ? (
      <tr>
        <td colSpan={3} className="px-5 py-3 bg-gray-50/70 dark:bg-white/[0.015] border-t border-gray-100 dark:border-gray-800">
          <BreakdownTable breakdown={line.account_breakdown!} />
        </td>
      </tr>
    ) : null;

  if (isResult) {
    return (
      <>
        <tr
          onClick={hasBreakdown ? onToggle : undefined}
          className={`border-t-2 border-gray-200 dark:border-gray-700 bg-brand-50/40 dark:bg-brand-500/5 ${
            hasBreakdown ? "cursor-pointer hover:bg-brand-50/60 dark:hover:bg-brand-500/10" : ""
          } transition-colors`}
        >
          <td className="px-5 py-3.5 text-sm font-bold text-brand-700 dark:text-brand-400">
            {line.line_id}
          </td>
          <td className="px-4 py-3.5 text-sm font-bold text-gray-900 dark:text-white">
            <div className="flex items-center gap-2">
              {chevron}
              {line.label}
            </div>
          </td>
          <td
            className={`px-5 py-3.5 text-right text-base font-bold tabular-nums ${
              line.amount >= 0
                ? "text-success-600 dark:text-success-400"
                : "text-error-600 dark:text-error-400"
            }`}
          >
            {formatCurrency(line.amount)}
          </td>
        </tr>
        {breakdownPanel}
      </>
    );
  }

  if (isSubtotal) {
    return (
      <>
        <tr
          onClick={hasBreakdown ? onToggle : undefined}
          className={`border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-white/[0.015] ${
            hasBreakdown ? "cursor-pointer hover:bg-gray-100/60 dark:hover:bg-white/[0.025]" : ""
          } transition-colors`}
        >
          <td className="px-5 py-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
            {line.line_id}
          </td>
          <td className="px-4 py-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
            <div className="flex items-center gap-2">
              {chevron}
              {line.label}
            </div>
          </td>
          <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
            {formatCurrency(line.amount)}
          </td>
        </tr>
        {breakdownPanel}
      </>
    );
  }

  return (
    <>
      <tr
        onClick={hasBreakdown ? onToggle : undefined}
        className={`border-t border-gray-100 dark:border-gray-800 ${
          hasBreakdown
            ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
            : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
        } transition-colors`}
      >
        <td className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500">
          {line.line_id}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
          <div className="flex items-center gap-2">
            {chevron}
            {line.label}
          </div>
        </td>
        <td className="px-5 py-3 text-right text-sm text-gray-900 dark:text-white tabular-nums">
          {formatCurrency(line.amount)}
        </td>
      </tr>
      {breakdownPanel}
    </>
  );
}

// ── BreakdownTable ──

function BreakdownTable({ breakdown }: { breakdown: AccountDetail[] }) {
  if (breakdown.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 italic">
        Aucun détail disponible
      </p>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
          <th className="text-left pb-2 font-medium">Compte</th>
          <th className="text-left pb-2 font-medium">Libellé</th>
          <th className="text-right pb-2 font-medium">Montant (DT)</th>
        </tr>
      </thead>
      <tbody>
        {breakdown.map((item, idx) => (
          <tr
            key={idx}
            className="border-b border-gray-100 dark:border-gray-800/60 last:border-0"
          >
            <td className="py-1.5 font-mono text-gray-600 dark:text-gray-400 pr-4">
              {item.code}
            </td>
            <td className="py-1.5 text-gray-600 dark:text-gray-400 pr-4">
              {item.label ?? <span className="italic text-gray-400 dark:text-gray-600">—</span>}
            </td>
            <td
              className={`py-1.5 text-right tabular-nums font-medium ${
                item.amount < 0
                  ? "text-error-600 dark:text-error-400"
                  : "text-gray-800 dark:text-gray-200"
              }`}
            >
              {formatCurrency(item.amount)}
            </td>
          </tr>
        ))}
      </tbody>
      {/* Subtotal row when more than one account */}
      {breakdown.length > 1 && (
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-gray-700">
            <td colSpan={2} className="pt-2 text-gray-500 dark:text-gray-400 font-medium">
              Sous-total
            </td>
            <td className="pt-2 text-right tabular-nums font-semibold text-gray-900 dark:text-white">
              {formatCurrency(
                breakdown.reduce((sum, item) => sum + item.amount, 0)
              )}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

// ── MetricCard ──

interface MetricCardProps {
  label: string;
  value: number;
  accent: "blue" | "neutral" | "brand" | "error";
}

function MetricCard({ label, value, accent }: MetricCardProps) {
  const bar = {
    blue: "bg-blue-light-500",
    neutral: "bg-gray-400",
    brand: "bg-brand-500",
    error: "bg-error-500",
  }[accent];

  const valueColor = {
    blue: "text-gray-900 dark:text-white",
    neutral: "text-gray-900 dark:text-white",
    brand: "text-success-600 dark:text-success-400",
    error: "text-error-600 dark:text-error-400",
  }[accent];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-5">
      <div className={`w-8 h-1 rounded-full ${bar} mb-4`} />
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}