export interface DetectedIssue {
  severity: "error" | "warning" | "info";
  account: string | null;
  message: string;
  expected?: string | null;
  actual?: string | null;
}

export interface BilanReportData {
  detected_issues?: DetectedIssue[];
  imbalance_analysis?: string | null;
  analysis?: string | null;
  totals?: { balanced?: boolean; difference?: number };
}

export interface CRReportData {
  warnings?: string[];
  cr_diagnosis?: string | null;
}
