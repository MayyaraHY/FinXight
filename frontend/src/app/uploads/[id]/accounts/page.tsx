"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";

import { getAccountsByUpload, updateAccount, deleteAccount } from "@/services/accountService";
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

  // ✏️ EDIT & DELETE
  const [editingCell, setEditingCell] = useState<{ accountId: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [contextMenu, setContextMenu] = useState<{ 
    accountId: number; 
    x: number; 
    y: number; 
    code: string;
    label: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    accountId: number;
    code: string;
    label: string;
  } | null>(null);

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
      opening_debit: filteredAccounts.some((acc) => acc.opening_debit !== null && acc.opening_debit !== undefined),
      opening_credit: filteredAccounts.some((acc) => acc.opening_credit !== null && acc.opening_credit !== undefined),
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

  // ✏️ EDIT & DELETE HANDLERS
  const handleCellDoubleClick = (accountId: number, field: string, value: unknown) => {
    setEditingCell({ accountId, field });
    setEditValue(String(value || ""));
  };

  const handleRightClick = (e: React.MouseEvent, accountId: number, code: string, label: string) => {
    e.preventDefault();
    setContextMenu({ accountId, x: e.clientX, y: e.clientY, code, label });
  };

  const handleSaveEdit = async () => {
    if (!editingCell) return;
    
    try {
      const updates: Record<string, string | number | null> = {};
      const numericFields = ["debit", "credit", "solde_debit", "solde_credit", "solde_final_debit", "solde_final_credit", "solde_final", "opening_debit", "opening_credit"];
      
      if (numericFields.includes(editingCell.field)) {
        // Convert to number for numeric fields
        updates[editingCell.field] = editValue === "" ? null : parseFloat(editValue);
      } else {
        // Keep as string for text fields
        updates[editingCell.field] = editValue === "" ? null : editValue;
      }
      
      await updateAccount(editingCell.accountId, updates);
      
      // Update local state
      const newValue = numericFields.includes(editingCell.field) 
        ? (editValue === "" ? null : parseFloat(editValue))
        : (editValue === "" ? null : editValue);
      
      setAccounts(accounts.map(acc => 
        acc.id === editingCell.accountId 
          ? { ...acc, [editingCell.field]: newValue }
          : acc
      ));
      
      setEditingCell(null);
      setEditValue("");
    } catch (err) {
      alert("Failed to update account: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) return;
    
    try {
      await deleteAccount(deleteConfirm.accountId);
      setAccounts(accounts.filter(acc => acc.id !== deleteConfirm.accountId));
      setDeleteConfirm(null);
      setContextMenu(null);
    } catch (err) {
      alert("Failed to delete account: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setEditValue("");
    }
  };

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
                    {activeColumns.opening_debit && <th className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600">Opening Debit</th>}
                    {activeColumns.opening_credit && <th className="px-3 py-2 text-right">Opening Credit</th>}
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
                      onContextMenu={(e) => handleRightClick(e, acc.id, acc.account_code, acc.label || "")}
                    >
                      <td 
                        className="px-3 py-2 font-medium cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                        onDoubleClick={() => handleCellDoubleClick(acc.id, "account_code", acc.account_code)}
                      >
                        {editingCell?.accountId === acc.id && editingCell.field === "account_code" ? (
                          <input
                            autoFocus
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSaveEdit}
                            className="w-full px-2 py-1 border border-blue-500 rounded"
                          />
                        ) : (
                          acc.account_code
                        )}
                      </td>
                      <td 
                        className="px-3 py-2 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                        onDoubleClick={() => handleCellDoubleClick(acc.id, "label", acc.label || "")}
                      >
                        {editingCell?.accountId === acc.id && editingCell.field === "label" ? (
                          <input
                            autoFocus
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSaveEdit}
                            className="w-full px-2 py-1 border border-blue-500 rounded"
                          />
                        ) : (
                          acc.label || "-"
                        )}
                      </td>
                      {activeColumns.opening_debit && (
                        <td 
                          className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "opening_debit", acc.opening_debit)}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "opening_debit" ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleSaveEdit}
                              className="w-full px-2 py-1 border border-blue-500 rounded text-right"
                            />
                          ) : (
                            formatCurrency(acc.opening_debit)
                          )}
                        </td>
                      )}
                      {activeColumns.opening_credit && (
                        <td 
                          className="px-3 py-2 text-right cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "opening_credit", acc.opening_credit)}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "opening_credit" ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleSaveEdit}
                              className="w-full px-2 py-1 border border-blue-500 rounded text-right"
                            />
                          ) : (
                            formatCurrency(acc.opening_credit)
                          )}
                        </td>
                      )}
                      {activeColumns.debit && (
                        <td 
                          className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "debit", acc.debit)}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "debit" ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleSaveEdit}
                              className="w-full px-2 py-1 border border-blue-500 rounded text-right"
                            />
                          ) : (
                            formatCurrency(acc.debit)
                          )}
                        </td>
                      )}
                      {activeColumns.credit && (
                        <td 
                          className="px-3 py-2 text-right cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "credit", acc.credit)}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "credit" ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleSaveEdit}
                              className="w-full px-2 py-1 border border-blue-500 rounded text-right"
                            />
                          ) : (
                            formatCurrency(acc.credit)
                          )}
                        </td>
                      )}
                      {activeColumns.solde_debit && (
                        <td 
                          className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "solde_debit", acc.solde_debit)}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "solde_debit" ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleSaveEdit}
                              className="w-full px-2 py-1 border border-blue-500 rounded text-right"
                            />
                          ) : (
                            formatCurrency(acc.solde_debit)
                          )}
                        </td>
                      )}
                      {activeColumns.solde_credit && (
                        <td 
                          className="px-3 py-2 text-right cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "solde_credit", acc.solde_credit)}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "solde_credit" ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleSaveEdit}
                              className="w-full px-2 py-1 border border-blue-500 rounded text-right"
                            />
                          ) : (
                            formatCurrency(acc.solde_credit)
                          )}
                        </td>
                      )}
                      {activeColumns.solde_final_debit && (
                        <td 
                          className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "solde_final_debit", acc.solde_final_debit)}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "solde_final_debit" ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleSaveEdit}
                              className="w-full px-2 py-1 border border-blue-500 rounded text-right"
                            />
                          ) : (
                            formatCurrency(acc.solde_final_debit)
                          )}
                        </td>
                      )}
                      {activeColumns.solde_final_credit && (
                        <td 
                          className="px-3 py-2 text-right cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "solde_final_credit", acc.solde_final_credit)}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "solde_final_credit" ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleSaveEdit}
                              className="w-full px-2 py-1 border border-blue-500 rounded text-right"
                            />
                          ) : (
                            formatCurrency(acc.solde_final_credit)
                          )}
                        </td>
                      )}
                      {activeColumns.solde_final && (
                        <td 
                          className="px-3 py-2 text-right border-l border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          onDoubleClick={() => handleCellDoubleClick(acc.id, "solde_final", acc.solde_final)}
                        >
                          {editingCell?.accountId === acc.id && editingCell.field === "solde_final" ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleSaveEdit}
                              className="w-full px-2 py-1 border border-blue-500 rounded text-right"
                            />
                          ) : (
                            formatCurrency(acc.solde_final)
                          )}
                        </td>
                      )}
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

        {/* 🎯 Context Menu */}
        {contextMenu && (
          <div
            className="fixed bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={() => setContextMenu(null)}
          >
            <button
              className="block w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
              onClick={() => setDeleteConfirm({
                isOpen: true,
                accountId: contextMenu.accountId,
                code: contextMenu.code,
                label: contextMenu.label
              })}
            >
              Delete
            </button>
          </div>
        )}

        {/* 🗑️ Delete Confirmation Modal */}
        {deleteConfirm?.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Delete Account?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete this account?
                <br />
                <strong>Code:</strong> {deleteConfirm.code}
                <br />
                <strong>Label:</strong> {deleteConfirm.label}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </ComponentCard>
    </div>
  );
}