import { BACKEND_URL } from "@/lib/apiUrls";
import { apiClient } from "@/lib/apiClient";
import { CustomMetric } from "@/models/Company";

const base = (companyId: number) => `${BACKEND_URL}/companies/${companyId}/custom-metrics`;

export type CustomMetricInput = {
  name: string;
  formula: string;
  kind: "kpi" | "ratio";
  format?: "currency" | "ratio" | "percent" | null;
  higher_better?: boolean;
  threshold?: number | null;
};

export async function listCustomMetrics(companyId: number): Promise<CustomMetric[]> {
  const res = await apiClient.get<{ success: boolean; data: CustomMetric[] }>(`${base(companyId)}/`);
  return res.data;
}

export async function createCustomMetric(
  companyId: number,
  body: CustomMetricInput
): Promise<CustomMetric> {
  const res = await apiClient.post<{ success: boolean; data: CustomMetric }>(`${base(companyId)}/`, body);
  return res.data;
}

export async function updateCustomMetric(
  companyId: number,
  metricId: number,
  body: Partial<CustomMetricInput>
): Promise<CustomMetric> {
  const res = await apiClient.put<{ success: boolean; data: CustomMetric }>(
    `${base(companyId)}/${metricId}`,
    body
  );
  return res.data;
}

export async function deleteCustomMetric(companyId: number, metricId: number): Promise<void> {
  await apiClient.delete(`${base(companyId)}/${metricId}`);
}
