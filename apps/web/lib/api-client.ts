/**
 * CAUSAL — Typed API client.
 *
 * Thin fetch wrapper for all CAUSAL API calls.
 * Centralises: base URL, headers, and error handling.
 *
 * This is NOT a framework — it's a small, typed utility.
 * Do NOT replace with axios, SWR, or React Query in Phase 1.
 */

import type {
  HealthResponse,
  SystemInfoResponse,
  SystemStatusResponse,
  GraphResponse,
  NodeResponse,
  DependencyResponse,
  GraphStatisticsResponse,
  GraphValidationResponse,
  EventResponse,
  EventCreate,
  EventUpdate,
  ObservationResponse,
  ObservationCreate,
  EventStatisticsResponse,
} from "@causal/shared/src/index";

import { parseApiResponse } from "./api-error";

// ── Base URL ───────────────────────────────────────────────────

export const PRODUCTION_API_URL = "https://casaul.onrender.com";
export const LOCAL_API_URL = "http://localhost:8000";

/**
 * Returns the active API base URL.
 * 
 * Precedence:
 * 1. process.env.NEXT_PUBLIC_API_URL (if set, stripped of trailing slash)
 * 2. Browser runtime: if running on non-localhost (e.g. *.vercel.app), returns https://casaul.onrender.com
 * 3. Server runtime: if NODE_ENV === "production" or VERCEL is set, returns https://casaul.onrender.com
 * 4. Fallback to local development server (http://localhost:8000)
 */
export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local");
    if (!isLocal) {
      return PRODUCTION_API_URL;
    }
    return LOCAL_API_URL;
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    return PRODUCTION_API_URL;
  }

  return LOCAL_API_URL;
}

export const API_BASE_URL = getApiBaseUrl();

// ── Core fetch helper ──────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const baseUrl = getApiBaseUrl().replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${baseUrl}${cleanPath}`, init);
  return parseApiResponse<T>(response);
}

// ── API client ─────────────────────────────────────────────────

