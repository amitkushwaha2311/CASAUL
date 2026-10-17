/**
 * CAUSAL Platform — Phase 6 Cascade Prediction Engine TypeScript Types
 *
 * Types for probabilistic, time-aware downstream failure cascade forecasting.
 */

export type CalibrationStatus = "HEURISTIC_ESTIMATE" | "CALIBRATED" | "UNAVAILABLE";

export type CascadeNodeForecastStatus = "ALREADY_AFFECTED" | "PREDICTED_AFFECTED" | "UNAFFECTED";

export type CascadeImpactLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type SimulationMode = "DETERMINISTIC" | "MONTE_CARLO";

export type DelaySource = "METADATA" | "HEURISTIC_DEFAULT" | "UNKNOWN";

export interface TimeToImpactRange {
  min_seconds: number;
  max_seconds: number;
  point_estimate_seconds: number;
  assumption: string;
  delay_source: DelaySource;
}

export interface PredictedNodeDetail {
  node_id: string;
  node_name: string;
  node_type: string;
  criticality: number;
  forecast_status: CascadeNodeForecastStatus;
  current_state: string;
  predicted_state: string;
  predicted_impact_level: CascadeImpactLevel;
  earliest_impact_seconds: number | null;
  latest_impact_seconds: number | null;
  time_to_impact_range: TimeToImpactRange | null;
  propagation_probability_min: number | null;
  propagation_probability_max: number | null;
  propagation_probability_point: number | null;
  calibration_status: CalibrationStatus;
  depth: number;
  path_summary: string[];
  contributing_causes: string[];
  assumptions: string[];
  limitations: string[];
}

export interface PropagationPathDetail {
  id: string;
  source_node_id: string;
  source_node_name: string;
  target_node_id: string;
  target_node_name: string;
  dependency_id: string | null;
  hop_number: number;
  estimated_delay_seconds: number | null;
  delay_source: DelaySource;
  attenuation_factor: number;
  propagation_rationale: string;
}

export interface CascadeImpactSummary {
  total_nodes: number;
  total_already_affected: number;
  total_predicted_affected: number;
  total_unaffected: number;
  total_critical_affected: number;
  max_depth_reached: number;
  impact_by_severity: Record<string, number>;
  impact_by_domain: Record<string, number>;
  critical_nodes_at_risk: Array<{
    node_id: string;
    name: string;
    criticality: number;
    status: string;
    impact_level: string;
    time_to_impact_seconds: number;
  }>;
  composite_criticality_impact_percent: number;
  composite_metric_explanation: string;
  assumptions: string[];
  warnings: string[];
  limitations: string[];
}

export interface CascadeForecastRequest {
  initiating_node_id?: string | null;
  horizon_minutes?: number;
  max_depth?: number;
  simulation_mode?: SimulationMode;
  seed?: number | null;
  propagation_probability_threshold?: number;
  custom_delay_assumptions?: Record<string, number> | null;
}

export interface CascadeForecastResponse {
  id: string;
  graph_id: string;
  initiating_node_id: string | null;
  rule_version: string;
  simulation_mode: string;
  calibration_status: CalibrationStatus;
  horizon_minutes: number;
  max_depth: number;
  seed: number | null;
  source_state_timestamp: string | null;
  total_already_affected: number;
  total_predicted_affected: number;
  total_critical_affected: number;
  max_depth_reached: number;
  impact_summary: CascadeImpactSummary;
  predicted_nodes: PredictedNodeDetail[];
  propagation_paths: PropagationPathDetail[];
  created_at: string;
}

export interface CascadeTimelineEvent {
  timestamp_offset_seconds: number;
  estimated_time: string | null;
  node_id: string;
  node_name: string;
  event_type: string;
  forecast_status: string;
  predicted_state: string;
  impact_level: string;
  depth: number;
  propagation_probability_point: number | null;
  explanation: string;
}

export interface CascadeTimelineResponse {
  forecast_id: string;
  graph_id: string;
  horizon_minutes: number;
  events: CascadeTimelineEvent[];
}

export interface CascadeForecastListItem {
  id: string;
  graph_id: string;
  initiating_node_id: string | null;
  rule_version: string;
  simulation_mode: string;
  calibration_status: string;
  horizon_minutes: number;
  total_already_affected: number;
  total_predicted_affected: number;
  total_critical_affected: number;
  max_depth_reached: number;
  created_at: string;
}

export interface CascadeForecastListResponse {
  items: CascadeForecastListItem[];
  total: number;
  page: number;
  page_size: number;
}
