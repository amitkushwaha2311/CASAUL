"use client";

/**
 * CAUSAL — /app/assessments: Unified Resilience Intelligence & Evidence-Backed Decision Workspace
 *
 * Phase 10: Unified resilience intelligence layer connecting:
 *   - Phase 2/3: Infrastructure topology, observed health states, active events
 *   - Phase 4: State baselines, snapshots, and scenarios
 *   - Phase 5: Causal hypotheses, evidence lineage (supporting/contradicting)
 *   - Phase 6: Cascade forecasts, observed vs predicted distinction, calibration status
 *   - Phase 7: Counterfactual experiments, prevented vs newly introduced nodes
 *   - Phase 8: Recommendation candidates, safety constraints, multi-objective ranking, decisions
 *   - Phase 9: Authenticated actor attribution and append-only audit trail
 *
 * SAFETY BOUNDARY:
 * CAUSAL is strictly simulation-only. This interface produces evidence-backed
 * assessments for human engineering review. It NEVER applies real-world actuation
 * or directly mutates live infrastructure state.
 */

import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import {
  Panel,
  Badge,
  Button,
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/ui";
import type {
  GraphResponse,
  AssessmentResponse,
  AssessmentListItem,
  AssessmentEvidenceLineage,
  AssessmentImpactSummary,
  AssessmentDecisions,
  AssessmentCreateRequest,
} from "@causal/shared/src/index";

// ── Shared UI Styles ────────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  borderRadius: "var(--radius-md)",
  backgroundColor: "var(--color-bg-base)",
  border: "1px solid var(--color-border-default)",
  color: "var(--color-text-primary)",
  fontSize: "0.8125rem",
  fontFamily: "var(--font-sans)",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: "0.6875rem",
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--color-text-tertiary)",
  marginBottom: "0.375rem",
};

// ── Badges ──────────────────────────────────────────────────────────────────

