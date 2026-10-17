// ── Infrastructure Graph Phase 2 Types ─────────────────────────────────────
import type { NodeState } from "./index";

export interface GraphResponse {

  id: string;
  name: string;
  description: string | null;
  domain: string | null;
  version: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface NodeResponse {
  id: string;
  graph_id: string;
  name: string;
  type: string;
  description: string | null;
  state: NodeState;
  health: number;
  capacity: number;
  criticality: number;
  location: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DependencyResponse {
  id: string;
  graph_id: string;
  source_node_id: string;
  target_node_id: string;
  dependency_type: string;
  strength: number;
  required: boolean;
  failure_propagation: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface NodeSummary {
  id: string;
  name: string;
  type: string;
  state: NodeState;
  health: number;
  criticality: number;
}

export interface PathResponse {
  source_id: string;
  target_id: string;
  path: string[];
  path_nodes: NodeSummary[];
  found: boolean;
}

export interface NeighborhoodResponse {
  center_node_id: string;
  depth: number;
  nodes: NodeSummary[];
  dependencies: DependencyResponse[];
}

export interface GraphStatisticsResponse {
  graph_id: string;
  node_count: number;
  dependency_count: number;
  healthy_node_count: number;
  degraded_node_count: number;
  critical_node_count: number;
  failed_node_count: number;
  recovering_node_count: number;
  average_health: number;
  average_criticality: number;
  connected_components: number;
  isolated_nodes: number;
  cycle_count: number;
}

export interface ValidationIssue {
  severity: "ERROR" | "WARNING" | "INFO";
  code: string;
  message: string;
  node_id: string | null;
  dependency_id: string | null;
}

export interface GraphValidationResponse {
  graph_id: string;
  valid: boolean;
  issues: ValidationIssue[];
  error_count: number;
  warning_count: number;
  info_count: number;
}
