import { useCallback, useEffect, useState } from "react";
import {
  AppNotification,
  NOTIFICATIONS_EVENT,
  clearNotifications,
  getNotifications,
  markAllRead as storeMarkAllRead,
  removeNotification,
} from "@/utils/notifications";

/**
 * Subscribes the header bell to the localStorage notifications store. Re-reads
 * on mount and whenever the store changes — in this tab (custom event) or in
 * another tab (native `storage` event).
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refresh = useCallback(() => {
    setNotifications(getNotifications());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(NOTIFICATIONS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    markAllRead: storeMarkAllRead,
    remove: removeNotification,
    clearAll: clearNotifications,
  };
}
