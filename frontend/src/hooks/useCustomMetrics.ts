import { useCallback, useEffect, useState } from "react";
import { CustomMetric } from "@/models/Company";
import {
  CustomMetricInput,
  createCustomMetric,
  deleteCustomMetric,
  listCustomMetrics,
  updateCustomMetric,
} from "@/services/customMetricService";

/**
 * Loads the company's server-side custom metric definitions and exposes
 * create/update/remove. Definitions are shared (server); which ones are shown
 * is handled separately by the per-company localStorage selection hooks.
 */
export function useCustomMetrics(companyId: number) {
  const [metrics, setMetrics] = useState<CustomMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setMetrics(await listCustomMetrics(companyId));
    } catch {
      setMetrics([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(
    async (body: CustomMetricInput) => {
      const created = await createCustomMetric(companyId, body);
      setMetrics((prev) => [...prev, created]);
      return created;
    },
    [companyId]
  );

  const update = useCallback(
    async (metricId: number, body: Partial<CustomMetricInput>) => {
      const updated = await updateCustomMetric(companyId, metricId, body);
      setMetrics((prev) => prev.map((m) => (m.id === metricId ? updated : m)));
      return updated;
    },
    [companyId]
  );

  const remove = useCallback(
    async (metricId: number) => {
      await deleteCustomMetric(companyId, metricId);
      setMetrics((prev) => prev.filter((m) => m.id !== metricId));
    },
    [companyId]
  );

  return { metrics, loading, reload, create, update, remove };
}
