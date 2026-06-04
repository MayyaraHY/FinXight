import { BACKEND_URL } from "@/lib/apiUrls";
import { fetchAuthed } from "@/lib/apiClient";

const API_URL = `${BACKEND_URL}/cr`;

export async function generateCR(
  uploadId: number,
  inventoryMethod: "permanent" | "intermittent" = "permanent"
) {
  const res = await fetchAuthed(
    `${API_URL}/generate/${uploadId}?inventory_method=${inventoryMethod}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Compte de résultat generation failed");
  return res.json();
}

export async function getCR(uploadId: number) {
  const res = await fetchAuthed(`${API_URL}/${uploadId}`);
  if (!res.ok) throw new Error("Failed to fetch compte de résultat");
  return res.json();
}

// ===== ANALYZE (AI only — does not recalculate) =====
export async function analyzeCR(uploadId: number) {
  const res = await fetchAuthed(`${API_URL}/analyze/${uploadId}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("CR analysis failed");
  return res.json();
}
