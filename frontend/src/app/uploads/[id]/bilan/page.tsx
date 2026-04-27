"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { getBilan, generateBilan } from "@/services/bilanService";
import { formatCurrency } from "@/utils/formatters";

interface BreakdownItem {
  phase: string;
  account: string;
  label?: string;
  raw_amount?: number;
  signed_amount?: number;
  rule_prefix?: string;
}

interface AmountDetails {
  brut: number;
  amortissement: number;
  net: number;
  breakdown: BreakdownItem[];
}

interface SectionItem {
  label: string;
  amount: number;
  used_accounts: string[];
  amount_details: AmountDetails;
}

interface BilanResponse {
  success: boolean;
  message?: string;
  data: BilanData;
}

interface BilanData {
  bilan: {
    actifs: {
      actifs_non_courants: Record<string, Record<string, SectionItem>>;
      actifs_courants: Record<string, SectionItem>;
    };
    "capitaux propres et passifs": {
      "capitaux propres": Record<string, SectionItem>;
      passifs: {
        "passifs non courant": Record<string, SectionItem>;
        "passifs courant": Record<string, SectionItem>;
      };
    };
  };
  totals: {
    actif: {
      actifs_non_courants: number;
      actifs_courants: number;
      total_actif: number;
    };
    passif: {
      capitaux_propres: number;
      passifs_non_courants: number;
      passifs_courants: number;
      total_passif: number;
    };
    difference: number;
  };
}

// ===== TYPE DEFINITIONS =====
type ItemRecord = Record<string, unknown>;

// ===== HELPER FUNCTIONS =====

// Helper to check if item is a valid account item (has amount)
function isValidItem(item: unknown): item is SectionItem {
  return (
    item !== null &&
    typeof item === "object" &&
    "amount" in item &&
    "label" in item
  );
}

// Helper to render items, skipping empty containers
function renderItemsHelper(
  items: ItemRecord,
  expandedItems: Set<string>,
  toggleExpanded: (key: string) => void
): React.ReactNode[] {
  return Object.entries(items)
    .map(([key, item]) => {
      // Skip if not an object
      if (!item || typeof item !== "object") return null;

      // If it's a valid account item, render it
      if (isValidItem(item)) {
        return (
          <ExpandableRow
            key={key}
            label={item.label}
            amount={item.amount}
            breakdown={item.amount_details?.breakdown || []}
            expanded={expandedItems.has(key)}
            onToggle={() => toggleExpanded(key)}
          />
        );
      }

      // If it's a container (has nested items), recurse through them
      const hasValidChildren = Object.values(item).some(isValidItem);
      if (hasValidChildren) {
        return (
          <div key={key}>
            {Object.entries(item).map(([subKey, subItem]) => {
              if (!isValidItem(subItem)) return null;
              return (
                <ExpandableRow
                  key={subKey}
                  label={subItem.label}
                  amount={subItem.amount}
                  breakdown={subItem.amount_details?.breakdown || []}
                  expanded={expandedItems.has(subKey)}
                  onToggle={() => toggleExpanded(subKey)}
                />
              );
            })}
          </div>
        );
      }

      // Skip empty containers
      return null;
    })
    .filter(Boolean);
}

