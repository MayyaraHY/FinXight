import { DEFAULT_KPIS, KPI_CATALOG } from "@/components/companies/kpiCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";

/**
 * Per-company KPI selection (builtin keys + `custom:{id}`), persisted to
 * localStorage under `dashboard:kpis:{companyId}`.
 */
export function useDashboardKpis(companyId: number) {
  return useMetricSelection(`dashboard:kpis:${companyId}`, DEFAULT_KPIS, (k) => k in KPI_CATALOG);
}
