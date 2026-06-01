import { BACKEND_URL } from "@/lib/apiUrls";
import { fetchAuthed } from "@/lib/apiClient";

export type ExportContent = "bilan" | "cr" | "both";

/**
 * Download an Excel (.xlsx) file containing the selected statement(s).
 * The workbook is streamed from the backend and saved to disk via a temporary
 * anchor click — no third-party Excel library needed on the frontend.
 */
export async function exportStatements(
  uploadId: number,
  content: ExportContent,
): Promise<void> {
  const url = `${BACKEND_URL}/export/${uploadId}?content=${content}`;
  const res = await fetchAuthed(url);

  if (res.status === 404) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? "Statement not generated yet.");
  }
  if (!res.ok) {
    throw new Error(`Export failed (HTTP ${res.status}).`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  const filename =
    content === "both"
      ? `statements_${uploadId}.xlsx`
      : `${content}_${uploadId}.xlsx`;

  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
