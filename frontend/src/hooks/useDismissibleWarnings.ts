import { useCallback, useEffect, useState } from "react";
import { addNotification } from "@/utils/notifications";

const KEY_PREFIX = "dismissedWarnings:";

/**
 * Tracks per-warning dismissal for a given scope (e.g. `bilan:164`).
 *
 * - `hide(id)`   — dismiss for this session only; the warning returns on reload.
 * - `ignore(id, notify?)` — dismiss permanently (persisted to localStorage for
 *   the scope). When `notify` is given, also pushes a notification to the bell.
 * - `isDismissed(id)` — true if hidden this session OR previously ignored.
 *
 * Each warning needs a stable `id`. For persisted "ignore" to survive reloads,
 * prefer a content-based id (e.g. the warning text or an account code) over an
 * array index, which can shift between renders.
 */
export function useDismissibleWarnings(scope: string) {
  const storageKey = `${KEY_PREFIX}${scope}`;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  // Load persisted "ignored" ids for this scope.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setIgnored(raw ? new Set<string>(JSON.parse(raw)) : new Set());
    } catch {
      setIgnored(new Set());
    }
  }, [storageKey]);

  const hide = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const ignore = useCallback(
    (id: string, notify?: { message: string; href: string }) => {
      setIgnored((prev) => {
        const next = new Set(prev);
        next.add(id);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* localStorage unavailable — ignore persists for this session only */
        }
        return next;
      });
      if (notify) addNotification(notify);
    },
    [storageKey]
  );

  const isDismissed = useCallback(
    (id: string) => hidden.has(id) || ignored.has(id),
    [hidden, ignored]
  );

  return { hide, ignore, isDismissed };
}
