import { BACKEND_URL } from "@/lib/apiUrls";
import { fetchAuthed } from "@/lib/apiClient";

const API_URL = `${BACKEND_URL}/validation`;

export type ValidationStatus =
  | "valid"
  | "label_mismatch"
  | "class_mismatch"
  | "invalid_code"
  | "unresolved";

export interface ValidationLine {
  source_code: string;
  source_label: string | null;
  status: ValidationStatus;
  suggested_code: string | null;
  suggested_label: string | null;
  confidence: number;
  method: "rule" | "fuzzy" | "cache" | "llm";
  reason: string;
}

export interface ValidationSummary {
  total: number;
  valid: number;
  warnings: number;
  errors: number;
}

export interface ValidationReport {
  // "missing" → no report row yet; "pending" → background task running;
  // "done" → data populated; "failed" → task errored.
  status: "missing" | "pending" | "done" | "failed";
  success: boolean;
  data?: { summary: ValidationSummary; lines: ValidationLine[] } | null;
}

export async function getValidationReport(
  uploadId: number
): Promise<ValidationReport> {
  const res = await fetchAuthed(`${API_URL}/${uploadId}`);
  if (!res.ok) throw new Error("Failed to fetch validation report");
  return res.json();
}
