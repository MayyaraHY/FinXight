import { BACKEND_URL } from "@/lib/apiUrls";
import { fetchAuthed } from "@/lib/apiClient";
import { CashFlowResponse } from "@/models/Company";

const API_URL = `${BACKEND_URL}/companies`;

export type CashFlowResult =
  | { ok: true; data: CashFlowResponse }
  | { ok: false; status: number; message: string };

export async function getCashFlow(
  companyId: number,
  year: number,
  inventoryMethod: "permanent" | "intermittent"
): Promise<CashFlowResult> {
  const res = await fetchAuthed(
    `${API_URL}/${companyId}/cashflow?year=${year}&inventory_method=${inventoryMethod}`
  );
  if (!res.ok) {
    let message = "Échec du calcul des flux de trésorerie.";
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {
      /* non-JSON error body */
    }
    return { ok: false, status: res.status, message };
  }
  const body = await res.json();
  return { ok: true, data: body.data as CashFlowResponse };
}
