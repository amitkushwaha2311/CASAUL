"use client";

/**
 * CAUSAL — Phase 5: Evidence-Backed Causal Reasoning Engine Explorer
 *
 * Provides:
 * - Graph and affected node selection
 * - Run causal inference with explainable rules
 * - Hypotheses cards with qualitative status (SUPPORTED, POSSIBLE, CONTRADICTED, INSUFFICIENT_EVIDENCE)
 * - Traceable supporting and contradicting evidence tables with record IDs and sources
 * - Explicit missing information, unverified assumptions, and uncertainty warnings
 * - Competing explanation comparisons
 * - Clear disclaimer: Hypotheses are candidate explanations, not confirmed root causes
 */

import React, { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type {
  GraphResponse,
  NodeResponse,
  HypothesisResponse,
  EvidenceItemResponse,
  HypothesisStatus,
} from "@causal/shared/src/index";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_CONFIG: Record<
  HypothesisStatus,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  SUPPORTED: {
    label: "Supported",
    bg: "rgba(16, 185, 129, 0.12)",
    text: "#10b981",
    border: "rgba(16, 185, 129, 0.35)",
    desc: "Observed evidence is consistent with this mechanism with verified precedence.",
  },
  POSSIBLE: {
    label: "Possible",
    bg: "rgba(245, 158, 11, 0.12)",
    text: "#f59e0b",
    border: "rgba(245, 158, 11, 0.35)",
    desc: "Plausible candidate mechanism; key telemetry or history is incomplete.",
  },
  CONTRADICTED: {
    label: "Contradicted",
    bg: "rgba(239, 68, 68, 0.12)",
    text: "#ef4444",
    border: "rgba(239, 68, 68, 0.35)",
    desc: "Contradicted by direct observations or telemetry confirming operational normality.",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient Evidence",
    bg: "rgba(100, 116, 139, 0.15)",
    text: "#94a3b8",
    border: "rgba(100, 116, 139, 0.35)",
    desc: "Available observations do not contain sufficient data to evaluate this pathway.",
  },
};

