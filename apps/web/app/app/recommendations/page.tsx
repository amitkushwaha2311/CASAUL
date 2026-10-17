"use client";

/**
 * CAUSAL — /app/recommendations: Safety-Constrained Intervention Recommendation Engine
 *
 * Phase 8: Deterministic candidate generation, formal safety constraint evaluation,
 * counterfactual validation via Phase 7, transparent multi-objective ranking,
 * and human decision recording.
 *
 * SAFETY BOUNDARY:
 * CAUSAL is strictly simulation-only. This interface produces evidence-backed
 * recommendations for human engineering review. It NEVER applies real-world actuation
 * or directly mutates live infrastructure state.
 */

import React, { useState, useEffect, useCallback, useId } from "react";
import Link from "next/link";
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
  NodeResponse,
  StateBaselineListItem,
  RecommendationRunResponse,
  RecommendationRunListItem,
  CandidateInterventionResponse,
  SafetyConstraintEvaluationResponse,
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

// ── Badges & Status Helpers ─────────────────────────────────────────────────

function SafetyStatusBadge({ status }: { status: string }) {
  let bg = "rgba(100, 116, 139, 0.15)";
  let border = "rgba(100, 116, 139, 0.3)";
  let color = "var(--color-text-tertiary)";
  let icon = "○";

  if (status === "SAFE") {
    bg = "rgba(34, 197, 94, 0.12)";
    border = "rgba(34, 197, 94, 0.3)";
    color = "var(--color-status-normal)";
    icon = "✓";
  } else if (status === "UNSAFE") {
    bg = "rgba(239, 68, 68, 0.12)";
    border = "rgba(239, 68, 68, 0.3)";
    color = "var(--color-status-failed)";
    icon = "✕";
  } else if (status === "INDETERMINATE") {
    bg = "rgba(245, 158, 11, 0.12)";
    border = "rgba(245, 158, 11, 0.3)";
    color = "var(--color-status-degraded)";
    icon = "?";
  }

  return (
    <span
      data-testid={`safety-badge-${status.toLowerCase()}`}
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
        fontWeight: 700,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.04em",
      }}
    >
      <span>{icon}</span> {status}
    </span>
  );
}

function EligibilityBadge({ status }: { status: string }) {
  let bg = "rgba(100, 116, 139, 0.12)";
  let border = "rgba(100, 116, 139, 0.25)";
  let color = "var(--color-text-tertiary)";

  if (status === "ELIGIBLE") {
    bg = "rgba(130, 151, 125, 0.14)";
    border = "rgba(130, 151, 125, 0.3)";
    color = "var(--color-status-healthy)";
  } else if (status === "INELIGIBLE") {
    bg = "rgba(239, 68, 68, 0.12)";
    border = "rgba(239, 68, 68, 0.3)";
    color = "var(--color-status-failed)";
  } else if (status === "INDETERMINATE") {
    bg = "rgba(245, 158, 11, 0.12)";
    border = "rgba(245, 158, 11, 0.3)";
    color = "var(--color-status-degraded)";
  }

  return (
    <span
      data-testid={`eligibility-badge-${status.toLowerCase()}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.2rem 0.55rem",
        borderRadius: "var(--radius-sm)",
        backgroundColor: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: "0.6875rem",
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.04em",
      }}
    >
      {status}
    </span>
  );
}

function DecisionBadge({ status }: { status: string }) {
  let bg = "rgba(100, 116, 139, 0.12)";
  let border = "rgba(100, 116, 139, 0.25)";
  let color = "var(--color-text-tertiary)";

  if (status === "APPROVED") {
    bg = "rgba(34, 197, 94, 0.15)";
    border = "rgba(34, 197, 94, 0.4)";
    color = "var(--color-status-normal)";
  } else if (status === "REJECTED") {
    bg = "rgba(239, 68, 68, 0.15)";
    border = "rgba(239, 68, 68, 0.4)";
    color = "var(--color-status-failed)";
  }

  return (
    <span
      data-testid={`decision-badge-${status.toLowerCase()}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.2rem 0.55rem",
        borderRadius: "var(--radius-sm)",
        backgroundColor: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: "0.6875rem",
        fontWeight: 700,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.04em",
      }}
    >
      {status}
    </span>
  );
}

// ── Decision Modal / Drawer ──────────────────────────────────────────────────

