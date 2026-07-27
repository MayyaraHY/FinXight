import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import RecentActivity from "@/components/user-profile/RecentActivity";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Mon profil | Financial Engine",
  description: "Page de profil de Financial Engine",
};

export default function Profile() {
  return (
    <div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          Profil
        </h3>
        <div className="space-y-6">
          <UserMetaCard />
          <UserInfoCard />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}
