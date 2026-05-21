"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchAuthed } from "@/lib/apiClient";
import { USER_SERVICE_URL } from "@/lib/apiUrls";
import { useAuth } from "@/context/AuthContext";
import type { User } from "@/models/user";

interface UseProfileResult {
  profile: User | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches the full profile of the currently authenticated user from
 * GET /users/me. Returns null while loading or when unauthenticated.
 *
 * Re-fetches whenever the auth user changes (login / logout / token refresh).
 */
export function useProfile(): UseProfileResult {
  const { user } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuthed(`${USER_SERVICE_URL}/users/me`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: User = await res.json();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, error, refetch: fetchProfile };
}
