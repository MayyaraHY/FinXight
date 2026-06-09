"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { useSidebar } from "@/context/SidebarContext";
import UploadDashboard from "./components/uploadDashboard";
import { AuthGuard } from "@/components/auth/AuthGuard";

function UploadsPageInner() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const searchParams = useSearchParams();

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  const companyIdParam = searchParams.get("company_id");
  const defaultCompanyId = companyIdParam ? Number(companyIdParam) : undefined;

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
            <UploadDashboard defaultCompanyId={defaultCompanyId} />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <UploadsPageInner />
    </Suspense>
  );
}