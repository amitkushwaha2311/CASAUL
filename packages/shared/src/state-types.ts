/**
 * CAUSAL Platform — Phase 4 System State & Digital Twin TypeScript Types
 */

export interface StateProvenance {
  source: string;
  source_type: "observation" | "event" | "baseline" | "initialization" | "manual" | "reconstruction";
  observation_id?: string | null;
  event_id?: string | null;
  baseline_id?: string | null;
  observed_at?: string | null;
  recorded_at?: string | null;
  details?: Record<string, unknown> | null;
}

export interface NodeStateDetail {
  node_id: string;
  graph_id: string;
  node_name: string;
  node_type: string;
  state: "NORMAL" | "DEGRADED" | "CRITICAL" | "FAILED" | "RECOVERING" | "UNKNOWN" | string;
  health: number | null;
  capacity: number | null;
  availability: number | null;
  criticality: number;
  last_observed_at: string | null;
  last_state_change_at: string | null;
  confidence: number | null;
  source: string | null;
  consistency_status: "VALID" | "WARNING" | "INVALID" | "UNKNOWN";
  is_known: boolean;
  provenance?: StateProvenance | null;
}

export interface CurrentGraphStateResponse {
  graph_id: string;
  graph_name: string;
  as_of: string;
  total_nodes: number;
  nodes: NodeStateDetail[];
  completeness_ratio: number;
  consistency_status: string;
}

export interface CurrentNodeStateResponse {
  node: NodeStateDetail;
}

export interface StateHistoryResponse {
  id: string;
  graph_id: string;
  node_id: string;
  event_id?: string | null;
  observation_id?: string | null;
  state?: string | null;
  health?: number | null;
  capacity?: number | null;
  availability?: number | null;
  metric?: string | null;
  value_numeric?: number | null;
  value_text?: string | null;
  confidence?: number | null;
  source: string;
  change_reason?: string | null;
  observed_at: string;
  recorded_at: string;
  provenance_metadata?: Record<string, unknown> | null;
}

export interface NodeConsistencyIssue {
  node_id: string;
  node_name: string;
  rule_code: string;
  severity: "WARNING" | "INVALID" | "UNKNOWN";
  message: string;
  state?: string | null;
  health?: number | null;
  capacity?: number | null;
}

export interface StateConsistencyResponse {
  graph_id: string;
  status: "VALID" | "WARNING" | "INVALID" | "UNKNOWN";
  total_checked: number;
  valid_count: number;
  warning_count: number;
  invalid_count: number;
  unknown_count: number;
  issues: NodeConsistencyIssue[];
}

export interface StateReconstructionResponse {
  graph_id: string;
  node_id?: string | null;
  requested_timestamp: string;
  effective_timestamp?: string | null;
  reconstructed_at: string;
  is_complete: boolean;
  completeness_ratio: number;
  records_evaluated: number;
  completeness_note?: string | null;
  nodes: NodeStateDetail[];
}

export interface BaselineCreate {
  name: string;
  description?: string | null;
  is_active?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface BaselineResponse {
  id: string;
  graph_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  captured_at: string;
  completeness_ratio: number;
  node_count: number;
  node_states: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface SnapshotCreate {
  name?: string | null;
  snapshot_type?: "LIVE" | "RECONSTRUCTED";
  effective_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SnapshotResponse {
  id: string;
  graph_id: string;
  name?: string | null;
  snapshot_type: string;
  captured_at: string;
  effective_at: string;
  completeness_ratio: number;
  node_count: number;
  node_states: Record<string, unknown>;
  summary?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export type StateBaselineListItem = BaselineResponse;
export type StateSnapshotListItem = SnapshotResponse;


export interface NodeStateDiff {
  node_id: string;
  node_name: string;
  field_name: string;
  previous_value: unknown;
  current_value: unknown;
  previous_timestamp?: string | null;
  current_timestamp?: string | null;
  change_type: "MODIFIED" | "ADDED" | "REMOVED" | "UNCHANGED";
}

export interface NodeComparisonDetail {
  node_id: string;
  node_name: string;
  is_changed: boolean;
  diffs: NodeStateDiff[];
}

export interface StateComparisonResponse {
  graph_id: string;
  comparison_type: "BASELINE_VS_CURRENT" | "SNAPSHOT_VS_CURRENT" | "SNAPSHOT_VS_SNAPSHOT";
  source_a_label: string;
  source_b_label: string;
  source_a_timestamp?: string | null;
  source_b_timestamp?: string | null;
  total_nodes_compared: number;
  changed_nodes_count: number;
  unchanged_nodes_count: number;
  completeness_limitations?: string | null;
  node_comparisons: NodeComparisonDetail[];
}

export interface ScenarioCreate {
  name: string;
  description?: string | null;
  base_snapshot_id?: string | null;
  base_baseline_id?: string | null;
  state_overrides?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}

export interface ScenarioResponse {
  id: string;
  graph_id: string;
  name: string;
  description?: string | null;
  base_snapshot_id?: string | null;
  base_baseline_id?: string | null;
  state_overrides: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SystemStateSummaryResponse {
  graph_id: string;
  as_of: string;
  total_nodes: number;
  nodes_with_known_state: number;
  nodes_with_unknown_state: number;
  count_by_operational_state: Record<string, number>;
  average_health?: number | null;
  health_denominator: number;
  average_capacity?: number | null;
  capacity_denominator: number;
  average_criticality: number;
  latest_state_update_at?: string | null;
  completeness_ratio: number;
  consistency_warning_count: number;
  consistency_invalid_count: number;
}