// ===== MAIN COMPONENT =====
export default function BilanPage() {
  const params = useParams();
  const uploadId = Number(params.id);

  const [bilanData, setBilanData] = useState<BilanData | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBilan = useCallback(async () => {
    try {
      const res = (await getBilan(uploadId)) as unknown;
      const bilanRes = res as BilanResponse;

      if (!bilanRes.success) {
        const generateRes = (await generateBilan(uploadId)) as unknown;
        setBilanData((generateRes as BilanResponse).data);
      } else {
        setBilanData(bilanRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bilan");
    } finally {
      setLoading(false);
    }
  }, [uploadId]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = (await generateBilan(uploadId)) as unknown;
      const bilanRes = res as BilanResponse;
      if (bilanRes.success) {
        setBilanData(bilanRes.data);
        setError(null);
      } else {
        setError(bilanRes.message || "Failed to regenerate bilan");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate bilan");
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    loadBilan();
  }, [loadBilan]);

  const toggleExpanded = (key: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setExpandedItems(newSet);
  };

  // Helper to render items with proper typing
  const renderItems = (items: ItemRecord) =>
    renderItemsHelper(items, expandedItems, toggleExpanded);

  if (loading) return <p className="p-6 text-center">Loading bilan...</p>;
  if (error)
    return <p className="p-6 text-center text-red-600">Error: {error}</p>;
  if (!bilanData)
    return <p className="p-6 text-center">No bilan data found</p>;

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Bilan (Balance Sheet)
          </h1>
          <div className="flex justify-between items-center">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition font-medium"
            >
              {regenerating ? "Regenerating..." : "Regenerate Bilan"}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <SummaryCard
            title="Total Actif"
            amount={bilanData.totals.actif.total_actif}
            variant="primary"
          />
          <SummaryCard
            title="Total Passif"
            amount={bilanData.totals.passif.total_passif}
            variant="secondary"
          />
          <SummaryCard
            title="Capitaux Propres"
            amount={bilanData.totals.passif.capitaux_propres}
            variant="info"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ACTIFS */}
          <div>
            {/* Non-Current Assets */}
            <SectionCard
              title="Actifs Non-Courants"
              total={bilanData.totals.actif.actifs_non_courants}
            >
              {renderItems(bilanData.bilan.actifs.actifs_non_courants)}
            </SectionCard>

            {/* Current Assets */}
            <SectionCard
              title="Actifs Courants"
              total={bilanData.totals.actif.actifs_courants}
              className="mt-6"
            >
              {renderItems(bilanData.bilan.actifs.actifs_courants)}
            </SectionCard>
          </div>

          {/* PASSIFS & EQUITY */}
          <div>
            {/* Equity */}
            <SectionCard
              title="Capitaux Propres"
              total={bilanData.totals.passif.capitaux_propres}
            >
              {renderItems(
                bilanData.bilan["capitaux propres et passifs"]["capitaux propres"]
              )}
            </SectionCard>

            <SectionCard
              title="Passifs Non-Courants"
              total={bilanData.totals.passif.passifs_non_courants}
              className="mt-6"
            >
              {renderItems(
                bilanData.bilan["capitaux propres et passifs"].passifs[
                  "passifs non courant"
                ]
              )}
            </SectionCard>

            {/* Current Liabilities */}
            <SectionCard
              title="Passifs Courants"
              total={bilanData.totals.passif.passifs_courants}
              className="mt-6"
            >
              {renderItems(
                bilanData.bilan["capitaux propres et passifs"].passifs[
                  "passifs courant"
                ]
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== COMPONENTS ==========

interface SummaryCardProps {
  title: string;
  amount: number;
  variant: "primary" | "secondary" | "info";
}

function SummaryCard({ title, amount, variant }: SummaryCardProps) {
  const variantStyles = {
    primary: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    secondary:
      "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    info: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
  };

  return (
    <div
      className={`${variantStyles[variant]} border-l-4 rounded-lg p-4`}
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">
        {formatCurrency(amount)}
      </p>
    </div>
  );
}

interface SectionCardProps {
  title: string;
  total: number;
  children: React.ReactNode;
  className?: string;
}

function SectionCard({
  title,
  total,
  children,
  className,
}: SectionCardProps) {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden ${
        className || ""
      }`}
    >
      <div className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {children}
      </div>
    </div>
  );
}

interface ExpandableRowProps {
  label: string;
  amount: number;
  breakdown: BreakdownItem[];
  expanded: boolean;
  onToggle: () => void;
}

function ExpandableRow({
  label,
  amount,
  breakdown,
  expanded,
  onToggle,
}: ExpandableRowProps) {
  return (
    <React.Fragment>
      <div
        onClick={onToggle}
        className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition"
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span
              className={`text-gray-400 transition ${
                expanded ? "rotate-90" : ""
              }`}
            >
              ▶
            </span>
            <span className="font-medium text-gray-900 dark:text-white">
              {label}
            </span>
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">
            {formatCurrency(amount)}
          </span>
        </div>
      </div>

      {/* Breakdown Details */}
      {expanded && (
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30">
          {breakdown.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 italic">
              No breakdown details available
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                  <th className="text-left py-2 font-semibold">Compte</th>
                  <th className="text-left py-2 font-semibold">Description</th>
                  <th className="text-right py-2 font-semibold">Montant</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((item, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600/30"
                  >
                    <td className="py-2 text-gray-900 dark:text-gray-300">
                      {item.account}
                    </td>
                    <td className="py-2 text-gray-700 dark:text-gray-400">
                      {item.label ? (
                        item.label
                      ) : (
                        <span className="italic text-gray-500 dark:text-gray-500">
                          (no label)
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right text-gray-900 dark:text-white font-medium">
                      {formatCurrency(item.raw_amount || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </React.Fragment>
  );
}