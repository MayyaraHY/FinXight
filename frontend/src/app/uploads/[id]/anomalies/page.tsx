"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  getAnomalies,
  saveAnomalies,
  getCorrections,
  applyCorrection,
  CorrectionLog,
  getAnomalyStatuses,
  setAnomalyStatus,
  AnomalyStatusValue,
} from "@/services/aiService";
import { downloadAnomaliesPdf } from "@/services/exportService";
import { getBilan } from "@/services/bilanService";
import { getCR } from "@/services/compteResultatService";
import { getValidationReport, ValidationLine } from "@/services/validationService";
import { Anomaly } from "@/models/ai";
import { DetectedIssue, BilanReportData, CRReportData } from "@/models/anomalyReport";
import {
  AlertIcon,
  InfoIcon,
  CheckCircleIcon,
  CopyIcon,
  ArrowRightIcon,
  DownloadIcon,
  TrashBinIcon,
  EyeCloseIcon,
} from "@/icons";

// ---------------------------------------------------------------------------
// Row type
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

const SEVERITY_LABEL: Record<RowSeverity, string> = {
  critique: "Critique",
  avertissement: "Avertissement",
  info: "PCGT",
};

const SEVERITY_BADGE: Record<RowSeverity, string> = {
  critique: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  avertissement: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  info: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
};

const SEVERITY_BADGE_ACTIVE: Record<RowSeverity, string> = {
  critique: "bg-red-600 text-white ring-2 ring-red-400/40",
  avertissement: "bg-amber-500 text-white ring-2 ring-amber-400/40",
  info: "bg-blue-600 text-white ring-2 ring-blue-400/40",
};

const SEVERITY_LEFT_BORDER: Record<RowSeverity, string> = {
  critique: "border-l-red-500",
  avertissement: "border-l-amber-400",
  info: "border-l-blue-400",
};

const SOURCE_BADGE: Record<string, string> = {
  Bilan: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  "Compte de résultat": "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
  "Analyse IA": "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
  PCGT: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
};

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
// Expandable suggestion
// ---------------------------------------------------------------------------

const EXPAND_THRESHOLD = 140;

