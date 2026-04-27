const API_URL = "http://127.0.0.1:8000/bilan";


// ===== GENERATE =====
export async function generateBilan(uploadId: number) {
  const res = await fetch(`${API_URL}/generate/${uploadId}`, {
    method: "POST",
  });

  if (!res.ok) throw new Error("Bilan generation failed");

  return res.json();
}

// ===== GET =====
export async function getBilan(uploadId: number) {
  const res = await fetch(`${API_URL}/${uploadId}`);

  if (!res.ok) throw new Error("Failed to fetch bilan");

  return res.json();
} 