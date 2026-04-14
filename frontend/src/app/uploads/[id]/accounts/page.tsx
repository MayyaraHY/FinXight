"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";

import { getAccountsByUpload } from "@/services/accountService";
import { getUpload } from "@/services/UploadService";
import { Account } from "@/models/account";
import { Upload } from "@/models/Upload";
import { formatCurrency } from "@/utils/formatters";

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

  const totalSoldeFinalDebit = filteredAccounts.reduce(
    (sum, acc) => sum + (acc.solde_final_debit ?? 0),
    0
  );

  const totalSoldeFinalCredit = filteredAccounts.reduce(
    (sum, acc) => sum + (acc.solde_final_credit ?? 0),
    0
  );

  const difference = totalDebit - totalCredit;

  // ===== DETECT ACTIVE COLUMNS =====
  const activeColumns = useMemo(() => {
    const cols: { [key: string]: boolean } = {
      debit: filteredAccounts.some((acc) => acc.debit !== null && acc.debit !== undefined),
      credit: filteredAccounts.some((acc) => acc.credit !== null && acc.credit !== undefined),
      solde_debit: filteredAccounts.some((acc) => acc.solde_debit !== null && acc.solde_debit !== undefined),
      solde_credit: filteredAccounts.some((acc) => acc.solde_credit !== null && acc.solde_credit !== undefined),
      solde_final_debit: filteredAccounts.some((acc) => acc.solde_final_debit !== null && acc.solde_final_debit !== undefined),
      solde_final_credit: filteredAccounts.some((acc) => acc.solde_final_credit !== null && acc.solde_final_credit !== undefined),
      solde_final: filteredAccounts.some((acc) => acc.solde_final !== null && acc.solde_final !== undefined),
    };
    return cols;
  }, [filteredAccounts]);

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
            <div className="space-y-3 border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm font-medium">
                {activeColumns.debit && (
                  <div className="flex justify-between">
                    <span>Total Debit:</span>
                    <span>{formatCurrency(totalDebit)}</span>
                  </div>
                )}
                {activeColumns.credit && (
                  <div className="flex justify-between">
                    <span>Total Credit:</span>
                    <span>{formatCurrency(totalCredit)}</span>
                  </div>
                )}
                {(activeColumns.debit || activeColumns.credit) && (
                  <div
                    className={
                      difference !== 0
                        ? "flex justify-between text-red-500 font-semibold"
                        : "flex justify-between text-green-500"
                    }
                  >
                    <span>Difference:</span>
                    <span>{formatCurrency(difference)}</span>
                  </div>
                )}
              </div>

              {(activeColumns.solde_final_debit || activeColumns.solde_final_credit || activeColumns.solde_final) && (
                <div className="border-t border-gray-300 dark:border-gray-600 pt-3 mt-3">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-semibold">Final Balances</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm font-medium">
                    {activeColumns.solde_final_debit && (
                      <div className="flex justify-between">
                        <span>Solde Fin Débit:</span>
                        <span>{formatCurrency(totalSoldeFinalDebit)}</span>
                      </div>
                    )}
                    {activeColumns.solde_final_credit && (
                      <div className="flex justify-between">
                        <span>Solde Fin Crédit:</span>
                        <span>{formatCurrency(totalSoldeFinalCredit)}</span>
                      </div>
                    )}
                    {(activeColumns.solde_final_debit || activeColumns.solde_final_credit) && (
                      <div
                        className={
                          totalSoldeFinalDebit !== totalSoldeFinalCredit
                            ? "flex justify-between text-red-500 font-semibold"
                            : "flex justify-between text-green-500"
                        }
                      >
                        <span>Status:</span>
                        <span>{totalSoldeFinalDebit === totalSoldeFinalCredit ? "✓ Balanced" : "✗ Unbalanced"}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 📋 Table */}
            <div className="overflow-auto max-h-[600px] border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Label</th>
                    {activeColumns.debit && <th className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600">Debit</th>}
                    {activeColumns.credit && <th className="px-3 py-2 text-right">Credit</th>}
                    {activeColumns.solde_debit && <th className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600">Solde Pér Dbt</th>}
                    {activeColumns.solde_credit && <th className="px-3 py-2 text-right">Solde Pér Cdt</th>}
                    {activeColumns.solde_final_debit && <th className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600">Solde Fin Dbt</th>}
                    {activeColumns.solde_final_credit && <th className="px-3 py-2 text-right">Solde Fin Cdt</th>}
                    {activeColumns.solde_final && <th className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600">Solde Final</th>}
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
                      {activeColumns.debit && <td className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600">{formatCurrency(acc.debit)}</td>}
                      {activeColumns.credit && <td className="px-3 py-2 text-right">{formatCurrency(acc.credit)}</td>}
                      {activeColumns.solde_debit && <td className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600">{formatCurrency(acc.solde_debit)}</td>}
                      {activeColumns.solde_credit && <td className="px-3 py-2 text-right">{formatCurrency(acc.solde_credit)}</td>}
                      {activeColumns.solde_final_debit && <td className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600">{formatCurrency(acc.solde_final_debit)}</td>}
                      {activeColumns.solde_final_credit && <td className="px-3 py-2 text-right">{formatCurrency(acc.solde_final_credit)}</td>}
                      {activeColumns.solde_final && <td className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600">{formatCurrency(acc.solde_final)}</td>}
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