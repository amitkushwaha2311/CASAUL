/**
 * CAUSAL — Phase 1–6 Analytics & Historical Operational Trends Tests (/app/analytics)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AnalyticsPage from "../app/app/analytics/page";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    listGraphs: vi.fn(),
    getGraphStatistics: vi.fn(),
    getEventStatistics: vi.fn(),
    listEvents: vi.fn(),
    getSystemStateSummary: vi.fn(),
    getGraphStateHistory: vi.fn(),
    listHypotheses: vi.fn(),
    listCascadeForecasts: vi.fn(),
    listSnapshots: vi.fn(),
    listBaselines: vi.fn(),
  },
}));

describe("Analytics & Operational Trends Page (/app/analytics)", () => {
  const mockGraph = {
    id: "g-test-1",
    name: "Metropolitan Utility Grid",
    description: "Combined power and aqueduct grid",
    domain: "infrastructure",
    version: 1,
    metadata: null,
    created_at: "2026-10-10T00:00:00Z",
    updated_at: "2026-10-10T00:00:00Z",
  };

  const mockGraphStats = {
    graph_id: "g-test-1",
    node_count: 5,
    dependency_count: 8,
    healthy_node_count: 3,
    degraded_node_count: 1,
    critical_node_count: 0,
    failed_node_count: 1,
    recovering_node_count: 0,
    average_health: 0.88,
    average_criticality: 0.65,
    connected_components: 1,
    isolated_nodes: 0,
    cycle_count: 0,
  };

  const mockEventStats = {
    total_events: 42,
    open_events: 10,
    acknowledged_events: 12,
    resolved_events: 18,
    dismissed_events: 2,
    count_by_severity: {
      CRITICAL: 4,
      HIGH: 8,
      MEDIUM: 12,
      LOW: 6,
      INFO: 12,
    },
    count_by_type: {
      SUBSTATION_VOLTAGE_SPIKE: 4,
      PUMP_FLOW_RESTRICTION: 10,
    },
    observation_count: 85,
  };

  const mockEvents = [
    {
      id: "ev-1",
      graph_id: "g-test-1",
      event_type: "SUBSTATION_VOLTAGE_SPIKE",
      severity: "CRITICAL" as const,
      status: "OPEN" as const,
      source: "scada_telemetry",
      timestamp: "2026-10-12T10:00:00Z",
      received_at: "2026-10-12T10:00:01Z",
      description: "Voltage surge exceeded 20% tolerance",
      confidence: 0.98,
      evidence: null,
      metadata_: { surge_kv: 245 },
      created_at: "2026-10-12T10:00:01Z",
      updated_at: "2026-10-12T10:00:01Z",
    },
    {
      id: "ev-2",
      graph_id: "g-test-1",
      event_type: "PUMP_FLOW_RESTRICTION",
      severity: "MEDIUM" as const,
      status: "ACKNOWLEDGED" as const,
      source: "flow_monitor",
      timestamp: "2026-10-12T09:30:00Z",
      received_at: "2026-10-12T09:30:01Z",
      description: "Pump head pressure degraded to 65%",
      confidence: 0.92,
      evidence: null,
      metadata_: { pressure_bar: 3.2 },
      created_at: "2026-10-12T09:30:01Z",
      updated_at: "2026-10-12T09:30:01Z",
    },
  ];

  const mockStateSummary = {
    graph_id: "g-test-1",
    as_of: "2026-10-12T11:00:00Z",
    total_nodes: 5,
    nodes_with_known_state: 5,
    nodes_with_unknown_state: 0,
    count_by_operational_state: { NORMAL: 3, DEGRADED: 1, FAILED: 1 },
    average_health: 0.88,
    health_denominator: 5,
    average_capacity: 0.92,
    capacity_denominator: 5,
    average_criticality: 0.65,
    completeness_ratio: 1.0,
    consistency_warning_count: 0,
    consistency_invalid_count: 0,
  };

  const mockStateHistory = [
    {
      id: "hist-1",
      node_id: "node-p1",
      graph_id: "g-test-1",
      state: "FAILED",
      health: 0.15,
      capacity: 0.0,
      availability: 0.0,
      confidence: 0.98,
      consistency_status: "VALID",
      recorded_at: "2026-10-12T10:05:00Z",
      observed_at: "2026-10-12T10:05:00Z",
      source: "scada_alarm",
    },
    {
      id: "hist-2",
      node_id: "node-w1",
      graph_id: "g-test-1",
      state: "DEGRADED",
      health: 0.65,
      capacity: 0.7,
      availability: 0.85,
      confidence: 0.92,
      consistency_status: "VALID",
      recorded_at: "2026-10-12T09:35:00Z",
      observed_at: "2026-10-12T09:35:00Z",
      source: "flow_monitor",
    },
    {
      id: "hist-3",
      node_id: "node-c1",
      graph_id: "g-test-1",
      state: "NORMAL",
      health: 0.96,
      capacity: 1.0,
      availability: 1.0,
      confidence: 0.95,
      consistency_status: "VALID",
      recorded_at: "2026-10-12T08:00:00Z",
      observed_at: "2026-10-12T08:00:00Z",
      source: "heartbeat",
    },
  ];

  const mockHypotheses = [
    {
      id: "hyp-1",
      run_id: "run-1",
      graph_id: "g-test-1",
      affected_node_id: "node-w1",
      candidate_cause_node_id: "node-p1",
      candidate_cause_factor: "power_supply",
      hypothesis_type: "UPSTREAM_FAILURE" as const,
      inference_rule_id: "rule-casc-1",
      explanation: "Substation power drop triggered water pump stall",
      status: "SUPPORTED" as const,
      unresolved_assumptions: [],
      missing_evidence: [],
      evidence_completeness: 0.85,
      uncertainty_notes: "None",
      distinguishing_information: "Distinct voltage timestamp precursor",
      rule_version: "v1.0",
      state_timestamp: "2026-10-12T10:00:00Z",
      created_at: "2026-10-12T10:15:00Z",
    },
    {
      id: "hyp-2",
      run_id: "run-1",
      graph_id: "g-test-1",
      affected_node_id: "node-t1",
      candidate_cause_node_id: "node-w1",
      candidate_cause_factor: "telemetry_latency",
      hypothesis_type: "TELEMETRY_ANOMALY" as const,
      inference_rule_id: "rule-starv-1",
      explanation: "Downstream reservoir flow restricted",
      status: "CONTRADICTED" as const,
      unresolved_assumptions: [],
      missing_evidence: ["pipe_flow_sensor_3"],
      evidence_completeness: 0.4,
      uncertainty_notes: "Missing sensor",
      distinguishing_information: "Valve remained open",
      rule_version: "v1.0",
      state_timestamp: "2026-10-12T10:00:00Z",
      created_at: "2026-10-12T10:30:00Z",
    },
  ];

  const mockForecasts = {
    items: [
      {
        id: "fc-1",
        graph_id: "g-test-1",
        initiating_node_id: "node-p1",
        rule_version: "v1.0",
        simulation_mode: "DETERMINISTIC",
        calibration_status: "CALIBRATED",
        horizon_minutes: 720,
        total_already_affected: 1,
        total_predicted_affected: 4,
        total_critical_affected: 2,
        max_depth_reached: 3,
        created_at: "2026-10-12T10:30:00Z",
      },
    ],
    total: 1,
    page: 1,
    page_size: 50,
  };

  const mockSnapshots = [
    {
      id: "snap-1",
      graph_id: "g-test-1",
      name: "Pre-Incident Baseline Snapshot",
      snapshot_type: "LIVE",
      captured_at: "2026-10-12T07:00:00Z",
      effective_at: "2026-10-12T07:00:00Z",
      completeness_ratio: 1.0,
      node_count: 5,
      node_states: {},
      created_at: "2026-10-12T07:00:00Z",
    },
  ];

  const mockBaselines = [
    {
      id: "base-1",
      graph_id: "g-test-1",
      name: "Certified Q4 Normal Baseline",
      description: "Golden operating baseline for autumn grid load",
      is_active: true,
      captured_at: "2026-10-01T00:00:00Z",
      completeness_ratio: 1.0,
      node_count: 5,
      node_states: {},
      created_at: "2026-10-01T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(apiClient.listGraphs).mockResolvedValue([mockGraph]);
    vi.mocked(apiClient.getGraphStatistics).mockResolvedValue(mockGraphStats);
    vi.mocked(apiClient.getEventStatistics).mockResolvedValue(mockEventStats);
    vi.mocked(apiClient.listEvents).mockResolvedValue(mockEvents);
    vi.mocked(apiClient.getSystemStateSummary).mockResolvedValue(mockStateSummary);
    vi.mocked(apiClient.getGraphStateHistory).mockResolvedValue(mockStateHistory);
    vi.mocked(apiClient.listHypotheses).mockResolvedValue(mockHypotheses);
    vi.mocked(apiClient.listCascadeForecasts).mockResolvedValue(mockForecasts);
    vi.mocked(apiClient.listSnapshots).mockResolvedValue(mockSnapshots);
    vi.mocked(apiClient.listBaselines).mockResolvedValue(mockBaselines);
  });

  it("renders page header, title, and integrity standards callout", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Platform Analytics & Operational Trends")).toBeInTheDocument();
    });

    expect(screen.getByText(/PHASE 1–6 PERSISTED INTELLIGENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/REAL DATA ONLY · HONEST UNKNOWNS/i)).toBeInTheDocument();
    expect(screen.getByText(/All figures are computed directly from persisted audit records/i)).toBeInTheDocument();
  });

  it("renders executive metric cards with explicit units and denominators", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("MEAN HEALTH")).toBeInTheDocument();
    });

    expect(screen.getByText("FILTERED EVENTS")).toBeInTheDocument();
    expect(screen.getByText("EVIDENCE COMPLETENESS")).toBeInTheDocument();
    expect(screen.getByText("CASCADE FORECAST RUNS")).toBeInTheDocument();
    expect(screen.getByText("STATE COMPLETENESS")).toBeInTheDocument();

    // Check denominators & unit labels
    expect(screen.getByText(/evaluated hypotheses/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 6 simulations \(hypothetical\)/i)).toBeInTheDocument();
  });

  it("switches time ranges when clicking filter buttons", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Platform Analytics & Operational Trends")).toBeInTheDocument();
    });

    const range1h = screen.getByRole("button", { name: "Last 1h" });
    const range6h = screen.getByRole("button", { name: "Last 6h" });
    const range24h = screen.getByRole("button", { name: "Last 24h" });
    const range7d = screen.getByRole("button", { name: "Last 7d" });
    const rangeAll = screen.getByRole("button", { name: "All Time" });

    expect(range1h).toBeInTheDocument();
    expect(range6h).toBeInTheDocument();
    expect(range24h).toBeInTheDocument();
    expect(range7d).toBeInTheDocument();
    expect(rangeAll).toBeInTheDocument();

    fireEvent.click(range24h);
    fireEvent.click(rangeAll);
  });

  it("displays health and state trends with SVG trajectory and state breakdown", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Operational State Breakdown")).toBeInTheDocument();
    });

    expect(screen.getByText("Historical Node Health Trajectory")).toBeInTheDocument();
    expect(screen.getAllByText("FAILED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DEGRADED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NORMAL").length).toBeGreaterThan(0);
  });

  it("displays incidents and events trends when selecting tab", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /⚡ Incidents & Events/i })).toBeInTheDocument();
    });

    const tabBtn = screen.getByRole("button", { name: /⚡ Incidents & Events/i });
    fireEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText("SUBSTATION_VOLTAGE_SPIKE")).toBeInTheDocument();
    });

    expect(screen.getByText("PUMP_FLOW_RESTRICTION")).toBeInTheDocument();
    expect(screen.getByText("Incident Severity Distribution")).toBeInTheDocument();
  });

  it("displays causal hypotheses and evidence completeness metrics", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /⊛ Causal Hypotheses & Evidence/i })).toBeInTheDocument();
    });

    const tabBtn = screen.getByRole("button", { name: /⊛ Causal Hypotheses & Evidence/i });
    fireEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText("Causal Inference Hypothesis Status")).toBeInTheDocument();
    });

    expect(screen.getByText("Identified Mechanism Types")).toBeInTheDocument();
    expect(screen.getByText("UPSTREAM_FAILURE")).toBeInTheDocument();
    expect(screen.getByText("TELEMETRY_ANOMALY")).toBeInTheDocument();
  });

  it("displays cascade forecasts with clear prospective separation notice", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /◎ Cascade Forecasts/i })).toBeInTheDocument();
    });

    const tabBtn = screen.getByRole("button", { name: /◎ Cascade Forecasts/i });
    fireEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText("PROSPECTIVE SIMULATION ESTIMATES (NOT OBSERVED REALITY)")).toBeInTheDocument();
    });

    expect(screen.getByText(/Phase 6 Cascade Forecast records reflect algorithmic downstream propagation models/i)).toBeInTheDocument();
    expect(screen.getByText("Recorded Cascade Forecast Runs")).toBeInTheDocument();
    expect(screen.getByText(/720 min/i)).toBeInTheDocument();
  });

  it("displays snapshots and baselines audit context", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /◈ Baselines & Snapshots/i })).toBeInTheDocument();
    });

    const tabBtn = screen.getByRole("button", { name: /◈ Baselines & Snapshots/i });
    fireEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText("Pre-Incident Baseline Snapshot")).toBeInTheDocument();
    });

    expect(screen.getByText("Certified Q4 Normal Baseline")).toBeInTheDocument();
  });

  it("provides operational cross-navigation shortcuts to sibling pages", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("PLATFORM NAVIGATION:")).toBeInTheDocument();
    });

    const stateBtn = screen.getByRole("button", { name: "⎈ Digital Twin" });
    const incidentsBtn = screen.getByRole("button", { name: "⚡ Incidents" });
    const causalBtn = screen.getByRole("button", { name: "⊛ Causal Engine" });
    const evidenceBtn = screen.getByRole("button", { name: "⊘ Evidence Audit" });
    const scenariosBtn = screen.getByRole("button", { name: "⊙ Scenarios" });
    const simulationBtn = screen.getByRole("button", { name: "◎ Cascade Simulation" });

    expect(stateBtn.closest("a")).toHaveAttribute("href", "/app/state");
    expect(incidentsBtn.closest("a")).toHaveAttribute("href", "/app/incidents");
    expect(causalBtn.closest("a")).toHaveAttribute("href", "/app/causal");
    expect(evidenceBtn.closest("a")).toHaveAttribute("href", "/app/evidence");
    expect(scenariosBtn.closest("a")).toHaveAttribute("href", "/app/scenarios");
    expect(simulationBtn.closest("a")).toHaveAttribute("href", "/app/simulation");
  });

  it("handles honest empty data states gracefully without inventing values", async () => {
    vi.mocked(apiClient.getGraphStateHistory).mockResolvedValue([]);
    vi.mocked(apiClient.listEvents).mockResolvedValue([]);
    vi.mocked(apiClient.listHypotheses).mockResolvedValue([]);
    vi.mocked(apiClient.listCascadeForecasts).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Platform Analytics & Operational Trends")).toBeInTheDocument();
    });

    // Check empty state fallback for trends
    expect(screen.getByText("No Historical State Records")).toBeInTheDocument();

    // Check empty tab for events
    const evTab = screen.getByRole("button", { name: /⚡ Incidents & Events/i });
    fireEvent.click(evTab);
    expect(screen.getByText("No events recorded in this time range.")).toBeInTheDocument();

    // Check empty tab for forecasts
    const fcTab = screen.getByRole("button", { name: /◎ Cascade Forecasts/i });
    fireEvent.click(fcTab);
    expect(screen.getByText("No cascade forecast runs recorded for this graph yet.")).toBeInTheDocument();
  });
});
