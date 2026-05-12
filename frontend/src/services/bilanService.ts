import { BACKEND_URL } from "@/lib/apiUrls";
import { fetchAuthed } from "@/lib/apiClient";

const API_URL = `${BACKEND_URL}/bilan`;


// ===== GENERATE =====
export async function generateBilan(uploadId: number) {
  const res = await fetchAuthed(`${API_URL}/generate/${uploadId}`, {
    method: "POST",
  });

  if (!res.ok) throw new Error("Bilan generation failed");

  return res.json();
}

// ===== GET =====
export async function getBilan(uploadId: number) {
  const res = await fetchAuthed(`${API_URL}/${uploadId}`);

  if (!res.ok) throw new Error("Failed to fetch bilan");

  return res.json();
}
