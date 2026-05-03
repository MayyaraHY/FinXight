export interface Anomaly {
  compte: string;
  probleme: string;
  suggestion: string;
}

export interface AnomalyResponse {
  success: boolean;
  upload_id: number;
  count: number;
  anomalies: Anomaly[];
}

export interface ChatRequest {
  upload_id: number;
  message: string;
}

export interface ChatResponse {
  success: boolean;
  response: string;
}
