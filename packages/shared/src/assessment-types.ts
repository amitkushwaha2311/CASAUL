/**
 * CAUSAL Platform — Phase 10: Unified Resilience Assessment Types
 *
 * Types for assembling and viewing cross-phase evidence, forecasts,
 * counterfactuals, recommendations, and provenance.
 */

export type AssessmentStatus = "READY" | "PARTIAL" | "FAILED";

export interface AssessmentCreateRequest {
  name: string;
  description?: string | null;
  baseline_id?: string | null;
  snapshot_id?: string | null;
  causal_run_id?: string | null;
  forecast_run_id?: string | null;
  counterfactual_experiment_id?: string | null;
  recommendation_run_id?: string | null;
}

export interface SourceReference {
  record_type: string;
  record_id: string;
  description: string;
  timestamp?: string | null;
  url_hint?: string | null;
}

export interface EvidenceLineageItem {
  direction: "SUPPORTING" | "CONTRADICTING" | "NEUTRAL";
  evidence_type: string;
  summary: string;
  source_record_type?: string | null;
  source_record_id?: string | null;
  observed_at?: string | null;
  confidence?: number | null;
}

export interface HypothesisSummary {
  hypothesis_id: string;
  hypothesis_type: string;
  status: "SUPPORTED" | "POSSIBLE" | "CONTRADICTED" | "UNRESOLVED";
  explanation: string;
  inference_rule: string;
  evidence_completeness_ratio: number;
  supporting_count: number;
  contradicting_count: number;
  neutral_count: number;
  missing_evidence: string[];
  unresolved_assumptions: string[];
  affected_node_id?: string | null;
  affected_node_name?: string | null;
  candidate_cause_node_id?: string | null;
  candidate_cause_node_name?: string | null;
}

export interface ForecastNodeSummary {
  node_id: string;
  node_name: string;
  forecast_status: "ALREADY_AFFECTED" | "PREDICTED_AFFECTED" | "UNAFFECTED";
  predicted_impact_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  calibration_status: "HEURISTIC_ESTIMATE" | "CALIBRATED" | "UNAVAILABLE";
  earliest_impact_seconds?: number | null;
  latest_impact_seconds?: number | null;
  depth: number;
}

export interface CounterfactualSummaryItem {
  prevented_node_count: number;
  newly_introduced_node_count: number;
  shared_affected_node_count: number;
  timing_differences_count: number;
  has_critical_prevention: boolean;
  warnings: string[];
  limitations: string[];
}

export interface CandidateSummary {
  candidate_id: string;
  title: string;
  intervention_type: string;
  safety_status: "PASS" | "FAIL" | "INDETERMINATE";
  eligibility_status: "ELIGIBLE" | "INELIGIBLE";
  rank_position?: number | null;
  rank_score?: number | null;
  decision_status: "PENDING" | "APPROVED" | "REJECTED";
  decided_by?: string | null;
  decided_at?: string | null;
}

export interface AssessmentGraphSummary {
  graph_id: string;
  graph_name: string;
  node_count: number;
  dependency_count: number;
  active_event_count: number;
  critical_event_count: number;
  degraded_node_count: number;
  critical_node_count: number;
  failed_node_count: number;
  data_available: boolean;
  source_reference?: SourceReference | null;
}

export interface AssessmentImpactSummary {
  hypotheses_total?: number | null;
  hypotheses_supported?: number | null;
  hypotheses_contradicted?: number | null;
  hypotheses_unresolved?: number | null;
  causal_source?: SourceReference | null;
  causal_available: boolean;

  forecast_horizon_minutes?: number | null;
  forecast_already_affected?: number | null;
  forecast_predicted_affected?: number | null;
  forecast_critical_affected?: number | null;
  forecast_calibration_status?: string | null;
  forecast_source?: SourceReference | null;
  forecast_available: boolean;

  counterfactual_summary?: CounterfactualSummaryItem | null;
  counterfactual_source?: SourceReference | null;
  counterfactual_available: boolean;

  recommendation_eligible_count?: number | null;
  recommendation_ineligible_count?: number | null;
  recommendation_approved_count?: number | null;
  recommendation_rejected_count?: number | null;
  recommendation_pending_count?: number | null;
  recommendation_source?: SourceReference | null;
  recommendation_available: boolean;

  data_freshness_warning: boolean;
  missing_sources: string[];
}

export interface AssessmentEvidenceLineage {
  assessment_id: string;
  graph_id: string;
  causal_run_id?: string | null;
  analyzed_at?: string | null;
  rule_version?: string | null;
  hypotheses: HypothesisSummary[];
  total_hypotheses: number;
  evidence_completeness_avg?: number | null;
  missing_evidence_summary: string[];
  warnings: string[];
  causal_available: boolean;
}

export interface AssessmentDecisions {
  assessment_id: string;
  graph_id: string;
  recommendation_run_id?: string | null;
  run_name?: string | null;
  run_status?: string | null;
  candidates: CandidateSummary[];
  total_candidates: number;
  approved_count: number;
  rejected_count: number;
  pending_count: number;
  recommendation_available: boolean;
  limitations: string[];
}

export interface AssessmentListItem {
  id: string;
  graph_id: string;
  name: string;
  description?: string | null;
  status: AssessmentStatus;
  created_by_email?: string | null;
  assembled_at?: string | null;
  created_at: string;
  has_causal: boolean;
  has_forecast: boolean;
  has_counterfactual: boolean;
  has_recommendation: boolean;
  warning_count: number;
  missing_source_count: number;
}

export interface AssessmentResponse {
  id: string;
  graph_id: string;
  name: string;
  description?: string | null;
  status: AssessmentStatus;

  baseline_id?: string | null;
  snapshot_id?: string | null;
  causal_run_id?: string | null;
  forecast_run_id?: string | null;
  counterfactual_experiment_id?: string | null;
  recommendation_run_id?: string | null;

  graph_summary?: Record<string, any> | null;
  impact_summary?: Record<string, any> | null;
  uncertainty_summary?: Record<string, any> | null;
  recommendation_summary?: Record<string, any> | null;

  missing_sources: string[];
  warnings: string[];
  limitations: string[];
  model_versions: Record<string, string>;

  created_by_email?: string | null;
  created_by_id?: string | null;
  assembled_at?: string | null;
  assembly_error?: string | null;
  created_at: string;
}

export interface AssessmentListResponse {
  items: AssessmentListItem[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}
