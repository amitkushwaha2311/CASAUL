/**
 * CAUSAL — Frontend Tests: Platform Overview Dashboard (/app)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import OverviewDashboard from "../app/app/page";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    health: vi.fn(),
    systemStatus: vi.fn(),
    listGraphs: vi.fn(),
    getSystemStateSummary: vi.fn(),
    listEvents: vi.fn(),
    listHypotheses: vi.fn(),
  },
}));

describe("Platform Overview Dashboard (/app)", () => {
  const mockHealth = {
    status: "healthy" as const,
    database: "connected" as const,
    version: "1.0.0",
  };

  const mockSystemStatus = {
    api: "online",
    database: "connected",
    version: "1.0.0",
    features: {
      causal_engine: true,
      simulation: false,
      interventions: false,
    },
  };

  const mockGraphs = [
    {
      id: "graph-001",
      name: "Metropolitan Power Grid",
      description: "High-voltage distribution network",
      domain: "power",
      version: 1,
      metadata: null,
      created_at: "2026-10-11T00:00:00Z",
      updated_at: "2026-10-11T00:00:00Z",
    },
    {
      id: "graph-002",
      name: "Municipal Water Network",
      description: "Pumping stations and treatment facilities",
      domain: "water",
      version: 1,
      metadata: null,
      created_at: "2026-10-11T00:00:00Z",
      updated_at: "2026-10-11T00:00:00Z",
    },
  ];

  const mockSummaryGraph1 = {
    graph_id: "graph-001",
    as_of: "2026-10-11T12:00:00Z",
    total_nodes: 10,
    nodes_with_known_state: 9,
    nodes_with_unknown_state: 1,
    count_by_operational_state: {
      NORMAL: 7,
      DEGRADED: 2,
      CRITICAL: 1,
      FAILED: 0,
      RECOVERING: 0,
      UNKNOWN: 0,
    },
    average_health: 0.82,
    health_denominator: 10,
    average_capacity: 0.9,
    capacity_denominator: 10,
    average_criticality: 0.75,
    latest_state_update_at: "2026-10-11T12:05:00Z",
    completeness_ratio: 0.9,
    consistency_warning_count: 1,
    consistency_invalid_count: 0,
  };

  const mockSummaryGraph2 = {
    graph_id: "graph-002",
    as_of: "2026-10-11T12:00:00Z",
    total_nodes: 5,
    nodes_with_known_state: 5,
    nodes_with_unknown_state: 0,
    count_by_operational_state: {
      NORMAL: 5,
      DEGRADED: 0,
      CRITICAL: 0,
      FAILED: 0,
      RECOVERING: 0,
      UNKNOWN: 0,
    },
    average_health: 0.95,
    health_denominator: 5,
    average_capacity: 0.88,
    capacity_denominator: 5,
    average_criticality: 0.6,
    latest_state_update_at: "2026-10-11T12:06:00Z",
    completeness_ratio: 1.0,
    consistency_warning_count: 0,
    consistency_invalid_count: 0,
  };

  const mockEvents = [
    {
      id: "evt-01",
      graph_id: "graph-001",
      event_type: "TRANSFORMER_OVERHEAT",
      severity: "CRITICAL" as const,
      status: "OPEN" as const,
      source: "thermal_sensor",
      timestamp: "2026-10-11T12:04:00Z",
      received_at: "2026-10-11T12:04:02Z",
      description: "Core temperature threshold exceeded on transformer T-1",
      confidence: 0.98,
      evidence: null,
      metadata_: null,
      created_at: "2026-10-11T12:04:00Z",
      updated_at: "2026-10-11T12:04:00Z",
    },
    {
      id: "evt-02",
      graph_id: "graph-001",
      event_type: "VOLTAGE_SAG",
      severity: "HIGH" as const,
      status: "OPEN" as const,
      source: "bus_telemetry",
      timestamp: "2026-10-11T12:03:00Z",
      received_at: "2026-10-11T12:03:01Z",
      description: "Substation Alpha secondary bus drop below 0.92 pu",
      confidence: 0.94,
      evidence: null,
      metadata_: null,
      created_at: "2026-10-11T12:03:00Z",
      updated_at: "2026-10-11T12:03:00Z",
    },
  ];

  const mockHypotheses = [
    {
      id: "hyp-01",
      run_id: "run-01",
      graph_id: "graph-001",
      affected_node_id: "node-sub-2",
      candidate_cause_node_id: "node-t1",
      candidate_cause_factor: "Transformer Thermal Lockout",
      hypothesis_type: "UPSTREAM_FAILURE" as const,
      inference_rule_id: "RULE_CASCADE_UPSTREAM",
      explanation: "Substation secondary bus voltage dropped following upstream transformer thermal overload trip.",
      status: "SUPPORTED" as const,
      unresolved_assumptions: [],
      missing_evidence: [],
      evidence_completeness: 0.95,
      uncertainty_notes: "",
      distinguishing_information: "",
      rule_version: "1.0",
      state_timestamp: "2026-10-11T12:04:00Z",
      created_at: "2026-10-11T12:05:00Z",
    },
    {
      id: "hyp-02",
      run_id: "run-01",
      graph_id: "graph-001",
      affected_node_id: "node-sub-2",
      candidate_cause_node_id: null,
      candidate_cause_factor: "Local Switchgear Fault",
      hypothesis_type: "LOCAL_FAILURE" as const,
      inference_rule_id: "RULE_LOCAL_ANOMALY",
      explanation: "Possible contact resistance anomaly at breaker B-4.",
      status: "POSSIBLE" as const,
      unresolved_assumptions: [],
      missing_evidence: [],
      evidence_completeness: 0.6,
      uncertainty_notes: "",
      distinguishing_information: "",
      rule_version: "1.0",
      state_timestamp: "2026-10-11T12:04:00Z",
      created_at: "2026-10-11T12:05:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.health).mockResolvedValue(mockHealth);
    vi.mocked(apiClient.systemStatus).mockResolvedValue(mockSystemStatus);
    vi.mocked(apiClient.listGraphs).mockResolvedValue(mockGraphs);
    vi.mocked(apiClient.getSystemStateSummary).mockImplementation(async (id: string) => {
      if (id === "graph-001") return mockSummaryGraph1;
      return mockSummaryGraph2;
    });
    vi.mocked(apiClient.listEvents).mockImplementation(async (id: string) => {
      if (id === "graph-001") return mockEvents;
      return [];
    });
    vi.mocked(apiClient.listHypotheses).mockImplementation(async (id: string) => {
      if (id === "graph-001") return mockHypotheses;
      return [];
    });
  });

  it("renders platform overview title, live metrics, and health indicator", async () => {
    render(<OverviewDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Platform Overview")).toBeInTheDocument();
      expect(screen.getByText("Monitored Graphs")).toBeInTheDocument();
      expect(screen.getByText("Total Nodes")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument(); // 10 + 5 nodes
      expect(screen.getByText("Average Health")).toBeInTheDocument();
      expect(screen.getByText("88.5%")).toBeInTheDocument(); // avg of 82% and 95%
    });
  });

  it("renders graph cards and operational telemetry", async () => {
    render(<OverviewDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Metropolitan Power Grid")).toBeInTheDocument();
      expect(screen.getByText("Municipal Water Network")).toBeInTheDocument();
      expect(screen.getByText("High-voltage distribution network")).toBeInTheDocument();
      expect(screen.getByText("Infrastructure Graphs & Twin Telemetry")).toBeInTheDocument();
    });
  });

  it("renders active events and incident stream", async () => {
    render(<OverviewDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Active Incidents & Events")).toBeInTheDocument();
      expect(screen.getByText("TRANSFORMER_OVERHEAT")).toBeInTheDocument();
      expect(screen.getByText("Core temperature threshold exceeded on transformer T-1")).toBeInTheDocument();
      expect(screen.getByText("VOLTAGE_SAG")).toBeInTheDocument();
    });
  });

  it("renders causal hypotheses summary breakdown", async () => {
    render(<OverviewDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Causal Engine Hypotheses")).toBeInTheDocument();
      expect(screen.getAllByText("SUPPORTED").length).toBeGreaterThan(0);
      expect(screen.getAllByText("POSSIBLE").length).toBeGreaterThan(0);
      expect(screen.getByText("Transformer Thermal Lockout")).toBeInTheDocument();
    });
  });

  it("handles empty state when no graphs exist", async () => {
    vi.mocked(apiClient.listGraphs).mockResolvedValue([]);

    render(<OverviewDashboard />);

    await waitFor(() => {
      expect(screen.getByText("No Monitored Infrastructure Graphs")).toBeInTheDocument();
      expect(screen.getByText("Explore System State")).toBeInTheDocument();
    });
  });

  it("handles error state when API fails", async () => {
    vi.mocked(apiClient.listGraphs).mockRejectedValue(new Error("Network connection refused"));

    render(<OverviewDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Overview Telemetry Unavailable")).toBeInTheDocument();
      expect(screen.getByText("Try again")).toBeInTheDocument();
    });
  });

  it("triggers refresh when clicking refresh button", async () => {
    render(<OverviewDashboard />);

    await waitFor(() => {
      expect(screen.getByText("↺ Refresh")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("↺ Refresh"));

    await waitFor(() => {
      expect(apiClient.listGraphs).toHaveBeenCalledTimes(2);
    });
  });
});
