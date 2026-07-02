import { TimelinePeriod } from "@/models/Company";

export interface RatioDef {
  key: string;
  label: string;
  /** Human-readable formula, for display in the metrics manager. */
  formula: string;
  value: (p: TimelinePeriod | null) => number | null;
  /** Optional health test on the value. */
  healthy?: (v: number) => boolean;
  /** true → higher is better (green when N > N-1). */
  higherBetter: boolean;
  format: "ratio" | "percent";
}

function safeRatio(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

function sumOrNull(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

export const RATIO_CATALOG: Record<string, RatioDef> = {
  autonomie: {
    key: "autonomie",
    label: "Autonomie financière",
    formula: "capitaux_propres / total_passif",
    value: (p) => (p ? safeRatio(p.capitaux_propres, p.total_passif) : null),
    healthy: (v) => v >= 0.3,
    higherBetter: true,
    format: "percent",
  },
  liquidite_generale: {
    key: "liquidite_generale",
    label: "Liquidité générale",
    formula: "actifs_courants / passifs_courants",
    value: (p) => (p ? safeRatio(p.actifs_courants, p.passifs_courants) : null),
    healthy: (v) => v >= 1.5,
    higherBetter: true,
    format: "ratio",
  },
  endettement: {
    key: "endettement",
    label: "Endettement (D/E)",
    formula: "(passifs_non_courants + passifs_courants) / capitaux_propres",
    value: (p) =>
      p ? safeRatio(sumOrNull(p.passifs_non_courants, p.passifs_courants), p.capitaux_propres) : null,
    healthy: (v) => v <= 1,
    higherBetter: false,
    format: "ratio",
  },
  roa: {
    key: "roa",
    label: "ROA",
    formula: "resultat_net / total_actif",
    value: (p) => (p ? safeRatio(p.resultat_net, p.total_actif) : null),
    healthy: (v) => v >= 0.05,
    higherBetter: true,
    format: "percent",
  },
  roe: {
    key: "roe",
    label: "ROE",
    formula: "resultat_net / capitaux_propres",
    value: (p) => (p ? safeRatio(p.resultat_net, p.capitaux_propres) : null),
    healthy: (v) => v >= 0.1,
    higherBetter: true,
    format: "percent", // profitability ratios shown as % (aligned with ROA)
  },
};

export const RATIO_KEYS = Object.keys(RATIO_CATALOG);

export const DEFAULT_RATIOS = ["autonomie", "liquidite_generale", "endettement", "roa", "roe"];
