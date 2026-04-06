import { Account } from "./account";

export type Upload = {
  id: number;

  filename: string;
  file_path: string;
  status: string;

  created_at: string;

  // relationship (optional depending on API)
  accounts?: Account[];
};