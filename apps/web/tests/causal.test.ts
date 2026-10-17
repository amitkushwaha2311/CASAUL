/**
 * CAUSAL — Phase 5 Frontend Tests: Causal Reasoning API Client & View Integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "../lib/api-client";
import type {
  HypothesisResponse,
  EvidenceItemResponse,
  CausalInferenceRunResponse,
} from "@causal/shared/src/index";

const mockHypothesis: HypothesisResponse = {
  id: "hyp-001",
  run_id: "run-001",
  graph_id: "graph-001",
  affected_node_id: "node-002",
  candidate_cause_node_id: "node-001",
  candidate_cause_factor: "Upstream Turbine Failure",
  hypothesis_type: "UPSTREAM_FAILURE",
  inference_rule_id: "RULE_UPSTREAM_DEPENDENCY_PRECEDENCE",
  explanation: "Target node depends on upstream provider which experienced failure prior to downstream voltage sag.",
  status: "SUPPORTED",
  unresolved_assumptions: ["Assumes line impedance did not absorb load shift."],
  missing_evidence: [],
  evidence_completeness: 0.95,
  uncertainty_notes: "Temporal sequence validated with high observation confidence.",
  distinguishing_information: "Inspect breaker telemetry on interconnect.",
  rule_version: "1.0.0",
  state_timestamp: "2026-10-11T12:00:00Z",
  created_at: "2026-10-11T12:05:00Z",
};

const mockEvidence: EvidenceItemResponse = {
  id: "evi-001",
  hypothesis_id: "hyp-001",
  record_id: "evt-001",
  record_type: "event",
  node_id: "node-001",
  graph_id: "graph-001",
  evidence_type: "EVENT_FAILURE",
  metric_name: null,
  direction: "SUPPORTING",
  observed_at: "2026-10-11T11:50:00Z",
  recorded_at: "2026-10-11T11:50:02Z",
  source: "scada_system",
  confidence: 0.98,
  relevance_explanation: "Precedent failure event on upstream node matches dependency propagation path.",
  limitations: {},
  created_at: "2026-10-11T12:05:00Z",
};

const mockRunResponse: CausalInferenceRunResponse = {
  id: "run-001",
  graph_id: "graph-001",
  affected_node_id: "node-002",
  rule_version: "1.0.0",
  target_time: "2026-10-11T12:00:00Z",
  input_context: { max_hops: 2 },
  created_at: "2026-10-11T12:05:00Z",
  hypotheses: [mockHypothesis],
};

function mockFetch(data: unknown) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify(data),
    json: async () => data,
  } as unknown as Response);
}

describe("apiClient — Phase 5 Causal Reasoning API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should trigger causal analysis for an affected node", async () => {
    const spy = mockFetch(mockRunResponse);
    const result = await apiClient.analyzeCausal("graph-001", {
      affected_node_id: "node-002",
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/graph-001/causal/analyze"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ affected_node_id: "node-002" }),
      })
    );
    expect(result.id).toBe("run-001");
    expect(result.hypotheses).toHaveLength(1);
    expect(result.hypotheses[0].status).toBe("SUPPORTED");
  });

  it("should list causal hypotheses with status filtering", async () => {
    const spy = mockFetch([mockHypothesis]);
    const result = await apiClient.listHypotheses("graph-001", "SUPPORTED");

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/graph-001/causal/hypotheses?status=SUPPORTED"),
      expect.anything()
    );
    expect(result).toHaveLength(1);
    expect(result[0].inference_rule_id).toBe("RULE_UPSTREAM_DEPENDENCY_PRECEDENCE");
  });

  it("should retrieve a single hypothesis by ID", async () => {
    const spy = mockFetch(mockHypothesis);
    const result = await apiClient.getHypothesis("graph-001", "hyp-001");

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/graph-001/causal/hypotheses/hyp-001"),
      expect.anything()
    );
    expect(result.candidate_cause_factor).toBe("Upstream Turbine Failure");
  });

  it("should retrieve traceable evidence items for a hypothesis", async () => {
    const spy = mockFetch([mockEvidence]);
    const result = await apiClient.getHypothesisEvidence("graph-001", "hyp-001");

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/graph-001/causal/hypotheses/hyp-001/evidence"),
      expect.anything()
    );
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe("SUPPORTING");
    expect(result[0].record_type).toBe("event");
    expect(result[0].confidence).toBe(0.98);
  });

  it("should retrieve hypotheses filtered by node ID", async () => {
    const spy = mockFetch([mockHypothesis]);
    const result = await apiClient.getNodeHypotheses("graph-001", "node-002");

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/graph-001/nodes/node-002/causal/hypotheses"),
      expect.anything()
    );
    expect(result).toHaveLength(1);
    expect(result[0].affected_node_id).toBe("node-002");
  });
});
