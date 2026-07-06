"use client";

import Badge from "@/components/ui/badge/Badge";
import { SyntheseHealthEntry, SyntheseKeyPoint } from "@/models/Company";

const METRIC_LABELS: Record<string, string> = {
  resultat_net: "Résultat net",
  total_actif: "Total actif",
  capitaux_propres: "Capitaux propres",
  dettes: "Dettes",
};

const LEVEL_BADGE: Record<string, "success" | "warning" | "error" | "light"> = {
  good: "success",
  warning: "warning",
  bad: "error",
};

const DIMENSION_ORDER = ["liquidite", "endettement", "autonomie_financiere", "profitabilite"];

const DIMENSION_LABELS: Record<string, string> = {
  liquidite: "Liquidité",
  endettement: "Endettement",
  autonomie_financiere: "Autonomie financière",
  profitabilite: "Profitabilité",
};

function fmtValue(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(2);
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

interface Props {
  year: number;
  year_prev: number | null;
  health: Record<string, SyntheseHealthEntry>;
  keyPoints: SyntheseKeyPoint[];
}

export default function ExecutiveSummary({ year, year_prev, health, keyPoints }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Health indicators */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Santé financière — {year}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {DIMENSION_ORDER.map((key) => {
            const entry: SyntheseHealthEntry | undefined = health[key];
            if (!entry) return null;
            const badgeColor = entry.level ? LEVEL_BADGE[entry.level] ?? "light" : "light";
            const tooltip = entry.value != null
              ? `${entry.formula_label} = ${fmtValue(entry.value)}`
              : entry.formula_label;
            return (
              <div
                key={key}
                title={tooltip}
                className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 p-3 dark:border-gray-800 cursor-help"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                    entry.level === "good" ? "bg-success-500"
                    : entry.level === "warning" ? "bg-warning-500"
                    : entry.level === "bad" ? "bg-error-500"
                    : "bg-gray-300 dark:bg-gray-600"
                  }`} />
                  <span className="truncate text-sm text-gray-600 dark:text-gray-300">
                    {DIMENSION_LABELS[key] ?? key}
                  </span>
                </div>
                <Badge color={badgeColor} size="sm">
                  {entry.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key points */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Points clés{year_prev ? ` — vs ${year_prev}` : ""}
        </p>
        {keyPoints.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ajoutez une 2ᵉ période pour générer les variations clés.
          </p>
        ) : (
          <ul className="space-y-2">
            {keyPoints.map((kp) => {
              const arrowGlyph = kp.direction === "up" ? "▲" : kp.direction === "down" ? "▼" : "→";
              const sentimentColor =
                kp.sentiment === "positive" ? "text-success-600 dark:text-success-500"
                : kp.sentiment === "negative" ? "text-error-600 dark:text-error-500"
                : "text-gray-500 dark:text-gray-400";
              return (
                <li key={kp.metric} className="flex items-center gap-2 text-sm">
                  <span className={`flex-shrink-0 font-medium ${sentimentColor}`}>
                    {arrowGlyph}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {METRIC_LABELS[kp.metric] ?? kp.metric}{" "}
                    {kp.direction === "up" ? "en hausse" : kp.direction === "down" ? "en baisse" : "stable"}{" "}
                    de <span className={`font-medium ${sentimentColor}`}>{fmtPct(kp.delta_pct)}</span>
                    {kp.basis ? ` (${kp.basis})` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
