"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";

import { getAccountsByUpload } from "@/services/accountService";
import { getUpload } from "@/services/UploadService";
import { Account } from "@/models/account";
import { Upload } from "@/models/Upload";

export default function UploadDetailsPage() {
  const params = useParams();
  const uploadId = Number(params.id);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 🔍 Filters
  const [search, setSearch] = useState("");
  const [prefix, setPrefix] = useState("");

  // ===== FETCH =====
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [uploadRes, accountsRes] = await Promise.all([
          getUpload(uploadId),
          getAccountsByUpload(uploadId),
        ]);
        setUpload(uploadRes);
        setAccounts(accountsRes.data || []);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load data";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    if (uploadId) fetchData();
  }, [uploadId]);

  // ===== FILTERED DATA =====
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchesSearch =
        acc.account_code.toLowerCase().includes(search.toLowerCase()) ||
        (acc.label ?? "").toLowerCase().includes(search.toLowerCase());

      const matchesPrefix = prefix
        ? acc.account_code.startsWith(prefix)
        : true;

      return matchesSearch && matchesPrefix;
    });
  }, [accounts, search, prefix]);

  // ===== TOTALS =====
  const totalDebit = filteredAccounts.reduce(
    (sum, acc) => sum + (acc.debit ?? 0),
    0
  );

  const totalCredit = filteredAccounts.reduce(
    (sum, acc) => sum + (acc.credit ?? 0),
    0
  );

  const difference = totalDebit - totalCredit;

  return (
    <div>
      <ComponentCard title={`Accounts - ${upload?.display_filename || upload?.filename || "Loading..."}`}>

        {/* 🔄 Loading */}
        {loading && (
          <div className="flex justify-center py-10">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* ❌ Error */}
        {error && (
          <Alert
            variant="error"
            title="Error"
            message={error}
            showLink={false}
          />
        )}

        {/* ✅ Content */}
        {!loading && !error && (
          <div className="space-y-4">

            {/* 🔍 Filters */}
            <div className="flex flex-col md:flex-row gap-4">
              
              {/* Search */}
              <input
                type="text"
                placeholder="Search by code or label..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 border rounded-lg w-full md:w-1/2 dark:bg-gray-800 dark:border-gray-700"
              />

              {/* Prefix Filter */}
              <input
                type="text"
                placeholder="Filter by prefix (e.g. 1, 401)"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="px-3 py-2 border rounded-lg w-full md:w-1/3 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>

            {/* 📊 Totals */}
            <div className="flex flex-wrap gap-6 text-sm font-medium">
              <div>Total Debit: {totalDebit.toFixed(2)}</div>
              <div>Total Credit: {totalCredit.toFixed(2)}</div>
              <div
                className={
                  difference !== 0
                    ? "text-red-500 font-semibold"
                    : "text-green-500"
                }
              >
                Difference: {difference.toFixed(2)}
              </div>
            </div>

            {/* 📋 Table */}
            <div className="overflow-auto max-h-[600px] border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Label</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Solde</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredAccounts.map((acc) => (
                    <tr
                      key={acc.id}
                      className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="px-3 py-2 font-medium">
                        {acc.account_code}
                      </td>
                      <td className="px-3 py-2">
                        {acc.label || "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {acc.debit ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {acc.credit ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {acc.solde_final ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredAccounts.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  No matching accounts
                </div>
              )}
            </div>
          </div>
        )}
      </ComponentCard>
    </div>
  );
}