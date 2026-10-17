/**
 * CAUSAL — Phase 8 Frontend Tests: Recommendation Engine (/app/recommendations)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import RecommendationsPage from "../app/app/recommendations/page";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    listGraphs: vi.fn(),
    listNodes: vi.fn(),
    listBaselines: vi.fn(),
    listSnapshots: vi.fn(),
    listRecommendationRuns: vi.fn(),
    getRecommendationRun: vi.fn(),
    createRecommendationRun: vi.fn(),
    executeRecommendationRun: vi.fn(),
    recordCandidateDecision: vi.fn(),
  },
}));

describe("Recommendations Page (/app/recommendations)", () => {
  const mockGraph = {
    id: "g-rec-1",
    name: "Metropolitan Resilience Grid",
    description: "Phase 8 optimization target",
    domain: "infrastructure",
    version: 1,
    metadata: null,
    created_at: "2026-10-13T00:00:00Z",
    updated_at: "2026-10-13T00:00:00Z",
  };

  const mockNodes = [
    {
      id: "node-1",
      graph_id: "g-rec-1",
      name: "Substation Alpha",
      type: "substation",
      state: "DEGRADED",
      health: 0.4,
      capacity: 0.6,
      criticality: 0.9,
    },
    {
      id: "node-2",
      graph_id: "g-rec-1",
      name: "Water Pump 4",
      type: "pump",
      state: "NORMAL",
      health: 0.95,
      capacity: 1.0,
      criticality: 0.7,
    },
  ];

  const mockCandidates = [
    {
      id: "cand-1",
      run_id: "run-1",
      title: "Boost Health for Substation Alpha",
      description: "Restores degraded substation health above operating threshold",
      intervention_type: "HEALTH_OVERRIDE",
      changes: [
        {
          change_type: "HEALTH_OVERRIDE",
          target_type: "NODE",
          target_id: "node-1",
          proposed_value: 0.9,
          rationale: "Restore degraded node",
        },
      ],
      counterfactual_experiment_id: "cf-exp-101",
      safety_status: "SAFE",
      eligibility_status: "ELIGIBLE",
      rank_score: 0.785,
      rank_position: 1,
      ranking_breakdown: {
        prevention_score: 0.85,
        blast_radius_delta_nodes: 3,
        new_impact_penalty: 0.0,
      },
      decision_status: "PENDING",
      decision_notes: null,
      decided_at: null,
      decided_by: null,
      safety_evaluations: [
        {
          id: "eval-1",
          candidate_id: "cand-1",
          constraint_name: "Protected Node Health Floor",
          constraint_type: "PROTECTED_NODE_HEALTH",
          status: "PASSED",
          rationale: "Health 0.90 exceeds minimum floor 0.20",
          supporting_evidence: [],
          created_at: "2026-10-13T10:00:00Z",
        },
        {
          id: "eval-2",
          candidate_id: "cand-1",
          constraint_name: "Bounded Parameter Range",
          constraint_type: "BOUNDED_VALUE_RANGE",
          status: "PASSED",
          rationale: "Value 0.90 is strictly within [0.0, 1.0]",
          supporting_evidence: [],
          created_at: "2026-10-13T10:00:00Z",
        },
      ],
      created_at: "2026-10-13T10:00:00Z",
      updated_at: "2026-10-13T10:00:00Z",
    },
    {
      id: "cand-2",
      run_id: "run-1",
      title: "Sever Critical Power Feed",
      description: "Unsafe severance of required tie without upstream failure",
      intervention_type: "DEPENDENCY_AVAILABILITY",
      changes: [
        {
          change_type: "DEPENDENCY_AVAILABILITY",
          target_type: "DEPENDENCY",
          target_id: "dep-1",
          proposed_value: false,
          rationale: "Aggressive isolation",
        },
      ],
      counterfactual_experiment_id: null,
      safety_status: "UNSAFE",
      eligibility_status: "INELIGIBLE",
      rank_score: null,
      rank_position: null,
      ranking_breakdown: {},
      decision_status: "PENDING",
      decision_notes: null,
      decided_at: null,
      decided_by: null,
      safety_evaluations: [
        {
          id: "eval-3",
          candidate_id: "cand-2",
          constraint_name: "Severance Criticality Guard",
          constraint_type: "SEVERANCE_CRITICALITY_GUARD",
          status: "FAILED",
          rationale: "Cannot sever required dependency when source node is NORMAL",
          supporting_evidence: [],
          created_at: "2026-10-13T10:00:00Z",
        },
      ],
      created_at: "2026-10-13T10:00:00Z",
      updated_at: "2026-10-13T10:00:00Z",
    },
  ];

  const mockRun = {
    id: "run-1",
    graph_id: "g-rec-1",
    name: "Substation Cascade Mitigation Run",
    description: "Evaluates resilience candidates",
    baseline_id: null,
    snapshot_id: null,
    status: "COMPLETED",
    generation_settings: { max_candidates: 10, horizon_minutes: 60 },
    ranking_policy: { prevention_weight: 0.5, reduction_weight: 0.3 },
    summary: {
      total_candidates: 2,
      eligible_candidates: 1,
      ineligible_candidates: 1,
      indeterminate_candidates: 0,
      ranked_candidates: 1,
      top_rank_score: 0.785,
      disclaimer: "Interventions are simulation models only.",
    },
    limitations: ["Deterministic heuristical model only."],
    execution_error: null,
    completed_at: "2026-10-13T10:05:00Z",
    candidates: mockCandidates,
    created_at: "2026-10-13T10:00:00Z",
    updated_at: "2026-10-13T10:05:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(apiClient.listGraphs).mockResolvedValue([mockGraph]);
    vi.mocked(apiClient.listNodes).mockResolvedValue(mockNodes as any);
    vi.mocked(apiClient.listBaselines).mockResolvedValue([]);
    vi.mocked(apiClient.listSnapshots).mockResolvedValue([]);
    vi.mocked(apiClient.listRecommendationRuns).mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          id: "run-1",
          graph_id: "g-rec-1",
          name: "Substation Cascade Mitigation Run",
          status: "COMPLETED",
          summary: mockRun.summary,
          created_at: "2026-10-13T10:00:00Z",
          completed_at: "2026-10-13T10:05:00Z",
        },
      ],
    } as any);
    vi.mocked(apiClient.getRecommendationRun).mockResolvedValue(mockRun as any);
  });

  it("renders page title, safety boundary banner, and graph selector", async () => {
    render(<RecommendationsPage />);

    expect(screen.getByText("Loading resilience recommendation workspace...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Intervention Recommendation Engine")).toBeInTheDocument();
      expect(screen.getByText("SAFETY BOUNDARY & HUMAN REVIEW GATE")).toBeInTheDocument();
      expect(screen.getByText("SIMULATION ONLY")).toBeInTheDocument();
    });
  });

  it("renders candidate list with eligibility, safety, and rank positions", async () => {
    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Boost Health for Substation Alpha")).toBeInTheDocument();
      expect(screen.getByText("Sever Critical Power Feed")).toBeInTheDocument();
    });

    // Check badges
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getAllByTestId("eligibility-badge-eligible").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("eligibility-badge-ineligible").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("safety-badge-safe").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("safety-badge-unsafe").length).toBeGreaterThan(0);
  });

  it("displays safety constraint evaluations and blocker rationale", async () => {
    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Protected Node Health Floor")).toBeInTheDocument();
      expect(screen.getByText("Health 0.90 exceeds minimum floor 0.20")).toBeInTheDocument();
    });

    // Click on the ineligible candidate
    const cand2Card = screen.getByTestId("candidate-card-cand-2");
    fireEvent.click(cand2Card);

    await waitFor(() => {
      expect(screen.getByText("Severance Criticality Guard")).toBeInTheDocument();
      expect(screen.getByText("Cannot sever required dependency when source node is NORMAL")).toBeInTheDocument();
    });
  });

  it("displays transparent ranking breakdown and counterfactual link", async () => {
    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByText("PREVENTION SCORE")).toBeInTheDocument();
      expect(screen.getByText("0.850")).toBeInTheDocument();
      expect(screen.getByText("BLAST RADIUS REDUCTION")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("View Simulation Differential →")).toBeInTheDocument();
    });
  });

  it("opens decision modal, submits human approval, and updates status", async () => {
    const updatedCandidate = {
      ...mockCandidates[0],
      decision_status: "APPROVED",
      decided_at: "2026-10-13T10:15:00Z",
      decided_by: "Lead Reliability Engineer",
      decision_notes: "Safe for maintenance window simulation",
    };

    vi.mocked(apiClient.recordCandidateDecision).mockResolvedValue(updatedCandidate as any);

    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Boost Health for Substation Alpha")).toBeInTheDocument();
    });

    // Open decision modal
    const reviewBtn = screen.getByRole("button", { name: /Review \/ Decision/i });
    fireEvent.click(reviewBtn);

    expect(screen.getByRole("heading", { name: /Record Human Review Decision/i })).toBeInTheDocument();
    expect(screen.getByText(/Audit Boundary Note/i)).toBeInTheDocument();

    // Confirm approval
    const confirmBtn = screen.getByRole("button", { name: /Confirm APPROVED/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.recordCandidateDecision).toHaveBeenCalledWith(
        "g-rec-1",
        "run-1",
        "cand-1",
        expect.objectContaining({ decision: "APPROVED" })
      );
    });
  });

  it("renders policy tab with formal safety constraints and formula", async () => {
    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Safety Constraints & Ranking Policy/i)).toBeInTheDocument();
    });

    const policyTabBtn = screen.getByText(/Safety Constraints & Ranking Policy/i);
    fireEvent.click(policyTabBtn);

    expect(screen.getByText("Phase 8 Formal Safety Constraints")).toBeInTheDocument();
    expect(screen.getByText("1. Protected Node Health Floor")).toBeInTheDocument();
    expect(screen.getByText("2. Bounded Parameter Range Guard")).toBeInTheDocument();
    expect(screen.getByText("3. Severance Criticality Guard")).toBeInTheDocument();
    expect(screen.getByText("4. Cross-Graph Mutation Ban")).toBeInTheDocument();
    expect(screen.getByText("Transparent Multi-Objective Ranking Formula")).toBeInTheDocument();
  });
});
