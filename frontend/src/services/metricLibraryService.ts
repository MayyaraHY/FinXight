import { BACKEND_URL } from "@/lib/apiUrls";
import { apiClient } from "@/lib/apiClient";
import { CustomMetric } from "@/models/Company";
import { METRIC_VARIABLES } from "@/components/companies/metricVariables";
import { CustomMetricInput, GeneratedMetric } from "@/services/customMetricService";

/**
 * Global (user-scoped) metric library — the /metrics API. A metric defined here
 * applies to every company the user owns. Mirrors customMetricService but
 * without a companyId in the path.
 */
const base = `${BACKEND_URL}/metrics`;

export async function listMetrics(): Promise<CustomMetric[]> {
  const res = await apiClient.get<{ success: boolean; data: CustomMetric[] }>(`${base}/`);
  return res.data;
}

export async function createMetric(body: CustomMetricInput): Promise<CustomMetric> {
  const res = await apiClient.post<{ success: boolean; data: CustomMetric }>(`${base}/`, body);
  return res.data;
}

export async function updateMetric(
  metricId: number,
  body: Partial<CustomMetricInput>
): Promise<CustomMetric> {
  const res = await apiClient.put<{ success: boolean; data: CustomMetric }>(`${base}/${metricId}`, body);
  return res.data;
}

export async function deleteMetric(metricId: number): Promise<void> {
  await apiClient.delete(`${base}/${metricId}`);
}

/** Ask the backend (Groq) to draft a full metric definition from a typed name. */
export async function generateMetric(name: string): Promise<GeneratedMetric> {
  const res = await apiClient.post<{ success: boolean; data: GeneratedMetric }>(`${base}/generate`, {
    name,
    variables: METRIC_VARIABLES,
  });
  return res.data;
}
