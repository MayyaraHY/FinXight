/**
 * Central HTTP wrapper.
 *
 * Responsibilities:
 *   1. Hold the current access token in module-level memory (never
 *      localStorage / sessionStorage — XSS would otherwise exfiltrate it).
 *   2. Auto-attach `Authorization: Bearer <token>` to every request.
 *   3. Auto-retry once on 401: call `POST {USER_SERVICE_URL}/auth/refresh`
 *      (the HttpOnly cookie travels automatically), then replay the
 *      original request with the new token. If refresh also fails,
 *      clear state and resolve with the original 401 response so the
 *      caller can handle it (typically: redirect to /signin).
 *   4. Send `credentials: "include"` on cross-origin calls to user-service
 *      so the refresh cookie is sent back during refresh.
 *
 * Why this file is the gateway-migration lever
 * --------------------------------------------
 * Today three URLs (USER_SERVICE_URL, BACKEND_URL, AI_SERVICE_URL) are
 * imported across the app. The day an API gateway sits in front, those
 * three constants collapse to one — see frontend/src/lib/apiUrls.ts.
 * The apiClient itself is unchanged: it takes a full URL and wraps fetch.
 */

import { USER_SERVICE_URL } from "@/lib/apiUrls";

// ----------------------------------------------------------------
//  In-memory token state
// ----------------------------------------------------------------

let accessToken: string | null = null;

// Subscribers (AuthContext registers one) get notified when the
// token changes — typically because of a 401-triggered refresh.
type TokenListener = (token: string | null) => void;
const listeners = new Set<TokenListener>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  listeners.forEach((l) => l(token));
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onAccessTokenChange(listener: TokenListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ----------------------------------------------------------------
//  Refresh
// ----------------------------------------------------------------

// In-flight refresh promise — coalesces concurrent 401s so we only
// hit /auth/refresh once even when 10 requests race to renew.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const resp = await fetch(`${USER_SERVICE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include", // send the HttpOnly refresh cookie
        headers: { "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        setAccessToken(null);
        return null;
      }
      const body = await resp.json();
      const token = body.access_token ?? body.accessToken ?? null;
      setAccessToken(token);
      return token;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// ----------------------------------------------------------------
//  Authed fetch
// ----------------------------------------------------------------

export interface FetchAuthedOptions extends RequestInit {
  /**
   * If true, do not attempt the 401-refresh-retry. Used internally for
   * the refresh call itself (avoids infinite recursion) and exposed for
   * callers that want raw control.
   */
  skipRefresh?: boolean;
}

/**
 * Fetch wrapper that injects auth and retries once on 401.
 *
 * Use this instead of raw `fetch` for any call to backend, ai-service,
 * or any user-service endpoint that requires authentication.
 */
export async function fetchAuthed(
  url: string,
  init: FetchAuthedOptions = {},
): Promise<Response> {
  const { skipRefresh, ...rest } = init;
  const headers = new Headers(rest.headers ?? {});
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const finalInit: RequestInit = {
    credentials: "include", // safe default — only the refresh cookie matters and it's Path=/auth
    ...rest,
    headers,
  };

  let resp = await fetch(url, finalInit);
  if (resp.status !== 401 || skipRefresh) return resp;

  // Try refresh once, then replay
  const newToken = await refreshAccessToken();
  if (!newToken) return resp;

  const retryHeaders = new Headers(rest.headers ?? {});
  retryHeaders.set("Authorization", `Bearer ${newToken}`);
  resp = await fetch(url, {
    credentials: "include",
    ...rest,
    headers: retryHeaders,
  });
  return resp;
}

// ----------------------------------------------------------------
//  Convenience helpers
// ----------------------------------------------------------------

export const apiClient = {
  setAccessToken,
  getAccessToken,
  onAccessTokenChange,
  fetchAuthed,

  /** Manually trigger a refresh (used by AuthContext on mount). */
  refresh: refreshAccessToken,

  async get<T = unknown>(url: string, init?: FetchAuthedOptions): Promise<T> {
    const resp = await fetchAuthed(url, { ...init, method: "GET" });
    return parseJson<T>(resp);
  },

  async post<T = unknown>(
    url: string,
    body?: unknown,
    init?: FetchAuthedOptions,
  ): Promise<T> {
    const resp = await fetchAuthed(url, withBody({ ...init, method: "POST" }, body));
    return parseJson<T>(resp);
  },

  async put<T = unknown>(
    url: string,
    body?: unknown,
    init?: FetchAuthedOptions,
  ): Promise<T> {
    const resp = await fetchAuthed(url, withBody({ ...init, method: "PUT" }, body));
    return parseJson<T>(resp);
  },

  async delete<T = unknown>(url: string, init?: FetchAuthedOptions): Promise<T> {
    const resp = await fetchAuthed(url, { ...init, method: "DELETE" });
    return parseJson<T>(resp);
  },
};

// ----------------------------------------------------------------
//  Internal helpers
// ----------------------------------------------------------------

function withBody(init: FetchAuthedOptions, body: unknown): FetchAuthedOptions {
  if (body === undefined || body === null) return init;
  // FormData / Blob / URLSearchParams: pass through; let the browser set headers.
  if (
    typeof FormData !== "undefined" && body instanceof FormData
    || typeof Blob !== "undefined" && body instanceof Blob
    || typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams
  ) {
    return { ...init, body: body as BodyInit };
  }
  // JSON default
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return { ...init, headers, body: JSON.stringify(body) };
}

async function parseJson<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail: unknown = undefined;
    try {
      detail = await resp.json();
    } catch {
      try {
        detail = await resp.text();
      } catch {
        /* ignore */
      }
    }
    const message = extractDetail(detail) ?? `HTTP ${resp.status} ${resp.statusText}`;
    throw new ApiError(message, resp.status, detail);
  }
  // 204 No Content
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Pull a human-readable message out of a FastAPI / generic error body. */
export function extractDetail(body: unknown): string | undefined {
  if (body && typeof body === "object" && "detail" in (body as object)) {
    const d = (body as Record<string, unknown>).detail;
    if (typeof d === "string") return d;
    if (d != null) return JSON.stringify(d);
  }
  if (typeof body === "string" && body) return body;
  return undefined;
}
