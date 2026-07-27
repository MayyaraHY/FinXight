"use client";

/**
 * First-run onboarding. Shown to users whose server first-login flag is still
 * set. A focused 3-step flow: welcome -> create first company -> success, then
 * hand off to that company's dashboard.
 *
 * On success we store the company as the "last opened" one and clear the
 * first-login flag (best-effort — see failure note below).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import Alert from "@/components/ui/alert/Alert";
import { useProfile } from "@/hooks/useProfile";
import { getCompanies, createCompany } from "@/services/companyService";
import { completeOnboarding } from "@/services/userService";
import { useLastCompany } from "@/hooks/useLastCompany";

export default function OnboardingPage() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const { set: setLastCompany } = useLastCompany();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bounceChecked, setBounceChecked] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);

  // Guard: an already-onboarded user with companies doesn't belong here.
  // A returning user with zero companies legitimately does (they can create one).
  // Only the async, non-firstLogin branch needs a check; a firstLogin user is
  // ready immediately (see `guardReady` below), so no state is set here for them.
  useEffect(() => {
    if (loading || !profile || profile.firstLogin) return;
    let cancelled = false;
    getCompanies()
      .then((cs) => {
        if (cancelled) return;
        if (cs.length > 0) router.replace("/");
        else setBounceChecked(true);
      })
      .catch(() => {
        if (!cancelled) setBounceChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, loading, router]);

  // A firstLogin user is ready at once; a returning user waits for the bounce check.
  const guardReady = !loading && !!profile && (profile.firstLogin || bounceChecked);

  // Success screen -> dashboard. Brief pause so the "All set!" state is visible.
  useEffect(() => {
    if (step === 3 && createdId != null) {
      const t = setTimeout(() => router.replace(`/companies/${createdId}`), 900);
      return () => clearTimeout(t);
    }
  }, [step, createdId, router]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const company = await createCompany(trimmed);
      setLastCompany(company.id);
      // Clear the first-login flag. If this fails the company still exists, so
      // we proceed to the dashboard anyway; the landing router's stuck-flag
      // path (firstLogin && hasCompanies) will clear it on the next visit.
      completeOnboarding().catch(() => {});
      setCreatedId(company.id);
      setStep(3);
    } catch {
      setError("Échec de la création de la société. Veuillez réessayer.");
      setSubmitting(false);
    }
  };

  if (!guardReady) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">Chargement…</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
        <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          {/* Stepper */}
          <div className="mb-8 flex items-center justify-center gap-2">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-2 w-10 rounded-full transition-colors ${
                  n <= step ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>

          {step === 1 && (
            <div className="text-center">
              <h1 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-white">
                Bienvenue{profile?.firstName ? `, ${profile.firstName}` : ""} 👋
              </h1>
              <p className="mb-8 text-gray-500 dark:text-gray-400">
                Configurons votre espace de travail. Commencez par créer votre première société —
                vous téléverserez ensuite ses données financières.
              </p>
              <button
                onClick={() => setStep(2)}
                className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-white transition hover:bg-brand-600"
              >
                Ajouter votre première société
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                Créez votre première société
              </h1>
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                Donnez-lui un nom. Vous pourrez ajouter des périodes financières une fois créée.
              </p>

              {error && (
                <div className="mb-4">
                  <Alert variant="error" title="Erreur" message={error} showLink={false} />
                </div>
              )}

              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !submitting) handleCreate();
                }}
                placeholder="Nom de la société"
                className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Retour
                </button>
                <button
                  onClick={handleCreate}
                  disabled={submitting || !name.trim()}
                  className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-600 disabled:opacity-50"
                >
                  {submitting ? "Création…" : "Créer la société"}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-50 dark:bg-success-500/15">
                <svg className="h-7 w-7 text-success-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Tout est prêt !</h1>
              <p className="text-gray-500 dark:text-gray-400">Redirection vers votre tableau de bord…</p>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
