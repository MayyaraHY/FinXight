"use client";

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
