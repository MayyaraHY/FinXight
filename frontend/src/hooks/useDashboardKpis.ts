import { DEFAULT_KPIS, KPI_CATALOG } from "@/components/companies/kpiCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";

/**
 * KPI dashboard selection persisted to localStorage.
 * When companyId is provided the key is per-company (`metrics:kpis:{id}`),
 * otherwise falls back to the global key for non-company contexts.
 */
export function useDashboardKpis(companyId?: number) {
  const key = companyId != null ? `metrics:kpis:${companyId}` : "metrics:kpis";
  return useMetricSelection(key, DEFAULT_KPIS, (k) => k in KPI_CATALOG);
}
