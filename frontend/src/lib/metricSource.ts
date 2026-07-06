import { TimelinePeriod } from "@/models/Company";

/**
 * Where a metric variable was extracted from, so an operand/KPI can deep-link to
 * the source line in the bilan or compte de résultat.
 *
 *  - bilan `anchor`: "section:<id>" targets a section total (SectionCard /
 *    TotalFooter), "leaf:<ruleKey>" targets an expandable leaf row. The rule keys
 *    match the object keys in backend/app/core/bilan_rules.json.
 *  - cr `lineId`: the statutory line to expand + highlight.
 *
 * Derived keys (dettes, fonds_de_roulement) are intentionally absent — they have
 * no single source line and render as plain, non-navigable text.
 */
export type MetricSource =
  | { statement: "bilan"; anchor: string }
  | { statement: "cr"; lineId: number };

export const METRIC_SOURCE: Record<string, MetricSource> = {
  // ── Bilan section totals ──
  total_actif: { statement: "bilan", anchor: "section:total_actif" },
  actifs_non_courants: { statement: "bilan", anchor: "section:actifs_non_courants" },
  actifs_courants: { statement: "bilan", anchor: "section:actifs_courants" },
  total_passif: { statement: "bilan", anchor: "section:total_passif" },
  capitaux_propres: { statement: "bilan", anchor: "section:capitaux_propres" },
  passifs_non_courants: { statement: "bilan", anchor: "section:passifs_non_courants" },
  passifs_courants: { statement: "bilan", anchor: "section:passifs_courants" },
  // ── Bilan leaves (rule-tree object keys) ──
  stocks: { statement: "bilan", anchor: "leaf:stocks" },
  clients: { statement: "bilan", anchor: "leaf:clients_et_comptes_rattaches" },
  fournisseurs: { statement: "bilan", anchor: "leaf:fournisseurs_et_comptes_rattaches" },
  liquidites: { statement: "bilan", anchor: "leaf:liquidites_et_equivalents_de_liquidites" },
  concours_bancaires: { statement: "bilan", anchor: "leaf:concours_bancaires_et_autres_passif_financier" },
  autres_actifs_courants: { statement: "bilan", anchor: "leaf:autres_actifs_courants" },
  autres_passifs_courants: { statement: "bilan", anchor: "leaf:autres_passifs_courants" },
  // ── Compte de résultat lines ──
  produits_exploitation: { statement: "cr", lineId: 4 }, // Total des produits d'exploitation
  charges_exploitation: { statement: "cr", lineId: 11 }, // Total des charges d'exploitation
  resultat_exploitation: { statement: "cr", lineId: 12 },
  resultat_net: { statement: "cr", lineId: 21 },
};

/** Human label for the "open the source statement" action, per statement. */
export function metricSourceActionLabel(key: string): string | null {
  const src = METRIC_SOURCE[key];
  if (!src) return null;
  return src.statement === "bilan" ? "Voir dans le bilan" : "Voir dans le compte de résultat";
}

/**
 * Build a deep-link URL to the source line for `key` in `period`'s statements,
 * or null when the metric has no mapped source or the period lacks the needed
 * statement (so callers render plain, non-clickable text).
 */
export function metricSourceHref(
  period: Pick<TimelinePeriod, "upload_id" | "has_bilan" | "has_cr">,
  key: string
): string | null {
  const src = METRIC_SOURCE[key];
  if (!src) return null;
  if (src.statement === "bilan") {
    if (!period.has_bilan) return null;
    return `/uploads/${period.upload_id}/bilan?focus=${encodeURIComponent(src.anchor)}`;
  }
  if (!period.has_cr) return null;
  return `/uploads/${period.upload_id}/cr?focus=${encodeURIComponent(`line:${src.lineId}`)}`;
}
