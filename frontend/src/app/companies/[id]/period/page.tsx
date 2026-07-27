"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { useSidebar } from "@/context/SidebarContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import { Company, TimelinePeriod } from "@/models/Company";
import { getCompany, getTimeline } from "@/services/companyService";
import { periodLabel } from "@/lib/periodLabel";
import Badge from "@/components/ui/badge/Badge";
import PeriodCompare from "@/components/companies/PeriodCompare";
import { useMetricLibrary } from "@/hooks/useMetricLibrary";

export default function CompanyPeriodPage() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const params = useParams();
  const router = useRouter();
  const companyId = Number(params.id);

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  const [company, setCompany] = useState<Company | null>(null);
  const [timeline, setTimeline] = useState<TimelinePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const customMetrics = useMetricLibrary();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [comp, tlRes] = await Promise.all([
          getCompany(companyId),
          getTimeline(companyId),
        ]);
        setCompany(comp);
        setTimeline(tlRes.periods);
        setError(null);
      } catch {
        setError("Échec du chargement des données de la société");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [companyId]);

  const latestPeriod = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  const navTabs = [
    { label: "Tableau de bord", href: `/companies/${companyId}` },
    { label: "États financiers", href: `/companies/${companyId}/statements` },
    { label: "Comparaison des périodes", href: `/companies/${companyId}/period` },
    { label: "Synthèse", href: `/companies/${companyId}/synthese` },
    { label: "Fichiers", href: `/companies/${companyId}/fichiers` },
  ];

  return (
    <AuthGuard>
      <div className="min-h-screen xl:flex">
        <AppSidebar />
        <Backdrop />
        <div className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
          <AppHeader />
          <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {company?.name ?? "…"}
              </h1>
              {latestPeriod && (
                <Badge color="light" size="sm">
                  Dernière période :{" "}
                  {periodLabel(
                    latestPeriod.period_year,
                    latestPeriod.period_month,
                    latestPeriod.display_filename
                  )}
                </Badge>
              )}
            </div>

            {/* Nav tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
              {navTabs.map((tab) => (
                <button
                  key={tab.href}
                  onClick={() => router.push(tab.href)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition -mb-px border-b-2 ${
                    tab.href === `/companies/${companyId}/period`
                      ? "border-brand-500 text-brand-600 dark:text-brand-400"
                      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-4">
                <Alert variant="error" title="Erreur" message={error} showLink={false} />
              </div>
            )}

            {loading ? (
              <div className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />
            ) : timeline.length >= 2 ? (
              <PeriodCompare
                companyId={companyId}
                timeline={timeline}
                customMetrics={customMetrics.metrics}
              />
            ) : (
              <ComponentCard title="Comparaison de périodes">
                <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                  Ajoutez une 2ᵉ période pour comparer.
                </p>
              </ComponentCard>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