function DecisionModal({
  candidate,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  candidate: CandidateInterventionResponse;
  onClose: () => void;
  onSubmit: (decision: "APPROVED" | "REJECTED", notes: string, decidedBy: string) => void;
  isSubmitting: boolean;
}) {
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [notes, setNotes] = useState("");
  const [decidedBy, setDecidedBy] = useState("Human Engineering Reviewer");

  const notesId = useId();
  const reviewerId = useId();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Human Review Decision"
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
          maxWidth: "540px",
          backgroundColor: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "1.5rem",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
            Record Human Review Decision
          </h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-tertiary)",
              cursor: "pointer",
              fontSize: "1.25rem",
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", marginBottom: "1rem", lineHeight: 1.5 }}>
          Candidate: <strong>{candidate.title}</strong>
        </p>

        <div
          style={{
            padding: "0.75rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            marginBottom: "1.25rem",
            fontSize: "0.75rem",
            color: "var(--color-text-secondary)",
          }}
        >
          <strong style={{ color: "var(--color-status-degraded)" }}>Audit Boundary Note:</strong> Recording an approval or rejection logs a permanent human decision audit trail. CAUSAL will <em>never</em> automatically dispatch commands or actuate hardware.
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <span style={LABEL_STYLE}>Decision Outcome</span>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={() => setDecision("APPROVED")}
              style={{
                flex: 1,
                padding: "0.625rem",
                borderRadius: "var(--radius-md)",
                border: decision === "APPROVED" ? "2px solid #22c55e" : "1px solid var(--color-border-default)",
                backgroundColor: decision === "APPROVED" ? "rgba(34, 197, 94, 0.15)" : "var(--color-bg-base)",
                color: decision === "APPROVED" ? "#22c55e" : "var(--color-text-secondary)",
                fontWeight: 700,
                fontSize: "0.8125rem",
                cursor: "pointer",
              }}
            >
              ✓ APPROVE
            </button>
            <button
              type="button"
              onClick={() => setDecision("REJECTED")}
              style={{
                flex: 1,
                padding: "0.625rem",
                borderRadius: "var(--radius-md)",
                border: decision === "REJECTED" ? "2px solid #ef4444" : "1px solid var(--color-border-default)",
                backgroundColor: decision === "REJECTED" ? "rgba(239, 68, 68, 0.15)" : "var(--color-bg-base)",
                color: decision === "REJECTED" ? "#ef4444" : "var(--color-text-secondary)",
                fontWeight: 700,
                fontSize: "0.8125rem",
                cursor: "pointer",
              }}
            >
              ✕ REJECT
            </button>
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor={reviewerId} style={LABEL_STYLE}>Reviewer Identifier</label>
          <input
            id={reviewerId}
            type="text"
            value={decidedBy}
            onChange={(e) => setDecidedBy(e.target.value)}
            style={INPUT_STYLE}
            placeholder="Reviewer Name / ID"
          />
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <label htmlFor={notesId} style={LABEL_STYLE}>Review Notes & Rationale</label>
          <textarea
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...INPUT_STYLE, resize: "vertical" }}
            placeholder="Explain why this candidate intervention was approved or rejected..."
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onSubmit(decision, notes, decidedBy)}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : `Confirm ${decision}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page Component ─────────────────────────────────────────────────────

export default function RecommendationsPage() {
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string>("");
  const [nodes, setNodes] = useState<NodeResponse[]>([]);
  const [baselines, setBaselines] = useState<StateBaselineListItem[]>([]);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<"OPTIMIZER" | "RUNS_HISTORY" | "POLICY">("OPTIMIZER");

  // Run list & current run
  const [runs, setRuns] = useState<RecommendationRunListItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<RecommendationRunResponse | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  // Filters
  const [candidateFilter, setCandidateFilter] = useState<"ALL" | "ELIGIBLE" | "INELIGIBLE" | "INDETERMINATE">("ALL");

  // Run creation form
  const [newRunName, setNewRunName] = useState("Nominal Resilience Optimization");
  const newRunDescription = "Evaluation of candidates against cascading failures";
  const [selectedBaselineId, setSelectedBaselineId] = useState<string>("");
  const [maxCandidates, setMaxCandidates] = useState<number>(10);
  const horizonMinutes = 60;
  const [targetNodeFilter, setTargetNodeFilter] = useState<string>("");

  // Loading & error states
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decision Modal
  const [decisionModalCandidate, setDecisionModalCandidate] = useState<CandidateInterventionResponse | null>(null);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  // Load Graphs & System Context
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const gList = await apiClient.listGraphs();
      setGraphs(gList);
      if (gList.length > 0) {
        setSelectedGraphId(gList[0].id);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to initialize recommendation engine workspace.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Load Graph Details (Nodes, Baselines, Snapshots, Runs)
  const loadGraphContext = useCallback(async (gId: string) => {
    if (!gId) return;
    try {
      const [nList, bList, , rList] = await Promise.all([
        apiClient.listNodes(gId),
        apiClient.listBaselines(gId),
        apiClient.listSnapshots(gId),
        apiClient.listRecommendationRuns(gId, 1, 20),
      ]);
      setNodes(nList);
      setBaselines(bList);
      if (bList.length > 0) {
        setSelectedBaselineId(bList[0].id);
      }
      setRuns(rList.items || []);

      // If runs exist, auto-select the latest one
      if (rList.items && rList.items.length > 0) {
        // eslint-disable-next-line react-hooks/immutability
        loadRunDetails(gId, rList.items[0].id);
      } else {
        setSelectedRun(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load graph resilience data.");
    }
  }, []);

  useEffect(() => {
    if (selectedGraphId) {
      loadGraphContext(selectedGraphId);
    }
  }, [selectedGraphId, loadGraphContext]);

  // Load Run Details
  const loadRunDetails = async (gId: string, runId: string) => {
    try {
      const run = await apiClient.getRecommendationRun(gId, runId);
      setSelectedRun(run);
      if (run.candidates && run.candidates.length > 0) {
        setSelectedCandidateId(run.candidates[0].id);
      }
    } catch (e: any) {
      setError(e?.message ?? `Failed to fetch run ${runId}`);
    }
  };

  // Create New Recommendation Run
  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGraphId) return;
    setIsCreatingRun(true);
    setError(null);
    try {
      const created = await apiClient.createRecommendationRun(selectedGraphId, {
        name: newRunName,
        description: newRunDescription || undefined,
        baseline_id: selectedBaselineId || undefined,
        max_candidates: maxCandidates,
        horizon_minutes: horizonMinutes,
        target_node_ids: targetNodeFilter ? [targetNodeFilter] : undefined,
      });

      // Reload runs list
      const rList = await apiClient.listRecommendationRuns(selectedGraphId, 1, 20);
      setRuns(rList.items || []);
      setSelectedRun(created);
      setActiveTab("OPTIMIZER");
    } catch (e: any) {
      setError(e?.message ?? "Failed to create recommendation run.");
    } finally {
      setIsCreatingRun(false);
    }
  };

  // Execute Selected Run
  const handleExecuteRun = async () => {
    if (!selectedGraphId || !selectedRun) return;
    setIsExecuting(true);
    setError(null);
    try {
      const updated = await apiClient.executeRecommendationRun(selectedGraphId, selectedRun.id);
      setSelectedRun(updated);
      if (updated.candidates && updated.candidates.length > 0) {
        setSelectedCandidateId(updated.candidates[0].id);
      }
      // Refresh run history
      const rList = await apiClient.listRecommendationRuns(selectedGraphId, 1, 20);
      setRuns(rList.items || []);
    } catch (e: any) {
      setError(e?.message ?? "Execution of recommendation optimization failed.");
    } finally {
      setIsExecuting(false);
    }
  };

  // Submit Decision
  const handleDecisionSubmit = async (
    decision: "APPROVED" | "REJECTED",
    notes: string,
    decidedBy: string
  ) => {
    if (!selectedGraphId || !selectedRun || !decisionModalCandidate) return;
    setIsSubmittingDecision(true);
    try {
      const updatedCand = await apiClient.recordCandidateDecision(
        selectedGraphId,
        selectedRun.id,
        decisionModalCandidate.id,
        {
          decision,
          notes: notes || undefined,
          decided_by: decidedBy || undefined,
        }
      );

      // Update candidate in local state
      setSelectedRun((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          candidates: prev.candidates.map((c) => (c.id === updatedCand.id ? updatedCand : c)),
        };
      });
      setDecisionModalCandidate(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to record human review decision.");
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // Filter candidates
  const filteredCandidates = (selectedRun?.candidates || []).filter((c) => {
    if (candidateFilter === "ELIGIBLE") return c.eligibility_status === "ELIGIBLE";
    if (candidateFilter === "INELIGIBLE") return c.eligibility_status === "INELIGIBLE";
    if (candidateFilter === "INDETERMINATE") return c.eligibility_status === "INDETERMINATE";
    return true;
  });

  const activeCandidate = selectedRun?.candidates.find((c) => c.id === selectedCandidateId);

  if (isLoading) {
    return <LoadingState message="Loading resilience recommendation workspace..." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ── SAFETY BANNER ────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.875rem",
          padding: "1rem 1.25rem",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "rgba(139, 92, 246, 0.08)",
          border: "1px solid rgba(139, 92, 246, 0.25)",
        }}
      >
        <span style={{ fontSize: "1.25rem", lineHeight: 1 }}>🛡️</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "#c4b5fd" }}>
              SAFETY BOUNDARY & HUMAN REVIEW GATE
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: "#a78bfa",
                backgroundColor: "rgba(139, 92, 246, 0.15)",
                padding: "0.15rem 0.5rem",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-mono)",
              }}
            >
              SIMULATION ONLY
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
            Intervention optimization identifies potential mitigations, strictly validates each candidate against deterministic safety constraints, and simulates outcomes using Phase 7 counterfactual branches. High rankings never imply automatic safety approval. Live infrastructure state remains strictly immutable.
          </p>
        </div>
      </div>

      {/* ── HEADER & GRAPH SELECTOR ──────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 0.375rem 0", color: "var(--color-text-primary)" }}>
            Intervention Recommendation Engine
          </h1>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
            Phase 8 — Deterministic Candidate Generation, Safety Enforcement & Counterfactual Validation
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div>
            <label htmlFor="graph-select" style={LABEL_STYLE}>Active Infrastructure Graph</label>
            <select
              id="graph-select"
              value={selectedGraphId}
              onChange={(e) => setSelectedGraphId(e.target.value)}
              style={{ ...INPUT_STYLE, minWidth: "240px" }}
            >
              {graphs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} (v{g.version})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <ErrorState
          title="Engine Error"
          message={error}
          onRetry={() => {
            setError(null);
            if (selectedGraphId) loadGraphContext(selectedGraphId);
          }}
        />
      )}

      {/* ── NAVIGATION TABS ──────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "1px solid var(--color-border-subtle)",
          paddingBottom: "0.25rem",
        }}
      >
        <button
          onClick={() => setActiveTab("OPTIMIZER")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius-md) var(--radius-md) 0 0",
            border: "none",
            backgroundColor: activeTab === "OPTIMIZER" ? "var(--color-bg-elevated)" : "transparent",
            color: activeTab === "OPTIMIZER" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            fontWeight: activeTab === "OPTIMIZER" ? 600 : 400,
            fontSize: "0.8125rem",
            cursor: "pointer",
            borderBottom: activeTab === "OPTIMIZER" ? "2px solid var(--color-accent)" : "2px solid transparent",
          }}
        >
          ✦ Optimizer & Candidates
        </button>
        <button
          onClick={() => setActiveTab("RUNS_HISTORY")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius-md) var(--radius-md) 0 0",
            border: "none",
            backgroundColor: activeTab === "RUNS_HISTORY" ? "var(--color-bg-elevated)" : "transparent",
            color: activeTab === "RUNS_HISTORY" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            fontWeight: activeTab === "RUNS_HISTORY" ? 600 : 400,
            fontSize: "0.8125rem",
            cursor: "pointer",
            borderBottom: activeTab === "RUNS_HISTORY" ? "2px solid var(--color-accent)" : "2px solid transparent",
          }}
        >
          📂 Runs History ({runs.length})
        </button>
        <button
          onClick={() => setActiveTab("POLICY")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius-md) var(--radius-md) 0 0",
            border: "none",
            backgroundColor: activeTab === "POLICY" ? "var(--color-bg-elevated)" : "transparent",
            color: activeTab === "POLICY" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            fontWeight: activeTab === "POLICY" ? 600 : 400,
            fontSize: "0.8125rem",
            cursor: "pointer",
            borderBottom: activeTab === "POLICY" ? "2px solid var(--color-accent)" : "2px solid transparent",
          }}
        >
          ⚖ Safety Constraints & Ranking Policy
        </button>
      </div>

      {/* ── TAB 1: OPTIMIZER & CANDIDATES ────────────────────────────── */}
      {activeTab === "OPTIMIZER" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Top Panel: Active Run Controls / Creation */}
          <Panel>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem 0", color: "var(--color-text-primary)" }}>
              Optimization Run Configuration
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
              <div>
                <label htmlFor="run-name-input" style={LABEL_STYLE}>Run Name</label>
                <input
                  id="run-name-input"
                  type="text"
                  value={newRunName}
                  onChange={(e) => setNewRunName(e.target.value)}
                  style={INPUT_STYLE}
                />
              </div>

              <div>
                <label htmlFor="baseline-select" style={LABEL_STYLE}>Anchor Baseline / Snapshot</label>
                <select
                  id="baseline-select"
                  value={selectedBaselineId}
                  onChange={(e) => setSelectedBaselineId(e.target.value)}
                  style={INPUT_STYLE}
                >
                  <option value="">Live Current State (Default)</option>
                  {baselines.map((b) => (
                    <option key={b.id} value={b.id}>
                      Baseline: {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="target-node-select" style={LABEL_STYLE}>Focus Node (Optional)</label>
                <select
                  id="target-node-select"
                  value={targetNodeFilter}
                  onChange={(e) => setTargetNodeFilter(e.target.value)}
                  style={INPUT_STYLE}
                >
                  <option value="">All Degraded / Affected Nodes</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} ({n.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="max-candidates-input" style={LABEL_STYLE}>Max Candidates (Bound: 1-30)</label>
                <input
                  id="max-candidates-input"
                  type="number"
                  min={1}
                  max={30}
                  value={maxCandidates}
                  onChange={(e) => setMaxCandidates(Number(e.target.value))}
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
              <Button
                variant="secondary"
                onClick={handleCreateRun}
                disabled={isCreatingRun || isExecuting}
              >
                {isCreatingRun ? "Creating..." : "⊕ Create New Run"}
              </Button>

              {selectedRun && selectedRun.status === "PENDING" && (
                <Button
                  variant="primary"
                  onClick={handleExecuteRun}
                  disabled={isExecuting}
                >
                  {isExecuting ? "Executing Optimization..." : "▶ Execute Run"}
                </Button>
              )}
            </div>
          </Panel>

          {/* Active Run Status & Summary Banner */}
          {selectedRun && (
            <div
              style={{
                padding: "1.25rem",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border-subtle)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0, color: "var(--color-text-primary)" }}>
                      {selectedRun.name}
                    </h2>
                    <Badge variant={selectedRun.status === "COMPLETED" ? "normal" : selectedRun.status === "FAILED" ? "critical" : "degraded"}>
                      {selectedRun.status}
                    </Badge>
                  </div>
                  {selectedRun.description && (
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
                      {selectedRun.description}
                    </p>
                  )}
                </div>

                {selectedRun.status === "PENDING" && (
                  <Button variant="primary" onClick={handleExecuteRun} disabled={isExecuting}>
                    {isExecuting ? "Optimizing..." : "▶ Execute Run Optimization"}
                  </Button>
                )}
              </div>

              {/* Summary Metrics */}
              {selectedRun.summary && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", marginTop: "0.75rem" }}>
                  <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg-base)", textAlign: "center" }}>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontWeight: 600 }}>TOTAL CANDIDATES</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
                      {(selectedRun.summary as any).total_candidates ?? selectedRun.candidates.length}
                    </div>
                  </div>
                  <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg-base)", textAlign: "center" }}>
                    <div style={{ fontSize: "0.6875rem", color: "#60a5fa", fontWeight: 600 }}>ELIGIBLE</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#60a5fa" }}>
                      {(selectedRun.summary as any).eligible_candidates ?? 0}
                    </div>
                  </div>
                  <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg-base)", textAlign: "center" }}>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-status-failed)", fontWeight: 600 }}>SAFETY BLOCKED</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-status-failed)" }}>
                      {(selectedRun.summary as any).ineligible_candidates ?? 0}
                    </div>
                  </div>
                  <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg-base)", textAlign: "center" }}>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-status-degraded)", fontWeight: 600 }}>INDETERMINATE</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-status-degraded)" }}>
                      {(selectedRun.summary as any).indeterminate_candidates ?? 0}
                    </div>
                  </div>
                  <div style={{ padding: "0.75rem", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg-base)", textAlign: "center" }}>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-status-normal)", fontWeight: 600 }}>TOP SCORE</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-status-normal)" }}>
                      {(selectedRun.summary as any).top_rank_score !== null && (selectedRun.summary as any).top_rank_score !== undefined
                        ? (selectedRun.summary as any).top_rank_score.toFixed(3)
                        : "N/A"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Candidate Split Layout: List (Left) + Detailed Evaluation (Right) */}
          {selectedRun && selectedRun.candidates.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
              {/* Left Column: Filterable Candidates List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    {(["ALL", "ELIGIBLE", "INELIGIBLE", "INDETERMINATE"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setCandidateFilter(f)}
                        style={{
                          padding: "0.25rem 0.625rem",
                          borderRadius: "var(--radius-sm)",
                          border: candidateFilter === f ? "1px solid var(--color-accent)" : "1px solid var(--color-border-subtle)",
                          backgroundColor: candidateFilter === f ? "rgba(99, 102, 241, 0.15)" : "transparent",
                          color: candidateFilter === f ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                    Showing {filteredCandidates.length} of {selectedRun.candidates.length}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", maxHeight: "650px", overflowY: "auto" }}>
                  {filteredCandidates.map((c) => {
                    const isSelected = c.id === selectedCandidateId;
                    return (
                      <div
                        key={c.id}
                        data-testid={`candidate-card-${c.id}`}
                        onClick={() => setSelectedCandidateId(c.id)}
                        style={{
                          padding: "0.875rem 1rem",
                          borderRadius: "var(--radius-md)",
                          backgroundColor: isSelected ? "var(--color-bg-elevated)" : "var(--color-bg-base)",
                          border: isSelected ? "1px solid var(--color-accent)" : "1px solid var(--color-border-subtle)",
                          cursor: "pointer",
                          transition: "all var(--duration-fast) var(--ease-default)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.375rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {c.rank_position ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  backgroundColor: "var(--color-accent)",
                                  color: "#fff",
                                  fontSize: "0.6875rem",
                                  fontWeight: 700,
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "var(--radius-sm)",
                                }}
                              >
                                #{c.rank_position}
                              </span>
                            ) : (
                              <span
                                style={{
                                  color: "var(--color-text-tertiary)",
                                  fontSize: "0.6875rem",
                                  fontWeight: 600,
                                }}
                              >
                                —
                              </span>
                            )}
                            <strong style={{ fontSize: "0.875rem", color: "var(--color-text-primary)" }}>
                              {c.title}
                            </strong>
                          </div>
                          <DecisionBadge status={c.decision_status} />
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                          <EligibilityBadge status={c.eligibility_status} />
                          <SafetyStatusBadge status={c.safety_status} />
                          {c.rank_score !== null && c.rank_score !== undefined && (
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                              Score: <strong>{c.rank_score.toFixed(3)}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Detailed Candidate Inspection & Human Review */}
              <div>
                {activeCandidate ? (
                  <Panel>
                    <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem 0", color: "var(--color-text-primary)" }}>
                      Candidate Detail: {activeCandidate.title}
                    </h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {/* Candidate Header & Decision Controls */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <EligibilityBadge status={activeCandidate.eligibility_status} />
                            <SafetyStatusBadge status={activeCandidate.safety_status} />
                            <DecisionBadge status={activeCandidate.decision_status} />
                          </div>
                          {activeCandidate.description && (
                            <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
                              {activeCandidate.description}
                            </p>
                          )}
                        </div>

                        <Button
                          variant="secondary"
                          onClick={() => setDecisionModalCandidate(activeCandidate)}
                        >
                          ⚖ Review / Decision
                        </Button>
                      </div>

                      {/* Ranking Breakdown */}
                      {activeCandidate.ranking_breakdown && Object.keys(activeCandidate.ranking_breakdown).length > 0 && (
                        <div
                          style={{
                            padding: "0.75rem 1rem",
                            borderRadius: "var(--radius-md)",
                            backgroundColor: "var(--color-bg-base)",
                            border: "1px solid var(--color-border-subtle)",
                          }}
                        >
                          <span style={LABEL_STYLE}>Transparent Ranking Metric Breakdown</span>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginTop: "0.375rem" }}>
                            <div>
                              <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>PREVENTION SCORE</div>
                              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-status-normal)" }}>
                                {(activeCandidate.ranking_breakdown as any).prevention_score !== undefined
                                  ? (activeCandidate.ranking_breakdown as any).prevention_score.toFixed(3)
                                  : "N/A"}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>BLAST RADIUS REDUCTION</div>
                              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#60a5fa" }}>
                                {(activeCandidate.ranking_breakdown as any).blast_radius_delta_nodes ?? "N/A"}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>NEW IMPACT PENALTY</div>
                              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-status-failed)" }}>
                                {(activeCandidate.ranking_breakdown as any).new_impact_penalty !== undefined
                                  ? (activeCandidate.ranking_breakdown as any).new_impact_penalty.toFixed(3)
                                  : "0.000"}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Hypothetical Proposed Changes */}
                      <div>
                        <span style={LABEL_STYLE}>Staged Changes</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginTop: "0.25rem" }}>
                          {activeCandidate.changes.map((ch: any, idx: number) => (
                            <div
                              key={idx}
                              style={{
                                padding: "0.5rem 0.75rem",
                                borderRadius: "var(--radius-sm)",
                                backgroundColor: "var(--color-bg-base)",
                                border: "1px solid var(--color-border-subtle)",
                                fontSize: "0.75rem",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              <strong>{ch.change_type}</strong> on {ch.target_type} ({ch.target_id}):{" "}
                              <span style={{ color: "var(--color-accent)" }}>{JSON.stringify(ch.proposed_value)}</span>
                              {ch.rationale && (
                                <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginTop: "0.15rem" }}>
                                  Rationale: {ch.rationale}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Safety Constraint Evaluation Audit List */}
                      <div>
                        <span style={LABEL_STYLE}>Deterministic Safety Constraint Evaluations</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginTop: "0.25rem" }}>
                          {activeCandidate.safety_evaluations && activeCandidate.safety_evaluations.length > 0 ? (
                            activeCandidate.safety_evaluations.map((evalItem: SafetyConstraintEvaluationResponse) => (
                              <div
                                key={evalItem.id}
                                style={{
                                  padding: "0.625rem 0.75rem",
                                  borderRadius: "var(--radius-sm)",
                                  backgroundColor: "var(--color-bg-base)",
                                  border: `1px solid ${
                                    evalItem.status === "PASSED"
                                      ? "rgba(34, 197, 94, 0.25)"
                                      : evalItem.status === "FAILED"
                                      ? "rgba(239, 68, 68, 0.25)"
                                      : "rgba(245, 158, 11, 0.25)"
                                  }`,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "0.25rem",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
                                    {evalItem.constraint_name}
                                  </span>
                                  <Badge variant={evalItem.status === "PASSED" ? "normal" : evalItem.status === "FAILED" ? "critical" : "degraded"}>
                                    {evalItem.status}
                                  </Badge>
                                </div>
                                {evalItem.rationale && (
                                  <span style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)" }}>
                                    {evalItem.rationale}
                                  </span>
                                )}
                              </div>
                            ))
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                              No constraint records logged yet.
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Phase 7 Counterfactual Link */}
                      {activeCandidate.counterfactual_experiment_id && (
                        <div
                          style={{
                            padding: "0.75rem",
                            borderRadius: "var(--radius-md)",
                            backgroundColor: "rgba(99, 102, 241, 0.08)",
                            border: "1px solid rgba(99, 102, 241, 0.25)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
                              Counterfactual Simulation Evidence
                            </span>
                            <div style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)" }}>
                              Exp ID: {activeCandidate.counterfactual_experiment_id}
                            </div>
                          </div>
                          <Link
                            href={`/app/interventions?experiment_id=${activeCandidate.counterfactual_experiment_id}`}
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--color-accent)",
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
                          >
                            View Simulation Differential →
                          </Link>
                        </div>
                      )}

                      {/* Human Decision Audit Trail */}
                      {activeCandidate.decided_at && (
                        <div
                          style={{
                            padding: "0.75rem",
                            borderRadius: "var(--radius-md)",
                            backgroundColor: "var(--color-bg-base)",
                            border: "1px solid var(--color-border-subtle)",
                            fontSize: "0.75rem",
                          }}
                        >
                          <span style={LABEL_STYLE}>Human Review Audit Record</span>
                          <div style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
                            {activeCandidate.decision_status} by {activeCandidate.decided_by || "Unknown Reviewer"}
                          </div>
                          <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.6875rem" }}>
                            Timestamp: {new Date(activeCandidate.decided_at).toLocaleString()}
                          </div>
                          {activeCandidate.decision_notes && (
                            <div style={{ marginTop: "0.375rem", color: "var(--color-text-secondary)" }}>
                              Review notes: &ldquo;{activeCandidate.decision_notes}&rdquo;
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Panel>
                ) : (
                  <EmptyState title="No candidate selected" description="Select a candidate intervention on the left to inspect its safety constraints, ranking details, and record a review decision." />
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              title={selectedRun ? "Run has no candidates generated yet" : "No recommendation runs found"}
              description={selectedRun ? "Click 'Execute Run' to start candidate generation and safety constraint optimization." : "Configure parameters above and click 'Create New Run'."}
            />
          )}
        </div>
      )}

      {/* ── TAB 2: RUNS HISTORY ──────────────────────────────────────── */}
      {activeTab === "RUNS_HISTORY" && (
        <Panel>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem 0", color: "var(--color-text-primary)" }}>
            Historical Recommendation Runs
          </h2>
          {runs.length === 0 ? (
            <EmptyState title="No past runs" description="No optimization runs have been executed for this graph yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {runs.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1rem",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-bg-base)",
                    border: "1px solid var(--color-border-subtle)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <strong style={{ fontSize: "0.875rem", color: "var(--color-text-primary)" }}>{r.name}</strong>
                      <Badge variant={r.status === "COMPLETED" ? "normal" : r.status === "FAILED" ? "critical" : "degraded"}>
                        {r.status}
                      </Badge>
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>
                      Created: {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (selectedGraphId) loadRunDetails(selectedGraphId, r.id);
                      setActiveTab("OPTIMIZER");
                    }}
                  >
                    Inspect Run →
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* ── TAB 3: SAFETY POLICY & CONSTRAINTS ───────────────────────── */}
      {activeTab === "POLICY" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Panel>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--color-text-primary)" }}>
              Phase 8 Formal Safety Constraints
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 1rem 0" }}>
              Before any candidate intervention is validated via counterfactual cascade simulation, it must deterministically pass all active safety constraints. Any failure permanently marks the candidate as <code>INELIGIBLE</code>. High candidate rankings <strong>never</strong> override safety constraints.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              <div style={{ padding: "0.875rem", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)" }}>
                <strong style={{ color: "var(--color-text-primary)", fontSize: "0.8125rem" }}>1. Protected Node Health Floor</strong>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                  Ensures critical infrastructure nodes never have their health lowered below a strict floor (default 0.20).
                </p>
              </div>
              <div style={{ padding: "0.875rem", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)" }}>
                <strong style={{ color: "var(--color-text-primary)", fontSize: "0.8125rem" }}>2. Bounded Parameter Range Guard</strong>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                  Validates all continuous metrics (health, capacity, availability) strictly remain within normalized boundaries [0.0, 1.0].
                </p>
              </div>
              <div style={{ padding: "0.875rem", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)" }}>
                <strong style={{ color: "var(--color-text-primary)", fontSize: "0.8125rem" }}>3. Severance Criticality Guard</strong>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                  Prohibits severing required dependencies unless the upstream source node is actively failed.
                </p>
              </div>
              <div style={{ padding: "0.875rem", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)" }}>
                <strong style={{ color: "var(--color-text-primary)", fontSize: "0.8125rem" }}>4. Cross-Graph Mutation Ban</strong>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                  Strictly rejects interventions referencing nodes or dependencies outside the target graph boundary.
                </p>
              </div>
            </div>
          </Panel>

          <Panel>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--color-text-primary)" }}>
              Transparent Multi-Objective Ranking Formula
            </h2>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              <p style={{ margin: "0 0 0.5rem 0" }}>
                Eligible candidates are ranked by a deterministic utility function combining cascade blast radius reduction, prevented nodes, and secondary new-impact penalties:
              </p>
              <pre
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-bg-base)",
                  border: "1px solid var(--color-border-subtle)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: "#c4b5fd",
                  overflowX: "auto",
                }}
              >
{`RankScore = 0.50 * (prevented_nodes / max(baseline_affected, 1))
          + 0.30 * max(0, (baseline_blast_radius - cf_blast_radius) / max(baseline_blast_radius, 1))
          - 0.20 * (newly_affected_nodes / max(total_nodes, 1))
Score is clamped to [0.0, 1.0]. Tied scores share equal rank positions.`}
              </pre>
            </div>
          </Panel>
        </div>
      )}

      {/* ── HUMAN DECISION MODAL ─────────────────────────────────────── */}
      {decisionModalCandidate && (
        <DecisionModal
          candidate={decisionModalCandidate}
          onClose={() => setDecisionModalCandidate(null)}
          onSubmit={handleDecisionSubmit}
          isSubmitting={isSubmittingDecision}
        />
      )}
    </div>
  );
}
