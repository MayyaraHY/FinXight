export type Account = {
  id: number;

  upload_id: number;

  account_code: string;
  label?: string | null;

  debit?: number | null;
  credit?: number | null;
  solde_debit?: number | null;
  solde_credit?: number | null;
  solde_final?: number | null;

  opening_debit?: number | null;
  opening_credit?: number | null;

  created_at: string; // ISO date string
};