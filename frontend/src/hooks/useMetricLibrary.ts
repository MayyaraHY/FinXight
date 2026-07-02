import { useCallback, useEffect, useState } from "react";
import { CustomMetric } from "@/models/Company";
import { CustomMetricInput } from "@/services/customMetricService";
import {
  createMetric,
  deleteMetric,
  listMetrics,
  updateMetric,
} from "@/services/metricLibraryService";

/**
 * Loads the user's global metric library (KPIs & ratios) and exposes
 * create/update/remove. These definitions apply to every company; which ones
 * appear on a dashboard is handled by the (global) selection hooks.
 */
export function useMetricLibrary() {
  const [metrics, setMetrics] = useState<CustomMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setMetrics(await listMetrics());
    } catch {
      setMetrics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(async (body: CustomMetricInput) => {
    const created = await createMetric(body);
    setMetrics((prev) => [...prev, created]);
    return created;
  }, []);

  const update = useCallback(async (metricId: number, body: Partial<CustomMetricInput>) => {
    const updated = await updateMetric(metricId, body);
    setMetrics((prev) => prev.map((m) => (m.id === metricId ? updated : m)));
    return updated;
  }, []);

  const remove = useCallback(async (metricId: number) => {
    await deleteMetric(metricId);
    setMetrics((prev) => prev.filter((m) => m.id !== metricId));
  }, []);

  return { metrics, loading, reload, create, update, remove };
}
