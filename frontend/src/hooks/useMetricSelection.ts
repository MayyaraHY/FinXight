import { useCallback, useEffect, useState } from "react";

/**
 * Generic per-key ordered selection persisted to localStorage. A key is kept on
 * load when it is a valid builtin (`isValidBuiltin`) OR a `custom:{id}` entry.
 * Used by both the KPI row and the ratio table.
 */
export function useMetricSelection(
  storageKey: string,
  defaults: string[],
  isValidBuiltin: (key: string) => boolean
) {
  const [keys, setKeys] = useState<string[]>(defaults);

  const keep = useCallback(
    (k: unknown): k is string =>
      typeof k === "string" && (isValidBuiltin(k) || k.startsWith("custom:")),
    [isValidBuiltin]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setKeys(defaults);
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      const clean = Array.isArray(parsed) ? parsed.filter(keep) : [];
      setKeys(clean.length ? clean : defaults);
    } catch {
      setKeys(defaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = useCallback(
    (next: string[]) => {
      setKeys(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* localStorage unavailable — session only */
      }
    },
    [storageKey]
  );

  const add = useCallback(
    (key: string) => persist(keys.includes(key) ? keys : [...keys, key]),
    [keys, persist]
  );
  const remove = useCallback((key: string) => persist(keys.filter((k) => k !== key)), [keys, persist]);
  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= keys.length || to >= keys.length) return;
      const next = [...keys];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      persist(next);
    },
    [keys, persist]
  );
  const reset = useCallback(() => persist(defaults), [persist, defaults]);

  return { keys, add, remove, move, reset };
}
