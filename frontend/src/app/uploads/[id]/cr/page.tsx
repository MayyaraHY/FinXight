"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { generateCR, getCR, analyzeCR } from "@/services/compteResultatService";
import { formatCurrency } from "@/utils/formatters";
import Button from "@/components/ui/button/Button";
import ExportModal from "@/components/export/ExportModal";
import { useModal } from "@/hooks/useModal";

// ── Constants ──

// Lines rendered with a bold subtotal style
const SUBTOTAL_LINE_IDS = new Set([4, 11, 17, 19]);
// Lines rendered with strong result emphasis + sign coloring
const RESULT_LINE_IDS = new Set([12, 21, 23]);
// Section header appears *before* these line IDs
const SECTION_HEADERS: Record<number, string> = {
  1: "Produits d'exploitation",
  5: "Charges d'exploitation",
  13: "Éléments financiers",
  18: "Impôt sur les bénéfices",
  20: "Éléments extraordinaires",
  22: "Modifications comptables",
};

// ── Types ──

interface CRLine {
  line_id: number;
  label: string;
  amount: number;
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
  const [inventoryMethod, setInventoryMethod] =
    useState<InventoryMethod>("permanent");
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isOpen: exportOpen, openModal: openExport, closeModal: closeExport } = useModal();

  const loadCR = useCallback(async () => {
    try {
      const res = (await getCR(uploadId)) as CRResponse;
      if (!res.success) {
        const generated = (await generateCR(
          uploadId,
          inventoryMethod
        )) as CRResponse;
        setCRData(generated.data);
      } else {
        setCRData(res.data);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load compte de résultat"
      );
    } finally {
      setLoading(false);
    }
  }, [uploadId, inventoryMethod]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = (await generateCR(uploadId, inventoryMethod)) as CRResponse;
      if (res.success) {
        setCRData(res.data);
        setError(null);
      } else {
        setError(res.message ?? "Failed to regenerate");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to regenerate compte de résultat"
      );
    } finally {
      setRegenerating(false);
    }
  };

  const handleDiagnose = async () => {
    setDiagnosing(true);
    try {
      const res = await analyzeCR(uploadId);
      if (res.success) {
        setCRData((prev) => prev ? { ...prev, ...res.data } : prev);
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
        <p className="text-sm font-medium text-error-700 dark:text-error-400">
          {error}
        </p>
      </div>
    );

  if (!crData)
    return (
      <p className="py-20 text-center text-sm text-gray-500 dark:text-gray-400">
        Aucune donnée disponible
      </p>
    );

  const orderedLines = Object.values(crData.lines).sort(
    (a, b) => a.line_id - b.line_id
  );

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
          {/* Inventory method segmented control */}
          <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5">
            {(["permanent", "intermittent"] as InventoryMethod[]).map(
              (method) => (
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
              )
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={openExport}
          >
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
      {crData.warnings.length > 0 && (
        <div className="rounded-2xl border border-warning-300 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/15 p-4">
          <p className="text-xs font-semibold text-warning-700 dark:text-warning-400 uppercase tracking-wide mb-2">
            Avertissements
          </p>
          <ul className="space-y-1">
            {crData.warnings.map((w, i) => (
              <li
                key={i}
                className="text-sm text-warning-700 dark:text-warning-300"
              >
                {w}
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
              <p key={i} dangerouslySetInnerHTML={{
                __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
              }} />
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
                {/* Section header row */}
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
                <LineRow line={line} />
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sub-components ──

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

function LineRow({ line }: { line: CRLine }) {
  const isResult = RESULT_LINE_IDS.has(line.line_id);
  const isSubtotal = SUBTOTAL_LINE_IDS.has(line.line_id);

  if (isResult) {
    return (
      <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-brand-50/40 dark:bg-brand-500/5">
        <td className="px-5 py-3.5 text-sm font-bold text-brand-700 dark:text-brand-400">
          {line.line_id}
        </td>
        <td className="px-4 py-3.5 text-sm font-bold text-gray-900 dark:text-white">
          {line.label}
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
    );
  }

  if (isSubtotal) {
    return (
      <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-white/[0.015]">
        <td className="px-5 py-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
          {line.line_id}
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
          {line.label}
        </td>
        <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
          {formatCurrency(line.amount)}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
      <td className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500">
        {line.line_id}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {line.label}
      </td>
      <td className="px-5 py-3 text-right text-sm text-gray-900 dark:text-white tabular-nums">
        {formatCurrency(line.amount)}
      </td>
    </tr>
  );
}
