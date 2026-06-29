export type Company = {
  id: number;
  name: string;
  created_at: string;
  upload_count: number;
};

export type TimelinePeriod = {
  upload_id: number;
  period_year: number | null;
  period_month: number | null;
  display_filename: string;
  total_actif: number | null;
  actifs_non_courants: number | null;
  actifs_courants: number | null;
  total_passif: number | null;
  capitaux_propres: number | null;
  passifs_non_courants: number | null;
  passifs_courants: number | null;
  resultat_net: number | null;
  // Named statement lines (formula variables) — optional: present on enriched timelines.
  produits_exploitation?: number | null;
  charges_exploitation?: number | null;
  resultat_exploitation?: number | null;
  stocks?: number | null;
  clients?: number | null;
  fournisseurs?: number | null;
  autres_actifs_courants?: number | null;
  autres_passifs_courants?: number | null;
  liquidites?: number | null;
  concours_bancaires?: number | null;
  has_bilan: boolean;
  has_cr: boolean;
};

export type CustomMetric = {
  id: number;
  company_id: number;
  name: string;
  formula: string;
  kind: "kpi" | "ratio";
  format: "currency" | "ratio" | "percent" | null;
  higher_better: boolean;
  threshold: number | null;
  created_at?: string;
};

export type ComparisonValue = {
  a: number | null;
  b: number | null;
  delta: number | null;
  pct: number | null;
};

export type TimelineWarning = {
  type: "duplicate_period";
  period_year: number;
  period_month: number | null;
  upload_ids: number[];
};

export type TimelineResponse = {
  periods: TimelinePeriod[];
  warnings: TimelineWarning[];
};

export type CashFlowLine = {
  label: string;
  amount_n: number;
  amount_n_1: number | null;
};

export type CashFlowSection = {
  label: string;
  lines: CashFlowLine[];
  total_n: number;
  total_n_1: number | null;
};

export type CashFlowResponse = {
  year_n: number;
  year_n_1: number;
  label_n: string;
  label_n_1: string;
  has_n_1_column: boolean;
  inventory_method: "permanent" | "intermittent";
  sections: CashFlowSection[];
  variation_tresorerie_n: number;
  variation_tresorerie_n_1: number | null;
  tresorerie_debut_n: number;
  tresorerie_fin_n: number;
  tresorerie_debut_n_1: number | null;
  tresorerie_fin_n_1: number | null;
  reconciliation_ok_n: boolean;
  reconciliation_ecart_n: number;
  reconciliation_ok_n_1: boolean | null;
  reconciliation_ecart_n_1: number | null;
  warnings: string[];
};

export type TimelineComparison = {
  period_a: TimelinePeriod;
  period_b: TimelinePeriod;
  comparison: {
    total_actif: ComparisonValue;
    total_passif: ComparisonValue;
    capitaux_propres: ComparisonValue;
    resultat_net: ComparisonValue;
    actifs_non_courants: ComparisonValue;
    actifs_courants: ComparisonValue;
    passifs_non_courants: ComparisonValue;
    passifs_courants: ComparisonValue;
  };
};
