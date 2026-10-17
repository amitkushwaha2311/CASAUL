/**
 * CAUSAL — Frontend Tests: Unified Resilience Intelligence Workspace
 *
 * Phase 10 verification:
 *   - Safety boundary banner
 *   - Assessment selection & status badge
 *   - Overview stats & narrative
 *   - Evidence lineage & hypotheses rendering
 *   - Cascade forecast observed vs predicted distinction
 *   - Counterfactual branch differential outcomes
 *   - Safety constraints, rankings, and human decision attribution
 *   - Provenance, model versions, and disclosed limitations
 *   - Create assessment modal
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ResilienceAssessmentsPage from "../app/app/assessments/page";
import { apiClient } from "../lib/api-client";

// ── Mock API Client ──────────────────────────────────────────────────────────

vi.mock("../lib/api-client", () => ({
  apiClient: {
    listGraphs: vi.fn(),
    listAssessments: vi.fn(),
    getAssessment: vi.fn(),
    getAssessmentEvidence: vi.fn(),
    getAssessmentImpacts: vi.fn(),
    getAssessmentDecisions: vi.fn(),
    createAssessment: vi.fn(),
  },
}));

const MOCK_GRAPHS = [
  {
    id: "graph-1",
    name: "Metropolitan Power Grid",
    domain: "power",
    version: 1,
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
  },
];

const MOCK_ASSESSMENT_LIST = {
  items: [
    {
      id: "assess-1",
      graph_id: "graph-1",
      name: "Q4 Grid Cascade Assessment",
      description: "Primary grid stress assessment",
      status: "READY",
      created_by_email: "analyst@causal.local",
      assembled_at: "2026-10-15T00:10:00Z",
      created_at: "2026-10-15T00:10:00Z",
      has_causal: true,
      has_forecast: true,
      has_counterfactual: true,
      has_recommendation: true,
      warning_count: 0,
      missing_source_count: 0,
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
  has_next: false,
};

const MOCK_ASSESSMENT = {
  id: "assess-1",
  graph_id: "graph-1",
  name: "Q4 Grid Cascade Assessment",
  description: "Primary grid stress assessment",
  status: "READY",
  causal_run_id: "causal-1",
  forecast_run_id: "forecast-1",
  counterfactual_experiment_id: "cf-1",
  recommendation_run_id: "rec-1",
  graph_summary: {
    graph_id: "graph-1",
    graph_name: "Metropolitan Power Grid",
    node_count: 42,
    dependency_count: 88,
    active_event_count: 3,
    critical_event_count: 1,
    degraded_node_count: 4,
    critical_node_count: 2,
    failed_node_count: 1,
    data_available: true,
  },
  impact_summary: {
    hypotheses_total: 5,
    hypotheses_supported: 3,
    hypotheses_contradicted: 1,
    hypotheses_unresolved: 1,
    causal_available: true,
    forecast_horizon_minutes: 60,
    forecast_already_affected: 4,
    forecast_predicted_affected: 8,
    forecast_calibration_status: "HEURISTIC_ESTIMATE",
    forecast_available: true,
    counterfactual_available: true,
  },
  uncertainty_summary: {
    available: true,
    calibration_status: "HEURISTIC_ESTIMATE",
    label: "heuristic",
  },
  recommendation_summary: {
    run_id: "rec-1",
    run_name: "Primary Optimization",
    status: "COMPLETED",
    ranking_policy: "resilience_multi_objective_v1",
  },
  missing_sources: [],
  warnings: [],
  limitations: [
    "Resilience assessments represent simulation-only analytical evaluations.",
    "Forecast timings labeled as HEURISTIC_ESTIMATE are uncalibrated.",
  ],
  model_versions: {
    assessment: "1.0.0",
    causal: "0.5.0",
    forecast: "0.6.0",
  },
  created_by_email: "analyst@causal.local",
  created_by_id: "user-1",
  assembled_at: "2026-10-15T00:10:00Z",
  created_at: "2026-10-15T00:10:00Z",
};

const MOCK_EVIDENCE = {
  assessment_id: "assess-1",
  graph_id: "graph-1",
  causal_run_id: "causal-1",
  analyzed_at: "2026-10-15T00:05:00Z",
  rule_version: "1.0",
  total_hypotheses: 1,
  evidence_completeness_avg: 0.85,
  missing_evidence_summary: [],
  warnings: [],
  causal_available: true,
  hypotheses: [
    {
      hypothesis_id: "hyp-1",
      hypothesis_type: "UPSTREAM_DEGRADATION",
      status: "SUPPORTED",
      explanation: "Substation Alpha degraded causing downstream feeder voltage drop.",
      inference_rule: "causal_pathway_rule_v1",
      evidence_completeness_ratio: 0.85,
      supporting_count: 4,
      contradicting_count: 0,
      neutral_count: 1,
      missing_evidence: ["Feeder Beta Telemetry"],
      unresolved_assumptions: [],
      affected_node_id: "node-2",
      affected_node_name: "Feeder Beta",
      candidate_cause_node_id: "node-1",
      candidate_cause_node_name: "Substation Alpha",
    },
  ],
};

const MOCK_IMPACTS = {
  hypotheses_total: 5,
  hypotheses_supported: 3,
  hypotheses_contradicted: 1,
  hypotheses_unresolved: 1,
  causal_available: true,
  forecast_horizon_minutes: 60,
  forecast_already_affected: 4,
  forecast_predicted_affected: 8,
  forecast_critical_affected: 2,
  forecast_calibration_status: "HEURISTIC_ESTIMATE",
  forecast_available: true,
  counterfactual_available: true,
  counterfactual_summary: {
    prevented_node_count: 5,
    newly_introduced_node_count: 0,
    shared_affected_node_count: 3,
    timing_differences_count: 2,
    has_critical_prevention: true,
    warnings: [],
    limitations: [],
  },
  recommendation_available: true,
  recommendation_eligible_count: 4,
  recommendation_ineligible_count: 1,
  recommendation_approved_count: 1,
  recommendation_rejected_count: 0,
  recommendation_pending_count: 3,
  data_freshness_warning: false,
  missing_sources: [],
};

const MOCK_DECISIONS = {
  assessment_id: "assess-1",
  graph_id: "graph-1",
  recommendation_run_id: "rec-1",
  run_name: "Primary Optimization",
  run_status: "COMPLETED",
  total_candidates: 1,
  approved_count: 1,
  rejected_count: 0,
  pending_count: 0,
  recommendation_available: true,
  limitations: ["No automated actuation."],
  candidates: [
    {
      candidate_id: "cand-1",
      title: "Isolate Feeder Beta & Boost Transformer 4",
      intervention_type: "ISOLATION_AND_BOOST",
      safety_status: "PASS",
      eligibility_status: "ELIGIBLE",
      rank_position: 1,
      rank_score: 0.892,
      decision_status: "APPROVED",
      decided_by: "approver@causal.local",
      decided_at: "2026-10-15T00:15:00Z",
    },
  ],
};

// ── Test Suite ───────────────────────────────────────────────────────────────

describe("Unified Resilience Intelligence Workspace (/app/assessments)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.listGraphs as any).mockResolvedValue(MOCK_GRAPHS);
    (apiClient.listAssessments as any).mockResolvedValue(MOCK_ASSESSMENT_LIST);
    (apiClient.getAssessment as any).mockResolvedValue(MOCK_ASSESSMENT);
    (apiClient.getAssessmentEvidence as any).mockResolvedValue(MOCK_EVIDENCE);
    (apiClient.getAssessmentImpacts as any).mockResolvedValue(MOCK_IMPACTS);
    (apiClient.getAssessmentDecisions as any).mockResolvedValue(MOCK_DECISIONS);
  });

  it("renders page title, Phase 10 badge, and mandatory safety boundary banner", async () => {
    render(<ResilienceAssessmentsPage />);

    expect(await screen.findByTestId("page-title")).toBeInTheDocument();
    expect(screen.getByText("Unified Resilience Intelligence")).toBeInTheDocument();
    expect(screen.getByTestId("safety-boundary-banner")).toBeInTheDocument();
    expect(screen.getByText(/SIMULATION-ONLY WORKSPACE/i)).toBeInTheDocument();
  });

  it("renders assessment selector strip with status badge and metadata", async () => {
    render(<ResilienceAssessmentsPage />);

    expect(await screen.findByTestId("assessment-status-badge-ready")).toBeInTheDocument();
    expect(screen.getByText(/Assembled by:/i)).toBeInTheDocument();
    expect(screen.getByText("analyst@causal.local")).toBeInTheDocument();
  });

  it("displays overview metrics cards and summary narrative", async () => {
    render(<ResilienceAssessmentsPage />);

    expect(await screen.findByText("Topology Scope")).toBeInTheDocument();
    expect(screen.getByText("42 Nodes")).toBeInTheDocument();
    expect(screen.getByText("3 Active")).toBeInTheDocument();
    expect(screen.getByText("3 Supported")).toBeInTheDocument();
    expect(screen.getByText("8 Predicted")).toBeInTheDocument();
    expect(screen.getByText("1 Approved")).toBeInTheDocument();
  });

  it("switches to Evidence Lineage tab and renders causal hypotheses with completeness", async () => {
    render(<ResilienceAssessmentsPage />);

    const evidenceTab = await screen.findByTestId("tab-evidence");
    fireEvent.click(evidenceTab);

    expect(await screen.findByText("Forensic Evidence Lineage")).toBeInTheDocument();
    expect(screen.getByText(/Feeder Beta ← Substation Alpha/i)).toBeInTheDocument();
    expect(screen.getByText("SUPPORTED")).toBeInTheDocument();
    expect(screen.getByText(/4 Supporting/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing Telemetry/i)).toBeInTheDocument();
  });

  it("switches to Cascade Forecast tab and distinguishes observed from predicted nodes", async () => {
    render(<ResilienceAssessmentsPage />);

    const forecastTab = await screen.findByTestId("tab-forecast");
    fireEvent.click(forecastTab);

    expect(await screen.findByText("Cascade Propagation & Horizon")).toBeInTheDocument();
    expect(screen.getByTestId("observed-affected-count")).toHaveTextContent("4 Nodes");
    expect(screen.getByTestId("predicted-affected-count")).toHaveTextContent("8 Nodes");
    expect(screen.getByTestId("calibration-badge")).toHaveTextContent("HEURISTIC ESTIMATE");
  });

  it("switches to Counterfactual Branch tab and displays prevented vs new nodes", async () => {
    render(<ResilienceAssessmentsPage />);

    const cfTab = await screen.findByTestId("tab-counterfactual");
    fireEvent.click(cfTab);

    expect(await screen.findByText("Paired Counterfactual Evaluation")).toBeInTheDocument();
    expect(screen.getByTestId("prevented-node-count")).toHaveTextContent("5");
    expect(screen.getByTestId("newly-introduced-count")).toHaveTextContent("0");
    expect(screen.getByText(/Critical Tier Prevention Confirmed/i)).toBeInTheDocument();
  });

  it("switches to Recommendations tab and renders candidate rankings and decision attribution", async () => {
    render(<ResilienceAssessmentsPage />);

    const decTab = await screen.findByTestId("tab-decisions");
    fireEvent.click(decTab);

    expect(await screen.findByText("Safety-Constrained Candidate Interventions")).toBeInTheDocument();
    expect(screen.getByTestId("rank-position-badge")).toHaveTextContent("RANK #1");
    expect(screen.getByText("Isolate Feeder Beta & Boost Transformer 4")).toBeInTheDocument();
    expect(screen.getByText("Safety: PASS")).toBeInTheDocument();
    expect(screen.getByText("Decision: APPROVED")).toBeInTheDocument();
    expect(screen.getByText("approver@causal.local")).toBeInTheDocument();
  });

  it("switches to Provenance tab and displays model versions and explicit limitations", async () => {
    render(<ResilienceAssessmentsPage />);

    const provTab = await screen.findByTestId("tab-provenance");
    fireEvent.click(provTab);

    expect(await screen.findByText("Audit Provenance & Explicit Limitations")).toBeInTheDocument();
    expect(screen.getByText("Engine Model Versions")).toBeInTheDocument();
    expect(screen.getByText("1.0.0")).toBeInTheDocument();
    expect(screen.getByText(/Resilience assessments represent simulation-only analytical evaluations/i)).toBeInTheDocument();
  });

  it("opens create modal and submits new resilience assessment request", async () => {
    (apiClient.createAssessment as any).mockResolvedValue({
      id: "assess-2",
      name: "New Emergency Assessment",
      status: "READY",
      created_at: "2026-10-15T00:20:00Z",
    });

    render(<ResilienceAssessmentsPage />);

    const newBtn = await screen.findByTestId("new-assessment-button");
    fireEvent.click(newBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Assemble Resilience Assessment")).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Assessment Name \*/i);
    fireEvent.change(nameInput, { target: { value: "New Emergency Assessment" } });

    const submitBtn = screen.getByText("Assemble Assessment");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.createAssessment).toHaveBeenCalledWith(
        "graph-1",
        expect.objectContaining({ name: "New Emergency Assessment" })
      );
    });
  });

  it("renders UNAVAILABLE instead of zero metrics when source data is missing", async () => {
    (apiClient.getAssessmentImpacts as any).mockResolvedValue({
      causal_available: false,
      forecast_available: false,
      counterfactual_available: false,
      recommendation_available: false,
      hypotheses_total: null,
      forecast_predicted_affected: null,
      missing_sources: [],
      data_freshness_warning: false,
    });
    (apiClient.getAssessmentDecisions as any).mockResolvedValue({
      assessment_id: "assess-1",
      graph_id: "graph-1",
      total_candidates: 0,
      approved_count: 0,
      rejected_count: 0,
      pending_count: 0,
      recommendation_available: false,
      candidates: [],
      limitations: [],
    });

    render(<ResilienceAssessmentsPage />);

    expect(await screen.findByText("Topology Scope")).toBeInTheDocument();
    // In overview, causal, forecast, and decisions cards should display UNAVAILABLE, not "0 Supported" or "0 Predicted"
    const unavails = screen.getAllByText("UNAVAILABLE");
    expect(unavails.length).toBeGreaterThanOrEqual(3);
  });

  it("renders missing sources callout in provenance panel without leaking foreign graph data", async () => {
    (apiClient.getAssessment as any).mockResolvedValue({
      ...MOCK_ASSESSMENT,
      status: "PARTIAL",
      missing_sources: ["causal_run:foreign-uuid-1", "forecast_run:foreign-uuid-2"],
      warnings: ["Causal run foreign-uuid-1 belongs to a different graph; excluded."],
    });

    render(<ResilienceAssessmentsPage />);

    const provTab = await screen.findByTestId("tab-provenance");
    fireEvent.click(provTab);

    expect(await screen.findByText("Missing or Incompatible Sources:")).toBeInTheDocument();
    expect(screen.getByText("causal_run:foreign-uuid-1")).toBeInTheDocument();
    expect(screen.getByText("forecast_run:foreign-uuid-2")).toBeInTheDocument();
  });
});
