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
import CashFlowSection from "@/components/companies/CashFlowSection";
import BilanCompare from "@/components/companies/BilanCompare";
import CompteResultatCompare from "@/components/companies/CompteResultatCompare";

export default function StatementsPage() {
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
  const [tab, setTab] = useState<"cashflow" | "bilan" | "cr">("cashflow");

  useEffect(() => {
    (async () => {
      try {
        const [comp, tlRes] = await Promise.all([getCompany(companyId), getTimeline(companyId)]);
        setCompany(comp);
        setTimeline(tlRes.periods);
        setError(null);
      } catch {
        setError("Failed to load company data");
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const periodN = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const periodN1 = timeline.length > 1 ? timeline[timeline.length - 2] : null;
  const labelN = periodN
    ? periodLabel(periodN.period_year, periodN.period_month, periodN.display_filename)
    : "N";
  const labelN1 = periodN1
    ? periodLabel(periodN1.period_year, periodN1.period_month, periodN1.display_filename)
    : "N-1";

  return (
    <AuthGuard>
      <div className="min-h-screen xl:flex">
        <AppSidebar />
        <Backdrop />
        <div className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
          <AppHeader />
          <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => router.push(`/companies/${companyId}`)}
                className="text-sm text-gray-500 hover:text-brand-500 transition"
              >
                ← {company?.name ?? "Société"}
              </button>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">États financiers</h1>
            </div>

            {error && (
              <div className="mb-4">
                <Alert variant="error" title="Error" message={error} showLink={false} />
              </div>
            )}

            {loading ? (
              <p className="text-gray-500 dark:text-gray-400 py-12 text-center">Chargement…</p>
            ) : !periodN ? (
              <ComponentCard title="États financiers">
                <p className="text-gray-500 dark:text-gray-400 py-8 text-center">
                  Aucune période pour cette société.
                </p>
              </ComponentCard>
            ) : (
              <div className="space-y-6">
                {!periodN1 && (
                  <div className="px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-yellow-800 dark:text-yellow-300">
                    Un seul exercice disponible : la colonne N-1 reste vide. Ajoutez une période
                    précédente pour la comparaison.
                  </div>
                )}

                {/* Tab buttons */}
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { key: "cashflow", label: "Flux de trésorerie" },
                      { key: "bilan", label: "Bilan" },
                      { key: "cr", label: "Compte de résultat" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`px-4 py-2 text-sm rounded-lg border transition ${
                        tab === t.key
                          ? "bg-brand-500 border-brand-500 text-white"
                          : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Active section */}
                {tab === "cashflow" && (
                  <CashFlowSection companyId={companyId} timeline={timeline} />
                )}

                {tab === "bilan" && (
                  <ComponentCard title="Bilan">
                    <BilanCompare
                      uploadIdN={periodN.upload_id}
                      uploadIdN1={periodN1?.upload_id ?? null}
                      labelN={labelN}
                      labelN1={labelN1}
                    />
                  </ComponentCard>
                )}

                {tab === "cr" && (
                  <ComponentCard title="Compte de résultat">
                    <CompteResultatCompare
                      uploadIdN={periodN.upload_id}
                      uploadIdN1={periodN1?.upload_id ?? null}
                      labelN={labelN}
                      labelN1={labelN1}
                    />
                  </ComponentCard>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
