/**
 * CAUSAL Platform — Phase 5 Causal Reasoning Engine TypeScript Types
 *
 * Types for hypotheses, evidence traceability, and causal inference runs.
 */

export type HypothesisStatus =
  | "SUPPORTED"
  | "POSSIBLE"
  | "CONTRADICTED"
  | "INSUFFICIENT_EVIDENCE";

export type EvidenceDirection =
  | "SUPPORTING"
  | "CONTRADICTING"
  | "NEUTRAL";

export type HypothesisType =
  | "UPSTREAM_FAILURE"
  | "LOCAL_FAILURE"
  | "TELEMETRY_ANOMALY"
  | "UNKNOWN_CAUSE";

export interface EvidenceItemResponse {
  id: string;
  hypothesis_id: string;
  record_id: string;
  record_type: string;
  node_id: string | null;
  graph_id: string;
  evidence_type: string;
  metric_name: string | null;
  direction: EvidenceDirection;
  observed_at: string | null;
  recorded_at: string | null;
  source: string | null;
  confidence: number | null;
  relevance_explanation: string;
  limitations: Record<string, unknown>;
  created_at: string;
}

export interface HypothesisResponse {
  id: string;
  run_id: string;
  graph_id: string;
  affected_node_id: string;
  candidate_cause_node_id: string | null;
  candidate_cause_factor: string;
  hypothesis_type: HypothesisType;
  inference_rule_id: string;
  explanation: string;
  status: HypothesisStatus;
  unresolved_assumptions: string[];
  missing_evidence: string[];
  evidence_completeness: number;
  uncertainty_notes: string;
  distinguishing_information: string;
  rule_version: string;
  state_timestamp: string | null;
  created_at: string;
  evidence_items?: EvidenceItemResponse[];
}

export interface CausalAnalysisRequest {
  affected_node_id: string;
  target_time?: string;
  max_depth?: number;
}

export interface CausalInferenceRunResponse {
  id: string;
  graph_id: string;
  affected_node_id: string;
  rule_version: string;
  target_time: string | null;
  input_context: Record<string, unknown>;
  created_at: string;
  hypotheses: HypothesisResponse[];
}
