import { Upload } from "@/models/Upload";
import { BACKEND_URL } from "@/lib/apiUrls";
import { fetchAuthed } from "@/lib/apiClient";

const API_URL = `${BACKEND_URL}/upload`;

export async function uploadFile(file: File, displayName?: string) {
  const formData = new FormData();
  formData.append("file", file);

  let url = `${API_URL}/add`;
  if (displayName) {
    url += `?display_filename=${encodeURIComponent(displayName)}`;
  }

  const res = await fetchAuthed(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Upload failed");

  return res.json() as Promise<Upload>;
}

export async function uploadAndParse(file: File, displayName?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (displayName) {
    formData.append("display_name", displayName);
  }

  const res = await fetchAuthed(`${API_URL}/upload_and_parse`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Upload & parse failed");

  return res.json();
}

export interface UploadMetadata {
  displayName?: string;
  companyId?: number | null;
  periodYear?: number | null;
  periodMonth?: number | null;
}

/**
 * Upload + parse with simulated progress reporting via fetch.
 *
 * True byte-level upload progress requires XHR, but XHR has CORS limitations
 * when credentials + custom headers are involved. We use fetchAuthed instead
 * (proper CORS, 401-refresh-retry) and simulate progress with a timer:
 *   0 → 85 %  fake ramp-up while the file is uploading + server is parsing
 *   85 → 99 % slower ticks during the parsing phase
 *   100 %     when the response arrives
 */
export async function uploadAndParseWithProgress(
  file: File,
  metadata?: UploadMetadata,
  onProgress?: (progress: number) => void
): Promise<Upload> {
  const formData = new FormData();
  formData.append("file", file);
  if (metadata?.displayName) {
    formData.append("display_name", metadata.displayName);
  }
  if (metadata?.companyId != null) {
    formData.append("company_id", String(metadata.companyId));
  }
  if (metadata?.periodYear != null) {
    formData.append("period_year", String(metadata.periodYear));
  }
  if (metadata?.periodMonth != null) {
    formData.append("period_month", String(metadata.periodMonth));
  }

  // Simulate progress while the request is in flight
  let simulatedProgress = 0;
  let progressInterval: ReturnType<typeof setInterval> | null = null;

  if (onProgress) {
    onProgress(0);
    progressInterval = setInterval(() => {
      // Fast ramp to 85 %, then slow ticks up to 99 %
      const increment = simulatedProgress < 85 ? 5 : 1;
      simulatedProgress = Math.min(simulatedProgress + increment, 99);
      onProgress(simulatedProgress);
    }, 300);
  }

  try {
    const res = await fetchAuthed(`${API_URL}/upload_and_parse`, {
      method: "POST",
      body: formData,
    });

    if (progressInterval) clearInterval(progressInterval);

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.detail)  detail += `: ${body.detail}`;
        else if (body?.message) detail += `: ${body.message}`;
      } catch { /* response wasn't JSON */ }
      throw new Error(`Upload failed — ${detail}`);
    }

    onProgress?.(100);
    return res.json();
  } catch (err) {
    if (progressInterval) clearInterval(progressInterval);
    throw err;
  }
}

export async function parseUpload(uploadId: number) {
  const res = await fetchAuthed(`${API_URL}/parse/${uploadId}`, {
    method: "POST",
  });

  if (!res.ok) throw new Error("Parse failed");

  return res.json();
}

export async function getUploads(): Promise<Upload[]> {
  const res = await fetchAuthed(`${API_URL}/get_all_uploads`);

  if (!res.ok) throw new Error("Failed to fetch uploads");

  return res.json();
}

export async function getUpload(uploadId: number): Promise<Upload> {
  const res = await fetchAuthed(`${API_URL}/upload/${uploadId}`);

  if (!res.ok) throw new Error("Failed to fetch upload");

  return res.json();
}

export async function updateUpload(uploadId: number, filename: string) {
  const res = await fetchAuthed(
    `${API_URL}/update_upload/${uploadId}?filename=${filename}`,
    {
      method: "PUT",
    }
  );

  if (!res.ok) throw new Error("Update failed");

  return res.json();
}

export async function deleteUpload(uploadId: number) {
  const res = await fetchAuthed(`${API_URL}/delete_upload/${uploadId}`, {
    method: "DELETE",
  });

  if (!res.ok) throw new Error("Delete failed");

  return res.json();
}

export async function deleteAllUploads() {
  const res = await fetchAuthed(`${API_URL}/delete_all_uploads`, {
    method: "DELETE",
  });

  if (!res.ok) throw new Error("Delete all failed");

  return res.json();
}

export async function getPreviewCSV(uploadId: number, rows: number = 20) {
  const res = await fetchAuthed(`${API_URL}/preview/${uploadId}?rows=${rows}`);

  if (!res.ok) throw new Error("Failed to fetch preview");

  return res.json();
}

export async function patchUploadMetadata(
  uploadId: number,
  data: { company_id?: number | null; period_year?: number | null; period_month?: number | null }
) {
  const res = await fetchAuthed(`${API_URL}/${uploadId}/metadata`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to update upload metadata");

  return res.json();
}
