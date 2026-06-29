import { DEFAULT_RATIOS, RATIO_CATALOG } from "@/components/companies/ratioCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";

/**
 * Per-company ratio selection (builtin keys + `custom:{id}`), persisted to
 * localStorage under `dashboard:ratios:{companyId}`.
 */
export function useDashboardRatios(companyId: number) {
  return useMetricSelection(`dashboard:ratios:${companyId}`, DEFAULT_RATIOS, (k) => k in RATIO_CATALOG);
}
