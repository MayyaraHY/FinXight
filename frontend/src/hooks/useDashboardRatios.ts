import { DEFAULT_RATIOS, RATIO_CATALOG } from "@/components/companies/ratioCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";

/**
 * Global ratio dashboard selection (builtin keys + `custom:{id}`), persisted to
 * localStorage under `metrics:ratios`. Shared by every company dashboard and the
 * metric-management hub, so visibility/order is managed in one place.
 */
export function useDashboardRatios() {
  return useMetricSelection("metrics:ratios", DEFAULT_RATIOS, (k) => k in RATIO_CATALOG);
}
