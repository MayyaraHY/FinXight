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
import { Company, TimelinePeriod, TimelineComparison } from "@/models/Company";
import { getCompany, getTimeline, compareTimeline } from "@/services/companyService";
import { periodLabel } from "@/lib/periodLabel";
import Badge from "@/components/ui/badge/Badge";
import ExecutiveSummary from "@/components/companies/ExecutiveSummary";

export default function CompanySynthesePage() {
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
  const [comparison, setComparison] = useState<TimelineComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [comp, tlRes] = await Promise.all([
          getCompany(companyId),
          getTimeline(companyId),
        ]);
        setCompany(comp);
        setTimeline(tlRes.periods);

        const periods = tlRes.periods;
        const prev = periods[periods.length - 2];
        const latest = periods[periods.length - 1];
        if (periods.length >= 2 && prev?.period_year && latest?.period_year) {
          try {
            setComparison(
              await compareTimeline(
                companyId,
                prev.period_year,
                latest.period_year,
                prev.period_month ?? undefined,
                latest.period_month ?? undefined
              )
            );
          } catch {
            setComparison(null);
          }
        } else {
          setComparison(null);
        }
        setError(null);
      } catch {
        setError("Failed to load company data");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [companyId]);

  const latestPeriod = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  const navTabs = [
    { label: "Dashboard", href: `/companies/${companyId}` },
    { label: "États financiers", href: `/companies/${companyId}/statements` },
    { label: "Périodes", href: `/companies/${companyId}/period` },
    { label: "Synthèse", href: `/companies/${companyId}/synthese` },
  ];

  return (
    <AuthGuard>
      <div className="min-h-screen xl:flex">
        <AppSidebar />
        <Backdrop />
        <div
          className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}
        >
          <AppHeader />
          <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
            <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
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
              </div>
            </div>

            {/* Nav tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
              {navTabs.map((tab) => (
                <button
                  key={tab.href}
                  onClick={() => router.push(tab.href)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition -mb-px border-b-2 ${
                    tab.href === `/companies/${companyId}/synthese`
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
                <Alert variant="error" title="Error" message={error} showLink={false} />
              </div>
            )}

            {loading ? (
              <div className="space-y-6">
                <div className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />
              </div>
            ) : latestPeriod ? (
              <ComponentCard title="Synthèse">
                <ExecutiveSummary latest={latestPeriod} comparison={comparison} />
              </ComponentCard>
            ) : (
              <ComponentCard title="Synthèse">
                <div className="py-10 text-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    Aucune donnée disponible. Ajoutez une période depuis le dashboard.
                  </p>
                </div>
              </ComponentCard>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