export default function CausalReasoningPage() {
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<NodeResponse[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");

  const [hypotheses, setHypotheses] = useState<HypothesisResponse[]>([]);
  const [selectedHypothesis, setSelectedHypothesis] = useState<HypothesisResponse | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItemResponse[]>([]);

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Load graphs
  useEffect(() => {
    apiClient
      .listGraphs()
      .then((g) => {
        setGraphs(g);
        if (g.length > 0) {
          setSelectedGraphId(g[0].id);
        }
      })
      .catch((err) => setError(err.message || "Failed to load graphs"))
      .finally(() => setLoading(false));
  }, []);

  // Load nodes and existing hypotheses when graph changes
  const loadGraphData = useCallback(async (graphId: string) => {
    try {
      const [nList, hList] = await Promise.all([
        apiClient.listNodes(graphId),
        apiClient.listHypotheses(graphId),
      ]);
      setNodes(nList);
      if (nList.length > 0) {
        setSelectedNodeId(nList[0].id);
      }
      setHypotheses(hList);
      if (hList.length > 0) {
        setSelectedHypothesis(hList[0]);
      } else {
        setSelectedHypothesis(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load graph nodes";
      setError(msg);
    }
  }, []);

  useEffect(() => {
    if (selectedGraphId) {
      loadGraphData(selectedGraphId);
    }
  }, [selectedGraphId, loadGraphData]);


  // Load evidence whenever selected hypothesis changes
  useEffect(() => {
    if (selectedGraphId && selectedHypothesis) {
      setEvidenceLoading(true);
      apiClient
        .getHypothesisEvidence(selectedGraphId, selectedHypothesis.id)
        .then((evs) => setSelectedEvidence(evs))
        .catch(() => setSelectedEvidence([]))
        .finally(() => setEvidenceLoading(false));
    } else {
      setSelectedEvidence([]);
    }
  }, [selectedGraphId, selectedHypothesis]);

  // Trigger Causal Inference
  const handleRunAnalysis = async () => {
    if (!selectedGraphId || !selectedNodeId) return;
    setAnalyzing(true);
    setError(null);
    try {
      const runRes = await apiClient.analyzeCausal(selectedGraphId, {
        affected_node_id: selectedNodeId,
      });
      setHypotheses(runRes.hypotheses);
      if (runRes.hypotheses.length > 0) {
        setSelectedHypothesis(runRes.hypotheses[0]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Causal analysis failed";
      setError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const filteredHypotheses = hypotheses.filter((h) => {
    if (filterStatus === "ALL") return true;
    return h.status === filterStatus;
  });

  if (loading) {
    return <LoadingState message="Loading Causal Reasoning Engine..." />;
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1600px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
              Causal Reasoning Engine
            </h1>
            <Badge variant="info">Phase 5</Badge>
          </div>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
            Deterministic, evidence-backed hypothesis generation with verifiable traceability.
          </p>
        </div>

        {/* Graph & Node selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <select
            id="causal-graph-select"
            value={selectedGraphId || ""}
            onChange={(e) => {
              setSelectedGraphId(e.target.value);
              setSelectedNodeId("");
            }}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-bg-surface)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-subtle)",
              fontSize: "0.875rem",
            }}
          >
            {graphs.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <select
            id="causal-node-select"
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-bg-surface)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-subtle)",
              fontSize: "0.875rem",
            }}
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.state})
              </option>
            ))}
          </select>

          <Button
            id="btn-run-analysis"
            onClick={handleRunAnalysis}
            disabled={analyzing || !selectedNodeId}
          >
            {analyzing ? "Analyzing..." : "Analyze Affected Node"}
          </Button>
        </div>
      </div>

      {/* Critical Epistemological Disclaimer */}
      <div
        style={{
          padding: "0.875rem 1.25rem",
          marginBottom: "1.5rem",
          backgroundColor: "rgba(169, 154, 128, 0.08)",
          border: "1px solid rgba(169, 154, 128, 0.25)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
        }}
      >
        <span style={{ fontSize: "1.25rem", lineHeight: 1 }}>ℹ</span>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--color-text-primary)" }}>Epistemological Notice: </strong>
          Hypotheses are candidate explanatory models grounded in observable telemetry and dependency graph topology.
          Temporal precedence and dependency edges support hypotheses but do not establish definitive root causation.
          No probabilities are invented.
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: "1.5rem" }}>
          <ErrorState message={error} onRetry={() => selectedGraphId && loadGraphData(selectedGraphId)} />
        </div>
      )}

      {/* Main Analysis Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.3fr",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Left Column: Hypotheses List */}
        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border-subtle)",
            padding: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>
              Generated Hypotheses ({filteredHypotheses.length})
            </h2>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                fontSize: "0.75rem",
                padding: "0.25rem 0.5rem",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)",
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="SUPPORTED">Supported</option>
              <option value="POSSIBLE">Possible</option>
              <option value="CONTRADICTED">Contradicted</option>
              <option value="INSUFFICIENT_EVIDENCE">Insufficient Evidence</option>
            </select>
          </div>

          {filteredHypotheses.length === 0 ? (
            <EmptyState
              title="No Hypotheses Generated"
              description="Run causal analysis on an affected node to evaluate candidate explanatory hypotheses against traceable evidence."
              action={{
                label: analyzing ? "Running..." : "Run Causal Analysis",
                onClick: handleRunAnalysis,
              }}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {filteredHypotheses.map((h) => {
                const cfg = STATUS_CONFIG[h.status] || STATUS_CONFIG.INSUFFICIENT_EVIDENCE;
                const isSelected = selectedHypothesis?.id === h.id;

                return (
                  <div
                    key={h.id}
                    onClick={() => setSelectedHypothesis(h)}
                    style={{
                      padding: "1rem",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: isSelected
                        ? "var(--color-bg-elevated)"
                        : "var(--color-bg-secondary)",
                      border: isSelected
                        ? "1px solid var(--color-accent)"
                        : "1px solid var(--color-border-subtle)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "0.2rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: cfg.bg,
                          color: cfg.text,
                          border: `1px solid ${cfg.border}`,
                        }}
                      >
                        {cfg.label}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                        Completeness: {(h.evidence_completeness * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                      {h.hypothesis_type.replace(/_/g, " ")}: {h.candidate_cause_factor}
                    </div>

                    <p
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.4,
                        marginBottom: "0.5rem",
                      }}
                    >
                      {h.explanation}
                    </p>

                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                      Rule: <code>{h.inference_rule_id}</code> (v{h.rule_version})
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Hypothesis Detail & Traceable Evidence */}
        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border-subtle)",
            padding: "1.25rem",
          }}
        >
          {selectedHypothesis ? (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  paddingBottom: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <h2 style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                    Hypothesis Detail & Evidence Trail
                  </h2>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>
                    ID: {selectedHypothesis.id}
                  </div>
                </div>

                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.625rem",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: STATUS_CONFIG[selectedHypothesis.status].bg,
                    color: STATUS_CONFIG[selectedHypothesis.status].text,
                    border: `1px solid ${STATUS_CONFIG[selectedHypothesis.status].border}`,
                  }}
                >
                  {STATUS_CONFIG[selectedHypothesis.status].label}
                </span>
              </div>

              {/* Explanation & Reasoning Path */}
              <div style={{ marginBottom: "1.25rem" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                  Inference Explanation
                </h3>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                  {selectedHypothesis.explanation}
                </p>
              </div>

              {/* Distinguishing Information */}
              {selectedHypothesis.distinguishing_information && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    backgroundColor: "var(--color-bg-elevated)",
                    borderRadius: "var(--radius-md)",
                    marginBottom: "1.25rem",
                    borderLeft: "3px solid var(--color-accent)",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    Distinguishing Information for Competing Hypotheses:
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
                    {selectedHypothesis.distinguishing_information}
                  </div>
                </div>
              )}

              {/* Unresolved Assumptions & Missing Evidence */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "var(--color-bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border-subtle)",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "0.375rem" }}>
                    Unresolved Assumptions ({selectedHypothesis.unresolved_assumptions.length})
                  </div>
                  {selectedHypothesis.unresolved_assumptions.length === 0 ? (
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>None recorded.</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                      {selectedHypothesis.unresolved_assumptions.map((u, i) => (
                        <li key={i}>{u}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "var(--color-bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border-subtle)",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "0.375rem" }}>
                    Missing Evidence ({selectedHypothesis.missing_evidence.length})
                  </div>
                  {selectedHypothesis.missing_evidence.length === 0 ? (
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>None recorded.</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.75rem", color: "var(--color-status-degraded)" }}>
                      {selectedHypothesis.missing_evidence.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Traceable Evidence Items */}
              <div>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Traceable Evidence Trail ({selectedEvidence.length})
                </h3>

                {evidenceLoading ? (
                  <div style={{ padding: "1rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.8125rem" }}>
                    Loading traceable evidence records...
                  </div>
                ) : selectedEvidence.length === 0 ? (
                  <div style={{ padding: "1rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.8125rem" }}>
                    No direct records linked to this hypothesis.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border-subtle)", textAlign: "left", color: "var(--color-text-tertiary)" }}>
                          <th style={{ padding: "0.5rem" }}>Direction</th>
                          <th style={{ padding: "0.5rem" }}>Record Type</th>
                          <th style={{ padding: "0.5rem" }}>Record ID</th>
                          <th style={{ padding: "0.5rem" }}>Observed At</th>
                          <th style={{ padding: "0.5rem" }}>Confidence</th>
                          <th style={{ padding: "0.5rem" }}>Relevance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEvidence.map((ev) => (
                          <tr
                            key={ev.id}
                            style={{
                              borderBottom: "1px solid var(--color-border-subtle)",
                              backgroundColor:
                                ev.direction === "CONTRADICTING"
                                  ? "rgba(239, 68, 68, 0.05)"
                                  : ev.direction === "SUPPORTING"
                                  ? "rgba(16, 185, 129, 0.05)"
                                  : "transparent",
                            }}
                          >
                            <td style={{ padding: "0.5rem" }}>
                              <span
                                style={{
                                  fontWeight: 600,
                                  color:
                                    ev.direction === "SUPPORTING"
                                      ? "#10b981"
                                      : ev.direction === "CONTRADICTING"
                                      ? "#ef4444"
                                      : "var(--color-text-tertiary)",
                                }}
                              >
                                {ev.direction}
                              </span>
                            </td>
                            <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>
                              {ev.record_type}
                            </td>
                            <td
                              style={{
                                padding: "0.5rem",
                                fontFamily: "monospace",
                                color: "var(--color-text-secondary)",
                              }}
                              title={ev.record_id}
                            >
                              {ev.record_id.slice(0, 8)}...
                            </td>
                            <td style={{ padding: "0.5rem", color: "var(--color-text-secondary)" }}>
                              {ev.observed_at ? new Date(ev.observed_at).toLocaleTimeString() : "—"}
                            </td>
                            <td style={{ padding: "0.5rem" }}>
                              {ev.confidence !== null && ev.confidence !== undefined
                                ? `${(ev.confidence * 100).toFixed(0)}%`
                                : "Unknown"}
                            </td>
                            <td style={{ padding: "0.5rem", color: "var(--color-text-secondary)" }}>
                              {ev.relevance_explanation}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-tertiary)" }}>
              Select a hypothesis to inspect its supporting and contradicting evidence trail.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