function ExpandableSuggestion({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > EXPAND_THRESHOLD;

  return (
    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
      <span className="whitespace-pre-wrap">
        {isLong && !expanded ? `${text.slice(0, EXPAND_THRESHOLD)}…` : text}
      </span>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-1.5 text-blue-600 dark:text-blue-400 font-semibold text-xs hover:underline focus:outline-none"
        >
          {expanded ? "Voir moins" : "Voir plus"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left panel — anomaly card
// ---------------------------------------------------------------------------

interface CardProps {
  row: AnomalyRow;
  isSelected: boolean;
  isCorrected: boolean;
  isIgnored: boolean;
  onSelect: () => void;
}

function AnomalyCard({ row, isSelected, isCorrected, isIgnored, onSelect }: CardProps) {
  const SeverityIcon = row.severity === "info" ? InfoIcon : AlertIcon;

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border-l-4 border border-gray-200 dark:border-gray-700 p-4 cursor-pointer transition-all ${
        SEVERITY_LEFT_BORDER[row.severity]
      } ${
        isSelected
          ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
          : isIgnored
          ? "bg-gray-50 dark:bg-gray-800/50 opacity-60 hover:opacity-80"
          : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750"
      }`}
    >
      {/* Row 1: severity + source + status badges */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${SEVERITY_BADGE[row.severity]}`}
        >
          <SeverityIcon className="w-3 h-3" />
          {SEVERITY_LABEL[row.severity]}
        </span>
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
            SOURCE_BADGE[row.source] ?? SOURCE_BADGE.PCGT
          }`}
        >
          {row.source}
        </span>
        {isCorrected && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
            <CheckCircleIcon className="w-3 h-3" />
            Corrigé
          </span>
        )}
        {isIgnored && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            <EyeCloseIcon className="w-3 h-3" />
            Ignoré
          </span>
        )}
      </div>

      {/* Compte badge */}
      {row.compte && (
        <div className="mb-2">
          <span className="font-mono text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded">
            {row.compte}
          </span>
        </div>
      )}

      {/* Problem */}
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2 line-clamp-2 leading-snug">
        {row.probleme}
      </p>

      {/* Expected / actual */}
      {(row.expected || row.actual) && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex flex-wrap gap-3">
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

      {/* Suggestion preview */}
      {row.suggestion && (
        <div className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded p-2 mt-1">
          <CheckCircleIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2">{row.suggestion}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel — detail view
// ---------------------------------------------------------------------------

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
        <ArrowRightIcon className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-base font-semibold text-gray-500 dark:text-gray-400">
        Sélectionnez une anomalie
      </p>
      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
        pour afficher les détails complets
      </p>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  account_code: "Code du compte",
  solde_final: "Solde final (signé)",
  solde_final_debit: "Solde final débit",
  solde_final_credit: "Solde final crédit",
  solde_debit: "Solde débit",
  solde_credit: "Solde crédit",
  debit: "Débit",
  credit: "Crédit",
  label: "Libellé",
};

interface DetailViewProps {
  row: AnomalyRow;
  isIgnored: boolean;
  correction: CorrectionLog | null;
  onCopy: () => void;
  copied: boolean;
  onCorrect: (payload: { field: string; newValue: string; note: string }) => Promise<void>;
  onToggleIgnore: () => void;
  onDelete: () => void;
}

function DetailView({
  row,
  isIgnored,
  correction,
  onCopy,
  copied,
  onCorrect,
  onToggleIgnore,
  onDelete,
}: DetailViewProps) {
  const SeverityIcon = row.severity === "info" ? InfoIcon : AlertIcon;
  const [corrField, setCorrField] = useState("solde_final");
  const [corrValue, setCorrValue] = useState("");
  const [corrNote, setCorrNote] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [corrError, setCorrError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmitCorrection = async () => {
    if (!corrValue.trim()) return;
    setCorrecting(true);
    setCorrError(null);
    try {
      await onCorrect({ field: corrField, newValue: corrValue.trim(), note: corrNote.trim() });
      setCorrValue("");
      setCorrNote("");
    } catch (e) {
      setCorrError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setCorrecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold ${SEVERITY_BADGE[row.severity]}`}
          >
            <SeverityIcon className="w-3.5 h-3.5" />
            {SEVERITY_LABEL[row.severity]}
          </span>
          <span
            className={`inline-block px-3 py-1 rounded text-xs font-medium ${
              SOURCE_BADGE[row.source] ?? SOURCE_BADGE.PCGT
            }`}
          >
            {row.source}
          </span>
          {correction && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
              <CheckCircleIcon className="w-3 h-3" />
              Corrigé
            </span>
          )}
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">
          {row.probleme}
        </h2>
      </div>

      {/* Fields */}
      {row.compte && (
        <DetailSection label="Compte">
          <code className="block px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono font-semibold text-gray-800 dark:text-gray-200">
            {row.compte}
          </code>
        </DetailSection>
      )}

      {row.expected && (
        <DetailSection label="Valeur attendue">
          <div className="px-3 py-2 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
            {row.expected}
          </div>
        </DetailSection>
      )}

      {row.actual && (
        <DetailSection label="Valeur obtenue">
          <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
            {row.actual}
          </div>
        </DetailSection>
      )}

      {row.suggestion && (
        <DetailSection label="Suggestion">
          <div className="px-3 py-3 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded text-green-800 dark:text-green-300">
            <ExpandableSuggestion text={row.suggestion} />
          </div>
        </DetailSection>
      )}

      {/* Correction section — only for anomalies with a compte */}
      {row.compte && (
        <DetailSection label="Correction">
          {correction ? (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold text-sm">
                <CheckCircleIcon className="w-4 h-4" />
                Correction appliquée le {correction.corrected_at
                  ? new Date(correction.corrected_at).toLocaleDateString("fr-FR", {
                      day: "2-digit", month: "short", year: "numeric",
                    })
                  : "—"}
              </div>
              {correction.field && (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  <span className="font-semibold">{FIELD_LABELS[correction.field] ?? correction.field} :</span>{" "}
                  <span className="line-through text-red-500">{correction.old_value ?? "—"}</span>
                  {" → "}
                  <span className="font-semibold text-green-700 dark:text-green-300">{correction.new_value ?? "—"}</span>
                </div>
              )}
              {correction.note && (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">{correction.note}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Champ à corriger</label>
                  <select
                    value={corrField}
                    onChange={(e) => setCorrField(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(FIELD_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nouvelle valeur</label>
                  <input
                    type="text"
                    value={corrValue}
                    onChange={(e) => setCorrValue(e.target.value)}
                    placeholder="Ex: 15000.00"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Note de correction (optionnel)</label>
                <textarea
                  value={corrNote}
                  onChange={(e) => setCorrNote(e.target.value)}
                  placeholder="Décrivez la correction apportée…"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {corrError && <p className="text-xs text-red-500">{corrError}</p>}
              <button
                onClick={handleSubmitCorrection}
                disabled={correcting || !corrValue.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white transition-colors"
              >
                {correcting ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircleIcon className="w-4 h-4" />
                )}
                {correcting ? "Application…" : "Appliquer la correction"}
              </button>
            </div>
          )}
        </DetailSection>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onCopy}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <CopyIcon className="w-4 h-4" />
          {copied ? "Copié !" : "Copier"}
        </button>
        <div className="flex gap-3">
          <button
            onClick={onToggleIgnore}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
              isIgnored
                ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            <EyeCloseIcon className="w-4 h-4" />
            {isIgnored ? "Rétablir" : "Ignorer"}
          </button>
          {confirmDelete ? (
            <button
              onClick={onDelete}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              <TrashBinIcon className="w-4 h-4" />
              Confirmer la suppression
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-red-200 dark:border-red-800 bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <TrashBinIcon className="w-4 h-4" />
              Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resize divider
// ---------------------------------------------------------------------------

function ResizeDivider({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="relative w-2 flex-shrink-0 bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500 cursor-col-resize transition-colors group"
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 pointer-events-none">
        <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 group-hover:bg-white transition-colors" />
        <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 group-hover:bg-white transition-colors" />
        <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 group-hover:bg-white transition-colors" />
      </div>
    </div>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correctionMap, setCorrectionMap] = useState<Record<string, CorrectionLog>>({});
  const [statusMap, setStatusMap] = useState<Record<string, AnomalyStatusValue>>({});
  const [activeFilters, setActiveFilters] = useState<Set<RowSeverity>>(new Set());
  const [statusFilters, setStatusFilters] = useState<Set<"ignored" | "corrected">>(new Set());
  const [copied, setCopied] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(480);
  const leftWidthRef = useRef(480);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidthRef.current;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      const next = Math.min(700, Math.max(280, startWidth + ev.clientX - startX));
      leftWidthRef.current = next;
      setLeftWidth(next);
    };

    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  useEffect(() => {
    const load = async () => {
      const [bilanRes, crRes, validationRes, aiRes, correctionsRes, statusesRes] = await Promise.allSettled([
        getBilan(uploadId),
        getCR(uploadId),
        getValidationReport(uploadId),
        getAnomalies(uploadId),
        getCorrections(uploadId),
        getAnomalyStatuses(uploadId),
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

      // Build correction map keyed by anomaly_id (most recent entry wins).
      if (correctionsRes.status === "fulfilled") {
        const map: Record<string, CorrectionLog> = {};
        // API returns newest-first; iterate reverse so newest wins.
        for (const c of [...correctionsRes.value].reverse()) {
          map[c.anomaly_id] = c;
        }
        setCorrectionMap(map);
      }

      // Build status map keyed by anomaly_id (ignored / deleted).
      if (statusesRes.status === "fulfilled") {
        const map: Record<string, AnomalyStatusValue> = {};
        for (const s of statusesRes.value) {
          map[s.anomaly_id] = s.status;
        }
        setStatusMap(map);
      }

      const mergedRows = toRows(bilanIssues, crWarnings, aiAnomalies, validationLines);
      setRows(mergedRows);
      setPendingSources(pending);
      setLoading(false);

      if (pending.length === 0 && mergedRows.length > 0) {
        saveAnomalies(uploadId, mergedRows).catch(() => {});
      }
    };

    load();
  }, [uploadId]);

  const handleExportPdf = async () => {
    setPdfLoading(true);
    setPdfError(null);
    try {
      await downloadAnomaliesPdf(uploadId);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Erreur lors de l'export.");
    } finally {
      setPdfLoading(false);
    }
  };

  const toggleFilter = (severity: RowSeverity) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) {
        next.delete(severity);
      } else {
        next.add(severity);
      }
      return next;
    });
    // If the selected row is filtered out, deselect it
    setSelectedId((prev) => {
      if (!prev) return prev;
      const row = rows.find((r) => r.id === prev);
      if (!row) return prev;
      const willBeHidden =
        activeFilters.size === 1 && activeFilters.has(row.severity) && !activeFilters.has(row.severity);
      return willBeHidden ? null : prev;
    });
  };

  const copyRow = () => {
    const row = rows.find((r) => r.id === selectedId);
    if (!row) return;
    const lines = [
      `Sévérité : ${SEVERITY_LABEL[row.severity]}`,
      `Source : ${row.source}`,
      row.compte ? `Compte : ${row.compte}` : null,
      `Problème : ${row.probleme}`,
      row.expected ? `Attendu : ${row.expected}` : null,
      row.actual ? `Obtenu : ${row.actual}` : null,
      row.suggestion ? `Suggestion : ${row.suggestion}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCorrect = async (
    anomalyId: string,
    compteCode: string | null,
    { field, newValue, note }: { field: string; newValue: string; note: string }
  ) => {
    const entry = await applyCorrection(uploadId, {
      anomaly_id: anomalyId,
      compte_code: compteCode ?? undefined,
      field,
      new_value: newValue,
      note: note || undefined,
    });
    setCorrectionMap((prev) => ({ ...prev, [anomalyId]: entry }));
  };

  const handleToggleIgnore = async (id: string) => {
    const isIgnored = statusMap[id] === "ignored";
    const next = isIgnored ? "active" : "ignored";
    await setAnomalyStatus(uploadId, id, next);
    setStatusMap((prev) => {
      const m = { ...prev };
      if (next === "active") delete m[id];
      else m[id] = "ignored";
      return m;
    });
  };

  const handleDelete = async (id: string) => {
    await setAnomalyStatus(uploadId, id, "deleted");
    setStatusMap((prev) => ({ ...prev, [id]: "deleted" }));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const toggleStatusFilter = (key: "ignored" | "corrected") => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Deleted anomalies are hidden everywhere; only non-deleted rows are considered.
  const nonDeletedRows = rows.filter((r) => statusMap[r.id] !== "deleted");
  const ignoredCount = nonDeletedRows.filter((r) => statusMap[r.id] === "ignored").length;
  const correctedCount = nonDeletedRows.filter((r) => !!correctionMap[r.id]).length;

  // Default (no status filter): active rows = not ignored. Severity chips count these.
  const activeRows = nonDeletedRows.filter((r) => statusMap[r.id] !== "ignored");
  const totalCritique = activeRows.filter((r) => r.severity === "critique").length;
  const totalAvert = activeRows.filter((r) => r.severity === "avertissement").length;
  const totalPCGT = activeRows.filter((r) => r.severity === "info").length;

  const visibleRows = nonDeletedRows.filter((r) => {
    const isIgnored = statusMap[r.id] === "ignored";
    const isCorrected = !!correctionMap[r.id];

    // Status dimension: when a status filter is active, show only matching rows;
    // otherwise hide ignored rows by default.
    if (statusFilters.size > 0) {
      const matchIgnored = statusFilters.has("ignored") && isIgnored;
      const matchCorrected = statusFilters.has("corrected") && isCorrected;
      if (!(matchIgnored || matchCorrected)) return false;
    } else if (isIgnored) {
      return false;
    }

    // Severity dimension (existing behaviour).
    if (activeFilters.size > 0 && !activeFilters.has(r.severity)) return false;

    return true;
  });

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  // Deselect if the selected row is now filtered out
  const effectiveSelectedRow =
    selectedRow && visibleRows.includes(selectedRow) ? selectedRow : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Chargement du rapport d&apos;anomalies…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex -mx-4 md:-mx-6 -mt-4 md:-mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 112px)" }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Left panel — list                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col overflow-hidden"
        style={{ width: leftWidth }}
      >
        {/* Sticky header */}
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          {/* Title row with export button */}
          <div className="flex items-center justify-between mb-0.5">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Rapport d&apos;Anomalies
            </h1>
            <button
              onClick={handleExportPdf}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {pdfLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <DownloadIcon className="w-3.5 h-3.5" />
              )}
              {pdfLoading ? "Export…" : "Exporter PDF"}
            </button>
          </div>

          {pdfError && (
            <p className="text-xs text-red-500 mt-1 mb-1">{pdfError}</p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Upload #{uploadId}
            {correctedCount > 0 && (
              <span className="ml-2 text-green-700 dark:text-green-300 font-semibold">
                · {correctedCount} corrigé{correctedCount > 1 ? "s" : ""}
              </span>
            )}
          </p>

          {/* Filter badges */}
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {totalCritique > 0 && (
                <button
                  onClick={() => toggleFilter("critique")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeFilters.has("critique")
                      ? SEVERITY_BADGE_ACTIVE.critique
                      : SEVERITY_BADGE.critique + " hover:opacity-80"
                  }`}
                >
                  {totalCritique} critique{totalCritique > 1 ? "s" : ""}
                </button>
              )}
              {totalAvert > 0 && (
                <button
                  onClick={() => toggleFilter("avertissement")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeFilters.has("avertissement")
                      ? SEVERITY_BADGE_ACTIVE.avertissement
                      : SEVERITY_BADGE.avertissement + " hover:opacity-80"
                  }`}
                >
                  {totalAvert} avertissement{totalAvert > 1 ? "s" : ""}
                </button>
              )}
              {totalPCGT > 0 && (
                <button
                  onClick={() => toggleFilter("info")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeFilters.has("info")
                      ? SEVERITY_BADGE_ACTIVE.info
                      : SEVERITY_BADGE.info + " hover:opacity-80"
                  }`}
                >
                  {totalPCGT} code{totalPCGT > 1 ? "s" : ""} PCGT
                </button>
              )}
              {correctedCount > 0 && (
                <button
                  onClick={() => toggleStatusFilter("corrected")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    statusFilters.has("corrected")
                      ? "bg-green-600 text-white ring-2 ring-green-400/40"
                      : "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:opacity-80"
                  }`}
                >
                  {correctedCount} corrigé{correctedCount > 1 ? "s" : ""}
                </button>
              )}
              {ignoredCount > 0 && (
                <button
                  onClick={() => toggleStatusFilter("ignored")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    statusFilters.has("ignored")
                      ? "bg-gray-600 text-white ring-2 ring-gray-400/40"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:opacity-80"
                  }`}
                >
                  {ignoredCount} ignoré{ignoredCount > 1 ? "s" : ""}
                </button>
              )}
              {(activeFilters.size > 0 || statusFilters.size > 0) && (
                <button
                  onClick={() => {
                    setActiveFilters(new Set());
                    setStatusFilters(new Set());
                  }}
                  className="px-3 py-1 rounded-full text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Tout afficher
                </button>
              )}
            </div>
          )}

          {/* Pending chips */}
          {pendingSources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {pendingSources.map((src) => (
                <span
                  key={src}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
                  {src} en attente
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Card list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {rows.length === 0 && pendingSources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <CheckCircleIcon className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-base font-semibold text-green-700 dark:text-green-300 mb-1">
                Aucune anomalie détectée
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Les comptes sont conformes au PCGT tunisien.
              </p>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Aucun résultat pour ce filtre.
              </p>
              <button
                onClick={() => {
                  setActiveFilters(new Set());
                  setStatusFilters(new Set());
                }}
                className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            visibleRows.map((row) => (
              <AnomalyCard
                key={row.id}
                row={row}
                isSelected={selectedId === row.id}
                isCorrected={!!correctionMap[row.id]}
                isIgnored={statusMap[row.id] === "ignored"}
                onSelect={() => setSelectedId(row.id)}
              />
            ))
          )}
        </div>
      </div>

      <ResizeDivider onMouseDown={startResize} />

      {/* ------------------------------------------------------------------ */}
      {/* Right panel — detail                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 bg-gray-50 dark:bg-gray-900 overflow-y-auto p-6">
        {effectiveSelectedRow ? (
          <DetailView
            row={effectiveSelectedRow}
            isIgnored={statusMap[effectiveSelectedRow.id] === "ignored"}
            correction={correctionMap[effectiveSelectedRow.id] ?? null}
            onCopy={copyRow}
            copied={copied}
            onCorrect={(payload) =>
              handleCorrect(effectiveSelectedRow.id, effectiveSelectedRow.compte, payload)
            }
            onToggleIgnore={() => handleToggleIgnore(effectiveSelectedRow.id)}
            onDelete={() => handleDelete(effectiveSelectedRow.id)}
          />
        ) : (
          <EmptyDetail />
        )}
      </div>
    </div>
  );
}
