import { severityOf, issueCount, type Severity, type StatusState } from "@/lib/companyStatus";

const BADGE: Record<Severity, { label: string; cls: string }> = {
  ok: { label: "Sain", cls: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400" },
  warning: { label: "À vérifier", cls: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400" },
  error: { label: "Problèmes", cls: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400" },
  empty: { label: "Aucune donnée", cls: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400" },
};

/** Severity pill for a company's portfolio status. Handles loading/failed states. */
export default function StatusBadge({ status }: { status: StatusState }) {
  if (status === undefined) {
    return <span className="h-5 w-20 animate-pulse rounded-full bg-gray-100 dark:bg-white/5" />;
  }
  if (status === null) {
    return <span className="text-xs text-gray-400">statut indisponible</span>;
  }
  const sev = severityOf(status);
  const badge = BADGE[sev];
  const issues = issueCount(status);
  return (
    <span className="flex items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
        {badge.label}
      </span>
      {issues > 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {issues} problème{issues !== 1 ? "s" : ""}
        </span>
      )}
    </span>
  );
}
