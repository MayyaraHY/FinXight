export interface AppNotification {
  id: string;
  message: string;
  href: string; // origin page, e.g. /uploads/164/bilan
  createdAt: number; // Date.now()
  read: boolean;
}

const STORAGE_KEY = "appNotifications";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const NOTIFICATIONS_EVENT = "notifications:changed";

function isBrowser() {
  return typeof window !== "undefined";
}

function read(): AppNotification[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppNotification[]) : [];
  } catch {
    return [];
  }
}

function write(list: AppNotification[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* localStorage unavailable */
  }
  window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
}

/** Drop entries older than one week. */
function prune(list: AppNotification[]): AppNotification[] {
  const cutoff = Date.now() - WEEK_MS;
  return list.filter((n) => n.createdAt >= cutoff);
}

/** Returns unexpired notifications, newest first. Persists the pruned list. */
export function getNotifications(): AppNotification[] {
  const pruned = prune(read());
  const current = read();
  if (pruned.length !== current.length) write(pruned);
  return [...pruned].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Append a notification. Skips if an unexpired entry with the same href +
 * message already exists, so re-ignoring the same warning doesn't spam the bell.
 */
export function addNotification(input: { message: string; href: string }): void {
  const list = prune(read());
  const duplicate = list.some(
    (n) => n.href === input.href && n.message === input.message
  );
  if (duplicate) {
    write(list); // still persist any pruning that happened
    return;
  }
  list.push({
    id:
      isBrowser() && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    message: input.message,
    href: input.href,
    createdAt: Date.now(),
    read: false,
  });
  write(list);
}

export function markAllRead(): void {
  const list = prune(read()).map((n) => ({ ...n, read: true }));
  write(list);
}

export function removeNotification(id: string): void {
  write(prune(read()).filter((n) => n.id !== id));
}

export function clearNotifications(): void {
  write([]);
}
