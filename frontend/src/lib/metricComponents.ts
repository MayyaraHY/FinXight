import { validateFormula } from "@/lib/formula";
import { METRIC_VARIABLE_KEYS, MetricFormat } from "@/components/companies/metricVariables";

/** A single operand of a formula: its variable key (for source deep-linking),
 *  display label, current value, and its own display format. */
export type ComponentLine = {
  key: string;
  label: string;
  value: number | null;
  format: MetricFormat;
};

/**
 * Extract the named variable components of a formula with their current values.
 * Returns null when the formula has no arithmetic operators (i.e. it is a direct
 * field reference like "total_actif") — callers use null to decide whether to
 * render the expand toggle.
 */
export function getComponents(
  formula: string,
  vars: Record<string, number | null>,
  varMeta: { key: string; label: string; format?: MetricFormat }[]
): ComponentLine[] | null {
  if (!formula || !/[+\-*/]/.test(formula)) return null;

  const metaOf = new Map(varMeta.map((v) => [v.key, v]));
  const validation = validateFormula(formula, METRIC_VARIABLE_KEYS);
  if (!validation.ok || validation.usedVars.length === 0) return null;

  return validation.usedVars.map((key) => ({
    key,
    label: metaOf.get(key)?.label ?? key,
    value: vars[key] ?? null,
    format: metaOf.get(key)?.format ?? "currency",
  }));
}
