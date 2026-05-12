/**
 * Frontend JWT helpers.
 *
 * IMPORTANT: We do NOT verify signatures here. The frontend trusts the
 * token because it was just received over HTTPS from user-service. The
 * authoritative check happens on every API call — backend/ai-service
 * verify the signature using JWKS. If we lie to ourselves about claims
 * on the frontend, the worst that happens is a confused UI; no privilege
 * escalation is possible because the server re-validates everything.
 *
 * That is why a heavy library like ``jose`` is overkill here. We only
 * need to read the payload to populate the auth context.
 */

export interface JwtClaims {
  sub: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
  iss?: string;
  aud?: string | string[];
}

/** Decode a JWT's payload. Returns null on any parse error. */
export function decodeJwtClaims(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = base64UrlDecode(parts[1]);
    const parsed = JSON.parse(payload);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as JwtClaims;
  } catch {
    return null;
  }
}

/** Returns true if the token's `exp` has passed. Treats malformed as expired. */
export function isJwtExpired(token: string, skewSeconds = 0): boolean {
  const claims = decodeJwtClaims(token);
  if (!claims || typeof claims.exp !== "number") return true;
  const nowSec = Math.floor(Date.now() / 1000);
  return claims.exp - skewSeconds <= nowSec;
}

function base64UrlDecode(input: string): string {
  // JWT uses base64url: '-' and '_' instead of '+' and '/', no padding.
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  // atob returns Latin-1; need to convert to UTF-8 for non-ASCII claims (e.g. accented emails).
  try {
    return decodeURIComponent(
      Array.from(bin, (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""),
    );
  } catch {
    return bin;
  }
}
