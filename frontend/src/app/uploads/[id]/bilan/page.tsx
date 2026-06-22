"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getBilan, generateBilan, analyzeBilan } from "@/services/bilanService";
import { formatCurrency, formatCurrencyRounded } from "@/utils/formatters";
import Button from "@/components/ui/button/Button";
import ExportModal from "@/components/export/ExportModal";
import { useModal } from "@/hooks/useModal";
import { useDismissibleWarnings } from "@/hooks/useDismissibleWarnings";
import DismissControls from "@/components/warnings/DismissControls";

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

// ── Reconciliation / data-quality types ──────────────────────────────────────

type ReconciliationStatus = "ok" | "discrepancy" | "unmapped";

interface ReconciliationLine {
  code: string;
  label: string;
  category: string | null;
  source_rubrique: string | null;
  status: ReconciliationStatus;
  warning: string | null;
}

interface DataQuality {
  rubrique_present: boolean;
  discrepancy_count: number;
  unmapped_count: number;
  flagged_lines: ReconciliationLine[];
  lines: ReconciliationLine[];
}

// ── Core data types ───────────────────────────────────────────────────────────

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
    balanced?: boolean;
  };
  data_quality?: DataQuality;
  analysis?: string;
  imbalance_analysis?: string;
}

// Map account_code → reconciliation line (for O(1) lookup in breakdown tables)
type ReconMap = Map<string, ReconciliationLine>;

type ItemRecord = Record<string, unknown>;

type ViewMode = "classes" | "structure";

// Human-readable labels for non-leaf grouping nodes in the rule tree (the leaves
// already carry their own `label`). Used by the "official structure" view.
const GROUP_LABELS: Record<string, string> = {
  actifs_immobilises: "Actifs immobilisés",
};

// ===== HELPERS =====

function isValidItem(item: unknown): item is SectionItem {
  return (
    item !== null &&
    typeof item === "object" &&
    "amount" in item &&
    "label" in item
  );
}

