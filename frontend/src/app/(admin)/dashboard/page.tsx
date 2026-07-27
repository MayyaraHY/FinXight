"use client";

/**
 * Home dashboard (post-login landing).
 *
 * A portfolio-level "home" that is deliberately one altitude *up* from a single
 * company's deep dashboard (companies/[id]) and more curated than the flat
 * companies list. Two bands:
 *   - Top (personal): greeting, quick actions, "jump back in" to recent companies.
 *   - Bottom (portfolio): health summary, aggregate totals, companies needing
 *     attention, and a recent-activity feed.
 *
 * Lives inside the (admin) route group, so the sidebar/header/padding come from
 * (admin)/layout.tsx — this component renders content only.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useProfile } from "@/hooks/useProfile";
import { useLastCompany } from "@/hooks/useLastCompany";
import ComponentCard from "@/components/common/ComponentCard";
import StatusBadge from "@/components/companies/StatusBadge";
import {
  severityOf,
  issueCount,
  issueLinks,
  type Severity,
  type StatusState,
} from "@/lib/companyStatus";
import {
  getCompanies,
  getCompanyStatus,
  getTimeline,
} from "@/services/companyService";
import { fmtCompact } from "@/lib/formatMoney";
import type { Company, TimelinePeriod } from "@/models/Company";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

/** Latest period in a timeline: the one with the greatest (year, month). */
function latestPeriod(periods: TimelinePeriod[]): TimelinePeriod | null {
  const dated = periods.filter((p) => p.period_year != null);
  if (dated.length === 0) return periods[periods.length - 1] ?? null;
  return dated.reduce((best, p) => {
    const key = (x: TimelinePeriod) => (x.period_year ?? 0) * 100 + (x.period_month ?? 0);
    return key(p) > key(best) ? p : best;
  });
}

type Aggregates = { assets: number; equity: number; netIncome: number };

const HEALTH_TILES: { sev: Severity; label: string; cls: string }[] = [
  { sev: "ok", label: "Sain", cls: "text-success-600 dark:text-success-400" },
  { sev: "warning", label: "À vérifier", cls: "text-warning-600 dark:text-warning-400" },
  { sev: "error", label: "Problèmes", cls: "text-error-600 dark:text-error-400" },
  { sev: "empty", label: "Aucune donnée", cls: "text-gray-500 dark:text-gray-400" },
];

