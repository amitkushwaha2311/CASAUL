/**
 * CAUSAL Platform — Phase 7 Counterfactual Simulation Engine TypeScript Types
 *
 * Types for deterministic, auditable counterfactual what-if experiments.
 *
 * Safety note: All types in this file represent hypothetical simulation inputs
 * and outputs. They NEVER represent live operational state or real-world commands.
 */

// ── Enumerations ────────────────────────────────────────────────────────────

export type CounterfactualExperimentStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export type CounterfactualTargetType = "NODE" | "DEPENDENCY";

/**
 * Supported hypothetical change types.
 * Only operations that can be defensibly supported by the Phase 6
 * propagation model are included.
 */
export type CounterfactualChangeType =
  | "STATE_OVERRIDE"            // Override a node's operational state
  | "HEALTH_OVERRIDE"           // Override a node's health score [0.0–1.0]
  | "CAPACITY_OVERRIDE"         // Override a node's capacity [0.0–1.0]
  | "AVAILABILITY_OVERRIDE"     // Override a node's availability [0.0–1.0]
  | "DEPENDENCY_AVAILABILITY"   // Sever (false) or restore (true) a dependency
  | "DEPENDENCY_STRENGTH"       // Override coupling strength [0.0–1.0]
  | "DEPENDENCY_DELAY";         // Override propagation delay in seconds

/**
 * Comparison outcome status for a specific metric or node.
 * All statuses are model-dependent; a modeled improvement does NOT
 * prove real-world intervention effectiveness.
 */
export type ComparisonStatus =
  | "IMPROVED"       // Defined modeled metric improves under selected assumptions
  | "UNCHANGED"      // No modeled difference detected
  | "WORSENED"       // Defined modeled metric worsens
  | "INDETERMINATE"; // Model cannot support a defensible comparison

// ── Intervention / Change types ─────────────────────────────────────────────

export interface CounterfactualChangeCreate {
  /** Target entity type: NODE or DEPENDENCY */
  target_type: CounterfactualTargetType;
  /** UUID of the target node or dependency within this graph */
  target_id: string;
  /** Type of hypothetical modification */
  change_type: CounterfactualChangeType;
  /** Hypothetical proposed value to apply in the isolated simulation copy */
  proposed_value: string | number | boolean;
  /** Original baseline value (optional — auto-filled from baseline if omitted) */
  original_value?: string | number | boolean | null;
  /** Optional unit of measurement (e.g. "seconds", "fraction") */
  unit?: string | null;
  /** User-provided rationale for why this hypothetical change is being tested */
  rationale?: string | null;
}

export interface CounterfactualChangeResponse {
  id: string;
  experiment_id: string;
  target_type: CounterfactualTargetType;
  target_id: string;
  change_type: CounterfactualChangeType;
  original_value: string | number | boolean | null;
  proposed_value: string | number | boolean;
  unit: string | null;
  rationale: string | null;
  created_at: string;
}

// ── Forecast Settings ────────────────────────────────────────────────────────

export interface CounterfactualForecastSettings {
  /** Simulation time horizon in minutes [1–1440] */
  horizon_minutes?: number;
  /** Maximum traversal depth [1–20] */
  max_depth?: number;
  /** DETERMINISTIC or MONTE_CARLO */
  simulation_mode?: string;
  /** Reproducibility seed for stochastic modes */
  seed?: number | null;
  /** Minimum propagation probability threshold [0.0–1.0] */
  propagation_probability_threshold?: number;
  /** Node that initiates the disturbance scenario */
  initiating_node_id?: string | null;
  /** Custom per-dependency-type delay overrides (seconds) */
  custom_delay_assumptions?: Record<string, number> | null;
}

// ── Experiment Create / Response ─────────────────────────────────────────────

export interface CounterfactualExperimentCreate {
  name: string;
  description?: string | null;
  /** Phase 4 StateBaseline ID to use as the observed baseline */
  baseline_id?: string | null;
  /** Phase 4 StateSnapshot ID to use as the observed baseline */
  snapshot_id?: string | null;
  forecast_settings?: CounterfactualForecastSettings;
  /** At least one hypothetical change is required */
  changes: CounterfactualChangeCreate[];
}

export interface CounterfactualExperimentResponse {
  id: string;
  graph_id: string;
  name: string;
  description: string | null;
  baseline_id: string | null;
  snapshot_id: string | null;
  status: CounterfactualExperimentStatus;
  rule_version: string;
  forecast_settings: Record<string, unknown>;
  baseline_forecast_id: string | null;
  counterfactual_forecast_id: string | null;
  execution_error: string | null;
  summary: Record<string, unknown> | null;
  changes: CounterfactualChangeResponse[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CounterfactualExperimentListItem {
  id: string;
  graph_id: string;
  name: string;
  status: CounterfactualExperimentStatus;
  total_changes: number;
  baseline_forecast_id: string | null;
  counterfactual_forecast_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CounterfactualExperimentListResponse {
  items: CounterfactualExperimentListItem[];
  total: number;
  page: number;
  page_size: number;
}

// ── Comparison Response ──────────────────────────────────────────────────────

export interface CounterfactualNodeDiff {
  node_id: string;
  node_name: string;
  criticality: number;
  /** Category label: PREVENTED, NEW_IMPACT, DELAYED, ACCELERATED, SEVERITY_CHANGED */
  difference_category?: string;
  explanation?: string;
  baseline_status?: string;
  baseline_impact_level?: string;
  baseline_point_impact_seconds?: number | null;
  counterfactual_status?: string;
  counterfactual_impact_level?: string;
  counterfactual_point_impact_seconds?: number | null;
  time_delta_seconds?: number | null;
}

export interface CounterfactualComparisonMetrics {
  baseline_blast_radius_count: number;
  counterfactual_blast_radius_count: number;
  blast_radius_reduction_count: number;
  nodes_prevented_count: number;
  nodes_newly_affected_count: number;
  baseline_composite_impact_percent: number;
  counterfactual_composite_impact_percent: number;
  composite_impact_delta_percent: number;
  baseline_critical_affected_count: number;
  counterfactual_critical_affected_count: number;
  baseline_max_depth: number;
  counterfactual_max_depth: number;
  horizon_minutes: number;
}

export interface CounterfactualComparisonResponse {
  id: string;
  experiment_id: string;
  baseline_forecast_id: string | null;
  counterfactual_forecast_id: string | null;
  nodes_affected_both: CounterfactualNodeDiff[];
  nodes_affected_baseline_only: CounterfactualNodeDiff[];
  nodes_affected_counterfactual_only: CounterfactualNodeDiff[];
  nodes_timing_differ: CounterfactualNodeDiff[];
  nodes_severity_differ: CounterfactualNodeDiff[];
  critical_nodes_summary: {
    baseline_critical_affected_count: number;
    counterfactual_critical_affected_count: number;
    critical_nodes_prevented: string[];
    critical_nodes_newly_affected: string[];
  };
  uncertainty_differences: {
    baseline_completeness_ratio: number;
    calibration_status: string;
    model_assumptions_hold_constant: boolean;
    note: string;
  };
  comparison_metrics: CounterfactualComparisonMetrics;
  warnings: string[];
  limitations: string[];
  created_at: string;
}

// ── Full Result Response ─────────────────────────────────────────────────────

export interface CounterfactualRunResultResponse {
  experiment: CounterfactualExperimentResponse;
  baseline_forecast: Record<string, unknown> | null;
  counterfactual_forecast: Record<string, unknown> | null;
  comparison: CounterfactualComparisonResponse | null;
}
