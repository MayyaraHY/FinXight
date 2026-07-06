"use client";
import { useState, useEffect, useRef } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { CustomMetric, TimelineComparison, TimelinePeriod } from "@/models/Company";
import { compareTimeline } from "@/services/companyService";
import { periodLabel } from "@/lib/periodLabel";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

function fmtTND(val: number | null): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(val);
}

function fmtDelta(val: number | null): string {
  if (val == null) return "—";
  const sign = val > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(val)}`;
}

function fmtPct(val: number | null): string {
  if (val == null) return "—";
  return `${val > 0 ? "+" : ""}${val.toFixed(1)}%`;
}

function deltaColor(val: number | null): string {
  if (val == null || val === 0) return "text-gray-500 dark:text-gray-400";
  return val > 0 ? "text-success-600 dark:text-success-500" : "text-error-600 dark:text-error-500";
}

const BASE_METRICS: { key: string; label: string }[] = [
  { key: "total_actif", label: "Total Actif" },
  { key: "actifs_non_courants", label: "Actifs non courants" },
  { key: "actifs_courants", label: "Actifs courants" },
  { key: "total_passif", label: "Total Passif" },
  { key: "capitaux_propres", label: "Capitaux propres" },
  { key: "passifs_non_courants", label: "Passifs non courants" },
  { key: "passifs_courants", label: "Passifs courants" },
  { key: "resultat_net", label: "Résultat net" },
];

const DEFAULT_KEYS = BASE_METRICS.map((m) => m.key);
const STORAGE_KEY = "period-compare-indicators";

function loadKeys(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    }
  } catch {}
  return DEFAULT_KEYS;
}

function encodePeriod(p: TimelinePeriod): string {
  return `${p.period_year ?? "null"}_${p.period_month ?? "null"}_${p.upload_id}`;
}

interface Props {
  companyId: number;
  timeline: TimelinePeriod[];
  customMetrics?: CustomMetric[];
}

export default function PeriodCompare({ companyId, timeline, customMetrics = [] }: Props) {
  const defaultA = timeline.length >= 2 ? encodePeriod(timeline[timeline.length - 2]) : "";
  const defaultB = timeline.length >= 1 ? encodePeriod(timeline[timeline.length - 1]) : "";

  const [selA, setSelA] = useState(defaultA);
  const [selB, setSelB] = useState(defaultB);
  const [result, setResult] = useState<TimelineComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Indicator customization
  const [selectedKeys, setSelectedKeys] = useState<string[]>(loadKeys);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  // Close add dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-fetch on mount when both defaults are available
  useEffect(() => {
    if (defaultA && defaultB) fetchComparison(defaultA, defaultB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistKeys = (keys: string[]) => {
    setSelectedKeys(keys);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); } catch {}
  };

  const removeKey = (key: string) => persistKeys(selectedKeys.filter((k) => k !== key));
  const addKey = (key: string) => { persistKeys([...selectedKeys, key]); setAddOpen(false); };
  const resetKeys = () => persistKeys(DEFAULT_KEYS);

  const decodePeriod = (val: string) => timeline.find((p) => encodePeriod(p) === val);

  const fetchComparison = async (valA: string, valB: string) => {
    if (!valA || !valB) { setResult(null); setError(null); return; }
    const pA = decodePeriod(valA);
    const pB = decodePeriod(valB);
    if (!pA?.period_year || !pB?.period_year) {
      setResult(null);
      setError("Impossible de comparer des périodes sans année définie.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await compareTimeline(
        companyId, pA.period_year, pB.period_year,
        pA.period_month ?? undefined, pB.period_month ?? undefined
      );
      setResult(data);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status ?? (e as { response?: { status?: number } })?.response?.status;
      setError(status === 404 ? "Une ou les deux périodes sont introuvables." : "Erreur lors de la comparaison.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Build the ordered active row list from selectedKeys
  const baseMap = new Map(BASE_METRICS.map((m) => [m.key, m.label]));
  const customMap = new Map(customMetrics.map((cm) => [`custom:${cm.id}`, cm.name]));
  const allAvailableKeys = [...BASE_METRICS.map((m) => m.key), ...customMetrics.map((cm) => `custom:${cm.id}`)];

  const activeRows = selectedKeys
    .map((key) => {
      const label = baseMap.get(key) ?? customMap.get(key);
      return label ? { key, label } : null;
    })
    .filter((r): r is { key: string; label: string } => r !== null);

  const unselectedOptions = allAvailableKeys
    .filter((k) => !selectedKeys.includes(k))
    .map((k) => ({ key: k, label: baseMap.get(k) ?? customMap.get(k) ?? k }));

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
        Comparaison de périodes
      </h3>

      {/* Period selectors */}
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Période A</label>
          <select
            value={selA}
            onChange={(e) => { setSelA(e.target.value); fetchComparison(e.target.value, selB); }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          >
            <option value="">— Sélectionner —</option>
            {timeline.map((p) => (
              <option key={encodePeriod(p)} value={encodePeriod(p)}>
                {periodLabel(p.period_year, p.period_month, p.display_filename)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Période B</label>
          <select
            value={selB}
            onChange={(e) => { setSelB(e.target.value); fetchComparison(selA, e.target.value); }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          >
            <option value="">— Sélectionner —</option>
            {timeline.map((p) => (
              <option key={encodePeriod(p)} value={encodePeriod(p)}>
                {periodLabel(p.period_year, p.period_month, p.display_filename)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Chargement…</p>}
      {error && !loading && <p className="text-sm text-error-500 dark:text-error-400 py-2">{error}</p>}

      {result && !loading && (() => {
        const rows = activeRows
          .map((r) => ({ ...r, cv: result.comparison[r.key as keyof typeof result.comparison] }))
          .filter((r) => r.cv != null);

        const labelA = periodLabel(result.period_a.period_year, result.period_a.period_month, result.period_a.display_filename);
        const labelB = periodLabel(result.period_b.period_year, result.period_b.period_month, result.period_b.display_filename);

        const chartOptions: ApexOptions = {
          chart: { fontFamily: "Outfit, sans-serif", type: "bar", toolbar: { show: false } },
          colors: ["#465FFF", "#10B981"],
          plotOptions: { bar: { horizontal: false, columnWidth: "55%", borderRadius: 3 } },
          dataLabels: { enabled: false },
          legend: { show: false },
          grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
          xaxis: {
            categories: rows.map((r) => r.label),
            labels: { style: { fontSize: "11px", colors: "#6B7280" }, rotate: -30, trim: true, maxHeight: 60 },
            axisBorder: { show: false },
            axisTicks: { show: false },
          },
          yaxis: {
            labels: {
              style: { fontSize: "11px", colors: ["#6B7280"] },
              formatter: (v) => {
                if (v == null) return "—";
                if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                return String(Math.round(v));
              },
            },
          },
          tooltip: { y: { formatter: (v) => v == null ? "—" : new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(v) } },
        };

        return (
          <>
            <div className="flex gap-4 mb-3 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#465FFF]" />{labelA}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#10B981]" />{labelB}
              </span>
            </div>
            {rows.length > 0 && (
              <div className="overflow-x-auto mb-6">
                <div style={{ minWidth: Math.max(320, rows.length * 80) }}>
                  <ReactApexChart options={chartOptions} series={[{ name: labelA, data: rows.map((r) => r.cv?.a ?? null) }, { name: labelB, data: rows.map((r) => r.cv?.b ?? null) }]} type="bar" height={260} />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {editing && (
                  <button
                    onClick={resetKeys}
                    className="text-xs text-gray-500 hover:text-brand-500 transition"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
              <button
                onClick={() => { setEditing((v) => !v); setAddOpen(false); }}
                title={editing ? "Terminer" : "Personnaliser les indicateurs"}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-brand-500 transition"
              >
                {editing ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="18" x2="20" y2="18" />
                    <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
                    <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
                    <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
                  </svg>
                )}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 font-medium">Indicateur</th>
                    <th className="pb-2 font-medium text-right">{labelA}</th>
                    <th className="pb-2 font-medium text-right">{labelB}</th>
                    <th className="pb-2 font-medium text-right">Δ</th>
                    <th className="pb-2 font-medium text-right">Δ%</th>
                    {editing && <th className="pb-2 w-6" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ key, label, cv }) => (
                    <tr key={key} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{label}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-900 dark:text-white">{fmtTND(cv?.a ?? null)}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-900 dark:text-white">{fmtTND(cv?.b ?? null)}</td>
                      <td className={`py-2.5 pr-4 text-right font-medium ${deltaColor(cv?.delta ?? null)}`}>{fmtDelta(cv?.delta ?? null)}</td>
                      <td className={`py-2.5 text-right ${deltaColor(cv?.pct ?? null)}`}>{fmtPct(cv?.pct ?? null)}</td>
                      {editing && (
                        <td className="py-2.5 pl-3 text-right">
                          <button
                            onClick={() => removeKey(key)}
                            className="text-gray-400 hover:text-error-500 transition text-base leading-none"
                            title="Supprimer cet indicateur"
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add indicator */}
            {editing && (
              <div className="mt-3 relative" ref={addRef}>
                <button
                  onClick={() => setAddOpen((v) => !v)}
                  disabled={unselectedOptions.length === 0}
                  className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Ajouter un indicateur
                </button>
                {addOpen && unselectedOptions.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 z-20 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 max-h-60 overflow-y-auto">
                    {unselectedOptions.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => addKey(key)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
