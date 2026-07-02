import { DEFAULT_KPIS, KPI_CATALOG } from "@/components/companies/kpiCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";

/**
 * Global KPI dashboard selection (builtin keys + `custom:{id}`), persisted to
 * localStorage under `metrics:kpis`. Shared by every company dashboard and the
 * metric-management hub, so visibility/order is managed in one place.
 */
export function useDashboardKpis() {
  return useMetricSelection("metrics:kpis", DEFAULT_KPIS, (k) => k in KPI_CATALOG);
}
