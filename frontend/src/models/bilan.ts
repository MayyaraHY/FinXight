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
  analysis?: string;
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
export type BilanStatus = {
  bilan_recalculated: boolean;
  reason?: string;
  error?: string;
  totals?: {
    actif: {
      actifs_non_courants: number;
      actifs_courants: number;
      total_actif: number;
    };
    passif: {
      capitaux_propres: number;
      passifs_non_courants: number;
      passifs_courants: number;
      total_passif: number;
    };
    difference: number;
  };
};