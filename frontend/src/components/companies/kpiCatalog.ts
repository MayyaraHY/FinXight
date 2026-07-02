import { TimelinePeriod, TimelineComparison } from "@/models/Company";

export type KpiKey =
  | "total_actif"
  | "actifs_non_courants"
  | "actifs_courants"
  | "total_passif"
  | "capitaux_propres"
  | "passifs_non_courants"
  | "passifs_courants"
  | "resultat_net"
  | "dettes"
  | "fonds_de_roulement";

export interface KpiDef {
  key: KpiKey;
  label: string;
  /** Human-readable formula, for display in the metrics manager. */
  formula: string;
  value: (p: TimelinePeriod | null) => number | null;
  delta: (c: TimelineComparison | null) => number | null;
  pct: (c: TimelineComparison | null) => number | null;
}

// One of the 8 metrics that `/compare` returns directly (a/b/delta/pct).
type DirectKey = Exclude<KpiKey, "dettes" | "fonds_de_roulement">;

function direct(key: DirectKey, label: string): KpiDef {
  return {
    key,
    label,
    formula: key, // a direct statement line
    value: (p) => p?.[key] ?? null,
    delta: (c) => c?.comparison[key].delta ?? null,
    pct: (c) => c?.comparison[key].pct ?? null,
  };
}

function debtOf(p: TimelinePeriod): number | null {
  if (p.passifs_non_courants == null && p.passifs_courants == null) return null;
  return (p.passifs_non_courants ?? 0) + (p.passifs_courants ?? 0);
}

function frOf(p: TimelinePeriod): number | null {
  if (p.capitaux_propres == null && p.passifs_non_courants == null && p.actifs_non_courants == null)
    return null;
  return (p.capitaux_propres ?? 0) + (p.passifs_non_courants ?? 0) - (p.actifs_non_courants ?? 0);
}

// Derived metric: value from the latest period, delta/pct from the compared periods.
function derived(
  key: "dettes" | "fonds_de_roulement",
  label: string,
  formula: string,
  fn: (p: TimelinePeriod) => number | null
): KpiDef {
  return {
    key,
    label,
    formula,
    value: (p) => (p ? fn(p) : null),
    delta: (c) => {
      if (!c) return null;
      const a = fn(c.period_a);
      const b = fn(c.period_b);
      return a == null || b == null ? null : b - a;
    },
    pct: (c) => {
      if (!c) return null;
      const a = fn(c.period_a);
      const b = fn(c.period_b);
      if (a == null || b == null || a === 0) return null;
      return ((b - a) / Math.abs(a)) * 100;
    },
  };
}

export const KPI_CATALOG: Record<KpiKey, KpiDef> = {
  total_actif: direct("total_actif", "Total Actif"),
  actifs_non_courants: direct("actifs_non_courants", "Actifs non courants"),
  actifs_courants: direct("actifs_courants", "Actifs courants"),
  total_passif: direct("total_passif", "Total Passif"),
  capitaux_propres: direct("capitaux_propres", "Capitaux propres"),
  passifs_non_courants: direct("passifs_non_courants", "Passifs non courants"),
  passifs_courants: direct("passifs_courants", "Passifs courants"),
  resultat_net: direct("resultat_net", "Résultat net"),
  dettes: derived("dettes", "Dettes", "passifs_non_courants + passifs_courants", debtOf),
  fonds_de_roulement: derived(
    "fonds_de_roulement",
    "Fonds de roulement",
    "capitaux_propres + passifs_non_courants - actifs_non_courants",
    frOf
  ),
};

export const KPI_KEYS = Object.keys(KPI_CATALOG) as KpiKey[];

export const DEFAULT_KPIS: KpiKey[] = [
  "total_actif",
  "total_passif",
  "capitaux_propres",
  "resultat_net",
];
