"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getAnomalies } from "@/services/aiService";
import { getBilan } from "@/services/bilanService";
import { getCR } from "@/services/compteResultatService";
import { getValidationReport, ValidationLine } from "@/services/validationService";
import { Anomaly } from "@/models/ai";
import { DetectedIssue, BilanReportData, CRReportData } from "@/models/anomalyReport";

// ---------------------------------------------------------------------------
// Unified row type
// ---------------------------------------------------------------------------

type RowSeverity = "critique" | "avertissement" | "info";

interface AnomalyRow {
  id: string;
  severity: RowSeverity;
  source: string;
  compte: string | null;
  probleme: string;
  suggestion: string | null;
  expected: string | null;
  actual: string | null;
}

const SUGGESTION_COLLAPSE_THRESHOLD = 120;

function toRows(
  bilanIssues: DetectedIssue[],
  crWarnings: string[],
  aiAnomalies: Anomaly[],
  validationLines: ValidationLine[]
): AnomalyRow[] {
  const rows: AnomalyRow[] = [];

  bilanIssues.forEach((issue, i) => {
    rows.push({
      id: `bilan-${i}`,
      severity: issue.severity === "error" ? "critique" : "avertissement",
      source: "Bilan",
      compte: issue.account,
      probleme: issue.message,
      suggestion: null,
      expected: issue.expected ?? null,
      actual: issue.actual ?? null,
    });
  });

  crWarnings.forEach((w, i) => {
    rows.push({
      id: `cr-${i}`,
      severity: "avertissement",
      source: "Compte de résultat",
      compte: null,
      probleme: w,
      suggestion: null,
      expected: null,
      actual: null,
    });
  });

  aiAnomalies.forEach((a, i) => {
    rows.push({
      id: `ai-${i}`,
      severity: "avertissement",
      source: "Analyse IA",
      compte: a.compte,
      probleme: a.probleme,
      suggestion: a.suggestion,
      expected: null,
      actual: null,
    });
  });

  validationLines.forEach((line, i) => {
    rows.push({
      id: `pcgt-${i}`,
      severity: "info",
      source: "PCGT",
      compte: line.source_code,
      probleme: line.source_label
        ? `${line.source_label} — code absent du PCGT`
        : "Code absent du PCGT",
      suggestion: line.suggested_code
        ? `${line.suggested_code}${line.suggested_label ? ` — ${line.suggested_label}` : ""} (${Math.round(line.confidence)} %)`
        : null,
      expected: line.reason,
      actual: null,
    });
  });

  const order: Record<RowSeverity, number> = { critique: 0, avertissement: 1, info: 2 };
  rows.sort((a, b) => order[a.severity] - order[b.severity]);
  return rows;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const SEVERITY_STYLE: Record<RowSeverity, string> = {
  critique: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  avertissement: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  info: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
};

const SEVERITY_LABEL: Record<RowSeverity, string> = {
  critique: "Critique",
  avertissement: "Avertissement",
  info: "PCGT",
};

const ROW_BG: Record<RowSeverity, string> = {
  critique: "bg-red-50/60 dark:bg-red-950/20",
  avertissement: "bg-amber-50/40 dark:bg-amber-950/10",
  info: "bg-white dark:bg-gray-800",
};

const LEFT_BORDER: Record<RowSeverity, string> = {
  critique: "border-l-4 border-red-500",
  avertissement: "border-l-4 border-amber-400",
  info: "border-l-4 border-blue-400",
};

function SeverityBadge({ severity }: { severity: RowSeverity }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${SEVERITY_STYLE[severity]}`}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    Bilan: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
    "Compte de résultat": "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
    "Analyse IA": "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
    PCGT: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${styles[source] ?? styles.PCGT}`}>
      {source}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expandable suggestion cell
// ---------------------------------------------------------------------------

function ExpandableSuggestion({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > SUGGESTION_COLLAPSE_THRESHOLD;

  if (!isLong) {
    return <span className="text-xs text-green-700 dark:text-green-400 whitespace-pre-wrap">{text}</span>;
  }

  return (
    <div className="text-xs text-green-700 dark:text-green-400">
      <span className="whitespace-pre-wrap">
        {expanded ? text : `${text.slice(0, SUGGESTION_COLLAPSE_THRESHOLD)}…`}
      </span>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="ml-1.5 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline focus:outline-none"
      >
        {expanded ? "Voir moins" : "Voir plus"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function PendingChip({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
      {source} en attente
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AnomaliesPage() {
  const params = useParams();
  const uploadId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AnomalyRow[]>([]);
  const [pendingSources, setPendingSources] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      const [bilanRes, crRes, validationRes, aiRes] = await Promise.allSettled([
        getBilan(uploadId),
        getCR(uploadId),
        getValidationReport(uploadId),
        getAnomalies(uploadId),
      ]);

      const pending: string[] = [];

      let bilanIssues: DetectedIssue[] = [];
      if (bilanRes.status === "fulfilled" && bilanRes.value?.success) {
        const d: BilanReportData = bilanRes.value.data ?? {};
        bilanIssues = d.detected_issues ?? [];
      } else {
        pending.push("Bilan");
      }

      let crWarnings: string[] = [];
      if (crRes.status === "fulfilled" && crRes.value?.success) {
        const d: CRReportData = crRes.value.data ?? {};
        crWarnings = d.warnings ?? [];
      } else {
        pending.push("Compte de résultat");
      }

      let validationLines: ValidationLine[] = [];
      if (validationRes.status === "fulfilled" && validationRes.value?.status === "done") {
        validationLines = (validationRes.value.data?.lines ?? []).filter(
          (l: ValidationLine) => l.status === "invalid_code" || l.status === "unresolved"
        );
      } else if (
        validationRes.status === "fulfilled" &&
        validationRes.value?.status === "pending"
      ) {
        pending.push("Validation PCGT");
      }

      let aiAnomalies: Anomaly[] = [];
      if (aiRes.status === "fulfilled") {
        aiAnomalies = aiRes.value?.anomalies ?? [];
      } else {
        pending.push("Analyse IA");
      }

      setRows(toRows(bilanIssues, crWarnings, aiAnomalies, validationLines));
      setPendingSources(pending);
      setLoading(false);
    };

    load();
  }, [uploadId]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Chargement du rapport d&apos;anomalies…</span>
        </div>
      </div>
    );
  }

  const totalCritique = rows.filter((r) => r.severity === "critique").length;
  const totalAvert = rows.filter((r) => r.severity === "avertissement").length;
  const totalPCGT = rows.filter((r) => r.severity === "info").length;

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
            Rapport d&apos;Anomalies
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Diagnostic complet — upload #{uploadId}
          </p>
        </div>

        {/* Pending chips */}
        {pendingSources.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {pendingSources.map((src) => (
              <PendingChip key={src} source={src} />
            ))}
          </div>
        )}

        {/* Summary pills */}
        {rows.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {totalCritique > 0 && (
              <span className="text-sm font-semibold px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                {totalCritique} critique{totalCritique > 1 ? "s" : ""}
              </span>
            )}
            {totalAvert > 0 && (
              <span className="text-sm font-semibold px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                {totalAvert} avertissement{totalAvert > 1 ? "s" : ""}
              </span>
            )}
            {totalPCGT > 0 && (
              <span className="text-sm font-semibold px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                {totalPCGT} code{totalPCGT > 1 ? "s" : ""} absents du PCGT
              </span>
            )}
          </div>
        )}

        {/* Empty state */}
        {rows.length === 0 && pendingSources.length === 0 && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center">
            <p className="text-green-700 dark:text-green-300 font-semibold text-lg mb-1">
              Aucune anomalie détectée
            </p>
            <p className="text-green-600 dark:text-green-400 text-sm">
              Les comptes de cet upload sont conformes au PCGT tunisien.
            </p>
          </div>
        )}

        {/* Table */}
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-semibold w-[120px]">Sévérité</th>
                  <th className="text-left px-4 py-3 font-semibold w-[150px]">Source</th>
                  <th className="text-left px-4 py-3 font-semibold w-[100px]">Compte</th>
                  <th className="text-left px-4 py-3 font-semibold">Problème</th>
                  <th className="text-left px-4 py-3 font-semibold w-[35%]">Suggestion / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`${ROW_BG[row.severity]} ${LEFT_BORDER[row.severity]} hover:brightness-95 dark:hover:brightness-110 transition-[filter]`}
                  >
                    <td className="px-4 py-3 align-top">
                      <SeverityBadge severity={row.severity} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <SourceBadge source={row.source} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.compte ? (
                        <span className="font-mono text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded">
                          {row.compte}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-gray-800 dark:text-gray-200">{row.probleme}</p>
                      {(row.expected || row.actual) && (
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                          {row.expected && (
                            <span>
                              <span className="font-semibold">Attendu :</span> {row.expected}
                            </span>
                          )}
                          {row.actual && (
                            <span>
                              <span className="font-semibold">Obtenu :</span> {row.actual}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.suggestion ? (
                        <ExpandableSuggestion text={row.suggestion} />
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
