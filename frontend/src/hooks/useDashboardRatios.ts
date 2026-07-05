import { DEFAULT_RATIOS, RATIO_CATALOG } from "@/components/companies/ratioCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";

/**
 * Ratio dashboard selection persisted to localStorage.
 * When companyId is provided the key is per-company (`metrics:ratios:{id}`),
 * otherwise falls back to the global key for non-company contexts.
 */
export function useDashboardRatios(companyId?: number) {
  const key = companyId != null ? `metrics:ratios:${companyId}` : "metrics:ratios";
  return useMetricSelection(key, DEFAULT_RATIOS, (k) => k in RATIO_CATALOG);
}
