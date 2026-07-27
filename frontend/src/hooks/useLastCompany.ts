"use client";

import { useCallback } from "react";

const STORAGE_KEY = "lastCompanyId";

/**
 * Remembers the company the user last opened so `/` can send returning users
 * straight back to it. Stored in localStorage (a UI preference, not sensitive),
 * mirroring the pattern in useMetricSelection.
 *
 * Reads are exposed as plain functions (not reactive state) because the only
 * reader is the landing router, which reads once on mount.
 */
export function useLastCompany() {
  const get = useCallback((): number | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }, []);

  const set = useCallback((id: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { get, set, clear };
}
