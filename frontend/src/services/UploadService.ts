const API_URL = "http://127.0.0.1:8000/upload";
import { Upload } from "@/models/Upload";

export async function uploadFile(file: File, displayName?: string) {
  const formData = new FormData();
  formData.append("file", file);

  let url = `${API_URL}/add`;
  if (displayName) {
    url += `?display_filename=${encodeURIComponent(displayName)}`;
  }

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Upload failed");

  return res.json() as Promise<Upload>;
}

export async function uploadAndParse(file: File, displayName?: string) {
  const formData = new FormData();
  formData.append("file", file);

  let url = `${API_URL}/add_upload`;
  if (displayName) {
    url += `?display_filename=${encodeURIComponent(displayName)}`;
  }

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Upload & parse failed");

  return res.json();
}

export async function parseUpload(uploadId: number) {
  const res = await fetch(`${API_URL}/parse/${uploadId}`, {
    method: "POST",
  });

  if (!res.ok) throw new Error("Parse failed");

  return res.json();
}

export async function getUploads(): Promise<Upload[]> {
  const res = await fetch(`${API_URL}/get_all_uploads`);

  if (!res.ok) throw new Error("Failed to fetch uploads");

  return res.json();
}

export async function getUpload(uploadId: number): Promise<Upload> {
  const res = await fetch(`${API_URL}/upload/${uploadId}`);

  if (!res.ok) throw new Error("Failed to fetch upload");

  return res.json();
}

export async function updateUpload(uploadId: number, filename: string) {
  const res = await fetch(
    `${API_URL}/update_upload/${uploadId}?filename=${filename}`,
    {
      method: "PUT",
    }
  );

  if (!res.ok) throw new Error("Update failed");

  return res.json();
}

export async function deleteUpload(uploadId: number) {
  const res = await fetch(`${API_URL}/delete_upload/${uploadId}`, {
    method: "DELETE",
  });

  if (!res.ok) throw new Error("Delete failed");

  return res.json();
}

export async function deleteAllUploads() {
  const res = await fetch(`${API_URL}/delete_all_uploads`, {
    method: "DELETE",
  });

  if (!res.ok) throw new Error("Delete all failed");

  return res.json();
}

export async function getPreviewCSV(uploadId: number, rows: number = 20) {
  const res = await fetch(`${API_URL}/preview/${uploadId}?rows=${rows}`);

  if (!res.ok) throw new Error("Failed to fetch preview");

  return res.json();
}