import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import { ThemeProvider } from "@/context/ThemeContext";
import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4 py-10">
        {/* Card */}
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
          {children}
        </div>

        {/* Theme toggle — bottom-right corner */}
        <div className="fixed bottom-6 right-6 z-50">
          <ThemeTogglerTwo />
        </div>
      </div>
    </ThemeProvider>
  );
}