function AssessmentStatusBadge({ status }: { status: string }) {
  let bg = "rgba(100, 116, 139, 0.15)";
  let border = "rgba(100, 116, 139, 0.3)";
  let color = "var(--color-text-tertiary)";
  let icon = "○";

  if (status === "READY") {
    bg = "rgba(34, 197, 94, 0.12)";
    border = "rgba(34, 197, 94, 0.3)";
    color = "var(--color-status-normal)";
    icon = "✓";
  } else if (status === "PARTIAL") {
    bg = "rgba(245, 158, 11, 0.12)";
    border = "rgba(245, 158, 11, 0.3)";
    color = "var(--color-status-degraded)";
    icon = "⚠";
  } else if (status === "FAILED") {
    bg = "rgba(239, 68, 68, 0.12)";
    border = "rgba(239, 68, 68, 0.3)";
    color = "var(--color-status-failed)";
    icon = "✕";
  }

  return (
    <span
      data-testid={`assessment-status-badge-${status.toLowerCase()}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.2rem 0.55rem",
        borderRadius: "var(--radius-sm)",
        backgroundColor: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.04em",
      }}
    >
      <span>{icon}</span>
      {status}
    </span>
  );
}

function CalibrationBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const isCalibrated = status === "CALIBRATED";
  return (
    <span
      data-testid="calibration-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.15rem 0.45rem",
        borderRadius: "var(--radius-sm)",
        backgroundColor: isCalibrated
          ? "rgba(169, 154, 128, 0.15)"
          : "rgba(185, 149, 91, 0.15)",
        border: `1px solid ${
          isCalibrated ? "rgba(169, 154, 128, 0.3)" : "rgba(185, 149, 91, 0.3)"
        }`,
        color: isCalibrated ? "#A99A80" : "#B9955B",
        fontSize: "0.625rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      <span>{isCalibrated ? "◈" : "⚠"}</span>
      {isCalibrated ? "CALIBRATED MODEL" : "HEURISTIC ESTIMATE"}
    </span>
  );
}

// ── Main Page Component ─────────────────────────────────────────────────────

export default function ResilienceAssessmentsPage() {
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string>("");
  const [loadingGraphs, setLoadingGraphs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Assessments list for selected graph
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");
  const [loadingAssessments, setLoadingAssessments] = useState(false);

  // Detail data for selected assessment
  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
  const [evidence, setEvidence] = useState<AssessmentEvidenceLineage | null>(null);
  const [impacts, setImpacts] = useState<AssessmentImpactSummary | null>(null);
  const [decisions, setDecisions] = useState<AssessmentDecisions | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<
    "overview" | "evidence" | "forecast" | "counterfactual" | "decisions" | "provenance"
  >("overview");

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createForm, setCreateForm] = useState<AssessmentCreateRequest>({
    name: "",
    description: "",
    causal_run_id: "",
    forecast_run_id: "",
    counterfactual_experiment_id: "",
    recommendation_run_id: "",
  });

  // Load graphs on mount
  useEffect(() => {
    async function loadGraphs() {
      try {
        setLoadingGraphs(true);
        const data = await apiClient.listGraphs();
        setGraphs(data);
        if (data.length > 0) {
          setSelectedGraphId(data[0].id);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load infrastructure graphs");
      } finally {
        setLoadingGraphs(false);
      }
    }
    loadGraphs();
  }, []);

  // Load assessments when selected graph changes
  const loadAssessments = useCallback(async (graphId: string) => {
    if (!graphId) return;
    try {
      setLoadingAssessments(true);
      setError(null);
      const res = await apiClient.listAssessments(graphId);
      setAssessments(res.items);
      if (res.items.length > 0) {
        setSelectedAssessmentId(res.items[0].id);
      } else {
        setSelectedAssessmentId("");
        setAssessment(null);
        setEvidence(null);
        setImpacts(null);
        setDecisions(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to list resilience assessments");
    } finally {
      setLoadingAssessments(false);
    }
  }, []);

  useEffect(() => {
    if (selectedGraphId) {
      loadAssessments(selectedGraphId);
    }
  }, [selectedGraphId, loadAssessments]);

  // Load assessment detail when selectedAssessmentId changes
  const loadAssessmentDetail = useCallback(
    async (graphId: string, assessmentId: string) => {
      if (!graphId || !assessmentId) return;
      try {
        setLoadingDetail(true);
        const [a, ev, imp, dec] = await Promise.all([
          apiClient.getAssessment(graphId, assessmentId),
          apiClient.getAssessmentEvidence(graphId, assessmentId),
          apiClient.getAssessmentImpacts(graphId, assessmentId),
          apiClient.getAssessmentDecisions(graphId, assessmentId),
        ]);
        setAssessment(a);
        setEvidence(ev);
        setImpacts(imp);
        setDecisions(dec);
      } catch (err: any) {
        setError(err.message || "Failed to load assessment details");
      } finally {
        setLoadingDetail(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedGraphId && selectedAssessmentId) {
      loadAssessmentDetail(selectedGraphId, selectedAssessmentId);
    }
  }, [selectedGraphId, selectedAssessmentId, loadAssessmentDetail]);

  // Handle new assessment creation
  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGraphId || !createForm.name) return;
    try {
      setSubmittingCreate(true);
      setError(null);

      // Clean empty string IDs to undefined
      const payload: AssessmentCreateRequest = {
        name: createForm.name,
        description: createForm.description || undefined,
        causal_run_id: createForm.causal_run_id || undefined,
        forecast_run_id: createForm.forecast_run_id || undefined,
        counterfactual_experiment_id:
          createForm.counterfactual_experiment_id || undefined,
        recommendation_run_id:
          createForm.recommendation_run_id || undefined,
      };

      const created = await apiClient.createAssessment(selectedGraphId, payload);
      setShowCreateModal(false);
      setCreateForm({
        name: "",
        description: "",
        causal_run_id: "",
        forecast_run_id: "",
        counterfactual_experiment_id: "",
        recommendation_run_id: "",
      });
      await loadAssessments(selectedGraphId);
      setSelectedAssessmentId(created.id);
    } catch (err: any) {
      setError(err.message || "Failed to create assessment");
    } finally {
      setSubmittingCreate(false);
    }
  };

  if (loadingGraphs) {
    return <LoadingState message="Connecting to resilience engine..." />;
  }

  const selectedGraph = graphs.find((g) => g.id === selectedGraphId);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "1.5rem" }}>
      {/* ── SAFETY BOUNDARY NOTICE ────────────────────────────────────────── */}
      <div
        data-testid="safety-boundary-banner"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.75rem 1rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: "rgba(169, 154, 128, 0.08)",
          border: "1px solid rgba(169, 154, 128, 0.25)",
          marginBottom: "1.5rem",
          fontSize: "0.8125rem",
          color: "var(--color-text-secondary)",
        }}
      >
        <span style={{ fontSize: "1.125rem", color: "#A99A80" }}>🛡</span>
        <div>
          <strong style={{ color: "var(--color-text-primary)" }}>
            SIMULATION-ONLY WORKSPACE:
          </strong>{" "}
          Resilience assessments assemble forensic evidence, forecasts, and
          recommendations for human decision support. CAUSAL never executes
          real-world infrastructure changes.
        </div>
      </div>

      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              marginBottom: "0.375rem",
            }}
          >
            <h1
              data-testid="page-title"
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Unified Resilience Intelligence
            </h1>
            <Badge variant="outline">Phase 10</Badge>
          </div>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-text-tertiary)",
              margin: 0,
            }}
          >
            Traceable, evidence-backed decision workspace across topology,
            causal inference, cascade forecasts, counterfactuals, and
            recommendations.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {/* Graph Selector */}
          <div style={{ minWidth: "220px" }}>
            <select
              data-testid="graph-select"
              aria-label="Select Infrastructure Graph"
              value={selectedGraphId}
              onChange={(e) => setSelectedGraphId(e.target.value)}
              style={INPUT_STYLE}
            >
              {graphs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.domain})
                </option>
              ))}
            </select>
          </div>

          {/* New Assessment Button */}
          <Button
            data-testid="new-assessment-button"
            variant="primary"
            onClick={() => setShowCreateModal(true)}
          >
            + New Assessment
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{ marginBottom: "1.5rem" }}>
          <ErrorState
            title="Resilience Workspace Error"
            message={error}
            onRetry={() => {
              if (selectedGraphId) loadAssessments(selectedGraphId);
            }}
          />
        </div>
      )}

      {/* ── ASSESSMENT SELECTOR STRIP ─────────────────────────────────────── */}
      <Panel style={{ padding: "0.875rem 1.25rem", marginBottom: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              flex: 1,
            }}
          >
            <span style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>
              Assessment Run:
            </span>
            {assessments.length === 0 ? (
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--color-text-tertiary)",
                  fontStyle: "italic",
                }}
              >
                No assessments found for this graph.
              </span>
            ) : (
              <select
                data-testid="assessment-select"
                aria-label="Select Assessment"
                value={selectedAssessmentId}
                onChange={(e) => setSelectedAssessmentId(e.target.value)}
                style={{ ...INPUT_STYLE, maxWidth: "340px" }}
              >
                {assessments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — [{item.status}] ({new Date(item.created_at).toLocaleTimeString()})
                  </option>
                ))}
              </select>
            )}
          </div>

          {assessment && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <AssessmentStatusBadge status={assessment.status} />
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-tertiary)",
                  borderLeft: "1px solid var(--color-border-subtle)",
                  paddingLeft: "1rem",
                }}
              >
                Assembled by:{" "}
                <span style={{ color: "var(--color-text-secondary)" }}>
                  {assessment.created_by_email || "System"}
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                Timestamp:{" "}
                <span style={{ color: "var(--color-text-secondary)" }}>
                  {new Date(assessment.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* ── EMPTY STATE IF NO ASSESSMENTS ─────────────────────────────────── */}
      {assessments.length === 0 && !loadingAssessments && (
        <EmptyState
          title="No Resilience Assessments"
          description="Create a unified assessment to connect topology, evidence chains, cascade predictions, and intervention recommendations."
          action={{
            label: "Assemble First Assessment",
            onClick: () => setShowCreateModal(true),
          }}
        />
      )}

      {/* ── DETAIL VIEW WHEN ASSESSMENT SELECTED ──────────────────────────── */}
      {assessment && (
        <>
          {/* Navigation Tabs */}
          <div
            role="tablist"
            style={{
              display: "flex",
              gap: "0.5rem",
              borderBottom: "1px solid var(--color-border-subtle)",
              marginBottom: "1.5rem",
            }}
          >
            {[
              { id: "overview", label: "Assessment Overview", icon: "⬡" },
              { id: "evidence", label: "Evidence Lineage", icon: "⊛" },
              { id: "forecast", label: "Cascade Forecast", icon: "◎" },
              { id: "counterfactual", label: "Counterfactual Branch", icon: "✦" },
              { id: "decisions", label: "Recommendations & Decisions", icon: "⚖" },
              { id: "provenance", label: "Provenance & Limitations", icon: "◈" },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  data-testid={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.625rem 1rem",
                    backgroundColor: "transparent",
                    border: "none",
                    borderBottom: active
                      ? "2px solid var(--color-accent)"
                      : "2px solid transparent",
                    color: active
                      ? "var(--color-text-primary)"
                      : "var(--color-text-tertiary)",
                    fontSize: "0.8125rem",
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    transition: "all var(--duration-fast) var(--ease-default)",
                  }}
                >
                  <span style={{ fontSize: "0.875rem" }}>{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {loadingDetail ? (
            <LoadingState message="Assembling unified intelligence layers..." />
          ) : (
            <>
              {/* ── TAB 1: OVERVIEW ───────────────────────────────────────── */}
              {activeTab === "overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  {/* Top Stats Grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "1rem",
                    }}
                  >
                    <Panel style={{ padding: "1.25rem" }}>
                      <span style={LABEL_STYLE}>Topology Scope</span>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {assessment.graph_summary?.node_count ?? 0} Nodes
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                        {assessment.graph_summary?.dependency_count ?? 0} Dependencies ·{" "}
                        <span style={{ color: "var(--color-status-failed)" }}>
                          {assessment.graph_summary?.failed_node_count ?? 0} Failed
                        </span>
                      </div>
                    </Panel>

                    <Panel style={{ padding: "1.25rem" }}>
                      <span style={LABEL_STYLE}>Active Incident Events</span>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color:
                            (assessment.graph_summary?.critical_event_count ?? 0) > 0
                              ? "var(--color-status-failed)"
                              : "var(--color-text-primary)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {assessment.graph_summary?.active_event_count ?? 0} Active
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                        {assessment.graph_summary?.critical_event_count ?? 0} Critical severity
                      </div>
                    </Panel>

                    <Panel style={{ padding: "1.25rem" }}>
                      <span style={LABEL_STYLE}>Causal Hypotheses</span>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {impacts?.causal_available
                          ? `${impacts.hypotheses_supported ?? 0} Supported`
                          : "UNAVAILABLE"}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                        {impacts?.causal_available
                          ? `${impacts.hypotheses_total ?? 0} Evaluated · ${
                              impacts.hypotheses_contradicted ?? 0
                            } Contradicted`
                          : "No causal run linked"}
                      </div>
                    </Panel>

                    <Panel style={{ padding: "1.25rem" }}>
                      <span style={LABEL_STYLE}>Cascade Impact Forecast</span>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {impacts?.forecast_available
                          ? `${impacts.forecast_predicted_affected ?? 0} Predicted`
                          : "UNAVAILABLE"}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                        {impacts?.forecast_available ? (
                          <>
                            <span style={{ color: "var(--color-status-degraded)" }}>
                              {impacts.forecast_already_affected ?? 0} observed
                            </span>{" "}
                            · {impacts.forecast_horizon_minutes ?? 0}m horizon
                          </>
                        ) : (
                          "No forecast run linked"
                        )}
                      </div>
                    </Panel>

                    <Panel style={{ padding: "1.25rem" }}>
                      <span style={LABEL_STYLE}>Human Decisions</span>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {decisions?.recommendation_available
                          ? `${decisions.approved_count} Approved`
                          : "UNAVAILABLE"}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                        {decisions?.recommendation_available
                          ? `${decisions.pending_count} Pending · ${decisions.rejected_count} Rejected`
                          : "No recommendations linked"}
                      </div>
                    </Panel>
                  </div>

                  {/* Summary Narrative */}
                  <Panel style={{ padding: "1.5rem" }}>
                    <h3
                      style={{
                        fontSize: "1rem",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        marginTop: 0,
                        marginBottom: "0.75rem",
                      }}
                    >
                      Resilience Assessment Narrative
                    </h3>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        lineHeight: 1.6,
                        color: "var(--color-text-secondary)",
                        margin: 0,
                      }}
                    >
                      Assessment{" "}
                      <strong style={{ color: "var(--color-text-primary)" }}>
                        {assessment.name}
                      </strong>{" "}
                      evaluates infrastructure topology for graph{" "}
                      <strong>{selectedGraph?.name}</strong>. Current state indicates{" "}
                      <strong>{assessment.graph_summary?.degraded_node_count ?? 0}</strong>{" "}
                      degraded nodes and{" "}
                      <strong>{assessment.graph_summary?.active_event_count ?? 0}</strong> active
                      telemetry events.
                      {impacts?.forecast_available && (
                        <>
                          {" "}
                          Cascade forecasting estimates{" "}
                          <strong>{impacts.forecast_predicted_affected}</strong> additional nodes
                          at risk within a {impacts.forecast_horizon_minutes}-minute horizon.
                        </>
                      )}
                      {impacts?.counterfactual_available && (
                        <>
                          {" "}
                          Counterfactual validation confirms an intervention outcome preventing{" "}
                          <strong>
                            {impacts.counterfactual_summary?.prevented_node_count}
                          </strong>{" "}
                          nodes from downstream failure.
                        </>
                      )}
                    </p>
                  </Panel>
                </div>
              )}

              {/* ── TAB 2: EVIDENCE LINEAGE ─────────────────────────────────── */}
              {activeTab === "evidence" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                          margin: 0,
                        }}
                      >
                        Forensic Evidence Lineage
                      </h3>
                      <p
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--color-text-tertiary)",
                          margin: "0.25rem 0 0 0",
                        }}
                      >
                        Traceable causal mechanisms connecting observed events to underlying failure
                        hypotheses.
                      </p>
                    </div>

                    {evidence?.causal_available && (
                      <Badge variant="outline">
                        Completeness:{" "}
                        {Math.round((evidence.evidence_completeness_avg ?? 0) * 100)}%
                      </Badge>
                    )}
                  </div>

                  {!evidence?.causal_available ? (
                    <EmptyState
                      title="No Causal Lineage Available"
                      description="This assessment does not link a Phase 5 causal inference run. Causal mechanisms and evidence chains cannot be rendered."
                    />
                  ) : evidence.hypotheses.length === 0 ? (
                    <EmptyState
                      title="No Hypotheses Generated"
                      description="The linked causal run evaluated zero hypotheses for this state configuration."
                    />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {evidence.hypotheses.map((h) => (
                        <Panel
                          key={h.hypothesis_id}
                          data-testid={`hypothesis-card-${h.hypothesis_id}`}
                          style={{ padding: "1.25rem" }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              marginBottom: "0.75rem",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                  marginBottom: "0.25rem",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.875rem",
                                    fontWeight: 600,
                                    color: "var(--color-text-primary)",
                                  }}
                                >
                                  {h.affected_node_name || "Unknown Target"} ←{" "}
                                  {h.candidate_cause_node_name || "Upstream Mechanism"}
                                </span>
                                <Badge
                                  variant={
                                    h.status === "SUPPORTED"
                                      ? "success"
                                      : h.status === "CONTRADICTED"
                                      ? "error"
                                      : "outline"
                                  }
                                >
                                  {h.status}
                                </Badge>
                              </div>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--color-text-tertiary)",
                                }}
                              >
                                Rule: {h.inference_rule} · Completeness:{" "}
                                {Math.round(h.evidence_completeness_ratio * 100)}%
                              </span>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: "0.5rem",
                                fontSize: "0.75rem",
                              }}
                            >
                              <span style={{ color: "var(--color-status-normal)" }}>
                                ✓ {h.supporting_count} Supporting
                              </span>
                              <span style={{ color: "var(--color-status-failed)" }}>
                                ✕ {h.contradicting_count} Contradicting
                              </span>
                              <span style={{ color: "var(--color-text-tertiary)" }}>
                                ○ {h.neutral_count} Neutral
                              </span>
                            </div>
                          </div>

                          <p
                            style={{
                              fontSize: "0.8125rem",
                              color: "var(--color-text-secondary)",
                              lineHeight: 1.5,
                              marginBottom: "0.75rem",
                            }}
                          >
                            {h.explanation}
                          </p>

                          {/* Missing evidence notes */}
                          {h.missing_evidence && h.missing_evidence.length > 0 && (
                            <div
                              style={{
                                padding: "0.5rem 0.75rem",
                                borderRadius: "var(--radius-sm)",
                                backgroundColor: "rgba(245, 158, 11, 0.08)",
                                border: "1px solid rgba(245, 158, 11, 0.2)",
                                fontSize: "0.75rem",
                                color: "#fbbf24",
                              }}
                            >
                              ⚠ <strong>Missing Telemetry / Information:</strong>{" "}
                              {h.missing_evidence.join(", ")}
                            </div>
                          )}
                        </Panel>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 3: CASCADE FORECAST ─────────────────────────────────── */}
              {activeTab === "forecast" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                          margin: 0,
                        }}
                      >
                        Cascade Propagation & Horizon
                      </h3>
                      <p
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--color-text-tertiary)",
                          margin: "0.25rem 0 0 0",
                        }}
                      >
                        Distinguishing already-affected infrastructure from predicted cascade impacts.
                      </p>
                    </div>

                    <CalibrationBadge status={impacts?.forecast_calibration_status} />
                  </div>

                  {!impacts?.forecast_available ? (
                    <EmptyState
                      title="No Forecast Run Linked"
                      description="This assessment does not link a Phase 6 cascade forecast. Forward cascade projections and horizon bounds are unavailable."
                    />
                  ) : (
                    <>
                      {/* Observed vs Predicted distinction grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "1.5rem",
                        }}
                      >
                        <Panel style={{ padding: "1.25rem" }}>
                          <span style={LABEL_STYLE}>Observed Degradation (Live Fact)</span>
                          <div
                            data-testid="observed-affected-count"
                            style={{
                              fontSize: "1.75rem",
                              fontWeight: 700,
                              color: "var(--color-status-degraded)",
                              marginBottom: "0.5rem",
                            }}
                          >
                            {impacts.forecast_already_affected ?? 0} Nodes
                          </div>
                          <p
                            style={{
                              fontSize: "0.8125rem",
                              color: "var(--color-text-secondary)",
                              margin: 0,
                            }}
                          >
                            Infrastructure already operating at degraded, critical, or failed health
                            as confirmed by telemetry.
                          </p>
                        </Panel>

                        <Panel style={{ padding: "1.25rem" }}>
                          <span style={LABEL_STYLE}>Predicted Impact (Estimated Horizon)</span>
                          <div
                            data-testid="predicted-affected-count"
                            style={{
                              fontSize: "1.75rem",
                              fontWeight: 700,
                              color: "var(--color-text-primary)",
                              marginBottom: "0.5rem",
                            }}
                          >
                            {impacts.forecast_predicted_affected ?? 0} Nodes
                          </div>
                          <p
                            style={{
                              fontSize: "0.8125rem",
                              color: "var(--color-text-secondary)",
                              margin: 0,
                            }}
                          >
                            Downstream nodes predicted to degrade within {impacts.forecast_horizon_minutes}{" "}
                            minutes along directional dependency edges.
                          </p>
                        </Panel>
                      </div>

                      {/* Forecast calibration disclosure */}
                      <Panel style={{ padding: "1rem 1.25rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.625rem",
                            fontSize: "0.8125rem",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          <span style={{ color: "#fbbf24" }}>⚠</span>
                          <div>
                            <strong>Methodology Notice:</strong> Delay and propagation values labeled as{" "}
                            <em>HEURISTIC_ESTIMATE</em> represent uncalibrated synthetic decay curves
                            rather than real-time statistical guarantees.
                          </div>
                        </div>
                      </Panel>
                    </>
                  )}
                </div>
              )}

              {/* ── TAB 4: COUNTERFACTUAL BRANCH ────────────────────────────── */}
              {activeTab === "counterfactual" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div>
                    <h3
                      style={{
                        fontSize: "1rem",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        margin: 0,
                      }}
                    >
                      Paired Counterfactual Evaluation
                    </h3>
                    <p
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--color-text-tertiary)",
                        margin: "0.25rem 0 0 0",
                      }}
                    >
                      Differential comparison between unmitigated baseline and hypothetical
                      intervention outcomes.
                    </p>
                  </div>

                  {!impacts?.counterfactual_available ? (
                    <EmptyState
                      title="No Counterfactual Experiment Linked"
                      description="This assessment does not link a Phase 7 counterfactual experiment. Differential branch comparisons are unavailable."
                    />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                          gap: "1rem",
                        }}
                      >
                        <Panel style={{ padding: "1.25rem" }}>
                          <span style={LABEL_STYLE}>Prevented Failures</span>
                          <div
                            data-testid="prevented-node-count"
                            style={{
                              fontSize: "1.75rem",
                              fontWeight: 700,
                              color: "var(--color-status-normal)",
                              marginBottom: "0.25rem",
                            }}
                          >
                            {impacts.counterfactual_summary?.prevented_node_count ?? 0}
                          </div>
                          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                            Nodes saved from cascading failure
                          </span>
                        </Panel>

                        <Panel style={{ padding: "1.25rem" }}>
                          <span style={LABEL_STYLE}>Newly Introduced Impacts</span>
                          <div
                            data-testid="newly-introduced-count"
                            style={{
                              fontSize: "1.75rem",
                              fontWeight: 700,
                              color:
                                (impacts.counterfactual_summary?.newly_introduced_node_count ?? 0) >
                                0
                                  ? "var(--color-status-failed)"
                                  : "var(--color-text-primary)",
                              marginBottom: "0.25rem",
                            }}
                          >
                            {impacts.counterfactual_summary?.newly_introduced_node_count ?? 0}
                          </div>
                          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                            Nodes harmed by intervention
                          </span>
                        </Panel>

                        <Panel style={{ padding: "1.25rem" }}>
                          <span style={LABEL_STYLE}>Shared Affected</span>
                          <div
                            style={{
                              fontSize: "1.75rem",
                              fontWeight: 700,
                              color: "var(--color-text-primary)",
                              marginBottom: "0.25rem",
                            }}
                          >
                            {impacts.counterfactual_summary?.shared_affected_node_count ?? 0}
                          </div>
                          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                            Affected regardless of mitigation
                          </span>
                        </Panel>

                        <Panel style={{ padding: "1.25rem" }}>
                          <span style={LABEL_STYLE}>Timing Differences</span>
                          <div
                            style={{
                              fontSize: "1.75rem",
                              fontWeight: 700,
                              color: "var(--color-text-primary)",
                              marginBottom: "0.25rem",
                            }}
                          >
                            {impacts.counterfactual_summary?.timing_differences_count ?? 0}
                          </div>
                          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                            Shifted onset timestamps
                          </span>
                        </Panel>
                      </div>

                      {impacts.counterfactual_summary?.has_critical_prevention && (
                        <Panel
                          style={{
                            padding: "0.875rem 1.25rem",
                            backgroundColor: "rgba(34, 197, 94, 0.08)",
                            border: "1px solid rgba(34, 197, 94, 0.25)",
                          }}
                        >
                          <span style={{ color: "var(--color-status-normal)", fontWeight: 600 }}>
                            ✓ Critical Tier Prevention Confirmed:
                          </span>{" "}
                          <span
                            style={{
                              fontSize: "0.8125rem",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            This intervention successfully prevented failure in at least one
                            high-criticality core node.
                          </span>
                        </Panel>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 5: RECOMMENDATIONS & DECISIONS ───────────────────────── */}
              {activeTab === "decisions" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div>
                    <h3
                      style={{
                        fontSize: "1rem",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        margin: 0,
                      }}
                    >
                      Safety-Constrained Candidate Interventions
                    </h3>
                    <p
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--color-text-tertiary)",
                        margin: "0.25rem 0 0 0",
                      }}
                    >
                      Multi-objective rankings and human decision attribution.
                    </p>
                  </div>

                  {!decisions?.recommendation_available ? (
                    <EmptyState
                      title="No Recommendations Linked"
                      description="This assessment does not link a Phase 8 recommendation run. Candidate rankings and decision records are unavailable."
                    />
                  ) : decisions.candidates.length === 0 ? (
                    <EmptyState
                      title="No Candidates Found"
                      description="No intervention candidates were generated for this run."
                    />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {decisions.candidates.map((cand) => (
                        <Panel
                          key={cand.candidate_id}
                          data-testid={`candidate-row-${cand.candidate_id}`}
                          style={{ padding: "1.25rem" }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              flexWrap: "wrap",
                              gap: "0.75rem",
                              marginBottom: "0.5rem",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.625rem",
                                  marginBottom: "0.25rem",
                                }}
                              >
                                {cand.rank_position !== null && (
                                  <span
                                    data-testid="rank-position-badge"
                                    style={{
                                      fontSize: "0.75rem",
                                      fontWeight: 700,
                                      padding: "0.15rem 0.5rem",
                                      borderRadius: "var(--radius-sm)",
                                      backgroundColor: "var(--color-bg-elevated)",
                                      border: "1px solid var(--color-border-subtle)",
                                      color: "var(--color-text-primary)",
                                    }}
                                  >
                                    RANK #{cand.rank_position}
                                  </span>
                                )}
                                <span
                                  style={{
                                    fontSize: "0.9375rem",
                                    fontWeight: 600,
                                    color: "var(--color-text-primary)",
                                  }}
                                >
                                  {cand.title}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--color-text-tertiary)",
                                }}
                              >
                                Type: {cand.intervention_type} · Score:{" "}
                                {cand.rank_score != null ? cand.rank_score.toFixed(3) : "N/A"}
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              {/* Safety Status */}
                              <Badge
                                variant={
                                  cand.safety_status === "PASS"
                                    ? "success"
                                    : cand.safety_status === "FAIL"
                                    ? "error"
                                    : "outline"
                                }
                              >
                                Safety: {cand.safety_status}
                              </Badge>

                              {/* Decision Status */}
                              <Badge
                                variant={
                                  cand.decision_status === "APPROVED"
                                    ? "success"
                                    : cand.decision_status === "REJECTED"
                                    ? "error"
                                    : "outline"
                                }
                              >
                                Decision: {cand.decision_status}
                              </Badge>
                            </div>
                          </div>

                          {/* Decision Attribution */}
                          {cand.decision_status !== "PENDING" && (
                            <div
                              style={{
                                marginTop: "0.5rem",
                                paddingTop: "0.5rem",
                                borderTop: "1px solid var(--color-border-subtle)",
                                fontSize: "0.75rem",
                                color: "var(--color-text-tertiary)",
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              <span>
                                Decided by:{" "}
                                <strong style={{ color: "var(--color-text-secondary)" }}>
                                  {cand.decided_by || "Authorized Approver"}
                                </strong>
                              </span>
                              <span>
                                Recorded at:{" "}
                                <span style={{ color: "var(--color-text-secondary)" }}>
                                  {cand.decided_at
                                    ? new Date(cand.decided_at).toLocaleString()
                                    : "N/A"}
                                </span>
                              </span>
                            </div>
                          )}
                        </Panel>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 6: PROVENANCE & LIMITATIONS ─────────────────────────── */}
              {activeTab === "provenance" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div>
                    <h3
                      style={{
                        fontSize: "1rem",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        margin: 0,
                      }}
                    >
                      Audit Provenance & Explicit Limitations
                    </h3>
                    <p
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--color-text-tertiary)",
                        margin: "0.25rem 0 0 0",
                      }}
                    >
                      Full source record traceability, engine model versions, and methodology
                      disclosures.
                    </p>
                  </div>

                  {/* Missing Sources Warnings */}
                  {assessment.missing_sources && assessment.missing_sources.length > 0 && (
                    <Panel
                      style={{
                        padding: "1rem 1.25rem",
                        backgroundColor: "rgba(245, 158, 11, 0.08)",
                        border: "1px solid rgba(245, 158, 11, 0.25)",
                      }}
                    >
                      <h4
                        style={{
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          color: "#fbbf24",
                          marginTop: 0,
                          marginBottom: "0.5rem",
                        }}
                      >
                        Missing or Incompatible Sources:
                      </h4>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: "1.25rem",
                          fontSize: "0.75rem",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {assessment.missing_sources.map((m, idx) => (
                          <li key={idx}>{m}</li>
                        ))}
                      </ul>
                    </Panel>
                  )}

                  {/* Engine Model Versions */}
                  <Panel style={{ padding: "1.25rem" }}>
                    <span style={LABEL_STYLE}>Engine Model Versions</span>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "0.75rem",
                        marginTop: "0.5rem",
                      }}
                    >
                      {Object.entries(assessment.model_versions || {}).map(([engine, ver]) => (
                        <div
                          key={engine}
                          style={{
                            padding: "0.5rem 0.75rem",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: "var(--color-bg-base)",
                            border: "1px solid var(--color-border-subtle)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.6875rem",
                              color: "var(--color-text-tertiary)",
                              textTransform: "uppercase",
                            }}
                          >
                            {engine}
                          </div>
                          <div
                            style={{
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              color: "var(--color-text-primary)",
                            }}
                          >
                            {ver}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  {/* Disclosed Limitations */}
                  <Panel style={{ padding: "1.25rem" }}>
                    <span style={LABEL_STYLE}>Explicit Methodological Limitations</span>
                    <ul
                      style={{
                        margin: "0.5rem 0 0 0",
                        paddingLeft: "1.25rem",
                        fontSize: "0.8125rem",
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.6,
                      }}
                    >
                      {(assessment.limitations || []).map((lim, idx) => (
                        <li key={idx}>{lim}</li>
                      ))}
                    </ul>
                  </Panel>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── CREATE ASSESSMENT MODAL ───────────────────────────────────────── */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-assessment-title"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "560px",
              backgroundColor: "var(--color-bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border-default)",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
              overflow: "hidden",
            }}
          >
            <form onSubmit={handleCreateAssessment}>
              <div
                style={{
                  padding: "1.25rem 1.5rem",
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <h2
                  id="create-assessment-title"
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    margin: 0,
                  }}
                >
                  Assemble Resilience Assessment
                </h2>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-tertiary)",
                    margin: "0.25rem 0 0 0",
                  }}
                >
                  Connect existing Phase 2–9 persisted records for graph{" "}
                  <strong>{selectedGraph?.name}</strong>.
                </p>
              </div>

              <div
                style={{
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  maxHeight: "65vh",
                  overflowY: "auto",
                }}
              >
                <div>
                  <label htmlFor="assessment-name" style={LABEL_STYLE}>
                    Assessment Name *
                  </label>
                  <input
                    id="assessment-name"
                    required
                    style={INPUT_STYLE}
                    placeholder="e.g. Q4 Grid Cascade Assessment"
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, name: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="assessment-desc" style={LABEL_STYLE}>
                    Description / Context
                  </label>
                  <textarea
                    id="assessment-desc"
                    rows={2}
                    style={{ ...INPUT_STYLE, resize: "vertical" }}
                    placeholder="Operational context or trigger rationale..."
                    value={createForm.description || ""}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, description: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="causal-run-id" style={LABEL_STYLE}>
                    Causal Run ID (Optional)
                  </label>
                  <input
                    id="causal-run-id"
                    style={INPUT_STYLE}
                    placeholder="UUID of Phase 5 causal inference run"
                    value={createForm.causal_run_id || ""}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, causal_run_id: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="forecast-run-id" style={LABEL_STYLE}>
                    Forecast Run ID (Optional)
                  </label>
                  <input
                    id="forecast-run-id"
                    style={INPUT_STYLE}
                    placeholder="UUID of Phase 6 cascade forecast run"
                    value={createForm.forecast_run_id || ""}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, forecast_run_id: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="cf-exp-id" style={LABEL_STYLE}>
                    Counterfactual Experiment ID (Optional)
                  </label>
                  <input
                    id="cf-exp-id"
                    style={INPUT_STYLE}
                    placeholder="UUID of Phase 7 counterfactual experiment"
                    value={createForm.counterfactual_experiment_id || ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        counterfactual_experiment_id: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="rec-run-id" style={LABEL_STYLE}>
                    Recommendation Run ID (Optional)
                  </label>
                  <input
                    id="rec-run-id"
                    style={INPUT_STYLE}
                    placeholder="UUID of Phase 8 recommendation run"
                    value={createForm.recommendation_run_id || ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        recommendation_run_id: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div
                style={{
                  padding: "1rem 1.5rem",
                  borderTop: "1px solid var(--color-border-subtle)",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                }}
              >
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submittingCreate}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={submittingCreate}>
                  {submittingCreate ? "Assembling..." : "Assemble Assessment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
