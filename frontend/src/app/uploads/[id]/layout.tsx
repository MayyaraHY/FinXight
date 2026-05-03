"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import React from "react";

const TAB_ITEMS = [
  { label: "Comptes", segment: "accounts" },
  { label: "Bilan", segment: "bilan" },
  { label: "Anomalies", segment: "anomalies" },
  { label: "Chat IA", segment: "chat" },
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

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <Backdrop />
      <div
        className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}
      >
        <AppHeader />

        {/* Per-upload tab navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 md:px-6">
          <nav className="flex gap-1 overflow-x-auto">
            {TAB_ITEMS.map((tab) => {
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
  );
}