// Fallback: turn a snake_case rule key into a readable title.
function prettifyKey(key: string): string {
  const text = key.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Recursively sum the `amount` of every leaf under a (possibly nested) node.
function sumLeafAmounts(node: ItemRecord): number {
  return Object.values(node).reduce<number>((total, value) => {
    if (isValidItem(value)) return total + value.amount;
    if (value && typeof value === "object") {
      return total + sumLeafAmounts(value as ItemRecord);
    }
    return total;
  }, 0);
}

function renderItemsHelper(
  items: ItemRecord,
  expandedItems: Set<string>,
  toggleExpanded: (key: string) => void,
  reconMap: ReconMap
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
            reconMap={reconMap}
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
                  reconMap={reconMap}
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
  const [viewMode, setViewMode] = useState<ViewMode>("classes");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isOpen: exportOpen, openModal: openExport, closeModal: closeExport } = useModal();
  const warnings = useDismissibleWarnings(`bilan:${uploadId}`);

  // Build account-code → reconciliation-line lookup from data_quality.lines.
  // Only populate when the upload actually had a rubrique column; otherwise keep
  // the map empty so no rubrique UI (column, icons, highlights) appears at all.
  const reconMap: ReconMap = React.useMemo(() => {
    const map = new Map<string, ReconciliationLine>();
    if (bilanData?.data_quality?.rubrique_present) {
      bilanData.data_quality.lines?.forEach((l) => map.set(l.code, l));
    }
    return map;
  }, [bilanData]);

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

  const handleDiagnose = async () => {
    setDiagnosing(true);
    try {
      const res = await analyzeBilan(uploadId);
      if (res.success) {
        // Merge analysis fields into current bilan data without full reload
        setBilanData((prev) => prev ? { ...prev, ...res.data } : prev);
        setError(null);
      } else {
        setError(res.message || "Diagnostic IA échoué");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnostic IA échoué");
    } finally {
      setDiagnosing(false);
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
    renderItemsHelper(items, expandedItems, toggleExpanded, reconMap);

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
          {/* View-mode toggle: classes breakdown vs official bilan structure */}
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800/60">
            <button
              onClick={() => setViewMode("classes")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === "classes"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              Par classes
            </button>
            <button
              onClick={() => setViewMode("structure")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === "structure"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              Structure officielle
            </button>
          </div>
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
              : `Écart : ${formatCurrencyRounded(bilanData.totals.difference)}`}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={openExport}
          >
            Exporter .xlsx
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating || diagnosing}
          >
            {regenerating ? "Recalcul…" : "Recalculer"}
          </Button>
          {!isBalanced && (
            <Button
              size="sm"
              onClick={handleDiagnose}
              disabled={diagnosing || regenerating}
              className="bg-error-600 hover:bg-error-700 text-white border-error-600 flex items-center gap-1.5"
            >
              {diagnosing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Analyse…
                </>
              ) : (
                <>⚠ Diagnostic IA</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ── Export Modal ── */}
      <ExportModal
        isOpen={exportOpen}
        onClose={closeExport}
        uploadId={uploadId}
        available={{ bilan: true, cr: false }}
      />

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

      {/* ── AI Analysis (balanced bilan) ── */}
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

      {/* ── AI Imbalance Diagnosis (unbalanced bilan) ── */}
      {bilanData.imbalance_analysis && !warnings.isDismissed("imbalance-analysis") && (
        <div className="rounded-2xl border border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-error-600 dark:text-error-400 uppercase tracking-wide flex items-center gap-1.5">
              <span>⚠</span> Diagnostic IA — Bilan déséquilibré
            </p>
            <DismissControls
              className="text-error-600 dark:text-error-400"
              onHide={() => warnings.hide("imbalance-analysis")}
              onIgnore={() =>
                warnings.ignore("imbalance-analysis", {
                  message: "Bilan déséquilibré",
                  href: `/uploads/${uploadId}/bilan`,
                })
              }
            />
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed space-y-1">
            {bilanData.imbalance_analysis.split("\n").map((line, i) => (
              <p key={i} dangerouslySetInnerHTML={{
                __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
              }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Data Quality Banner ── */}
      {bilanData.data_quality && bilanData.data_quality.rubrique_present &&
        !warnings.isDismissed("data-quality") && (
        <DataQualityBanner
          dq={bilanData.data_quality}
          onHide={() => warnings.hide("data-quality")}
          onIgnore={() =>
            warnings.ignore("data-quality", {
              message: "Bilan — anomalies de classification",
              href: `/uploads/${uploadId}/bilan`,
            })
          }
        />
      )}

      {/* ── Two-column layout ── */}
      {viewMode === "classes" ? (
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
      ) : (
        <StructureView bilanData={bilanData} />
      )}
    </div>
  );
}

// ===== OFFICIAL STRUCTURE VIEW =====
//
// Mirrors the layout of the SCE maquette / bilan_rules.json: each asset leaf is
// expanded into its gross value, its accumulated depreciation/provisions, and a
// "Total <leaf>" subtotal; grouping nodes get their own header + subtotal; each
// section closes with its statutory total. All amounts come from the same
// `amount_details` the classes view uses — no recomputation here.

function StructureView({ bilanData }: { bilanData: BilanData }) {
  const { bilan, totals } = bilanData;
  const passif = bilan["capitaux propres et passifs"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ACTIF */}
      <div className="space-y-4">
        <ColumnLabel>Actif</ColumnLabel>
        <StructureCard title="Actifs Non Courants">
          {renderStructureNodes(bilan.actifs.actifs_non_courants, 0)}
          <StructureSubtotal
            label="Total des Actifs Non Courants"
            value={totals.actif.actifs_non_courants}
            level="section"
          />
        </StructureCard>
        <StructureCard title="Actifs Courants">
          {renderStructureNodes(bilan.actifs.actifs_courants, 0)}
          <StructureSubtotal
            label="Total des Actifs Courants"
            value={totals.actif.actifs_courants}
            level="section"
          />
        </StructureCard>
        <TotalFooter label="Total des Actifs" value={totals.actif.total_actif} />
      </div>

      {/* PASSIF */}
      <div className="space-y-4">
        <ColumnLabel>Capitaux Propres &amp; Passif</ColumnLabel>
        <StructureCard title="Capitaux Propres">
          {renderStructureNodes(passif["capitaux propres"], 0)}
          <StructureSubtotal
            label="Total des Capitaux Propres"
            value={totals.passif.capitaux_propres}
            level="section"
          />
        </StructureCard>
        <StructureCard title="Passifs Non Courants">
          {renderStructureNodes(passif.passifs["passifs non courant"], 0)}
          <StructureSubtotal
            label="Total des Passifs Non Courants"
            value={totals.passif.passifs_non_courants}
            level="section"
          />
        </StructureCard>
        <StructureCard title="Passifs Courants">
          {renderStructureNodes(passif.passifs["passifs courant"], 0)}
          <StructureSubtotal
            label="Total des Passifs Courants"
            value={totals.passif.passifs_courants}
            level="section"
          />
        </StructureCard>
        <TotalFooter
          label="Total des Capitaux Propres et Passifs"
          value={totals.passif.total_passif}
        />
      </div>
    </div>
  );
}

// Walk a (possibly nested) rule sub-tree and emit structure rows. Leaves render
// gross/amort/subtotal lines; grouping nodes render a header, their children,
// then a "Total <group>" subtotal.
function renderStructureNodes(
  nodes: ItemRecord,
  indent: number
): React.ReactNode[] {
  return Object.entries(nodes).flatMap(([key, value]) => {
    if (isValidItem(value)) {
      return [<StructureLeaf key={key} item={value} indent={indent} />];
    }
    if (!value || typeof value !== "object") return [];

    const group = value as ItemRecord;
    const groupLabel = GROUP_LABELS[key] ?? prettifyKey(key);
    return [
      <StructureRow
        key={`${key}__header`}
        label={groupLabel}
        indent={indent}
        variant="groupHeader"
      />,
      ...renderStructureNodes(group, indent + 1),
      <StructureSubtotal
        key={`${key}__total`}
        label={`Total ${groupLabel}`}
        value={sumLeafAmounts(group)}
        level="group"
        indent={indent + 1}
      />,
    ];
  });
}

function StructureCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-white/[0.02]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </h3>
      </div>
      <div>{children}</div>
    </div>
  );
}

// A single leaf rendered the "official" way: when it has accumulated
// depreciation/provisions, it splits into a gross line, an amortization line
// (shown negative) and a "Total <leaf>" subtotal; otherwise a single net line.
function StructureLeaf({ item, indent }: { item: SectionItem; indent: number }) {
  const d = item.amount_details;
  const hasAmort = !!d && Math.abs(d.amortissement) > 0.005;

  if (!hasAmort) {
    return <StructureRow label={item.label} value={item.amount} indent={indent} variant="line" />;
  }

  return (
    <>
      <StructureRow label={item.label} value={d.brut} indent={indent} variant="line" />
      <StructureRow
        label="Amortissements et provisions"
        value={-d.amortissement}
        indent={indent}
        variant="line"
      />
      <StructureSubtotal label={`Total ${item.label}`} value={item.amount} level="leaf" indent={indent} />
    </>
  );
}

interface StructureRowProps {
  label: string;
  value?: number;
  indent: number;
  variant: "line" | "groupHeader";
}

function StructureRow({ label, value, indent, variant }: StructureRowProps) {
  const padLeft = 20 + indent * 18;

  if (variant === "groupHeader") {
    return (
      <div
        className="py-2.5 pr-5 border-b border-gray-100 dark:border-gray-800"
        style={{ paddingLeft: padLeft }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between py-2 pr-5 border-b border-gray-50 dark:border-gray-800/50"
      style={{ paddingLeft: padLeft }}
    >
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <span className="text-sm text-gray-700 dark:text-gray-300 tabular-nums ml-4 flex-shrink-0">
        {formatCurrency(value ?? 0)}
      </span>
    </div>
  );
}

// Subtotal rows at three weights: leaf totals, group totals, and section totals.
function StructureSubtotal({
  label,
  value,
  level,
  indent = 0,
}: {
  label: string;
  value: number;
  level: "leaf" | "group" | "section";
  indent?: number;
}) {
  const padLeft = 20 + indent * 18;

  const styles = {
    leaf: "border-b border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-white/[0.01] text-gray-700 dark:text-gray-300 font-medium",
    group:
      "border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-white/[0.02] text-gray-800 dark:text-gray-200 font-semibold",
    section:
      "border-t border-gray-200 dark:border-gray-700 bg-gray-100/70 dark:bg-white/[0.04] text-gray-900 dark:text-white font-bold uppercase tracking-wide",
  }[level];

  return (
    <div
      className={`flex items-center justify-between py-2.5 pr-5 ${styles}`}
      style={{ paddingLeft: padLeft }}
    >
      <span className={level === "section" ? "text-xs" : "text-sm"}>{label}</span>
      <span className="text-sm tabular-nums ml-4 flex-shrink-0">
        {formatCurrencyRounded(value)}
      </span>
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
          {formatCurrencyRounded(total)}
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
        {formatCurrencyRounded(value)}
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
  reconMap: ReconMap;
}

function ExpandableRow({
  label,
  amount,
  breakdown,
  expanded,
  onToggle,
  reconMap,
}: ExpandableRowProps) {
  // Check if any account in this section has a reconciliation flag
  const sectionFlags = breakdown
    .map((b) => reconMap.get(b.account))
    .filter((r): r is ReconciliationLine => !!r && r.status !== "ok");
  const hasSectionFlag = sectionFlags.length > 0;

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
          {/* Section-level flag badge */}
          {hasSectionFlag && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400 flex-shrink-0"
              title={`${sectionFlags.length} compte(s) avec incohérence de classification`}
            >
              ⚠ {sectionFlags.length}
            </span>
          )}
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
                  {/* Show Rubrique column only when at least one row has it */}
                  {breakdown.some((b) => reconMap.get(b.account)?.source_rubrique) && (
                    <th className="text-left pb-2 font-medium">Rubrique source</th>
                  )}
                  <th className="text-right pb-2 font-medium">Montant</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((item, idx) => {
                  const recon = reconMap.get(item.account);
                  const isDiscrepancy = recon?.status === "discrepancy";
                  const isUnmapped = recon?.status === "unmapped";
                  const showRubriqueCol = breakdown.some(
                    (b) => reconMap.get(b.account)?.source_rubrique
                  );

                  return (
                    <tr
                      key={idx}
                      className={`border-b border-gray-100 dark:border-gray-800/60 last:border-0 ${
                        isDiscrepancy
                          ? "bg-error-50/40 dark:bg-error-500/5"
                          : isUnmapped
                          ? "bg-warning-50/40 dark:bg-warning-500/5"
                          : ""
                      }`}
                    >
                      {/* Account code + status icon */}
                      <td className="py-1.5 font-mono text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          {item.account}
                          {isDiscrepancy && (
                            <span
                              title={recon?.warning ?? "Incohérence de classification"}
                              className="cursor-help text-error-500 dark:text-error-400"
                            >
                              <svg className="w-3 h-3 inline" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                          {isUnmapped && (
                            <span
                              title={recon?.warning ?? "Compte non répertorié dans les règles"}
                              className="cursor-help text-warning-500 dark:text-warning-400"
                            >
                              <svg className="w-3 h-3 inline" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </span>
                      </td>

                      {/* Label */}
                      <td className="py-1.5 text-gray-600 dark:text-gray-400 pr-3">
                        {item.label ?? <span className="italic text-gray-400">—</span>}
                      </td>

                      {/* Rubrique source (conditional column) */}
                      {showRubriqueCol && (
                        <td className="py-1.5 pr-3">
                          {recon?.source_rubrique ? (
                            <span
                              className={`inline-block max-w-[160px] truncate text-[10px] px-1.5 py-0.5 rounded ${
                                isDiscrepancy
                                  ? "bg-error-100 text-error-700 dark:bg-error-500/20 dark:text-error-300"
                                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                              }`}
                              title={
                                isDiscrepancy
                                  ? `Source: "${recon.source_rubrique}" → règles: "${recon.category}"`
                                  : recon.source_rubrique
                              }
                            >
                              {recon.source_rubrique}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-700">—</span>
                          )}
                        </td>
                      )}

                      {/* Amount */}
                      <td className="py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-200">
                        {formatCurrency(item.raw_amount ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </React.Fragment>
  );
}

// ===== DATA QUALITY BANNER =====

function DataQualityBanner({
  dq,
  onHide,
  onIgnore,
}: {
  dq: DataQuality;
  onHide: () => void;
  onIgnore: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const total = dq.discrepancy_count + dq.unmapped_count;

  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10 overflow-hidden">
      {/* Summary bar */}
      <div className="flex items-start gap-3 p-4">
        <svg className="w-4 h-4 mt-0.5 text-warning-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm font-medium text-warning-700 dark:text-warning-400">
            {dq.discrepancy_count > 0 && (
              <span>{dq.discrepancy_count} compte{dq.discrepancy_count > 1 ? "s" : ""} avec rubrique incohérente</span>
            )}
            {dq.discrepancy_count > 0 && dq.unmapped_count > 0 && <span> · </span>}
            {dq.unmapped_count > 0 && (
              <span>{dq.unmapped_count} compte{dq.unmapped_count > 1 ? "s" : ""} non répertorié{dq.unmapped_count > 1 ? "s" : ""}</span>
            )}
          </p>
          <p className="text-xs text-warning-600/70 dark:text-warning-400/70 mt-0.5">
            Les montants sont calculés selon les règles SCE — les rubriques du fichier source sont affichées à titre indicatif.
            {dq.flagged_lines.length > 0 && !expanded && (
              <span className="ml-1 underline cursor-pointer">Voir le détail ({dq.flagged_lines.length})</span>
            )}
          </p>
        </button>
        <DismissControls
          className="text-warning-600 dark:text-warning-400 mt-0.5"
          onHide={onHide}
          onIgnore={onIgnore}
        />
        <button
          onClick={() => setExpanded((p) => !p)}
          aria-label={expanded ? "Réduire" : "Développer"}
          className="flex-shrink-0"
        >
          <svg
            className={`w-4 h-4 text-warning-500 transition-transform mt-0.5 ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Flagged accounts detail */}
      {expanded && dq.flagged_lines.length > 0 && (
        <div className="border-t border-warning-200 dark:border-warning-500/20 px-4 pb-4">
          <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
            {dq.flagged_lines.map((line, idx) => (
              <div
                key={`${line.code}-${idx}`}
                className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                  line.status === "discrepancy"
                    ? "bg-error-50 dark:bg-error-500/10"
                    : "bg-warning-50 dark:bg-warning-500/10"
                }`}
              >
                <span
                  className={`mt-0.5 flex-shrink-0 font-mono ${
                    line.status === "discrepancy"
                      ? "text-error-600 dark:text-error-400"
                      : "text-warning-600 dark:text-warning-400"
                  }`}
                >
                  {line.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-700 dark:text-gray-300 truncate">
                    {line.label}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5 break-words">
                    {line.warning}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
