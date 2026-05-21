"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getBilan, generateBilan } from "@/services/bilanService";
import { formatCurrency } from "@/utils/formatters";
import Button from "@/components/ui/button/Button";

// ===== TYPES =====

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
  analysis?: string;
}

type ItemRecord = Record<string, unknown>;

// ===== HELPERS =====

function isValidItem(item: unknown): item is SectionItem {
  return (
    item !== null &&
    typeof item === "object" &&
    "amount" in item &&
    "label" in item
  );
}

function renderItemsHelper(
  items: ItemRecord,
  expandedItems: Set<string>,
  toggleExpanded: (key: string) => void
): React.ReactNode[] {
  return Object.entries(items)
    .map(([key, item]) => {
      if (!item || typeof item !== "object") return null;

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

      return null;
    })
    .filter(Boolean);
}

// ===== PAGE =====

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
      const res = (await getBilan(uploadId)) as BilanResponse;
      if (!res.success) {
        const generated = (await generateBilan(uploadId)) as BilanResponse;
        setBilanData(generated.data);
      } else {
        setBilanData(res.data);
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
      const res = (await generateBilan(uploadId)) as BilanResponse;
      if (res.success) {
        setBilanData(res.data);
        setError(null);
      } else {
        setError(res.message || "Failed to regenerate bilan");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to regenerate bilan"
      );
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    loadBilan();
  }, [loadBilan]);

  const toggleExpanded = (key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const renderItems = (items: ItemRecord) =>
    renderItemsHelper(items, expandedItems, toggleExpanded);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Chargement du bilan…
        </p>
      </div>
    );

  if (error)
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15 p-5">
        <p className="text-sm font-medium text-error-700 dark:text-error-400">
          {error}
        </p>
      </div>
    );

  if (!bilanData)
    return (
      <p className="py-20 text-center text-sm text-gray-500 dark:text-gray-400">
        Aucune donnée disponible
      </p>
    );

  const isBalanced = Math.abs(bilanData.totals.difference) < 1;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Bilan Comptable
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            État de la situation financière
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              isBalanced
                ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
                : "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isBalanced ? "bg-success-500" : "bg-error-500"
              }`}
            />
            {isBalanced
              ? "Équilibré"
              : `Écart : ${formatCurrency(bilanData.totals.difference)}`}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? "Recalcul…" : "Recalculer"}
          </Button>
        </div>
      </div>

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Total Actif"
          value={bilanData.totals.actif.total_actif}
          accent="blue"
        />
        <MetricCard
          label="Total Passif"
          value={bilanData.totals.passif.total_passif}
          accent="neutral"
        />
        <MetricCard
          label="Capitaux Propres"
          value={bilanData.totals.passif.capitaux_propres}
          accent="brand"
        />
      </div>

      {/* ── AI Analysis ── */}
      {bilanData.analysis && (
        <div className="rounded-2xl border border-blue-light-200 bg-blue-light-50 dark:border-blue-light-500/30 dark:bg-blue-light-500/15 p-5">
          <p className="text-xs font-semibold text-blue-light-600 dark:text-blue-light-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <span>✦</span> Analyse IA
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
            {bilanData.analysis}
          </p>
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ACTIF */}
        <div className="space-y-4">
          <ColumnLabel>Actif</ColumnLabel>
          <SectionCard
            title="Actifs Non-Courants"
            total={bilanData.totals.actif.actifs_non_courants}
          >
            {renderItems(bilanData.bilan.actifs.actifs_non_courants)}
          </SectionCard>
          <SectionCard
            title="Actifs Courants"
            total={bilanData.totals.actif.actifs_courants}
          >
            {renderItems(bilanData.bilan.actifs.actifs_courants)}
          </SectionCard>
          {/* Actif total footer */}
          <TotalFooter
            label="Total Actif"
            value={bilanData.totals.actif.total_actif}
          />
        </div>

        {/* PASSIF */}
        <div className="space-y-4">
          <ColumnLabel>Capitaux Propres &amp; Passif</ColumnLabel>
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
          >
            {renderItems(
              bilanData.bilan["capitaux propres et passifs"].passifs[
                "passifs non courant"
              ]
            )}
          </SectionCard>
          <SectionCard
            title="Passifs Courants"
            total={bilanData.totals.passif.passifs_courants}
          >
            {renderItems(
              bilanData.bilan["capitaux propres et passifs"].passifs[
                "passifs courant"
              ]
            )}
          </SectionCard>
          {/* Passif total footer */}
          <TotalFooter
            label="Total Passif"
            value={bilanData.totals.passif.total_passif}
          />
        </div>
      </div>
    </div>
  );
}

// ===== SUB-COMPONENTS =====

function ColumnLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
      {children}
    </p>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  accent: "blue" | "neutral" | "brand";
}

function MetricCard({ label, value, accent }: MetricCardProps) {
  const bar = {
    blue: "bg-blue-light-500",
    neutral: "bg-gray-400",
    brand: "bg-brand-500",
  }[accent];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-5">
      <div className={`w-8 h-1 rounded-full ${bar} mb-4`} />
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
        {formatCurrency(value)}
      </p>
    </div>
  );
}

interface SectionCardProps {
  title: string;
  total: number;
  children: React.ReactNode;
}

function SectionCard({ title, total, children }: SectionCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title}
        </h3>
        <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
          {formatCurrency(total)}
        </span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {children}
      </div>
    </div>
  );
}

function TotalFooter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-5 py-3 flex justify-between items-center">
      <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide text-xs">
        {label}
      </span>
      <span className="text-base font-bold text-gray-900 dark:text-white tabular-nums">
        {formatCurrency(value)}
      </span>
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
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <svg
            className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm text-gray-700 dark:text-gray-300 truncate group-hover:text-gray-900 dark:group-hover:text-white">
            {label}
          </span>
        </div>
        <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums ml-4 flex-shrink-0">
          {formatCurrency(amount)}
        </span>
      </button>

      {expanded && (
        <div className="px-5 py-3 bg-gray-50/70 dark:bg-white/[0.015] border-t border-gray-100 dark:border-gray-800">
          {breakdown.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">
              Aucun détail disponible
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left pb-2 font-medium">Compte</th>
                  <th className="text-left pb-2 font-medium">Libellé</th>
                  <th className="text-right pb-2 font-medium">Montant</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((item, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-gray-100 dark:border-gray-800/60 last:border-0"
                  >
                    <td className="py-1.5 font-mono text-gray-600 dark:text-gray-400">
                      {item.account}
                    </td>
                    <td className="py-1.5 text-gray-600 dark:text-gray-400 pr-4">
                      {item.label ?? (
                        <span className="italic text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-200">
                      {formatCurrency(item.raw_amount ?? 0)}
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
