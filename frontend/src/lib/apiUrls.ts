/**
 * Central registry of every backend service URL.
 *
 * Every component, hook, and service module that issues HTTP calls MUST
 * import its base URL from here. Never reference `process.env.NEXT_PUBLIC_*`
 * directly in feature code, and never hardcode a host.
 *
 * Why this file exists
 * --------------------
 * The day we put an API gateway in front of these services, this file
 * collapses to one constant:
 *
 *     const BASE = process.env.NEXT_PUBLIC_API_URL!;
 *     export const USER_SERVICE_URL = BASE;
 *     export const BACKEND_URL      = BASE;
 *     export const AI_SERVICE_URL   = BASE;
 *
 * …and every consumer keeps working with zero edits. Without this
 * indirection, swapping to a gateway would touch every service file.
 *
 * Required env vars (set in .env.local — see .env.example):
 *   - NEXT_PUBLIC_USER_SERVICE_URL
 *   - NEXT_PUBLIC_BACKEND_URL
 *   - NEXT_PUBLIC_AI_SERVICE_URL
 *
 * Each is asserted non-empty at module load so a misconfigured environment
 * fails immediately and visibly instead of producing 404s at runtime.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in frontend/.env.local ` +
      `(see frontend/.env.example for the full list) and restart \`npm run dev\`.`
    );
  }
  return value;
}

export const USER_SERVICE_URL = required(
  "NEXT_PUBLIC_USER_SERVICE_URL",
  process.env.NEXT_PUBLIC_USER_SERVICE_URL,
);

export const BACKEND_URL = required(
  "NEXT_PUBLIC_BACKEND_URL",
  process.env.NEXT_PUBLIC_BACKEND_URL,
);

export const AI_SERVICE_URL = required(
  "NEXT_PUBLIC_AI_SERVICE_URL",
  process.env.NEXT_PUBLIC_AI_SERVICE_URL,
);
