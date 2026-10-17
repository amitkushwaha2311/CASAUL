/**
 * CAUSAL — Phase 4 Frontend Tests: Scenarios & State Exploration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ScenariosPage from "../app/app/scenarios/page";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    listGraphs: vi.fn(),
    listScenarios: vi.fn(),
    getScenario: vi.fn(),
    createScenario: vi.fn(),
    listSnapshots: vi.fn(),
    getSnapshot: vi.fn(),
    listBaselines: vi.fn(),
    getBaseline: vi.fn(),
    getGraphState: vi.fn(),
    compareBaselineVsCurrent: vi.fn(),
    compareSnapshots: vi.fn(),
  },
}));

describe("Scenarios & State Exploration Page (/app/scenarios)", () => {
  const mockGraph = {
    id: "g-1",
    name: "Regional Power & Water Grid",
    description: "Multi-utility urban infrastructure",
    domain: "infrastructure",
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
      state: "NORMAL",
      health: 0.9,
      capacity: 0.85,
      availability: 0.9,
      criticality: 0.6,
      last_observed_at: "2026-10-11T10:05:00Z",
      last_state_change_at: "2026-10-11T10:05:00Z",
      confidence: 0.85,
      source: "flow_meter",
      consistency_status: "VALID" as const,
      is_known: true,
      provenance: {
        source: "flow_meter",
        source_type: "observation" as const,
        observed_at: "2026-10-11T10:05:00Z",
      },
    },
  ];

  const mockScenarios = [
    {
      id: "sc-1",
      graph_id: "g-1",
      name: "Storm Disruption Scenario",
      description: "Simulate what if Substation Alpha trips during high winds",
      base_snapshot_id: "sn-1",
      base_baseline_id: null,
      state_overrides: {
        "n-1": { state: "FAILED", health: 0.0, capacity: 0.0, availability: 0.0 },
      },
      metadata: { created_via: "web_scenarios_ui" },
      created_at: "2026-10-11T12:00:00Z",
      updated_at: "2026-10-11T12:00:00Z",
    },
  ];

  const mockSnapshots = [
    {
      id: "sn-1",
      graph_id: "g-1",
      name: "Pre-Storm System Snapshot",
      snapshot_type: "LIVE",
      captured_at: "2026-10-11T11:00:00Z",
      effective_at: "2026-10-11T11:00:00Z",
      completeness_ratio: 1.0,
      node_count: 2,
      node_states: {},
      summary: null,
      metadata: null,
      created_at: "2026-10-11T11:00:00Z",
    },
  ];

  const mockBaselines = [
    {
      id: "bl-1",
      graph_id: "g-1",
      name: "Production Baseline Q4",
      description: "Nominal grid operations baseline",
      is_active: true,
      captured_at: "2026-10-10T00:00:00Z",
      completeness_ratio: 1.0,
      node_count: 2,
      node_states: {},
      metadata: null,
      created_at: "2026-10-10T00:00:00Z",
    },
  ];

  const mockComparison = {
    graph_id: "g-1",
    comparison_type: "BASELINE_VS_CURRENT" as const,
    source_a_label: "Baseline: Production Baseline Q4",
    source_b_label: "Current Operational State",
    source_a_timestamp: "2026-10-10T00:00:00Z",
    source_b_timestamp: "2026-10-11T12:00:00Z",
    total_nodes_compared: 2,
    changed_nodes_count: 1,
    unchanged_nodes_count: 1,
    completeness_limitations: null,
    node_comparisons: [
      {
        node_id: "n-1",
        node_name: "Substation Alpha",
        is_changed: true,
        diffs: [
          {
            node_id: "n-1",
            node_name: "Substation Alpha",
            field_name: "health",
            previous_value: 1.0,
            current_value: 0.95,
            change_type: "MODIFIED" as const,
          },
        ],
      },
      {
        node_id: "n-2",
        node_name: "Water Treatment Pump 3",
        is_changed: false,
        diffs: [],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.listGraphs).mockResolvedValue([mockGraph]);
    vi.mocked(apiClient.listScenarios).mockResolvedValue(mockScenarios);
    vi.mocked(apiClient.listSnapshots).mockResolvedValue(mockSnapshots);
    vi.mocked(apiClient.listBaselines).mockResolvedValue(mockBaselines);
    vi.mocked(apiClient.getGraphState).mockResolvedValue({
      graph_id: "g-1",
      graph_name: mockGraph.name,
      as_of: "2026-10-11T12:00:00Z",
      total_nodes: 2,
      nodes: mockNodes,
      completeness_ratio: 1.0,
      consistency_status: "VALID",
    });
    vi.mocked(apiClient.compareBaselineVsCurrent).mockResolvedValue(mockComparison);
    vi.mocked(apiClient.compareSnapshots).mockResolvedValue(mockComparison);
  });

  it("renders page header, stats bar, and the mandatory Scenario Exploration Advisory banner", async () => {
    render(<ScenariosPage />);

    await waitFor(() => {
      // Header and title
      expect(screen.getByText("Scenario & State Exploration")).toBeDefined();
      expect(screen.getByText("PHASE 4 · DIGITAL TWIN SANDBOX")).toBeDefined();

      // Advisory notice
      expect(screen.getByRole("alert", { name: "Scenario Exploration Advisory" })).toBeDefined();
      expect(
        screen.getByText(/Scenario exploration isolates hypothetical state overrides and snapshot comparisons for exploration/i)
      ).toBeDefined();

      // Stats
      expect(screen.getByText("SCENARIOS DEFINED")).toBeDefined();
      expect(screen.getByText("CAPTURED SNAPSHOTS")).toBeDefined();
      expect(screen.getByText("SAVED BASELINES")).toBeDefined();
    });
  });

  it("renders scenario list and displays isolated overrides side-by-side with live operational state", async () => {
    render(<ScenariosPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Storm Disruption Scenario").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("1 override")).toBeDefined();
      expect(screen.getByText("HYPOTHETICAL OVERRIDE")).toBeDefined();
      expect(screen.getByText("LIVE OPERATIONAL STATE")).toBeDefined();
      expect(screen.getByText("UNTOUCHED")).toBeDefined();
      expect(screen.getByText("ISOLATED")).toBeDefined();
      expect(screen.getByText("Substation Alpha")).toBeDefined();
      expect(screen.getByText("scada_sensor")).toBeDefined();
    });
  });

  it("opens create scenario modal and submits new scenario with isolated overrides", async () => {
    const createdScenario = {
      id: "sc-2",
      graph_id: "g-1",
      name: "Water Pump Outage",
      description: "Test hypothetical pump trip",
      base_snapshot_id: null,
      base_baseline_id: null,
      state_overrides: {
        "n-2": { state: "FAILED", health: 0.0, capacity: 0.0, availability: 0.0 },
      },
      metadata: { created_via: "web_scenarios_ui", override_count: 1 },
      created_at: "2026-10-11T13:00:00Z",
      updated_at: "2026-10-11T13:00:00Z",
    };
    vi.mocked(apiClient.createScenario).mockResolvedValue(createdScenario);

    render(<ScenariosPage />);

    await waitFor(() => {
      expect(screen.getByText("+ New Scenario")).toBeDefined();
    });

    // Open modal
    fireEvent.click(screen.getByText("+ New Scenario"));

    await waitFor(() => {
      expect(screen.getByLabelText(/Create New Scenario/i)).toBeDefined();
      expect(screen.getByLabelText(/Scenario Name/i)).toBeDefined();
    });

    // Fill form
    fireEvent.change(screen.getByLabelText(/Scenario Name/i), {
      target: { value: "Water Pump Outage" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Test hypothetical pump trip" },
    });

    // Add node override
    fireEvent.click(screen.getByText("+ Add Node Override"));

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "Create Scenario" }));

    await waitFor(() => {
      expect(apiClient.createScenario).toHaveBeenCalledWith("g-1", expect.objectContaining({
        name: "Water Pump Outage",
        description: "Test hypothetical pump trip",
      }));
    });
  });

  it("switches to State Comparison tab and executes comparison diffs", async () => {
    render(<ScenariosPage />);

    await waitFor(() => {
      expect(screen.getByText("⇄ State Comparison")).toBeDefined();
    });

    // Switch tab
    fireEvent.click(screen.getByText("⇄ State Comparison"));

    await waitFor(() => {
      expect(screen.getByText("System State Comparison Engine")).toBeDefined();
      expect(screen.getByText("Run State Comparison")).toBeDefined();
    });

    // Run comparison
    fireEvent.click(screen.getByText("Run State Comparison"));

    await waitFor(() => {
      expect(apiClient.compareBaselineVsCurrent).toHaveBeenCalledWith("g-1", "bl-1");
      expect(screen.getByText("TOTAL COMPARED")).toBeDefined();
      expect(screen.getByText("CHANGED")).toBeDefined();
      expect(screen.getByText("MODIFIED (1 fields)")).toBeDefined();
      expect(screen.getByText("health")).toBeDefined();
    });
  });

  it("switches to Snapshots & Baselines tab and views captured state items", async () => {
    render(<ScenariosPage />);

    await waitFor(() => {
      expect(screen.getByText("⎈ Snapshots & Baselines")).toBeDefined();
    });

    // Switch tab
    fireEvent.click(screen.getByText("⎈ Snapshots & Baselines"));

    await waitFor(() => {
      expect(screen.getByText("Pre-Storm System Snapshot")).toBeDefined();
      expect(screen.getByText("LIVE")).toBeDefined();
      expect(screen.getByText("Recorded Baselines (1)")).toBeDefined();
    });

    // Switch subtab to baselines
    fireEvent.click(screen.getByText("Recorded Baselines (1)"));

    await waitFor(() => {
      expect(screen.getByText("Production Baseline Q4")).toBeDefined();
      expect(screen.getByText("ACTIVE BASELINE")).toBeDefined();
    });
  });
});