export const apiClient = {
  health(): Promise<HealthResponse> {
    return request<HealthResponse>("/api/v1/health");
  },
  systemInfo(): Promise<SystemInfoResponse> {
    return request<SystemInfoResponse>("/api/v1/system/info");
  },
  systemStatus(): Promise<SystemStatusResponse> {
    return request<SystemStatusResponse>("/api/v1/system/status");
  },

  // Graphs
  listGraphs(): Promise<GraphResponse[]> {
    return request<GraphResponse[]>("/api/v1/graphs");
  },
  getGraph(id: string): Promise<GraphResponse> {
    return request<GraphResponse>(`/api/v1/graphs/${id}`);
  },
  getGraphStatistics(id: string): Promise<GraphStatisticsResponse> {
    return request<GraphStatisticsResponse>(`/api/v1/graphs/${id}/statistics`);
  },
  getGraphValidation(id: string): Promise<GraphValidationResponse> {
    return request<GraphValidationResponse>(`/api/v1/graphs/${id}/validation`);
  },

  // Nodes
  listNodes(graphId: string): Promise<NodeResponse[]> {
    return request<NodeResponse[]>(`/api/v1/graphs/${graphId}/nodes`);
  },

  // Dependencies
  listDependencies(graphId: string): Promise<DependencyResponse[]> {
    return request<DependencyResponse[]>(`/api/v1/graphs/${graphId}/dependencies`);
  },

  // Events
  listEvents(
    graphId: string,
    params?: {
      severity?: string;
      status?: string;
      event_type?: string;
      node_id?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<EventResponse[]> {
    const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as string[][]).toString() : "";
    return request<EventResponse[]>(`/api/v1/graphs/${graphId}/events${qs}`);
  },
  getEvent(graphId: string, eventId: string): Promise<EventResponse> {
    return request<EventResponse>(`/api/v1/graphs/${graphId}/events/${eventId}`);
  },
  createEvent(graphId: string, data: EventCreate): Promise<EventResponse> {
    return request<EventResponse>(`/api/v1/graphs/${graphId}/events`, { method: "POST", body: data });
  },
  updateEvent(graphId: string, eventId: string, data: EventUpdate): Promise<EventResponse> {
    return request<EventResponse>(`/api/v1/graphs/${graphId}/events/${eventId}`, { method: "PATCH", body: data });
  },
  getEventStatistics(graphId: string): Promise<EventStatisticsResponse> {
    return request<EventStatisticsResponse>(`/api/v1/graphs/${graphId}/event-statistics`);
  },
  getTimeline(
    graphId: string,
    params?: { page?: number; page_size?: number; node_id?: string; severity?: string; }
  ): Promise<EventResponse[]> {
    const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as string[][]).toString() : "";
    return request<EventResponse[]>(`/api/v1/graphs/${graphId}/timeline${qs}`);
  },

  // Observations
  listObservations(graphId: string, params?: { node_id?: string; event_id?: string; metric?: string; page?: number; }): Promise<ObservationResponse[]> {
    const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as string[][]).toString() : "";
    return request<ObservationResponse[]>(`/api/v1/graphs/${graphId}/observations${qs}`);
  },
  createObservation(graphId: string, data: ObservationCreate): Promise<ObservationResponse> {
    return request<ObservationResponse>(`/api/v1/graphs/${graphId}/observations`, { method: "POST", body: data });
  },

  // Node history
  getNodeEvents(graphId: string, nodeId: string): Promise<EventResponse[]> {
    return request<EventResponse[]>(`/api/v1/graphs/${graphId}/nodes/${nodeId}/events`);
  },
  getNodeObservations(graphId: string, nodeId: string, params?: { metric?: string }): Promise<ObservationResponse[]> {
    const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as string[][]).toString() : "";
    return request<ObservationResponse[]>(`/api/v1/graphs/${graphId}/nodes/${nodeId}/observations${qs}`);
  },

  // ── Phase 4: System State & Digital Twin Engine ──────────────────────────
  getGraphState(graphId: string): Promise<import("@causal/shared/src/index").CurrentGraphStateResponse> {
    return request(`/api/v1/graphs/${graphId}/state`);
  },
  getNodeState(graphId: string, nodeId: string): Promise<import("@causal/shared/src/index").CurrentNodeStateResponse> {
    return request(`/api/v1/graphs/${graphId}/nodes/${nodeId}/state`);
  },
  getNodeStateHistory(graphId: string, nodeId: string): Promise<import("@causal/shared/src/index").StateHistoryResponse[]> {
    return request(`/api/v1/graphs/${graphId}/nodes/${nodeId}/state/history`);
  },
  getGraphStateHistory(
    graphId: string,
    params?: { start_time?: string; end_time?: string; page?: number; page_size?: number }
  ): Promise<import("@causal/shared/src/index").StateHistoryResponse[]> {
    const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])) : "";
    return request(`/api/v1/graphs/${graphId}/state/history${qs}`);
  },
  reconstructGraphStateAt(graphId: string, timestamp: string): Promise<import("@causal/shared/src/index").StateReconstructionResponse> {
    return request(`/api/v1/graphs/${graphId}/state/at?timestamp=${encodeURIComponent(timestamp)}`);
  },
  getStateConsistency(graphId: string): Promise<import("@causal/shared/src/index").StateConsistencyResponse> {
    return request(`/api/v1/graphs/${graphId}/state/consistency`);
  },
  createBaseline(graphId: string, data: import("@causal/shared/src/index").BaselineCreate): Promise<import("@causal/shared/src/index").BaselineResponse> {
    return request(`/api/v1/graphs/${graphId}/baselines`, { method: "POST", body: data });
  },
  listBaselines(graphId: string): Promise<import("@causal/shared/src/index").BaselineResponse[]> {
    return request(`/api/v1/graphs/${graphId}/baselines`);
  },
  getBaseline(graphId: string, baselineId: string): Promise<import("@causal/shared/src/index").BaselineResponse> {
    return request(`/api/v1/graphs/${graphId}/baselines/${baselineId}`);
  },
  createSnapshot(graphId: string, data: import("@causal/shared/src/index").SnapshotCreate): Promise<import("@causal/shared/src/index").SnapshotResponse> {
    return request(`/api/v1/graphs/${graphId}/snapshots`, { method: "POST", body: data });
  },
  listSnapshots(graphId: string): Promise<import("@causal/shared/src/index").SnapshotResponse[]> {
    return request(`/api/v1/graphs/${graphId}/snapshots`);
  },
  getSnapshot(graphId: string, snapshotId: string): Promise<import("@causal/shared/src/index").SnapshotResponse> {
    return request(`/api/v1/graphs/${graphId}/snapshots/${snapshotId}`);
  },
  compareBaselineVsCurrent(graphId: string, baselineId: string): Promise<import("@causal/shared/src/index").StateComparisonResponse> {
    return request(`/api/v1/graphs/${graphId}/state/compare?baseline_id=${baselineId}`);
  },
  compareSnapshots(graphId: string, snapshotA: string, snapshotB?: string): Promise<import("@causal/shared/src/index").StateComparisonResponse> {
    const qs = snapshotB ? `snapshot_a=${snapshotA}&snapshot_b=${snapshotB}` : `snapshot_a=${snapshotA}`;
    return request(`/api/v1/graphs/${graphId}/state/compare?${qs}`);
  },
  createScenario(graphId: string, data: import("@causal/shared/src/index").ScenarioCreate): Promise<import("@causal/shared/src/index").ScenarioResponse> {
    return request(`/api/v1/graphs/${graphId}/scenarios`, { method: "POST", body: data });
  },
  listScenarios(graphId: string): Promise<import("@causal/shared/src/index").ScenarioResponse[]> {
    return request(`/api/v1/graphs/${graphId}/scenarios`);
  },
  getScenario(graphId: string, scenarioId: string): Promise<import("@causal/shared/src/index").ScenarioResponse> {
    return request(`/api/v1/graphs/${graphId}/scenarios/${scenarioId}`);
  },
  getSystemStateSummary(graphId: string): Promise<import("@causal/shared/src/index").SystemStateSummaryResponse> {
    return request(`/api/v1/graphs/${graphId}/state/summary`);
  },

  // ── Phase 5: Causal Reasoning Engine ──────────────────────
  analyzeCausal(graphId: string, data: import("@causal/shared/src/index").CausalAnalysisRequest): Promise<import("@causal/shared/src/index").CausalInferenceRunResponse> {
    return request(`/api/v1/graphs/${graphId}/causal/analyze`, { method: "POST", body: data });
  },
  listHypotheses(graphId: string, status?: string): Promise<import("@causal/shared/src/index").HypothesisResponse[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return request(`/api/v1/graphs/${graphId}/causal/hypotheses${qs}`);
  },
  getHypothesis(graphId: string, hypothesisId: string): Promise<import("@causal/shared/src/index").HypothesisResponse> {
    return request(`/api/v1/graphs/${graphId}/causal/hypotheses/${hypothesisId}`);
  },
  getHypothesisEvidence(graphId: string, hypothesisId: string): Promise<import("@causal/shared/src/index").EvidenceItemResponse[]> {
    return request(`/api/v1/graphs/${graphId}/causal/hypotheses/${hypothesisId}/evidence`);
  },
  getNodeHypotheses(graphId: string, nodeId: string): Promise<import("@causal/shared/src/index").HypothesisResponse[]> {
    return request(`/api/v1/graphs/${graphId}/nodes/${nodeId}/causal/hypotheses`);
  },

  // ── Phase 6: Cascade Prediction Engine ──────────────────────
  runCascadeForecast(
    graphId: string,
    data: import("@causal/shared/src/index").CascadeForecastRequest
  ): Promise<import("@causal/shared/src/index").CascadeForecastResponse> {
    return request(`/api/v1/graphs/${graphId}/forecasts/cascade`, { method: "POST", body: data });
  },
  listCascadeForecasts(
    graphId: string,
    params?: { page?: number; page_size?: number }
  ): Promise<import("@causal/shared/src/index").CascadeForecastListResponse> {
    const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as string[][]).toString() : "";
    return request(`/api/v1/graphs/${graphId}/forecasts${qs}`);
  },
  getCascadeForecast(
    graphId: string,
    forecastId: string
  ): Promise<import("@causal/shared/src/index").CascadeForecastResponse> {
    return request(`/api/v1/graphs/${graphId}/forecasts/${forecastId}`);
  },
  getCascadeForecastTimeline(
    graphId: string,
    forecastId: string
  ): Promise<import("@causal/shared/src/index").CascadeTimelineResponse> {
    return request(`/api/v1/graphs/${graphId}/forecasts/${forecastId}/timeline`);
  },
  getCascadeForecastImpact(
    graphId: string,
    forecastId: string
  ): Promise<import("@causal/shared/src/index").CascadeImpactSummary> {
    return request(`/api/v1/graphs/${graphId}/forecasts/${forecastId}/impact`);
  },
  getNodeCascadeForecasts(
    graphId: string,
    nodeId: string
  ): Promise<import("@causal/shared/src/index").CascadeForecastListItem[]> {
    return request(`/api/v1/graphs/${graphId}/nodes/${nodeId}/forecasts`);
  },

  // ── Phase 7: Counterfactual Simulation Engine ────────────────────────────

  /**
   * Define a new counterfactual experiment (PENDING status — not yet run).
   * All interventions are hypothetical-only and isolated from live state.
   */
  createCounterfactualExperiment(
    graphId: string,
    data: import("@causal/shared/src/index").CounterfactualExperimentCreate
  ): Promise<import("@causal/shared/src/index").CounterfactualExperimentResponse> {
    return request(`/api/v1/graphs/${graphId}/counterfactuals`, { method: "POST", body: data });
  },

  /**
   * List counterfactual experiments for a graph with optional status filter.
   */
  listCounterfactualExperiments(
    graphId: string,
    params?: { page?: number; page_size?: number; status?: string }
  ): Promise<import("@causal/shared/src/index").CounterfactualExperimentListResponse> {
    const qs = params
      ? "?" + new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : "";
    return request(`/api/v1/graphs/${graphId}/counterfactuals${qs}`);
  },

  /**
   * Retrieve a specific counterfactual experiment definition by ID.
   */
  getCounterfactualExperiment(
    graphId: string,
    experimentId: string
  ): Promise<import("@causal/shared/src/index").CounterfactualExperimentResponse> {
    return request(`/api/v1/graphs/${graphId}/counterfactuals/${experimentId}`);
  },

  /**
   * Execute both branches (baseline + counterfactual) through the Phase 6 engine.
   * Returns the full result including comparison. Idempotent unless force=true.
   */
  runCounterfactualExperiment(
    graphId: string,
    experimentId: string,
    force?: boolean
  ): Promise<import("@causal/shared/src/index").CounterfactualRunResultResponse> {
    const qs = force ? "?force=true" : "";
    return request(`/api/v1/graphs/${graphId}/counterfactuals/${experimentId}/run${qs}`, {
      method: "POST",
    });
  },

  /**
   * Get the differential outcome comparison for a completed experiment.
   */
  getCounterfactualComparison(
    graphId: string,
    experimentId: string
  ): Promise<import("@causal/shared/src/index").CounterfactualComparisonResponse> {
    return request(`/api/v1/graphs/${graphId}/counterfactuals/${experimentId}/comparison`);
  },

  /**
   * Get the full results payload (experiment + both forecasts + comparison).
   */
  getCounterfactualResults(
    graphId: string,
    experimentId: string
  ): Promise<import("@causal/shared/src/index").CounterfactualRunResultResponse> {
    return request(`/api/v1/graphs/${graphId}/counterfactuals/${experimentId}/results`);
  },

  // ── Phase 8: Recommendations ──────────────────────────────────────────

  /**
   * Create a new safety-constrained recommendation run.
   */
  createRecommendationRun(
    graphId: string,
    payload: import("@causal/shared/src/index").RecommendationRunCreate
  ): Promise<import("@causal/shared/src/index").RecommendationRunResponse> {
    return request(`/api/v1/graphs/${graphId}/recommendations/runs`, {
      method: "POST",
      body: payload,
    });
  },

  /**
   * List recommendation runs for a graph.
   */
  listRecommendationRuns(
    graphId: string,
    page: number = 1,
    pageSize: number = 20,
    status?: string
  ): Promise<import("@causal/shared/src/index").RecommendationRunListResponse> {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (status) params.append("status", status);
    return request(`/api/v1/graphs/${graphId}/recommendations/runs?${params.toString()}`);
  },

  /**
   * Get a specific recommendation run by ID with candidates.
   */
  getRecommendationRun(
    graphId: string,
    runId: string
  ): Promise<import("@causal/shared/src/index").RecommendationRunResponse> {
    return request(`/api/v1/graphs/${graphId}/recommendations/runs/${runId}`);
  },

  /**
   * Execute generation, safety constraint checks, Phase 7 simulation, and ranking.
   */
  executeRecommendationRun(
    graphId: string,
    runId: string
  ): Promise<import("@causal/shared/src/index").RecommendationRunResponse> {
    return request(`/api/v1/graphs/${graphId}/recommendations/runs/${runId}/execute`, {
      method: "POST",
    });
  },

  /**
   * List candidate interventions for a run.
   */
  listCandidateInterventions(
    graphId: string,
    runId: string
  ): Promise<import("@causal/shared/src/index").CandidateInterventionListItem[]> {
    return request(`/api/v1/graphs/${graphId}/recommendations/runs/${runId}/candidates`);
  },

  /**
   * Get detailed candidate evaluation with safety checks and ranking breakdown.
   */
  getCandidateIntervention(
    graphId: string,
    runId: string,
    candidateId: string
  ): Promise<import("@causal/shared/src/index").CandidateInterventionResponse> {
    return request(
      `/api/v1/graphs/${graphId}/recommendations/runs/${runId}/candidates/${candidateId}`
    );
  },

  /**
   * Record human decision (APPROVED or REJECTED) on a candidate intervention.
   */
  recordCandidateDecision(
    graphId: string,
    runId: string,
    candidateId: string,
    payload: import("@causal/shared/src/index").CandidateDecisionRequest
  ): Promise<import("@causal/shared/src/index").CandidateInterventionResponse> {
    return request(
      `/api/v1/graphs/${graphId}/recommendations/runs/${runId}/candidates/${candidateId}/decision`,
      {
        method: "POST",
        body: payload,
      }
    );
  },

  // ── Phase 10: Unified Resilience Assessments ──────────────────────────

  /**
   * Create a resilience assessment from existing records.
   */
  createAssessment(
    graphId: string,
    payload: import("@causal/shared/src/index").AssessmentCreateRequest
  ): Promise<import("@causal/shared/src/index").AssessmentResponse> {
    return request(`/api/v1/graphs/${graphId}/assessments`, {
      method: "POST",
      body: payload,
    });
  },

  /**
   * List paginated resilience assessments for a graph.
   */
  listAssessments(
    graphId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<import("@causal/shared/src/index").AssessmentListResponse> {
    return request(`/api/v1/graphs/${graphId}/assessments?page=${page}&page_size=${pageSize}`);
  },

  /**
   * Get single resilience assessment summary.
   */
  getAssessment(
    graphId: string,
    assessmentId: string
  ): Promise<import("@causal/shared/src/index").AssessmentResponse> {
    return request(`/api/v1/graphs/${graphId}/assessments/${assessmentId}`);
  },

  /**
   * Get full evidence lineage for an assessment.
   */
  getAssessmentEvidence(
    graphId: string,
    assessmentId: string
  ): Promise<import("@causal/shared/src/index").AssessmentEvidenceLineage> {
    return request(`/api/v1/graphs/${graphId}/assessments/${assessmentId}/evidence`);
  },

  /**
   * Get impact and uncertainty summary for an assessment.
   */
  getAssessmentImpacts(
    graphId: string,
    assessmentId: string
  ): Promise<import("@causal/shared/src/index").AssessmentImpactSummary> {
    return request(`/api/v1/graphs/${graphId}/assessments/${assessmentId}/impacts`);
  },

  /**
   * Get recommendation decisions for an assessment.
   */
  getAssessmentDecisions(
    graphId: string,
    assessmentId: string
  ): Promise<import("@causal/shared/src/index").AssessmentDecisions> {
    return request(`/api/v1/graphs/${graphId}/assessments/${assessmentId}/decisions`);
  },
} as const;

export type { HealthResponse, SystemInfoResponse, SystemStatusResponse };

