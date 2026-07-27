"use client";

/**
 * Post-login landing router.
 *
 * This page renders no dashboard of its own — it decides where the user
 * belongs and redirects. It lives inside the (admin) layout, so AuthGuard has
 * already ensured the user is authenticated by the time it mounts.
 *
 * Routing table (first match wins):
 *   firstLogin & no companies   -> /onboarding
 *   firstLogin & has companies  -> clear stuck flag (fire-and-forget) -> /dashboard
 *   no companies                -> /onboarding
 *   has companies               -> /dashboard  (drop a stale lastCompanyId on the way)
 *
 * "Home is the default": returning users land on the portfolio dashboard, which
 * owns the "jump back to last company" affordance — we no longer auto-redirect
 * straight into a single company.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/hooks/useProfile";
import { getCompanies } from "@/services/companyService";
import { completeOnboarding } from "@/services/userService";
import { useLastCompany } from "@/hooks/useLastCompany";
import type { Company } from "@/models/Company";

export default function LandingRouter() {
  const router = useRouter();
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const { get: getLastCompany, clear: clearLastCompany } = useLastCompany();
  const [error, setError] = useState<string | null>(null);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current) return;
    if (profileLoading || !profile) return;
    decided.current = true;

    (async () => {
      let companies: Company[] = [];
      try {
        companies = await getCompanies();
      } catch {
        setError("Échec du chargement de votre espace de travail. Veuillez actualiser la page.");
        decided.current = false; // let a later render retry
        return;
      }

      const hasCompanies = companies.length > 0;
      const lastId = getLastCompany();
      const lastValid = lastId != null && companies.some((c) => c.id === lastId);

      if (!hasCompanies) {
        // New or empty account: onboard (create the first company).
        router.replace("/onboarding");
      } else {
        // Has companies -> home dashboard.
        if (profile.firstLogin) {
          // Stuck flag: they already have companies but it was never cleared.
          // Fix it silently (idempotent) so they aren't re-onboarded.
          completeOnboarding().catch(() => {});
        }
        // Forget a lastCompanyId that no longer points at a real company so the
        // dashboard's "jump back in" doesn't offer a dead link.
        if (lastId != null && !lastValid) clearLastCompany();
        router.replace("/dashboard");
      }
    })();
  }, [profile, profileLoading, router, getLastCompany, clearLastCompany]);

  const message =
    error ?? (profileError ? "Échec du chargement de votre profil. Veuillez actualiser la page." : null);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      {message ? (
        <p className="text-error-500">{message}</p>
      ) : (
        <p className="text-gray-500 dark:text-gray-400">Chargement de votre espace de travail…</p>
      )}
    </div>
  );
}