export default function DashboardPage() {
  const { profile } = useProfile();
  const { get: getLastCompany } = useLastCompany();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [statuses, setStatuses] = useState<Record<number, StatusState>>({});
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastId, setLastId] = useState<number | null>(null);

  useEffect(() => {
    setLastId(getLastCompany());
  }, [getLastCompany]);

  useEffect(() => {
    let cancelled = false;

    getCompanies()
      .then((list) => {
        if (cancelled) return;
        setCompanies(list);
        setLoading(false);

        // Per-company status — resolve independently so one slow/failed company
        // never blocks the rest (same fan-out as the companies page).
        setStatuses(Object.fromEntries(list.map((c) => [c.id, undefined])));
        list.forEach((c) => {
          getCompanyStatus(c.id)
            .then((s) => !cancelled && setStatuses((prev) => ({ ...prev, [c.id]: s })))
            .catch(() => !cancelled && setStatuses((prev) => ({ ...prev, [c.id]: null })));
        });

        // Aggregate the latest period of every company. Failed timelines are
        // simply excluded from the totals.
        Promise.allSettled(list.map((c) => getTimeline(c.id))).then((results) => {
          if (cancelled) return;
          const agg: Aggregates = { assets: 0, equity: 0, netIncome: 0 };
          results.forEach((r) => {
            if (r.status !== "fulfilled") return;
            const lp = latestPeriod(r.value.periods);
            if (!lp) return;
            agg.assets += lp.total_actif ?? 0;
            agg.equity += lp.capitaux_propres ?? 0;
            agg.netIncome += lp.resultat_net ?? 0;
          });
          setAggregates(agg);
        });
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Health counts over the statuses that have resolved so far.
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { ok: 0, warning: 0, error: 0, empty: 0 };
    companies.forEach((co) => {
      const s = statuses[co.id];
      if (s) c[severityOf(s)]++;
    });
    return c;
  }, [companies, statuses]);

  // Companies with unresolved issues, worst-first isn't needed — just list them.
  const attention = useMemo(
    () =>
      companies.filter((co) => {
        const s = statuses[co.id];
        return s && issueCount(s) > 0;
      }),
    [companies, statuses]
  );

  // Recently opened first, then the rest — capped for the "jump back in" row.
  const jumpBack = useMemo(() => {
    const sorted = [...companies].sort((a, b) =>
      a.id === lastId ? -1 : b.id === lastId ? 1 : 0
    );
    return sorted.slice(0, 4);
  }, [companies, lastId]);

  const firstName = profile?.firstName?.trim();

  // Defensive: the landing router sends company-less users to /onboarding, so
  // this normally can't render, but don't crash if someone lands here directly.
  if (!loading && companies.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <p className="mb-4 text-gray-500 dark:text-gray-400">
          Vous n&apos;avez encore aucune société.
        </p>
        <Link
          href="/companies"
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm text-white transition hover:bg-brand-600"
        >
          Aller aux sociétés
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          {timeGreeting()}
          {firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Voici l&apos;état de votre portefeuille aujourd&apos;hui.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/uploads"
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
        >
          + Téléverser un fichier
        </Link>
        <Link
          href="/companies"
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          + Nouvelle société
        </Link>
      </div>

      {/* Jump back in */}
      <ComponentCard title="Reprendre là où vous étiez">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {jumpBack.map((c) => (
              <Link
                key={c.id}
                href={`/companies/${c.id}`}
                className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-brand-500 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-500"
              >
                <div className="flex items-center justify-between">
                  <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                    {c.name}
                  </h3>
                  {c.id === lastId && (
                    <span className="ml-2 shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                      Dernière ouverte
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {c.upload_count} fichier{c.upload_count !== 1 ? "s" : ""}
                </p>
                <div className="mt-3">
                  <StatusBadge status={statuses[c.id]} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </ComponentCard>

      {/* Portfolio health + aggregates */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ComponentCard title="Santé du portefeuille">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {HEALTH_TILES.map((t) => (
              <div
                key={t.sev}
                className="rounded-lg border border-gray-100 p-4 text-center dark:border-gray-800"
              >
                <div className={`text-2xl font-semibold ${t.cls}`}>
                  {loading ? "—" : counts[t.sev]}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t.label}</div>
              </div>
            ))}
          </div>
        </ComponentCard>

        <ComponentCard title="Totaux du portefeuille" desc="Cumulés sur la dernière période de chaque société">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Total actif", value: aggregates?.assets },
              { label: "Capitaux propres", value: aggregates?.equity },
              { label: "Résultat net", value: aggregates?.netIncome },
            ].map((t) => (
              <div
                key={t.label}
                className="rounded-lg border border-gray-100 p-4 dark:border-gray-800"
              >
                <div className="text-xl font-semibold text-gray-900 dark:text-white">
                  {aggregates ? fmtCompact(t.value) : "—"}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t.label}</div>
              </div>
            ))}
          </div>
        </ComponentCard>
      </div>

      {/* Needs attention */}
      <ComponentCard title="Nécessite votre attention">
        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-white/5" />
            ))}
          </div>
        ) : attention.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Tout semble en bonne santé 🎉
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {attention.map((c) => {
              const s = statuses[c.id];
              const links = s ? issueLinks(s) : [];
              return (
                <li key={c.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/companies/${c.id}`}
                      className="truncate text-sm font-medium text-gray-900 transition hover:text-brand-600 dark:text-white dark:hover:text-brand-400"
                    >
                      {c.name}
                    </Link>
                    <StatusBadge status={s} />
                  </div>

                  {links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {links.map((lnk) => (
                        <Link
                          key={lnk.href}
                          href={lnk.href}
                          className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300 dark:hover:text-brand-400"
                        >
                          {lnk.label}
                          <span aria-hidden>→</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ComponentCard>
    </div>
  );
}
