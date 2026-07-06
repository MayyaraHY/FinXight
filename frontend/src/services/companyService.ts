import { BACKEND_URL } from "@/lib/apiUrls";
import { apiClient } from "@/lib/apiClient";
import { Company, TimelineComparison, TimelineResponse, SyntheseResponse } from "@/models/Company";

const BASE = `${BACKEND_URL}/companies`;

export async function getCompanies(): Promise<Company[]> {
  const res = await apiClient.get<{ success: boolean; data: Company[] }>(BASE + "/");
  return res.data;
}

export async function createCompany(name: string): Promise<Company> {
  const res = await apiClient.post<{ success: boolean; data: Company }>(BASE + "/", { name });
  return res.data;
}

export async function getCompany(id: number): Promise<Company> {
  const res = await apiClient.get<{ success: boolean; data: Company }>(`${BASE}/${id}`);
  return res.data;
}

export async function renameCompany(id: number, name: string): Promise<Company> {
  const res = await apiClient.put<{ success: boolean; data: Company }>(`${BASE}/${id}`, { name });
  return res.data;
}

export async function deleteCompany(id: number): Promise<{ success: boolean; deleted_uploads: number }> {
  return apiClient.delete<{ success: boolean; deleted_uploads: number }>(`${BASE}/${id}`);
}

export async function getTimeline(companyId: number): Promise<TimelineResponse> {
  const res = await apiClient.get<{ success: boolean; data: TimelineResponse }>(
    `${BASE}/${companyId}/timeline`
  );
  return res.data;
}

export async function getSynthese(companyId: number, year: number): Promise<SyntheseResponse> {
  const res = await apiClient.get<{ success: boolean; data: SyntheseResponse }>(
    `${BASE}/${companyId}/synthese?year=${year}`
  );
  return res.data;
}

export async function compareTimeline(
  companyId: number,
  yearA: number,
  yearB: number,
  monthA?: number,
  monthB?: number
): Promise<TimelineComparison> {
  const params = new URLSearchParams({
    year_a: String(yearA),
    year_b: String(yearB),
  });
  if (monthA != null) params.set("month_a", String(monthA));
  if (monthB != null) params.set("month_b", String(monthB));
  const res = await apiClient.get<{ success: boolean; data: TimelineComparison }>(
    `${BASE}/${companyId}/timeline/compare?${params}`
  );
  return res.data;
}
