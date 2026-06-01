"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { exportStatements, ExportContent } from "@/services/exportService";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  uploadId: number;
  /** Which statements are available to export. */
  available: { bilan: boolean; cr: boolean };
}

const OPTION_LABELS: Record<ExportContent, string> = {
  bilan: "Bilan comptable seulement",
  cr: "Compte de résultat seulement",
  both: "Les deux (deux feuilles)",
};

export default function ExportModal({
  isOpen,
  onClose,
  uploadId,
  available,
}: ExportModalProps) {
  const canBoth = available.bilan && available.cr;
  const defaultContent: ExportContent = canBoth
    ? "both"
    : available.bilan
    ? "bilan"
    : "cr";

  const [content, setContent] = useState<ExportContent>(defaultContent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      await exportStatements(uploadId, content);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'export.");
    } finally {
      setLoading(false);
    }
  };

  const options: ExportContent[] = [
    ...(available.bilan ? (["bilan"] as ExportContent[]) : []),
    ...(available.cr ? (["cr"] as ExportContent[]) : []),
    ...(canBoth ? (["both"] as ExportContent[]) : []),
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[460px] p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Exporter en Excel
        </h4>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choisissez le contenu à inclure dans le fichier&nbsp;.xlsx
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt}
            className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
              content === opt
                ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            <input
              type="radio"
              name="export-content"
              value={opt}
              checked={content === opt}
              onChange={() => setContent(opt)}
              className="accent-brand-500 w-4 h-4 shrink-0"
            />
            <div>
              <span
                className={`block text-sm font-medium ${
                  content === opt
                    ? "text-brand-600 dark:text-brand-400"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {OPTION_LABELS[opt]}
              </span>
              {opt === "both" && (
                <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Un classeur avec deux feuilles : Bilan + Compte de Résultat
                </span>
              )}
            </div>
          </label>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="mt-4 text-sm text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-500/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 mt-6">
        <Button size="sm" variant="outline" onClick={onClose} disabled={loading}>
          Annuler
        </Button>
        <Button size="sm" onClick={handleExport} disabled={loading || options.length === 0}>
          {loading ? "Export…" : "Télécharger .xlsx"}
        </Button>
      </div>
    </Modal>
  );
}
