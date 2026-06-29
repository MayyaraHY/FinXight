"use client";

import { useCallback, useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { getBilan } from "@/services/bilanService";
import { formatCurrency } from "@/utils/formatters";

type Leaf = { label: string; amount: number };
type TreeNode = Leaf | { [key: string]: TreeNode };
type BilanData = { bilan: Record<string, TreeNode>; totals?: unknown };

const GROUP_LABELS: Record<string, string> = {
  actifs: "Actifs",
  actifs_non_courants: "Actifs non courants",
  actifs_immobilises: "Immobilisations",
  actifs_courants: "Actifs courants",
  "capitaux propres et passifs": "Capitaux propres et passifs",
  "capitaux propres": "Capitaux propres",
  passifs: "Passifs",
  "passifs non courant": "Passifs non courants",
  "passifs courant": "Passifs courants",
};

function prettify(key: string): string {
  const t = key.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function isLeaf(n: unknown): n is Leaf {
  return !!n && typeof n === "object" && "amount" in n && "label" in n;
}

function sumLeaves(node: TreeNode): number {
  if (isLeaf(node)) return node.amount;
  return Object.values(node).reduce<number>((t, v) => t + (v ? sumLeaves(v) : 0), 0);
}

type Row = {
  kind: "group" | "leaf" | "subtotal";
  label: string;
  n?: number | null;
  n1?: number | null;
  indent: number;
};

function collect(
  nodesN: Record<string, TreeNode>,
  nodesN1: Record<string, TreeNode> | null,
  indent: number,
  rows: Row[]
) {
  for (const [key, childN] of Object.entries(nodesN)) {
    const childN1 = nodesN1?.[key] ?? null;
    if (isLeaf(childN)) {
      rows.push({
        kind: "leaf",
        label: childN.label,
        n: childN.amount,
        n1: isLeaf(childN1) ? childN1.amount : null,
        indent,
      });
    } else if (childN && typeof childN === "object") {
      const label = GROUP_LABELS[key] ?? prettify(key);
      rows.push({ kind: "group", label, indent });
      collect(
        childN as Record<string, TreeNode>,
        (childN1 && !isLeaf(childN1) ? (childN1 as Record<string, TreeNode>) : null),
        indent + 1,
        rows
      );
      rows.push({
        kind: "subtotal",
        label: `Total ${label}`,
        n: sumLeaves(childN),
        n1: childN1 && !isLeaf(childN1) ? sumLeaves(childN1) : null,
        indent: indent + 1,
      });
    }
  }
}

interface Props {
  uploadIdN: number;
  uploadIdN1: number | null;
  labelN: string;
  labelN1: string;
}

export default function BilanCompare({ uploadIdN, uploadIdN1, labelN, labelN1 }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resN, resN1] = await Promise.all([
        getBilan(uploadIdN),
        uploadIdN1 != null ? getBilan(uploadIdN1) : Promise.resolve(null),
      ]);
      const dataN: BilanData = resN.data;
      const dataN1: BilanData | null = resN1?.data ?? null;
      const out: Row[] = [];
      collect(dataN.bilan, dataN1?.bilan ?? null, 0, out);
      setRows(out);
    } catch {
      setError("Bilan indisponible pour cet exercice.");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [uploadIdN, uploadIdN1]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">Chargement…</p>;
  if (error || !rows)
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">{error ?? "—"}</p>;

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
          {rows.map((r, i) => {
            const pad = { paddingLeft: `${r.indent * 16}px` };
            if (r.kind === "group") {
              return (
                <TableRow key={i} className="bg-gray-50 dark:bg-white/[0.02]">
                  <TableCell className="py-2 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    <span style={pad}>{r.label}</span>
                  </TableCell>
                  <TableCell className="py-2"> </TableCell>
                  <TableCell className="py-2"> </TableCell>
                </TableRow>
              );
            }
            const isSub = r.kind === "subtotal";
            const labelCls = isSub
              ? "py-2 font-medium text-gray-900 dark:text-white"
              : "py-2 text-gray-700 dark:text-gray-300";
            const numCls = isSub
              ? "py-2 text-right font-medium tabular-nums text-gray-900 dark:text-white"
              : "py-2 text-right tabular-nums text-gray-700 dark:text-gray-300";
            return (
              <TableRow key={i} className={isSub ? "border-t border-gray-200 dark:border-gray-700" : ""}>
                <TableCell className={labelCls}>
                  <span style={pad}>{r.label}</span>
                </TableCell>
                <TableCell className={numCls}>
                  {r.n == null ? "—" : formatCurrency(r.n)}
                </TableCell>
                <TableCell className={numCls}>
                  {r.n1 == null ? "—" : formatCurrency(r.n1)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
