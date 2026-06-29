import { useCallback, useEffect, useState } from "react";
import { DEFAULT_KPIS, KPI_CATALOG, KpiKey } from "@/components/companies/kpiCatalog";

const KEY_PREFIX = "dashboard:kpis:";

function isKpiKey(v: unknown): v is KpiKey {
  return typeof v === "string" && v in KPI_CATALOG;
}

/**
 * Per-company customisable KPI selection, persisted to localStorage under
 * `dashboard:kpis:{companyId}`. Returns the ordered keys plus mutators
 * (add / remove / move / reset). Unknown keys are filtered on load.
 */
export function useDashboardKpis(companyId: number) {
  const storageKey = `${KEY_PREFIX}${companyId}`;
  const [keys, setKeys] = useState<KpiKey[]>(DEFAULT_KPIS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setKeys(DEFAULT_KPIS);
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      const clean = Array.isArray(parsed) ? parsed.filter(isKpiKey) : [];
      setKeys(clean.length ? (clean as KpiKey[]) : DEFAULT_KPIS);
    } catch {
      setKeys(DEFAULT_KPIS);
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: KpiKey[]) => {
      setKeys(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* localStorage unavailable — keep for this session only */
      }
    },
    [storageKey]
  );

  const add = useCallback(
    (key: KpiKey) => persist(keys.includes(key) ? keys : [...keys, key]),
    [keys, persist]
  );

  const remove = useCallback(
    (key: KpiKey) => persist(keys.filter((k) => k !== key)),
    [keys, persist]
  );

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= keys.length || to >= keys.length) return;
      const next = [...keys];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      persist(next);
    },
    [keys, persist]
  );

  const reset = useCallback(() => persist(DEFAULT_KPIS), [persist]);

  return { keys, add, remove, move, reset };
}
