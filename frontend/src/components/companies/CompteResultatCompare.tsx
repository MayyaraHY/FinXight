"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { getCR } from "@/services/compteResultatService";
import { formatCurrency } from "@/utils/formatters";

type CRLine = { line_id: number; label: string; amount: number };
type CRData = { lines: Record<string, CRLine> };

const SUBTOTAL_LINE_IDS = new Set([4, 11, 17, 19]);
const RESULT_LINE_IDS = new Set([12, 21, 23]);
const SECTION_HEADERS: Record<number, string> = {
  1: "Produits d'exploitation",
  5: "Charges d'exploitation",
  13: "Éléments financiers",
  18: "Impôt sur les bénéfices",
  20: "Éléments extraordinaires",
  22: "Modifications comptables",
};

interface Props {
  uploadIdN: number;
  uploadIdN1: number | null;
  labelN: string;
  labelN1: string;
}

export default function CompteResultatCompare({ uploadIdN, uploadIdN1, labelN, labelN1 }: Props) {
  const [dataN, setDataN] = useState<CRData | null>(null);
  const [dataN1, setDataN1] = useState<CRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resN, resN1] = await Promise.all([
        getCR(uploadIdN),
        uploadIdN1 != null ? getCR(uploadIdN1) : Promise.resolve(null),
      ]);
      setDataN(resN.data);
      setDataN1(resN1?.data ?? null);
    } catch {
      setError("Compte de résultat indisponible pour cet exercice.");
      setDataN(null);
    } finally {
      setLoading(false);
    }
  }, [uploadIdN, uploadIdN1]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">Chargement…</p>;
  if (error || !dataN)
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">{error ?? "—"}</p>;

  const orderedLines = Object.values(dataN.lines).sort((a, b) => a.line_id - b.line_id);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="border-y border-gray-100 dark:border-gray-800">
          <TableRow>
            <TableCell isHeader className="py-2 text-left font-medium text-gray-500 text-theme-xs dark:text-gray-400">
              Libellé
            </TableCell>
            <TableCell isHeader className="py-2 text-right font-medium text-gray-500 text-theme-xs dark:text-gray-400">
              {labelN}
            </TableCell>
            <TableCell isHeader className="py-2 text-right font-medium text-gray-500 text-theme-xs dark:text-gray-400">
              {labelN1}
            </TableCell>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
          {orderedLines.map((lineN) => {
            const lineN1 = dataN1?.lines[String(lineN.line_id)] ?? null;
            const isResult = RESULT_LINE_IDS.has(lineN.line_id);
            const isSub = SUBTOTAL_LINE_IDS.has(lineN.line_id);
            const header = SECTION_HEADERS[lineN.line_id];

            const labelCls = isResult
              ? "py-2.5 font-bold text-brand-700 dark:text-brand-400"
              : isSub
              ? "py-2.5 font-semibold text-gray-500 dark:text-gray-400"
              : "py-2.5 text-gray-700 dark:text-gray-300";
            const numCls = isResult
              ? "py-2.5 text-right font-bold tabular-nums text-brand-700 dark:text-brand-400"
              : isSub
              ? "py-2.5 text-right font-semibold tabular-nums text-gray-600 dark:text-gray-300"
              : "py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300";
            const rowCls = isResult
              ? "border-t-2 border-gray-200 dark:border-gray-700 bg-brand-50/40 dark:bg-brand-500/5"
              : isSub
              ? "border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-white/[0.015]"
              : "";

            return (
              <React.Fragment key={lineN.line_id}>
                {header && (
                  <TableRow className="bg-gray-50 dark:bg-white/[0.02]">
                    <TableCell className="px-1 py-2 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                      {header}
                    </TableCell>
                    <TableCell className="py-2"> </TableCell>
                    <TableCell className="py-2"> </TableCell>
                  </TableRow>
                )}
                <TableRow className={rowCls}>
                  <TableCell className={`${labelCls} pr-4`}>{lineN.label}</TableCell>
                  <TableCell className={numCls}>{formatCurrency(lineN.amount)}</TableCell>
                  <TableCell className={numCls}>
                    {lineN1 == null ? "—" : formatCurrency(lineN1.amount)}
                  </TableCell>
                </TableRow>
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
