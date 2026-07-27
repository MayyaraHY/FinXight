import { USER_SERVICE_URL } from "@/lib/apiUrls";
import { fetchAuthed } from "@/lib/apiClient";
import type { User } from "@/models/user";

const BASE = `${USER_SERVICE_URL}/users`;

/** A single recent-activity entry (auth event) from GET /users/me/activity. */
export interface ActivityEntry {
  eventType: string | null;
  createdAt: string;
  ipAddress: string | null;
}

/**
 * Marks onboarding complete (clears the server first-login flag). Idempotent —
 * safe to call more than once. Returns the updated profile.
 */
export async function completeOnboarding(): Promise<User> {
  const res = await fetchAuthed(`${BASE}/me/complete-onboarding`, { method: "PATCH" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Recent auth events for the current user, newest first. */
export async function getRecentActivity(limit = 10): Promise<ActivityEntry[]> {
  const res = await fetchAuthed(`${BASE}/me/activity?limit=${limit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
