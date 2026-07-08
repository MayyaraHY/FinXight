"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import DismissControls from "@/components/warnings/DismissControls";
import { useDismissibleWarnings } from "@/hooks/useDismissibleWarnings";
import {
  getValidationReport,
  ValidationLine,
  ValidationStatus,
  ValidationSummary,
} from "@/services/validationService";

// ===== STATUS PRESENTATION =====

const STATUS_CONFIG: Record<
  ValidationStatus,
  { label: string; cls: string; level: "ok" | "warn" | "error" }
> = {
  valid: {
    label: "Valide",
    level: "ok",
    cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
  },
  label_mismatch: {
    label: "Libellé différent",
    level: "warn",
    cls: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  },
  class_mismatch: {
    label: "Mauvaise classe",
    level: "error",
    cls: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
  },
  invalid_code: {
    label: "Code inexistant",
    level: "error",
    cls: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
  },
  unresolved: {
    label: "Non résolu",
    level: "error",
    cls: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
  },
};

const METHOD_LABEL: Record<string, string> = {
  rule: "Règle",
  fuzzy: "Similarité",
  cache: "Cache",
  llm: "IA",
};

function StatusBadge({ status }: { status: ValidationStatus }) {
  const { label, cls } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}

// Confidence → action: a confident suggestion looks solid; a weak/zero-confidence
// one is muted and flagged "à vérifier" so an accountant never mistakes a guess
// for a certainty.
function SuggestionCell({ line }: { line: ValidationLine }) {
  if (!line.suggested_code) {
    return (
      <span className="text-xs text-gray-400 dark:text-gray-500 italic">
        Aucune suggestion — à vérifier manuellement
      </span>
    );
  }
  const confident = line.confidence >= 90;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium ${
          confident
            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
            : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600"
        }`}
        title={line.suggested_label ?? undefined}
      >
        {line.suggested_code}
        {!confident && " (à vérifier)"}
      </span>
      {line.suggested_label && (
        <span className="text-[11px] text-gray-500 dark:text-gray-400 max-w-[220px] truncate">
          {line.suggested_label}
        </span>
      )}
    </div>
  );
}

// ===== PAGE =====

export default function ValidationPage() {
  const params = useParams();
  const uploadId = Number(params.id);

  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [lines, setLines] = useState<ValidationLine[]>([]);
  const [phase, setPhase] = useState<"loading" | "pending" | "done" | "failed">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const warnings = useDismissibleWarnings(`validation:${uploadId}`);
  const pollRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount   = useRef(0);
  const cancelledRef = useRef(false); // set true on unmount to kill async chain
  const MAX_POLLS   = 20; // 20 × 3 s = 60 s max, then stop

  const load = useCallback(async () => {
    try {
      const res = await getValidationReport(uploadId);
      // Component may have unmounted while the fetch was in flight — bail out
      // before touching state or scheduling another tick.
      if (cancelledRef.current) return;

      if (res.status === "done" && res.data) {
        setSummary(res.data.summary);
        setLines(res.data.lines);
        setPhase("done");
      } else if (res.status === "failed") {
        setPhase("failed");
      } else {
        // "missing" or "pending" — not finished yet, poll again with a hard limit.
        setPhase("pending");
        if (pollCount.current < MAX_POLLS) {
          pollCount.current += 1;
          if (!cancelledRef.current) {
            pollRef.current = setTimeout(load, 3000);
          }
        } else {
          // Gave up after 60 s — stop polling, show a retry message.
          setPhase("failed");
          setError(
            "La validation n'est pas encore disponible. Rechargez la page dans quelques secondes."
          );
        }
      }
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : "Erreur de chargement");
      setPhase("failed");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadId]);

  useEffect(() => {
    cancelledRef.current = false; // re-arm for this mount
    pollCount.current = 0;
    if (uploadId) load();
    return () => {
      cancelledRef.current = true; // kills any in-flight async continuation
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [uploadId, load]);

  const visibleLines = (onlyIssues
    ? lines.filter((l) => l.status !== "valid")
    : lines
  ).filter((l) => l.status === "valid" || !warnings.isDismissed(l.source_code));

  return (
    <ComponentCard title="Validation des comptes (PCGT)">
      {(phase === "loading" || phase === "pending") && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-500 dark:text-gray-400">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span>Validation en cours…</span>
          <span className="text-xs text-gray-400">
            Lancée automatiquement après l&apos;import — actualisation auto.
          </span>
        </div>
      )}

      {phase === "failed" && (
        <Alert
          variant="error"
          title="Validation indisponible"
          message={error ?? "La validation a échoué. Les comptes restent importés et consultables."}
          showLink={false}
        />
      )}

      {phase === "done" && summary && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <SummaryStat label="Comptes vérifiés" value={summary.total} tone="neutral" />
            <SummaryStat label="Valides" value={summary.valid} tone="ok" />
            <SummaryStat label="Erreurs" value={summary.errors} tone="error" />
          </div>

          {/* Blocking call-to-action */}
          {summary.errors > 0 && (
            <div className="rounded-xl border border-error-300 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
              <strong>{summary.errors} compte{summary.errors > 1 ? "s" : ""} en erreur.</strong>{" "}
              Corrigez les codes signalés (onglet Comptes) avant de vous fier au bilan —
              un code erroné peut fausser silencieusement les états financiers.
            </div>
          )}
          {summary.errors === 0 && (
            <div className="rounded-xl border border-success-300 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10 px-4 py-3 text-sm text-success-700 dark:text-success-400">
              {summary.total} comptes vérifiés, tous valides.
            </div>
          )}

          {/* Filter */}
          {summary.errors > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={onlyIssues}
                onChange={(e) => setOnlyIssues(e.target.checked)}
              />
              N&apos;afficher que les comptes signalés
            </label>
          )}

          {/* Table */}
          <div className="overflow-auto max-h-[600px] border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left">Code source</th>
                  <th className="px-3 py-2 text-left">Libellé source</th>
                  <th className="px-3 py-2 text-left">Statut</th>
                  <th className="px-3 py-2 text-left">Suggestion PCGT</th>
                  <th className="px-3 py-2 text-left">Raison</th>
                  <th className="px-3 py-2 text-left">Méthode</th>
                  <th className="px-3 py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.map((line, idx) => {
                  const level = STATUS_CONFIG[line.status].level;
                  const rowBg =
                    level === "error"
                      ? "bg-error-50/30 dark:bg-error-500/5"
                      : level === "warn"
                      ? "bg-warning-50/30 dark:bg-warning-500/5"
                      : "";
                  return (
                    <tr
                      key={`${line.source_code}-${idx}`}
                      className={`border-b border-gray-200 dark:border-gray-700 ${rowBg}`}
                    >
                      <td className="px-3 py-2 font-mono font-medium">{line.source_code}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {line.source_label || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={line.status} />
                      </td>
                      <td className="px-3 py-2">
                        {line.status === "valid" ? (
                          <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                        ) : (
                          <SuggestionCell line={line} />
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-[280px]">
                        {line.reason}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                          {METHOD_LABEL[line.method] ?? line.method}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {line.status !== "valid" && (
                          <DismissControls
                            className="text-gray-500 dark:text-gray-400"
                            onHide={() => warnings.hide(line.source_code)}
                            onIgnore={() =>
                              warnings.ignore(line.source_code, {
                                message: `Compte ${line.source_code} — ${STATUS_CONFIG[line.status].label}`,
                                href: `/uploads/${uploadId}/validation`,
                              })
                            }
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleLines.length === 0 && (
              <div className="text-center py-6 text-gray-500 text-sm">
                Aucun compte à afficher
              </div>
            )}
          </div>
        </div>
      )}
    </ComponentCard>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "ok" | "warn" | "error";
}) {
  const toneCls = {
    neutral: "text-gray-800 dark:text-gray-200",
    ok: "text-success-600 dark:text-success-400",
    warn: "text-warning-600 dark:text-warning-400",
    error: "text-error-600 dark:text-error-400",
  }[tone];
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800">
      <div className={`text-2xl font-semibold ${toneCls}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}
