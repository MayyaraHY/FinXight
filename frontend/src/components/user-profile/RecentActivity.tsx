"use client";

import { useEffect, useState } from "react";
import { getRecentActivity, ActivityEntry } from "@/services/userService";
import { formatActivity } from "@/lib/companyStatus";

/**
 * Recent authentication activity for the current user. Lives on the profile
 * page — the activity feed belongs to the person, not the portfolio dashboard.
 */
export default function RecentActivity({ limit = 8 }: { limit?: number }) {
  const [activity, setActivity] = useState<ActivityEntry[] | null | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    getRecentActivity(limit)
      .then((a) => !cancelled && setActivity(a))
      .catch(() => !cancelled && setActivity(null));
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return (
    <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
      <h4 className="mb-6 text-lg font-semibold text-gray-800 dark:text-white/90">
        Activité récente
      </h4>

      {activity === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-white/5"
            />
          ))}
        </div>
      ) : activity === null ? (
        <p className="py-4 text-center text-sm text-gray-400">
          Impossible de charger l&apos;activité.
        </p>
      ) : activity.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Aucune activité récente pour le moment.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {activity.map((ev, i) => (
            <li
              key={i}
              className="flex items-center justify-between py-2.5 text-sm"
            >
              <span className="text-gray-700 dark:text-gray-300">
                {formatActivity(ev.eventType)}
              </span>
              <span className="text-gray-400">
                {new Date(ev.createdAt).toLocaleString("fr-FR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
