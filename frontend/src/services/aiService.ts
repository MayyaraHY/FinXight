import { AnomalyResponse, ChatRequest, ChatResponse } from "@/models/ai";
import { BACKEND_URL } from "@/lib/apiUrls";
import { fetchAuthed } from "@/lib/apiClient";

const API_URL = `${BACKEND_URL}/ai`;

export async function getAnomalies(uploadId: number): Promise<AnomalyResponse> {
  const res = await fetchAuthed(`${API_URL}/anomalies/${uploadId}`);
  if (!res.ok) throw new Error("Failed to fetch anomalies");
  return res.json();
}

export async function saveAnomalies(uploadId: number, anomalies: object[]): Promise<void> {
  await fetchAuthed(`${API_URL}/anomalies/${uploadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anomalies }),
  });
}

export async function sendChat(uploadId: number, message: string): Promise<ChatResponse> {
  const body: ChatRequest = { upload_id: uploadId, message };
  const res = await fetchAuthed(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Chat request failed");
  return res.json();
}

export interface CorrectionLog {
  id: number;
  anomaly_id: string;
  compte_code: string | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  corrected_at: string | null;
}

export interface ApplyCorrectionPayload {
  anomaly_id: string;
  compte_code?: string | null;
  field?: string | null;
  new_value?: string | null;
  note?: string | null;
}

export async function getCorrections(uploadId: number): Promise<CorrectionLog[]> {
  const res = await fetchAuthed(`${API_URL}/anomalies/${uploadId}/corrections`);
  if (!res.ok) throw new Error("Failed to fetch corrections");
  const data = await res.json();
  return data.corrections ?? [];
}

export async function applyCorrection(
  uploadId: number,
  payload: ApplyCorrectionPayload
): Promise<CorrectionLog> {
  const res = await fetchAuthed(`${API_URL}/anomalies/${uploadId}/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Erreur lors de l'application de la correction.");
  }
  const data = await res.json();
  return data.correction;
}

export type AnomalyStatusValue = "ignored" | "deleted";

export interface AnomalyStatus {
  anomaly_id: string;
  status: AnomalyStatusValue;
}

export async function getAnomalyStatuses(uploadId: number): Promise<AnomalyStatus[]> {
  const res = await fetchAuthed(`${API_URL}/anomalies/${uploadId}/statuses`);
  if (!res.ok) throw new Error("Failed to fetch anomaly statuses");
  const data = await res.json();
  return data.statuses ?? [];
}

export async function setAnomalyStatus(
  uploadId: number,
  anomalyId: string,
  status: AnomalyStatusValue | "active"
): Promise<void> {
  const res = await fetchAuthed(`${API_URL}/anomalies/${uploadId}/statuses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anomaly_id: anomalyId, status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Erreur lors de la mise à jour du statut.");
  }
}
