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
  has_bilan: boolean;
  has_cr: boolean;
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
