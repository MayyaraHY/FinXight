"use client";

/**
 * AuthGuard — wrap any subtree that should be visible only to authenticated users.
 *
 * Behaviour:
 *   - While the initial /auth/refresh probe is in flight: render a minimal
 *     loading placeholder. We deliberately do NOT render `children` yet,
 *     to avoid flashing protected content before knowing if the user is
 *     logged in.
 *   - If, after that probe, no `user` is set: redirect to /signin.
 *   - Otherwise: render `children`.
 */

import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

import { useAuth } from "@/context/AuthContext";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm text-gray-500 dark:text-gray-400">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
