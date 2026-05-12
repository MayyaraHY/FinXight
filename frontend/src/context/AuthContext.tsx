"use client";

/**
 * AuthContext — single source of truth for "who is logged in?" across the app.
 *
 * - On mount: calls apiClient.refresh() to recover a session from the
 *   HttpOnly refresh cookie. If that succeeds, the user is authenticated
 *   from page load. If it fails (no cookie / expired), `user` stays null.
 * - login(email, password): POST /auth/login, store access token in
 *   apiClient memory, decode claims into `user` state.
 * - logout(): POST /auth/logout, clear local state.
 *
 * The access token lives in module-level memory inside apiClient and is
 * mirrored here for rendering. Never persisted to localStorage — XSS would
 * exfiltrate it. Tab refresh re-runs the on-mount refresh-from-cookie path.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { USER_SERVICE_URL } from "@/lib/apiUrls";
import { apiClient, ApiError, extractDetail, setAccessToken, onAccessTokenChange } from "@/lib/apiClient";
import { decodeJwtClaims } from "@/lib/jwtUtils";

export interface AuthUser {
  id: string;     // UUID, stable
  email: string;
  roles: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True while the initial /auth/refresh probe is in flight. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const initRan = useRef(false);

  // Reflect token changes (e.g. silent refresh from apiClient) into user state.
  useEffect(() => {
    return onAccessTokenChange((token) => {
      if (!token) {
        setUser(null);
        return;
      }
      const claims = decodeJwtClaims(token);
      if (!claims) {
        setUser(null);
        return;
      }
      setUser({
        id: claims.sub,
        email: claims.email,
        roles: Array.isArray(claims.roles) ? claims.roles : [],
      });
    });
  }, []);

  // Try to recover a session on first mount. React strict mode in dev
  // double-invokes effects — `initRan` guards against a redundant call.
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    (async () => {
      try {
        await apiClient.refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const resp = await fetch(`${USER_SERVICE_URL}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!resp.ok) {
      let detail: unknown;
      try { detail = await resp.json(); } catch { /* ignore */ }
      throw new ApiError(
        extractDetail(detail) ?? `Login failed (HTTP ${resp.status})`,
        resp.status,
        detail,
      );
    }
    const body = await resp.json();
    const token: string | undefined = body.access_token ?? body.accessToken;
    if (!token) throw new ApiError("Login response missing access_token", 500, body);
    setAccessToken(token);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${USER_SERVICE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // network errors should not block local logout
    }
    setAccessToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used inside <AuthProvider>");
  }
  return ctx;
}
