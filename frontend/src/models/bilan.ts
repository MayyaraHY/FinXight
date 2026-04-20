export interface Bilan {
  id?: number;
  upload_id: number;
  data: BilanData;
  created_at?: string;
}

export interface BilanData {
  bilan: {
    actifs: unknown;
    passifs?: unknown;
  };
}

export interface BilanItem {
  label: string;
  amount: number;
  used_accounts: string[];
  amount_details?: {
    brut?: number;
    amortissement?: number;
    net?: number;
    breakdown?: BreakdownItem[];
  };
}

export interface BreakdownItem {
  phase: string;
  account: string;
  label?: string;
  raw_amount: number;
  signed_amount?: number;
}