"use client";

import Badge from "@/components/ui/badge/Badge";
import { TimelinePeriod, TimelineComparison } from "@/models/Company";

type Status = "success" | "warning" | "error" | "neutral";

function safeRatio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

function debtOf(p: TimelinePeriod): number | null {
  if (p.passifs_non_courants == null && p.passifs_courants == null) return null;
  return (p.passifs_non_courants ?? 0) + (p.passifs_courants ?? 0);
}

const STATUS_STYLE: Record<Status, { dot: string; badge: "success" | "warning" | "error" | "light" }> = {
  success: { dot: "bg-success-500", badge: "success" },
  warning: { dot: "bg-warning-500", badge: "warning" },
  error: { dot: "bg-error-500", badge: "error" },
  neutral: { dot: "bg-gray-300 dark:bg-gray-600", badge: "light" },
};

interface Props {
  latest: TimelinePeriod;
  comparison: TimelineComparison | null;
}

/**
 * Executive summary: health indicators + auto-generated highlights, derived
 * purely from the timeline/compare data already on the page (no backend).
 * Revenue / Net cash indicators are intentionally omitted (data not exposed).
 */
export default function ExecutiveSummary({ latest, comparison }: Props) {
  // --- Health indicators ---
  const netPct = comparison?.comparison.resultat_net.pct ?? null;
  const profitability: { status: Status; text: string } = (() => {
    if (netPct != null) {
      if (netPct > 2) return { status: "success", text: "En croissance" };
      if (netPct < -2) return { status: "error", text: "En baisse" };
      return { status: "warning", text: "Stable" };
    }
    if (latest.resultat_net == null) return { status: "neutral", text: "—" };
    return latest.resultat_net >= 0
      ? { status: "success", text: "Positif" }
      : { status: "error", text: "Négatif" };
  })();

  const cr = safeRatio(latest.actifs_courants, latest.passifs_courants);
  const liquidity: { status: Status; text: string } =
    cr == null
      ? { status: "neutral", text: "—" }
      : cr >= 1.5
      ? { status: "success", text: "Saine" }
      : cr >= 1
      ? { status: "warning", text: "Correcte" }
      : { status: "error", text: "Tendue" };

  const de = safeRatio(debtOf(latest), latest.capitaux_propres);
  const debtLevel: { status: Status; text: string } =
    de == null
      ? { status: "neutral", text: "—" }
      : de <= 1
      ? { status: "success", text: "Maîtrisé" }
      : de <= 2
      ? { status: "warning", text: "Modéré" }
      : { status: "error", text: "Élevé" };

  const au = safeRatio(latest.capitaux_propres, latest.total_passif);
  const autonomy: { status: Status; text: string } =
    au == null
      ? { status: "neutral", text: "—" }
      : au >= 0.4
      ? { status: "success", text: "Forte" }
      : au >= 0.3
      ? { status: "warning", text: "Correcte" }
      : { status: "error", text: "Faible" };

  const indicators = [
    { label: "Profitabilité", ...profitability },
    { label: "Liquidité", ...liquidity },
    { label: "Endettement", ...debtLevel },
    { label: "Autonomie financière", ...autonomy },
  ];

  // --- Key highlights (only when we have a comparison) ---
  type Highlight = { label: string; pct: number; good: boolean };
  const highlights: Highlight[] = [];
  if (comparison) {
    const c = comparison.comparison;
    const push = (label: string, pct: number | null, upIsGood: boolean) => {
      if (pct != null && Number.isFinite(pct) && pct !== 0)
        highlights.push({ label, pct, good: pct > 0 === upIsGood });
    };
    push("Résultat net", c.resultat_net.pct, true);
    push("Total actif", c.total_actif.pct, true);
    push("Capitaux propres", c.capitaux_propres.pct, true);

    const dA = debtOf(comparison.period_a);
    const dB = debtOf(comparison.period_b);
    if (dA != null && dB != null && dA !== 0) {
      push("Dettes", ((dB - dA) / Math.abs(dA)) * 100, false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Health indicators */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Santé financière
        </p>
        <div className="grid grid-cols-2 gap-3">
          {indicators.map((ind) => (
            <div
              key={ind.label}
              className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${STATUS_STYLE[ind.status].dot}`} />
                <span className="truncate text-sm text-gray-600 dark:text-gray-300">{ind.label}</span>
              </div>
              <Badge color={STATUS_STYLE[ind.status].badge} size="sm">
                {ind.text}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Key highlights */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Points clés
        </p>
        {highlights.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ajoutez une 2ᵉ période pour générer les variations clés.
          </p>
        ) : (
          <ul className="space-y-2">
            {highlights.map((h) => (
              <li key={h.label} className="flex items-center gap-2 text-sm">
                <span className={h.good ? "text-success-600 dark:text-success-500" : "text-error-600 dark:text-error-500"}>
                  {h.pct > 0 ? "▲" : "▼"}
                </span>
                <span className="text-gray-700 dark:text-gray-300">
                  {h.label} {h.pct > 0 ? "en hausse" : "en baisse"} de{" "}
                  {Math.abs(h.pct).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
