import { AnomalyResponse, ChatRequest, ChatResponse } from "@/models/ai";

const API_URL = "http://127.0.0.1:8000/ai";

export async function getAnomalies(uploadId: number): Promise<AnomalyResponse> {
  const res = await fetch(`${API_URL}/anomalies/${uploadId}`);
  if (!res.ok) throw new Error("Failed to fetch anomalies");
  return res.json();
}

export async function sendChat(uploadId: number, message: string): Promise<ChatResponse> {
  const body: ChatRequest = { upload_id: uploadId, message };
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Chat request failed");
  return res.json();
}
