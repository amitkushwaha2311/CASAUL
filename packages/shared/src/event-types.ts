export type EventSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type EventStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";

export interface EventCreate {
  event_type: string;
  severity: EventSeverity;
  status?: EventStatus;
  source: string;
  timestamp: string; // ISO8601
  description?: string;
  confidence?: number;
  evidence?: Record<string, any>;
  metadata_?: Record<string, any>;
}

export interface EventUpdate {
  severity?: EventSeverity;
  status?: EventStatus;
  description?: string;
  confidence?: number;
  evidence?: Record<string, any>;
  metadata_?: Record<string, any>;
}

export interface EventResponse {
  id: string;
  graph_id: string;
  event_type: string;
  severity: EventSeverity;
  status: EventStatus;
  source: string;
  timestamp: string;
  received_at: string;
  description: string | null;
  confidence: number | null;
  evidence: Record<string, any> | null;
  metadata_: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ObservationCreate {
  node_id?: string;
  event_id?: string;
  observation_type: string;
  metric: string;
  value_numeric?: number;
  value_text?: string;
  value_boolean?: boolean;
  value_json?: Record<string, any>;
  unit?: string;
  confidence?: number;
  timestamp: string; // ISO8601
  source: string;
  metadata_?: Record<string, any>;
}

export interface ObservationUpdate {
  confidence?: number;
  metadata_?: Record<string, any>;
}

export interface ObservationResponse {
  id: string;
  graph_id: string;
  node_id: string | null;
  event_id: string | null;
  observation_type: string;
  metric: string;
  value_numeric: number | null;
  value_text: string | null;
  value_boolean: boolean | null;
  value_json: Record<string, any> | null;
  unit: string | null;
  confidence: number | null;
  timestamp: string;
  source: string;
  metadata_: Record<string, any> | null;
  created_at: string;
}

export interface EventStatisticsResponse {
  total_events: number;
  open_events: number;
  acknowledged_events: number;
  resolved_events: number;
  dismissed_events: number;
  count_by_severity: Record<string, number>;
  count_by_type: Record<string, number>;
  observation_count: number;
}
