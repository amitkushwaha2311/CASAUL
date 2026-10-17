/**
 * CAUSAL — Phase 6 Frontend Tests: Cascade Simulation & Prediction Engine
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SimulationPage from "../app/app/simulation/page";
import { apiClient } from "@/lib/api-client";
import type {
  CascadeForecastResponse,
  CascadeTimelineResponse,
} from "@causal/shared/src/index";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    listGraphs: vi.fn(),
    listNodes: vi.fn(),
    listCascadeForecasts: vi.fn(),
    getCascadeForecast: vi.fn(),
    getCascadeForecastTimeline: vi.fn(),
    runCascadeForecast: vi.fn(),
  },
}));

describe("Cascade Simulation Page (/app/simulation)", () => {
  const mockGraph = {
    id: "g-001",
    name: "Regional Transmission Grid",
    domain: "power",
    description: "Grid backbone",
    version: 1,
    metadata: null,
    created_at: "2026-10-11T00:00:00Z",
    updated_at: "2026-10-11T00:00:00Z",
  };

  const mockNodes = [
    {
      id: "n-1",
      graph_id: "g-001",
      name: "Generator Alpha",
      type: "generator",
      description: null,
      location: null,
      state: "failed" as const,
      health: 0.0,
      capacity: 1.0,
      criticality: 0.9,
      metadata: null,
      created_at: "2026-10-11T00:00:00Z",
      updated_at: "2026-10-11T00:00:00Z",
    },
    {
      id: "n-2",
      graph_id: "g-001",
      name: "Substation Bravo",
      type: "substation",
      description: null,
      location: null,
      state: "normal" as const,
      health: 1.0,
      capacity: 1.0,
      criticality: 0.75,
      metadata: null,
      created_at: "2026-10-11T00:00:00Z",
      updated_at: "2026-10-11T00:00:00Z",
    },
  ];

  const mockForecast: CascadeForecastResponse = {
    id: "fc-001",
    graph_id: "g-001",
    initiating_node_id: "n-1",
    rule_version: "1.0.0",
    simulation_mode: "DETERMINISTIC",
    calibration_status: "HEURISTIC_ESTIMATE",
    horizon_minutes: 60,
    max_depth: 5,
    seed: 42,
    source_state_timestamp: "2026-10-11T12:00:00Z",
    total_already_affected: 1,
    total_predicted_affected: 1,
    total_critical_affected: 2,
    max_depth_reached: 1,
    impact_summary: {
      total_nodes: 2,
      total_already_affected: 1,
      total_predicted_affected: 1,
      total_unaffected: 0,
      total_critical_affected: 2,
      max_depth_reached: 1,
      impact_by_severity: { CRITICAL: 2, HIGH: 0, MEDIUM: 0, LOW: 0 },
      impact_by_domain: { generator: 1, substation: 1 },
      critical_nodes_at_risk: [
        {
          node_id: "n-2",
          name: "Substation Bravo",
          criticality: 0.75,
          status: "PREDICTED_AFFECTED",
          impact_level: "CRITICAL",
          time_to_impact_seconds: 120,
        },
      ],
      composite_criticality_impact_percent: 100.0,
      composite_metric_explanation: "Criticality-weighted ratio.",
      assumptions: [
        "Dependency direction: target depends on source.",
        "Delays derived from heuristic defaults.",
      ],
      warnings: [],
      limitations: ["Advisory simulation only."],
    },
    predicted_nodes: [
      {
        node_id: "n-1",
        node_name: "Generator Alpha",
        node_type: "generator",
        criticality: 0.9,
        forecast_status: "ALREADY_AFFECTED",
        current_state: "FAILED",
        predicted_state: "FAILED",
        predicted_impact_level: "CRITICAL",
        earliest_impact_seconds: 0,
        latest_impact_seconds: 0,
        time_to_impact_range: null,
        propagation_probability_min: 1.0,
        propagation_probability_max: 1.0,
        propagation_probability_point: 1.0,
        calibration_status: "HEURISTIC_ESTIMATE",
        depth: 0,
        path_summary: ["n-1"],
        contributing_causes: [],
        assumptions: ["Initial disturbance node."],
        limitations: [],
      },
      {
        node_id: "n-2",
        node_name: "Substation Bravo",
        node_type: "substation",
        criticality: 0.75,
        forecast_status: "PREDICTED_AFFECTED",
        current_state: "NORMAL",
        predicted_state: "CRITICAL",
        predicted_impact_level: "CRITICAL",
        earliest_impact_seconds: 90,
        latest_impact_seconds: 180,
        time_to_impact_range: {
          min_seconds: 90,
          max_seconds: 180,
          point_estimate_seconds: 120,
          assumption: "Default delay",
          delay_source: "HEURISTIC_DEFAULT",
        },
        propagation_probability_min: 0.7,
        propagation_probability_max: 0.95,
        propagation_probability_point: 0.85,
        calibration_status: "HEURISTIC_ESTIMATE",
        depth: 1,
        path_summary: ["n-1", "n-2"],
        contributing_causes: ["n-1"],
        assumptions: ["Required dependency coupling."],
        limitations: ["Heuristic propagation."],
      },
    ],
    propagation_paths: [
      {
        id: "path-1",
        source_node_id: "n-1",
        source_node_name: "Generator Alpha",
        target_node_id: "n-2",
        target_node_name: "Substation Bravo",
        dependency_id: "dep-1",
        hop_number: 1,
        estimated_delay_seconds: 120,
        delay_source: "HEURISTIC_DEFAULT",
        attenuation_factor: 1.0,
        propagation_rationale: "Required electrical dependency.",
      },
    ],
    created_at: "2026-10-11T12:05:00Z",
  };

  const mockTimeline: CascadeTimelineResponse = {
    forecast_id: "fc-001",
    graph_id: "g-001",
    horizon_minutes: 60,
    events: [
      {
        timestamp_offset_seconds: 0,
        estimated_time: null,
        node_id: "n-1",
        node_name: "Generator Alpha",
        event_type: "INITIAL_DISTURBANCE",
        forecast_status: "ALREADY_AFFECTED",
        predicted_state: "FAILED",
        impact_level: "CRITICAL",
        depth: 0,
        propagation_probability_point: 1.0,
        explanation: "Initial disturbance point.",
      },
      {
        timestamp_offset_seconds: 120,
        estimated_time: null,
        node_id: "n-2",
        node_name: "Substation Bravo",
        event_type: "CASCADE_PROPAGATION",
        forecast_status: "PREDICTED_AFFECTED",
        predicted_state: "CRITICAL",
        impact_level: "CRITICAL",
        depth: 1,
        propagation_probability_point: 0.85,
        explanation: "Projected impact on Substation Bravo via dependencies.",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.listGraphs).mockResolvedValue([mockGraph]);
    vi.mocked(apiClient.listNodes).mockResolvedValue(mockNodes);
    vi.mocked(apiClient.listCascadeForecasts).mockResolvedValue({
      items: [
        {
          id: "fc-001",
          graph_id: "g-001",
          initiating_node_id: "n-1",
          rule_version: "1.0.0",
          simulation_mode: "DETERMINISTIC",
          calibration_status: "HEURISTIC_ESTIMATE",
          horizon_minutes: 60,
          total_already_affected: 1,
          total_predicted_affected: 1,
          total_critical_affected: 2,
          max_depth_reached: 1,
          created_at: "2026-10-11T12:05:00Z",
        },
      ],
      total: 1,
      page: 1,
      page_size: 10,
    });
    vi.mocked(apiClient.getCascadeForecast).mockResolvedValue(mockForecast);
    vi.mocked(apiClient.getCascadeForecastTimeline).mockResolvedValue(mockTimeline);
    vi.mocked(apiClient.runCascadeForecast).mockResolvedValue(mockForecast);
  });

  it("renders page title, controls, and advisory warning banner", async () => {
    render(<SimulationPage />);

    await waitFor(() => {
      expect(screen.getByText("Cascade Prediction Engine")).toBeInTheDocument();
      expect(screen.getByText("Phase 6 · Forecast Model")).toBeInTheDocument();
      expect(
        screen.getByText(/Advisory only — Dependency paths do not establish guaranteed failure/i)
      ).toBeInTheDocument();
      expect(screen.getByText("Target Infrastructure Graph")).toBeInTheDocument();
      expect(screen.getByText("⚡ Run Cascade Forecast")).toBeInTheDocument();
    });
  });

  it("renders observed versus predicted distinction in the nodes table", async () => {
    render(<SimulationPage />);

    await waitFor(() => {
      expect(screen.getByText("Observed State")).toBeInTheDocument();
      expect(screen.getByText("Forecast Impact")).toBeInTheDocument();
      expect(screen.getByText("Generator Alpha")).toBeInTheDocument();
      expect(screen.getByText("Substation Bravo")).toBeInTheDocument();
    });
  });

  it("renders timeline events and switches tabs", async () => {
    render(<SimulationPage />);

    await waitFor(() => {
      expect(screen.getByText("Cascade Timeline")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Cascade Timeline"));

    await waitFor(() => {
      expect(screen.getByText("T = 0s")).toBeInTheDocument();
      expect(screen.getByText("+2 min")).toBeInTheDocument();
      expect(screen.getByText("CASCADE_PROPAGATION")).toBeInTheDocument();
    });
  });

  it("renders explicit assumptions and calibration metadata", async () => {
    render(<SimulationPage />);

    await waitFor(() => {
      expect(screen.getByText("Model Assumptions & Audit")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Model Assumptions & Audit"));

    await waitFor(() => {
      expect(
        screen.getByText(/Dependency direction: target depends on source/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Advisory simulation only/i)).toBeInTheDocument();
    });
  });

  it("executes new cascade forecast on button click", async () => {
    render(<SimulationPage />);

    await waitFor(() => {
      expect(screen.getByText("⚡ Run Cascade Forecast")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("⚡ Run Cascade Forecast"));

    await waitFor(() => {
      expect(apiClient.runCascadeForecast).toHaveBeenCalledWith("g-001", expect.objectContaining({
        horizon_minutes: 60,
        max_depth: 5,
        simulation_mode: "DETERMINISTIC",
      }));
    });
  });

  it("handles empty state when no graphs exist", async () => {
    vi.mocked(apiClient.listGraphs).mockResolvedValue([]);

    render(<SimulationPage />);

    await waitFor(() => {
      expect(screen.getByText("No Infrastructure Graphs Available")).toBeInTheDocument();
    });
  });
});
