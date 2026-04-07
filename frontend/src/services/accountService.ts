const API_URL = "http://127.0.0.1:8000/accounts";

import { Account } from "@/models/account";

// ===== READ =====

// Get account by ID
export async function getAccountById(accountId: number): Promise<Account> {
  const res = await fetch(`${API_URL}/get_account_by_id/${accountId}`);

  if (!res.ok) throw new Error("Failed to fetch account");

  return res.json();
}

// Get account by code
export async function getAccountByCode(code: string): Promise<Account> {
  const res = await fetch(`${API_URL}/get_account_by_code_class/${code}`);

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

  const res = await fetch(`${API_URL}/get_all_accounts/?${query}`);

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

  const res = await fetch(`${API_URL}/search/?${query}`);

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

  const res = await fetch(`${API_URL}/by_code_prefix/?${query}`);

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

  const res = await fetch(`${API_URL}/by_upload/${uploadId}?${query}`);

  if (!res.ok) throw new Error("Failed to fetch accounts for upload");

  return res.json();
}
