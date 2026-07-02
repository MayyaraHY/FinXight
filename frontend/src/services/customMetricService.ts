import { BACKEND_URL } from "@/lib/apiUrls";
import { apiClient } from "@/lib/apiClient";
import { CustomMetric } from "@/models/Company";
import { METRIC_VARIABLES } from "@/components/companies/metricVariables";

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

export type GeneratedMetric = {
  name: string;
  kind: "kpi" | "ratio";
  format: "currency" | "ratio" | "percent";
  formula: string;
  higher_better: boolean;
  threshold: number | null;
  explanation?: string | null;
};

/** Ask the backend (Groq) to draft a full metric definition from a typed name. */
export async function generateMetric(companyId: number, name: string): Promise<GeneratedMetric> {
  const res = await apiClient.post<{ success: boolean; data: GeneratedMetric }>(
    `${base(companyId)}/generate`,
    { name, variables: METRIC_VARIABLES }
  );
  return res.data;
}
