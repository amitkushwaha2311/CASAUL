/**
 * CAUSAL — Phase 7 Frontend Tests: Counterfactual Simulation Engine (/app/interventions)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import CounterfactualPage from "../app/app/interventions/page";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    listGraphs: vi.fn(),
    listNodes: vi.fn(),
    listDependencies: vi.fn(),
    listBaselines: vi.fn(),
    listSnapshots: vi.fn(),
    listCounterfactualExperiments: vi.fn(),
    getCounterfactualExperiment: vi.fn(),
    createCounterfactualExperiment: vi.fn(),
    runCounterfactualExperiment: vi.fn(),
    getCounterfactualResults: vi.fn(),
  },
}));

describe("Counterfactual Simulation Page (/app/interventions)", () => {
  const mockGraph = {
    id: "g-cf-1",
    name: "Metropolitan Power & Water Grid",
    description: "Phase 7 test infrastructure",
    domain: "infrastructure",
    version: 1,
    metadata: null,
    created_at: "2026-10-12T00:00:00Z",
    updated_at: "2026-10-12T00:00:00Z",
  };

  const mockNodes = [
    {
      id: "node-p1",
      graph_id: "g-cf-1",
      name: "Substation Alpha",
      type: "substation",
      state: "NORMAL",
      health: 1.0,
      capacity: 1.0,
      criticality: 0.9,
      location: "Sector 1",
    },
    {
      id: "node-w1",
      graph_id: "g-cf-1",
      name: "Aqueduct Pump 4",
      type: "pump",
      state: "NORMAL",
      health: 0.9,
      capacity: 0.85,
      criticality: 0.8,
      location: "Sector 2",
    },
    {
      id: "node-w2",
      graph_id: "g-cf-1",
      name: "Water Treatment Plant 2",
      type: "treatment_plant",
      state: "NORMAL",
      health: 0.95,
      capacity: 0.9,
      criticality: 0.85,
      location: "Sector 3",
    },
  ];

  const mockDependencies = [
    {
      id: "dep-1",
      graph_id: "g-cf-1",
      source_node_id: "node-p1",
      target_node_id: "node-w1",
      dependency_type: "power",
      strength: 0.9,
      required: true,
      failure_propagation: true,
      metadata_: { propagation_delay_seconds: 60 },
    },
    {
      id: "dep-2",
      graph_id: "g-cf-1",
      source_node_id: "node-w1",
      target_node_id: "node-w2",
      dependency_type: "fluid",
      strength: 0.85,
      required: true,
      failure_propagation: true,
      metadata_: { propagation_delay_seconds: 120 },
    },
  ];

  const mockBaselines = [
    {
      id: "bl-1",
      graph_id: "g-cf-1",
      name: "Nominal Grid Baseline",
      node_states: {},
      completeness_ratio: 1.0,
      created_at: "2026-10-12T00:00:00Z",
    },
  ];

  const mockExperiment = {
    id: "exp-1",
    graph_id: "g-cf-1",
    name: "Substation Tie Severance Counterfactual",
    description: "Evaluating backup microgrid isolation",
    status: "COMPLETED",
    baseline_id: "bl-1",
    snapshot_id: null,
    initiating_node_id: "node-p1",
    forecast_settings: {
      horizon_minutes: 60,
      max_depth: 5,
      seed: 42,
      simulation_mode: "DETERMINISTIC",
    },
    baseline_forecast_id: "fc-base-1",
    counterfactual_forecast_id: "fc-cf-1",
    changes: [
      {
        id: "ch-1",
        experiment_id: "exp-1",
        target_type: "DEPENDENCY",
        target_id: "dep-1",
        change_type: "DEPENDENCY_AVAILABILITY",
        proposed_value: false,
        rationale: "Emergency tie severed",
        created_at: "2026-10-12T10:00:00Z",
      },
    ],
    created_at: "2026-10-12T10:00:00Z",
  };

  const mockComparison = {
    experiment_id: "exp-1",
    nodes_affected_both: [
      {
        node_id: "node-p1",
        node_name: "Substation Alpha",
        criticality: 0.9,
        baseline_impact_level: "CRITICAL",
        counterfactual_impact_level: "CRITICAL",
        baseline_point_impact_seconds: 0,
        counterfactual_point_impact_seconds: 0,
        time_delta_seconds: 0,
      },
    ],
    nodes_affected_baseline_only: [
      {
        node_id: "node-w1",
        node_name: "Aqueduct Pump 4",
        criticality: 0.8,
        baseline_status: "PREDICTED_AFFECTED",
        baseline_impact_level: "HIGH",
        baseline_point_impact_seconds: 60,
        difference_category: "PREVENTED",
        explanation: "Failure propagation prevented in counterfactual branch.",
      },
      {
        node_id: "node-w2",
        node_name: "Water Treatment Plant 2",
        criticality: 0.85,
        baseline_status: "PREDICTED_AFFECTED",
        baseline_impact_level: "HIGH",
        baseline_point_impact_seconds: 180,
        difference_category: "PREVENTED",
        explanation: "Failure propagation prevented in counterfactual branch.",
      },
    ],
    nodes_affected_counterfactual_only: [],
    nodes_timing_differ: [],
    nodes_severity_differ: [],
    critical_nodes_summary: {
      baseline_critical_affected_count: 3,
      counterfactual_critical_affected_count: 1,
      critical_nodes_prevented: ["Aqueduct Pump 4", "Water Treatment Plant 2"],
      critical_nodes_newly_affected: [],
    },
    uncertainty_differences: {
      baseline_completeness_ratio: 1.0,
      calibration_status: "HEURISTIC_ESTIMATE",
      model_assumptions_hold_constant: true,
    },
    comparison_metrics: {
      baseline_blast_radius_count: 3,
      counterfactual_blast_radius_count: 1,
      blast_radius_reduction_count: 2,
      nodes_prevented_count: 2,
      nodes_newly_affected_count: 0,
      baseline_composite_impact_percent: 78.5,
      counterfactual_composite_impact_percent: 26.2,
      composite_impact_delta_percent: -52.3,
      baseline_critical_affected_count: 3,
      counterfactual_critical_affected_count: 1,
      baseline_max_depth: 2,
      counterfactual_max_depth: 0,
      horizon_minutes: 60,
    },
    warnings: [
      "Propagation probabilities are uncalibrated heuristics.",
    ],
    limitations: [
      "All hypothetical changes are isolated in memory and never applied to live hardware.",
    ],
  };

  const mockRunResult = {
    experiment: mockExperiment,
    baseline_forecast: {
      id: "fc-base-1",
      graph_id: "g-cf-1",
      predicted_nodes: [],
    },
    counterfactual_forecast: {
      id: "fc-cf-1",
      graph_id: "g-cf-1",
      predicted_nodes: [],
    },
    comparison: mockComparison,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(apiClient.listGraphs).mockResolvedValue([mockGraph]);
    vi.mocked(apiClient.listNodes).mockResolvedValue(mockNodes as any);
    vi.mocked(apiClient.listDependencies).mockResolvedValue(mockDependencies as any);
    vi.mocked(apiClient.listBaselines).mockResolvedValue(mockBaselines as any);
    vi.mocked(apiClient.listSnapshots).mockResolvedValue([]);
    vi.mocked(apiClient.listCounterfactualExperiments).mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          id: "exp-1",
          graph_id: "g-cf-1",
          name: "Substation Tie Severance Counterfactual",
          description: "Evaluating backup microgrid isolation",
          status: "COMPLETED",
          changes_count: 1,
          total_changes: 1,
          created_at: "2026-10-12T10:00:00Z",
          completed_at: "2026-10-12T10:00:05Z",
          summary: {
            comparison_metrics: mockComparison.comparison_metrics,
          },
        },
      ],
    } as any);
    vi.mocked(apiClient.getCounterfactualExperiment).mockResolvedValue(mockExperiment as any);
    vi.mocked(apiClient.getCounterfactualResults).mockResolvedValue(mockRunResult as any);
    vi.mocked(apiClient.createCounterfactualExperiment).mockResolvedValue(mockExperiment as any);
    vi.mocked(apiClient.runCounterfactualExperiment).mockResolvedValue(mockRunResult as any);
  });

  it("renders page header, Phase 7 badges, and isolation safety callout", async () => {
    render(<CounterfactualPage />);

    await waitFor(() => {
      expect(screen.getByText("Counterfactual Simulation")).toBeInTheDocument();
    });

    expect(screen.getByText("Phase 7 · What-If Engine")).toBeInTheDocument();
    expect(screen.getAllByText("◈ HYPOTHETICAL").length).toBeGreaterThan(0);
    expect(screen.getByText(/Isolated simulation — never modifies live infrastructure/i)).toBeInTheDocument();
  });

  it("switches to Run History tab and displays past experiment records", async () => {
    render(<CounterfactualPage />);

    await waitFor(() => {
      expect(screen.getByText("Counterfactual Simulation")).toBeInTheDocument();
    });

    const historyTab = screen.getByRole("button", { name: /Run History/i });
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText("Substation Tie Severance Counterfactual")).toBeInTheDocument();
    });

    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("1 intervention")).toBeInTheDocument();
  });

  it("stages hypothetical changes in the intervention builder", async () => {
    render(<CounterfactualPage />);

    await waitFor(() => {
      expect(screen.getByText("4 · Hypothetical Interventions")).toBeInTheDocument();
    });

    // Name the experiment
    const nameInput = screen.getByLabelText(/Experiment Name/i);
    fireEvent.change(nameInput, { target: { value: "Test Isolation Contingency" } });

    // Target node is already set to first node or select target
    const targetSelect = screen.getByLabelText(/Target Node/i);
    fireEvent.change(targetSelect, { target: { value: "node-p1" } });

    // Select state
    const stateSelect = screen.getByDisplayValue("— Select state —");
    fireEvent.change(stateSelect, { target: { value: "FAILED" } });

    // Enter rationale
    const rationaleInput = screen.getByPlaceholderText(/e.g. Backup generator engages on grid failure/i);
    fireEvent.change(rationaleInput, { target: { value: "Transformer overheating cascade test" } });

    // Click Add Intervention
    const addBtn = screen.getByRole("button", { name: /⊕ Add Intervention/i });
    expect(addBtn).not.toBeDisabled();
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText(/Transformer overheating cascade test/i)).toBeInTheDocument();
      expect(screen.getByText(/Staged interventions \(1\)/i)).toBeInTheDocument();
    });
  });

  it("triggers paired simulation execution and renders differential outcome comparison", async () => {
    render(<CounterfactualPage />);

    await waitFor(() => {
      expect(screen.getByText("4 · Hypothetical Interventions")).toBeInTheDocument();
    });

    // Enter experiment name
    const nameInput = screen.getByLabelText(/Experiment Name/i);
    fireEvent.change(nameInput, { target: { value: "Substation Tie Severance Counterfactual" } });

    // Select target & state
    const targetSelect = screen.getByLabelText(/Target Node/i);
    fireEvent.change(targetSelect, { target: { value: "node-p1" } });
    const stateSelect = screen.getByDisplayValue("— Select state —");
    fireEvent.change(stateSelect, { target: { value: "FAILED" } });

    // Stage the intervention
    const addBtn = screen.getByRole("button", { name: /⊕ Add Intervention/i });
    fireEvent.click(addBtn);

    // Click execute
    const runBtn = screen.getByRole("button", { name: /▶ Execute Counterfactual Simulation/i });
    expect(runBtn).not.toBeDisabled();
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(apiClient.createCounterfactualExperiment).toHaveBeenCalled();
      expect(apiClient.runCounterfactualExperiment).toHaveBeenCalled();
    });

    // Check that differential outcome comparison is shown
    await waitFor(() => {
      expect(screen.getByText(/Differential Outcome Metrics/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Blast Radius (Nodes)")).toBeInTheDocument();
    expect(screen.getByText("Critical Nodes Affected")).toBeInTheDocument();
    expect(screen.getByText("Composite Impact")).toBeInTheDocument();

    // Prevented nodes
    expect(screen.getByText("Aqueduct Pump 4")).toBeInTheDocument();
    expect(screen.getByText("Water Treatment Plant 2")).toBeInTheDocument();
    expect(screen.getAllByText("PREVENTED").length).toBeGreaterThan(0);
  });

  it("selects a completed experiment from history to load results", async () => {
    render(<CounterfactualPage />);

    await waitFor(() => {
      expect(screen.getByText("Counterfactual Simulation")).toBeInTheDocument();
    });

    const historyTab = screen.getByRole("button", { name: /Run History/i });
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText("Substation Tie Severance Counterfactual")).toBeInTheDocument();
    });

    const expCard = screen.getByText("Substation Tie Severance Counterfactual");
    fireEvent.click(expCard);

    await waitFor(() => {
      expect(apiClient.getCounterfactualResults).toHaveBeenCalledWith("g-cf-1", "exp-1");
    });

    await waitFor(() => {
      expect(screen.getByText(/Differential Outcome Metrics/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Aqueduct Pump 4")).toBeInTheDocument();
  });
});
