import { BilanStatus } from "./bilan";

export type Account = {
  id: number;

  upload_id: number;

  account_code: string;
  label?: string | null;
  source_rubrique?: string | null;

  debit?: number | null;
  credit?: number | null;
  solde_debit?: number | null;
  solde_credit?: number | null;
  solde_final_debit?: number | null;
  solde_final_credit?: number | null;
  solde_final?: number | null; // Legacy column for backward compatibility

  opening_debit?: number | null;
  opening_credit?: number | null;

  created_at: string; // ISO date string
};

export type UpdateAccountResponse = {
  status: string;
  account_id: number;
  account_code: string;
  message: string;
  bilan: BilanStatus;
};
 
export type DeleteAccountResponse = {
  status: string;
  message: string;
  bilan: BilanStatus;
};
export type UpdateAccountPayload = Partial<
  Omit<Account, "id" | "upload_id" | "account_code" | "created_at">
>;