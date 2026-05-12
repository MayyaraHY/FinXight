import { BACKEND_URL } from "@/lib/apiUrls";
import { fetchAuthed } from "@/lib/apiClient";

const API_URL = `${BACKEND_URL}/accounts`;

import {
  Account,
  UpdateAccountResponse,
  DeleteAccountResponse,
  UpdateAccountPayload,
} from "@/models/account";

// ===== READ =====

// Get account by ID
export async function getAccountById(accountId: number): Promise<Account> {
  const res = await fetchAuthed(`${API_URL}/get_account_by_id/${accountId}`);

  if (!res.ok) throw new Error("Failed to fetch account");

  return res.json();
}

// Get account by code
export async function getAccountByCode(code: string): Promise<Account> {
  const res = await fetchAuthed(`${API_URL}/get_account_by_code_class/${code}`);

  if (!res.ok) throw new Error("Account code not found");

  return res.json();
}

// Get all accounts (with optional upload filter)
export async function getAccounts(
  uploadId?: number,
  skip: number = 0,
  limit: number = 100
) {
  const query = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });

  if (uploadId !== undefined) {
    query.append("upload_id", String(uploadId));
  }

  const res = await fetchAuthed(`${API_URL}/get_all_accounts/?${query}`);

  if (!res.ok) throw new Error("Failed to fetch accounts");

  return res.json();
}

// Search accounts
export async function searchAccounts(
  keyword: string,
  skip: number = 0,
  limit: number = 100
) {
  const query = new URLSearchParams({
    keyword,
    skip: String(skip),
    limit: String(limit),
  });

  const res = await fetchAuthed(`${API_URL}/search/?${query}`);

  if (!res.ok) throw new Error("Search failed");

  return res.json();
}

// Get by prefix
export async function getAccountsByPrefix(
  prefix: string,
  skip: number = 0,
  limit: number = 100
) {
  const query = new URLSearchParams({
    prefix,
    skip: String(skip),
    limit: String(limit),
  });

  const res = await fetchAuthed(`${API_URL}/by_code_prefix/?${query}`);

  if (!res.ok) throw new Error("Failed to fetch accounts by prefix");

  return res.json();
}

// Get accounts by upload ID
export async function getAccountsByUpload(
  uploadId: number,
  skip: number = 0,
  limit: number = 1000
) {
  const query = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });

  const res = await fetchAuthed(`${API_URL}/by_upload/${uploadId}?${query}`);

  if (!res.ok) throw new Error("Failed to fetch accounts for upload");

  return res.json();
}

// ===== UPDATE =====
function buildQueryParams(obj: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();

  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  });

  return query;
}

export async function updateAccount(
  accountId: number,
  updates: UpdateAccountPayload
): Promise<UpdateAccountResponse> {
  const query = buildQueryParams(updates);

  const res = await fetchAuthed(`${API_URL}/update/${accountId}?${query}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to update account");
  }

  return res.json();
}

// ===== DELETE =====
export async function deleteAccount(
  accountId: number
): Promise<DeleteAccountResponse> {
  const res = await fetchAuthed(`${API_URL}/delete/${accountId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to delete account");
  }

  return res.json();
}

// ===== DELETE ALL =====
export async function deleteAccountsByUpload(
  uploadId: number,
  confirm: boolean = false
) {
  const query = buildQueryParams({
    confirm,
  });

  const res = await fetchAuthed(`${API_URL}/delete_upload/${uploadId}?${query}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to delete accounts");
  }

  return res.json();
}
