import { Account } from "./account";

export type Upload = {
  id: number;

  filename: string;
  display_filename?: string;
  file_path: string;
  status: string;

  created_at: string;

  company_id?: number | null;
  period_year?: number | null;
  period_month?: number | null;

  // relationship (optional depending on API)
  accounts?: Account[];
};