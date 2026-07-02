"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { CustomMetric, TimelinePeriod } from "@/models/Company";
import { CustomMetricInput, GeneratedMetric } from "@/services/customMetricService";
import { METRIC_VARIABLES, METRIC_VARIABLE_KEYS, periodVars } from "@/components/companies/metricVariables";
import { evalFormula, validateFormula } from "@/lib/formula";

type Kind = "kpi" | "ratio";
type Format = "currency" | "ratio" | "percent";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultKind: Kind;
  /** When set, the modal edits this metric instead of creating a new one. */
  editing?: CustomMetric | null;
  latestPeriod: TimelinePeriod | null;
  onSubmit: (body: CustomMetricInput) => Promise<unknown>;
  /** When provided, shows a "Générer avec l'IA" button that drafts the fields from the name. */
  onGenerate?: (name: string) => Promise<GeneratedMetric>;
}

function fmtPreview(v: number | null, format: Format): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (format === "currency") return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(v);
  if (format === "percent") return `${(v * 100).toFixed(1)}%`;
  return v.toFixed(2);
}

export default function CustomMetricModal({
  isOpen,
  onClose,
  defaultKind,
  editing,
  latestPeriod,
  onSubmit,
  onGenerate,
}: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [format, setFormat] = useState<Format>(defaultKind === "ratio" ? "ratio" : "currency");
  const [formula, setFormula] = useState("");
  const [higherBetter, setHigherBetter] = useState(true);
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the edited metric (or reset to defaults) each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setName(editing.name);
      setKind(editing.kind);
      setFormat(editing.format ?? (editing.kind === "ratio" ? "ratio" : "currency"));
      setFormula(editing.formula);
      setHigherBetter(editing.higher_better);
      setThreshold(editing.threshold != null ? String(editing.threshold) : "");
    } else {
      setName("");
      setKind(defaultKind);
      setFormat(defaultKind === "ratio" ? "ratio" : "currency");
      setFormula("");
      setHigherBetter(true);
      setThreshold("");
    }
    setError(null);
    setGenerating(false);
  }, [isOpen, editing, defaultKind]);

  const validation = useMemo(() => validateFormula(formula, METRIC_VARIABLE_KEYS), [formula]);
  const preview = useMemo(
    () => (validation.ok ? evalFormula(formula, periodVars(latestPeriod)) : null),
    [validation.ok, formula, latestPeriod]
  );

  const reset = () => {
    setName("");
    setKind(defaultKind);
    setFormat(defaultKind === "ratio" ? "ratio" : "currency");
    setFormula("");
    setHigherBetter(true);
    setThreshold("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canGenerate = !!onGenerate && name.trim().length > 0 && !generating && !saving;

  const handleGenerate = async () => {
    if (!canGenerate || !onGenerate) return;
    setGenerating(true);
    setError(null);
    try {
      const g = await onGenerate(name.trim());
      if (g.name) setName(g.name);
      setKind(g.kind);
      setFormat(g.format);
      setFormula(g.formula);
      setHigherBetter(g.higher_better);
      setThreshold(g.threshold == null ? "" : String(g.threshold));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la génération.");
    } finally {
      setGenerating(false);
    }
  };

  const canSave = name.trim().length > 0 && validation.ok && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        formula: formula.trim(),
        kind,
        format,
        higher_better: higherBetter,
        threshold: threshold.trim() === "" ? null : Number(threshold),
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white";

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-lg" showBackdrop>
      <div className="p-6 pt-8 max-h-[85vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {editing ? "Modifier le" : "Nouveau"} {kind === "kpi" ? "KPI" : "ratio"} personnalisé
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom</label>
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Marge d'exploitation"
              />
              {onGenerate && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  title="Générer le type, le format et la formule à partir du nom"
                  className="flex-shrink-0 whitespace-nowrap px-3 py-2 text-sm rounded-lg bg-brand-50 text-brand-600 border border-brand-200 hover:bg-brand-100 transition disabled:opacity-50 disabled:cursor-not-allowed dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/30"
                >
                  {generating ? "Génération…" : "✨ Générer avec l'IA"}
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                <option value="kpi">KPI</option>
                <option value="ratio">Ratio</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Format</label>
              <select className={inputCls} value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                <option value="currency">Montant (TND)</option>
                <option value="ratio">Ratio (×)</option>
                <option value="percent">Pourcentage</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Formule</label>
            <textarea
              className={`${inputCls} font-mono`}
              rows={2}
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="ex. resultat_exploitation / produits_exploitation"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {METRIC_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  title={v.label}
                  onClick={() => setFormula((f) => (f && !/[\s(]$/.test(f) ? `${f} ${v.key}` : `${f}${v.key}`))}
                  className="text-[11px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-500"
                >
                  {v.key}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              Fonctions : abs(x), min(a, b), max(a, b)
            </p>
            {formula.trim() !== "" && !validation.ok && (
              <p className="mt-1 text-xs text-error-500">{validation.error}</p>
            )}
          </div>

          {kind === "ratio" && (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Seuil sain (optionnel)
                </label>
                <input className={inputCls} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="ex. 1.5" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 pb-2">
                <input type="checkbox" checked={higherBetter} onChange={(e) => setHigherBetter(e.target.checked)} />
                Plus élevé = mieux
              </label>
            </div>
          )}

          <div className="rounded-lg bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Aperçu (dernière période) : </span>
            <span className="font-medium text-gray-900 dark:text-white">{fmtPreview(preview, format)}</span>
          </div>

          {error && <p className="text-sm text-error-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
