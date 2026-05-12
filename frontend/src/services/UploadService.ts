import { Upload } from "@/models/Upload";
import { BACKEND_URL } from "@/lib/apiUrls";
import { fetchAuthed, getAccessToken } from "@/lib/apiClient";

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

/**
 * Upload + parse with progress reporting via XMLHttpRequest.
 *
 * XHR is used (instead of fetch) only because the Streams API for upload
 * progress is still not universally supported. Because XHR does NOT go
 * through the apiClient fetch wrapper, we attach the Authorization header
 * manually with whatever access token is currently in memory. There is no
 * automatic 401-refresh-retry on this path — if the token expires mid-upload,
 * the caller will see a generic upload failure and can retry.
 */
export async function uploadAndParseWithProgress(
  file: File,
  displayName?: string,
  onProgress?: (progress: number) => void
): Promise<Upload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file);
    if (displayName) {
      formData.append("display_name", displayName);
    }

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 90);
        onProgress?.(percentComplete);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let parseProgress = 90;
        const interval = setInterval(() => {
          parseProgress = Math.min(parseProgress + 3, 99);
          onProgress?.(parseProgress);
          if (parseProgress >= 99) clearInterval(interval);
        }, 200);

        try {
          const result = JSON.parse(xhr.responseText);
          clearInterval(interval);
          onProgress?.(100);
          resolve(result);
        } catch {
          clearInterval(interval);
          reject(new Error("Failed to parse response"));
        }
      } else {
        reject(new Error(`Upload & parse failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload & parse failed"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload & parse cancelled"));
    });

    xhr.open("POST", `${API_URL}/upload_and_parse`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
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
