/**
 * CAUSAL — Phase 8: Safety-Constrained Intervention Recommendation Types
 *
 * Domain types for:
 * - RecommendationRun lifecycle (PENDING, RUNNING, COMPLETED, FAILED)
 * - CandidateIntervention (safety status, eligibility, ranking, human decision)
 * - SafetyConstraintEvaluation (deterministic constraint check results)
 * - Ranking policy and metric breakdowns
 * - Human decision audits (APPROVED, REJECTED, PENDING)
 */

export type RecommendationRunStatus =
  | "PENDING"
  | "GENERATING"
  | "CONSTRAINING"
  | "SIMULATING"
  | "RANKING"
  | "COMPLETED"
  | "FAILED";

export type SafetyStatus = "SAFE" | "UNSAFE" | "INDETERMINATE";

export type EligibilityStatus = "ELIGIBLE" | "INELIGIBLE" | "INDETERMINATE";

export type DecisionStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ConstraintType =
  | "PROTECTED_NODE_HEALTH"
  | "MAX_ISOLATED_CAPACITY"
  | "ALLOWED_TARGET_MUTABILITY"
  | "BOUNDED_VALUE_RANGE"
  | "NO_CROSS_GRAPH_MUTATION"
  | "SEVERANCE_CRITICALITY_GUARD";

export type ConstraintStatus = "PASSED" | "FAILED" | "INDETERMINATE";

export interface SafetyConstraintEvaluationResponse {
  id: string;
  candidate_id: string;
  constraint_name: string;
  constraint_type: ConstraintType | string;
  status: ConstraintStatus | string;
  evaluated_value?: unknown;
  threshold?: unknown;
  rationale?: string | null;
  supporting_evidence: Record<string, unknown>[];
  created_at: string;
}

export interface CandidateInterventionResponse {
  id: string;
  run_id: string;
  title: string;
  description?: string | null;
  intervention_type: string;
  changes: Record<string, unknown>[];
  counterfactual_experiment_id?: string | null;
  safety_status: SafetyStatus | string;
  eligibility_status: EligibilityStatus | string;
  rank_score?: number | null;
  rank_position?: number | null;
  ranking_breakdown: Record<string, unknown>;
  decision_status: DecisionStatus | string;
  decision_notes?: string | null;
  decided_at?: string | null;
  decided_by?: string | null;
  safety_evaluations: SafetyConstraintEvaluationResponse[];
  created_at: string;
  updated_at: string;
}

export interface CandidateInterventionListItem {
  id: string;
  run_id: string;
  title: string;
  intervention_type: string;
  safety_status: SafetyStatus | string;
  eligibility_status: EligibilityStatus | string;
  rank_score?: number | null;
  rank_position?: number | null;
  decision_status: DecisionStatus | string;
  counterfactual_experiment_id?: string | null;
  created_at: string;
}

export interface CandidateDecisionRequest {
  decision: "APPROVED" | "REJECTED";
  notes?: string;
  decided_by?: string;
}

export interface RecommendationRunCreate {
  name: string;
  description?: string;
  baseline_id?: string | null;
  snapshot_id?: string | null;
  max_candidates?: number;
  horizon_minutes?: number;
  max_depth?: number;
  seed?: number;
  target_node_ids?: string[] | null;
}

export interface RecommendationRunSummary {
  total_candidates: number;
  eligible_candidates: number;
  ineligible_candidates: number;
  indeterminate_candidates: number;
  ranked_candidates: number;
  top_rank_score?: number | null;
  disclaimer: string;
}

export interface RecommendationRunResponse {
  id: string;
  graph_id: string;
  name: string;
  description?: string | null;
  baseline_id?: string | null;
  snapshot_id?: string | null;
  status: RecommendationRunStatus | string;
  generation_settings: Record<string, unknown>;
  ranking_policy: Record<string, unknown>;
  summary?: RecommendationRunSummary | Record<string, unknown> | null;
  limitations: string[];
  execution_error?: string | null;
  completed_at?: string | null;
  candidates: CandidateInterventionResponse[];
  created_at: string;
  updated_at: string;
}

export interface RecommendationRunListItem {
  id: string;
  graph_id: string;
  name: string;
  status: RecommendationRunStatus | string;
  summary?: RecommendationRunSummary | Record<string, unknown> | null;
  created_at: string;
  completed_at?: string | null;
}

export interface RecommendationRunListResponse {
  items: RecommendationRunListItem[];
  total: number;
  page: number;
  page_size: number;
}
