/**
 * CAUSAL Platform — Shared TypeScript Types
 *
 * This package defines the foundational domain types shared between
 * the frontend and any type-generation utilities.
 *
 * Phase 1: Core platform concepts only.
 * Phase 2: Full infrastructure graph model will be added here.
 *
 * DO NOT import runtime dependencies — this package is types-only.
 */

// ── Node / Graph State ─────────────────────────────────────────────────────

/**
 * Operational state of a graph node in the infrastructure.
 * Maps to the semantic status colors in the design system.
 */
export type NodeState =
  | "normal"      // Operating within expected parameters
  | "degraded"    // Performance reduced but functional
  | "critical"    // Approaching failure threshold
  | "failed"      // Completely non-operational
  | "recovering"  // Returning to normal after failure
  | "simulation"  // Under simulation — not a real state
  | "unknown";    // State cannot be determined

// ── Event / Incident Severity ──────────────────────────────────────────────

/**
 * Severity classification for platform events and incidents.
 * Used to drive visual urgency and notification priority.
 */
export type EventSeverity =
  | "info"      // Informational, no action required
  | "low"       // Minor anomaly, monitor
  | "medium"    // Significant anomaly, investigation recommended
  | "high"      // Serious incident, action required
  | "critical"  // Emergency, immediate response required;

// ── System Status ──────────────────────────────────────────────────────────

/**
 * High-level operational status of a monitored infrastructure system.
 */
export type SystemStatus =
  | "normal"
  | "degraded"
  | "critical"
  | "failed"
  | "recovering"
  | "simulation"
  | "unknown";

// ── Simulation Status ──────────────────────────────────────────────────────

/**
 * Lifecycle state of a cascade simulation run.
 * Will be used by the simulation engine in a future phase.
 */
export type SimulationStatus =
  | "pending"     // Queued but not started
  | "running"     // Currently executing
  | "completed"   // Finished successfully
  | "failed"      // Simulation error
  | "cancelled";  // Cancelled by user

// ── Confidence Level ───────────────────────────────────────────────────────

/**
 * Qualitative confidence level for causal analysis outputs.
 * The exact confidence score (0–1) is a separate numeric field.
 * This label is for human-readable display.
 */
export type ConfidenceLevel =
  | "very_low"   // < 0.2
  | "low"        // 0.2 – 0.4
  | "moderate"   // 0.4 – 0.6
  | "high"       // 0.6 – 0.8
  | "very_high"; // > 0.8

/**
 * Map a numeric confidence score (0–1) to a ConfidenceLevel label.
 */
export function toConfidenceLevel(score: number): ConfidenceLevel {
  if (score < 0.2) return "very_low";
  if (score < 0.4) return "low";
  if (score < 0.6) return "moderate";
  if (score < 0.8) return "high";
  return "very_high";
}

// ── Infrastructure Domains ─────────────────────────────────────────────────

/**
 * Top-level domains of infrastructure that CAUSAL can model.
 */
export type InfrastructureDomain =
  | "power"
  | "water"
  | "telecom"
  | "healthcare"
  | "transportation"
  | "industrial"
  | "unknown";

// ── API Response Envelopes ─────────────────────────────────────────────────

/**
 * Standard error detail returned by the CAUSAL API.
 */
export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Standard error envelope returned by the CAUSAL API.
 */
export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

/**
 * Type guard to detect an API error response.
 */
export function isApiError(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiErrorResponse).error === "object"
  );
}

// ── Health ─────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: "healthy" | "degraded" | "unavailable";
  database: "connected" | "unavailable";
  version: string;
}

export interface SystemInfoResponse {
  service: string;
  version: string;
  environment: string;
  phase: string;
}

export interface SystemStatusResponse {
  api: string;
  database: string;
  version: string;
  features: {
    causal_engine: boolean;
    simulation: boolean;
    interventions: boolean;
  };
}

export * from "./graph-types";
export * from "./event-types";
export * from "./state-types";
export * from "./causal-types";
export * from "./cascade-types";
export * from "./counterfactual-types";
export * from "./recommendation-types";
export * from "./assessment-types";
