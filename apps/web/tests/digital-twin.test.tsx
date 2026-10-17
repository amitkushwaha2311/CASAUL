/**
 * CAUSAL — Phase 4 Frontend Tests: Digital Twin & State Explorer
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DigitalTwinPage from "../app/app/state/page";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    listGraphs: vi.fn(),
    getGraphState: vi.fn(),
    getNodeState: vi.fn(),
    getNodeStateHistory: vi.fn(),
    getGraphStateHistory: vi.fn(),
    reconstructGraphStateAt: vi.fn(),
    getStateConsistency: vi.fn(),
    createBaseline: vi.fn(),
    listBaselines: vi.fn(),
    getBaseline: vi.fn(),
    createSnapshot: vi.fn(),
    listSnapshots: vi.fn(),
    getSnapshot: vi.fn(),
    compareBaselineVsCurrent: vi.fn(),
    compareSnapshots: vi.fn(),
    createScenario: vi.fn(),
    listScenarios: vi.fn(),
    getScenario: vi.fn(),
    getSystemStateSummary: vi.fn(),
  },
}));

describe("Digital Twin & System State Explorer", () => {
  const mockGraph = {
    id: "g-1",
    name: "Regional Power & Water Grid",
    description: "Grid description",
    domain: "mixed",
    version: 1,
    metadata: null,
    created_at: "2026-10-11T00:00:00Z",
    updated_at: "2026-10-11T00:00:00Z",
  };
  const mockNodes = [
    {
      node_id: "n-1",
      graph_id: "g-1",
      node_name: "Substation Alpha",
      node_type: "power",
      state: "NORMAL",
      health: 0.95,
      capacity: 1.0,
      availability: 1.0,
      criticality: 0.8,
      last_observed_at: "2026-10-11T10:00:00Z",
      last_state_change_at: "2026-10-11T10:00:00Z",
      confidence: 0.9,
      source: "scada_sensor",
      consistency_status: "VALID" as const,
      is_known: true,
      provenance: {
        source: "scada_sensor",
        source_type: "observation" as const,
        observed_at: "2026-10-11T10:00:00Z",
      },
    },
    {
      node_id: "n-2",
      graph_id: "g-1",
      node_name: "Water Treatment Pump 3",
      node_type: "water",
      state: "DEGRADED",
      health: 0.45,
      capacity: 0.5,
      availability: 0.5,
      criticality: 0.6,
      last_observed_at: "2026-10-11T10:05:00Z",
      last_state_change_at: "2026-10-11T10:05:00Z",
      confidence: 0.75,
      source: "flow_meter",
      consistency_status: "WARNING" as const,
      is_known: true,
      provenance: {
        source: "flow_meter",
        source_type: "observation" as const,
        observed_at: "2026-10-11T10:05:00Z",
      },
    },
  ];



  const mockSummary = {
    graph_id: "g-1",
    as_of: "2026-10-11T10:10:00Z",
    total_nodes: 2,
    nodes_with_known_state: 2,
    nodes_with_unknown_state: 0,
    count_by_operational_state: { NORMAL: 1, DEGRADED: 1, CRITICAL: 0, FAILED: 0, RECOVERING: 0, UNKNOWN: 0 },
    average_health: 0.7,
    health_denominator: 2,
    average_capacity: 0.75,
    capacity_denominator: 2,
    average_criticality: 0.7,
    latest_state_update_at: "2026-10-11T10:05:00Z",
    completeness_ratio: 1.0,
    consistency_warning_count: 1,
    consistency_invalid_count: 0,
  };

  const mockConsistency = {
    graph_id: "g-1",
    status: "WARNING" as const,
    total_checked: 2,
    valid_count: 1,
    warning_count: 1,
    invalid_count: 0,
    unknown_count: 0,
    issues: [
      {
        node_id: "n-2",
        node_name: "Water Treatment Pump 3",
        rule_code: "DEGRADED_STATE_LOW_HEALTH",
        severity: "WARNING" as const,
        message: "State degraded",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.listGraphs).mockResolvedValue([mockGraph]);
    vi.mocked(apiClient.getGraphState).mockResolvedValue({
      graph_id: "g-1",
      graph_name: mockGraph.name,
      as_of: "2026-10-11T10:10:00Z",
      total_nodes: 2,
      nodes: mockNodes,
      completeness_ratio: 1.0,
      consistency_status: "WARNING",
    });
    vi.mocked(apiClient.getSystemStateSummary).mockResolvedValue(mockSummary);
    vi.mocked(apiClient.getStateConsistency).mockResolvedValue(mockConsistency);
    vi.mocked(apiClient.listBaselines).mockResolvedValue([]);
    vi.mocked(apiClient.listSnapshots).mockResolvedValue([]);
    vi.mocked(apiClient.getNodeStateHistory).mockResolvedValue([]);
  });

  it("renders graph title, summary metrics, and node list", async () => {
    render(<DigitalTwinPage />);

    await waitFor(() => {
      expect(screen.getByText("System State & Digital Twin")).toBeDefined();
      expect(screen.getByText("AVERAGE HEALTH")).toBeDefined();
      expect(screen.getByText("70.0%")).toBeDefined();
      expect(screen.getByText("TOTAL NODES")).toBeDefined();
    });
  });


  it("displays provenance and confidence for selected node", async () => {
    render(<DigitalTwinPage />);

    await waitFor(() => {
      expect(screen.getByText("State Provenance")).toBeDefined();
      expect(screen.getByText("scada_sensor")).toBeDefined();
      expect(screen.getByText("90%")).toBeDefined(); // confidence
    });
  });

  it("handles tab switching to Baselines and Snapshots", async () => {
    render(<DigitalTwinPage />);

    await waitFor(() => {
      expect(screen.getByText("Baselines & Snapshots")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Baselines & Snapshots"));

    await waitFor(() => {
      expect(screen.getByText("Recorded Baselines")).toBeDefined();
      expect(screen.getByText("System Snapshots")).toBeDefined();
    });
  });
});
