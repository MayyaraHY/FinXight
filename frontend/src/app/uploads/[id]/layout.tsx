"use client";

import { AuthGuard } from "@/components/auth/AuthGuard";
import Badge from "@/components/ui/badge/Badge";
import { useSidebar } from "@/context/SidebarContext";
import { periodLabel } from "@/lib/periodLabel";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { Company, TimelinePeriod } from "@/models/Company";
import { Upload } from "@/models/Upload";
import { getCompany, getTimeline } from "@/services/companyService";
import { getUpload } from "@/services/UploadService";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";

const UPLOAD_TABS = [
  { label: "Comptes", segment: "accounts" },
  { label: "Bilan", segment: "bilan" },
  { label: "Compte de Résultat", segment: "cr" },
  { label: "Anomalies", segment: "anomalies" },
  { label: "Chat IA", segment: "chat" },
];

const COMPANY_TABS = [
  { label: "Dashboard", segment: "" },
  { label: "États financiers", segment: "statements" },
  { label: "Comparaison des périodes", segment: "period" },
  { label: "Synthèse", segment: "synthese" },
  { label: "Fichiers", segment: "fichiers" },
];

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const params = useParams();
  const pathname = usePathname();
  const uploadId = params.id as string;

  const [upload, setUpload] = useState<Upload | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [latestPeriod, setLatestPeriod] = useState<TimelinePeriod | null>(null);

  useEffect(() => {
    getUpload(Number(uploadId)).then((u) => {
      setUpload(u);
      if (u.company_id) {
        getCompany(u.company_id).then(setCompany).catch(() => {});
        getTimeline(u.company_id)
          .then((tl) => {
            const arr = tl.periods ?? [];
            setLatestPeriod(arr.length > 0 ? arr[arr.length - 1] : null);
          })
          .catch(() => {});
      }
    }).catch(() => {});
  }, [uploadId]);

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  return (
    <AuthGuard>
      <div className="min-h-screen xl:flex">
        <AppSidebar />
        <Backdrop />
        <div
          className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}
        >
          <AppHeader />

          {/* Company context — only shown when upload belongs to a company */}
          {company && (
            <>
              <div className="flex flex-wrap items-center gap-3 px-4 md:px-6 pt-4 pb-2">
                <Link
                  href={`/companies/${company.id}/fichiers`}
                  className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {company.name}
                </Link>
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

              {/* Company nav tabs */}
              <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 md:px-6">
                <nav className="flex gap-1 overflow-x-auto">
                  {COMPANY_TABS.map((tab) => {
                    const href = tab.segment
                      ? `/companies/${company.id}/${tab.segment}`
                      : `/companies/${company.id}`;
                    const isActive = tab.segment === "fichiers";
                    return (
                      <Link
                        key={tab.segment}
                        href={href}
                        className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          isActive
                            ? "border-brand-500 text-brand-600 dark:text-brand-400"
                            : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        }`}
                      >
                        {tab.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </>
          )}

          {/* Per-upload tab navigation */}
          <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 md:px-6">
            <nav className="flex gap-1 overflow-x-auto">
              {UPLOAD_TABS.map((tab) => {
                const href = `/uploads/${uploadId}/${tab.segment}`;
                const isActive = pathname === href;
                return (
                  <Link
                    key={tab.segment}
                    href={href}
                    className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      isActive
                        ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
