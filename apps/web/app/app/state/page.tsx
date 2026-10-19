"use client";

/**
 * CAUSAL — Phase 4: System State & Digital Twin Explorer
 *
 * Provides:
 * - Graph selection and digital twin overview
 * - Current state summary metrics
 * - Node state grid with health, capacity, availability, confidence, and consistency
 * - Node detail side panel with state history and auditable provenance
 * - Baseline capture and selection
 * - Snapshot listing and capture
 * - State comparison view (baseline vs current, snapshot vs current)
 * - Historical state reconstruction at timestamp
 * - Consistency rule validation indicators
 */

import React, { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { formatUtcDateTime } from "@/lib/telemetry-freshness";
import type {
  CurrentGraphStateResponse,
  NodeStateDetail,
  StateHistoryResponse,
  SystemStateSummaryResponse,
  StateConsistencyResponse,
  BaselineResponse,
  SnapshotResponse,
  StateComparisonResponse,
  StateReconstructionResponse,
} from "@causal/shared/src/index";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NORMAL: { bg: "rgba(130, 151, 125, 0.12)", text: "var(--color-status-healthy)", border: "rgba(130, 151, 125, 0.3)" },
  DEGRADED: { bg: "rgba(185, 149, 91, 0.12)", text: "var(--color-status-degraded)", border: "rgba(185, 149, 91, 0.3)" },
  CRITICAL: { bg: "rgba(155, 69, 64, 0.14)", text: "var(--color-status-critical)", border: "rgba(155, 69, 64, 0.3)" },
  FAILED: { bg: "rgba(155, 69, 64, 0.18)", text: "var(--color-status-failed)", border: "rgba(155, 69, 64, 0.4)" },
  RECOVERING: { bg: "rgba(169, 154, 128, 0.14)", text: "var(--color-status-recovering)", border: "rgba(169, 154, 128, 0.3)" },
  UNKNOWN: { bg: "rgba(100, 116, 139, 0.1)", text: "var(--color-status-unknown)", border: "rgba(100, 116, 139, 0.3)" },
};

export default function DigitalTwinPage() {
  const [graphs, setGraphs] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);

  const [graphState, setGraphState] = useState<CurrentGraphStateResponse | null>(null);
  const [summary, setSummary] = useState<SystemStateSummaryResponse | null>(null);
  const [consistency, setConsistency] = useState<StateConsistencyResponse | null>(null);
  const [baselines, setBaselines] = useState<BaselineResponse[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotResponse[]>([]);

  const [selectedNode, setSelectedNode] = useState<NodeStateDetail | null>(null);
  const [nodeHistory, setNodeHistory] = useState<StateHistoryResponse[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [comparison, setComparison] = useState<StateComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  const [reconstruction, setReconstruction] = useState<StateReconstructionResponse | null>(null);
  const [reconTimestamp, setReconTimestamp] = useState<string>("");
  const [reconLoading, setReconLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"nodes" | "comparison" | "reconstruction" | "baselines">("nodes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Baseline form
  const [newBaselineName, setNewBaselineName] = useState("");
  const [isCapturingBaseline, setIsCapturingBaseline] = useState(false);

  // Initial load
  useEffect(() => {
    apiClient
      .listGraphs()
      .then((g) => {
        setGraphs(g);
        if (g.length > 0) setSelectedGraphId(g[0].id);
      })
      .catch((err) => setError(err.message || "Failed to load graphs"));
  }, []);

  const loadGraphData = useCallback(async (graphId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [gState, sum, cons, bls, snaps] = await Promise.all([
        apiClient.getGraphState(graphId),
        apiClient.getSystemStateSummary(graphId),
        apiClient.getStateConsistency(graphId),
        apiClient.listBaselines(graphId),
        apiClient.listSnapshots(graphId),
      ]);
      setGraphState(gState);
      setSummary(sum);
      setConsistency(cons);
      setBaselines(bls);
      setSnapshots(snaps);

      // Select first node by default if none selected
      if (gState.nodes.length > 0 && !selectedNode) {
        setSelectedNode(gState.nodes[0]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load digital twin data");
    } finally {
      setLoading(false);
    }
  }, [selectedNode]);

  useEffect(() => {
    if (selectedGraphId) {
      loadGraphData(selectedGraphId);
    }
  }, [selectedGraphId, loadGraphData]);

  // Load node history when node is selected
  useEffect(() => {
    if (!selectedGraphId || !selectedNode) return;
    setHistoryLoading(true);
    apiClient
      .getNodeStateHistory(selectedGraphId, selectedNode.node_id)
      .then((h) => setNodeHistory(h))
      .catch(() => setNodeHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [selectedGraphId, selectedNode]);

  const handleCaptureBaseline = async () => {
    if (!selectedGraphId || !newBaselineName.trim()) return;
    setIsCapturingBaseline(true);
    try {
      await apiClient.createBaseline(selectedGraphId, {
        name: newBaselineName.trim(),
        is_active: true,
      });
      setNewBaselineName("");
      const bls = await apiClient.listBaselines(selectedGraphId);
      setBaselines(bls);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to capture baseline");
    } finally {
      setIsCapturingBaseline(false);
    }
  };

  const handleCompareBaseline = async (baselineId: string) => {
    if (!selectedGraphId) return;
    setComparisonLoading(true);
    try {
      const res = await apiClient.compareBaselineVsCurrent(selectedGraphId, baselineId);
      setComparison(res);
      setActiveTab("comparison");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setComparisonLoading(false);
    }
  };

  const handleReconstruct = async () => {
    if (!selectedGraphId || !reconTimestamp) return;
    setReconLoading(true);
    try {
      const res = await apiClient.reconstructGraphStateAt(selectedGraphId, reconTimestamp);
      setReconstruction(res);
      setActiveTab("reconstruction");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Reconstruction failed");
    } finally {
      setReconLoading(false);
    }
  };

  if (loading && !graphState) {
    return <LoadingState message="Connecting to Digital Twin State Engine..." />;
  }

  if (error && !graphState) {
    return <ErrorState message={error} onRetry={() => selectedGraphId && loadGraphData(selectedGraphId)} />;
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1600px", margin: "0 auto", color: "var(--color-text-primary)" }}>
      {/* ── Header & Graph Selector ────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "1.5rem" }}>⎈</span>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>System State & Digital Twin</h1>
            <Badge variant="info">Phase 4</Badge>
          </div>

          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            Deterministic state representation over time • Auditable provenance • Zero causal speculation
          </p>
        </div>

        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {graphs.length > 0 && (
            <select
              value={selectedGraphId || ""}
              onChange={(e) => setSelectedGraphId(e.target.value)}
              style={{
                backgroundColor: "var(--color-bg-surface)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "0.5rem 0.75rem",
                fontSize: "0.875rem",
              }}
            >
              {graphs.map((g) => (
                <option key={g.id} value={g.id}>
                  Graph: {g.name}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => selectedGraphId && loadGraphData(selectedGraphId)}
          >
            ↻ Refresh State
          </Button>
        </div>
      </div>

      {/* ── State Summary Metrics Bar ──────────────────────────────────── */}
      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ backgroundColor: "var(--color-bg-surface)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-subtle)" }}>
            <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.75rem", fontWeight: 600 }}>TOTAL NODES</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>{summary.total_nodes}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
              {summary.nodes_with_known_state} known / {summary.nodes_with_unknown_state} unknown
            </div>
          </div>

          <div style={{ backgroundColor: "var(--color-bg-surface)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-subtle)" }}>
            <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.75rem", fontWeight: 600 }}>AVERAGE HEALTH</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem", color: (summary.average_health != null && summary.average_health < 0.7) ? "var(--color-status-degraded)" : "var(--color-status-healthy)" }}>
              {summary.average_health != null ? `${(summary.average_health * 100).toFixed(1)}%` : "UNKNOWN"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
              n = {summary.health_denominator} nodes evaluated
            </div>
          </div>

          <div style={{ backgroundColor: "var(--color-bg-surface)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-subtle)" }}>
            <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.75rem", fontWeight: 600 }}>AVERAGE CAPACITY</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
              {summary.average_capacity != null ? `${(summary.average_capacity * 100).toFixed(1)}%` : "UNKNOWN"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
              n = {summary.capacity_denominator} nodes evaluated
            </div>
          </div>


          <div style={{ backgroundColor: "var(--color-bg-surface)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-subtle)" }}>
            <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.75rem", fontWeight: 600 }}>CONSISTENCY STATUS</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem" }}>
              {consistency?.status === "VALID" && <span style={{ color: "var(--color-status-healthy)" }}>✓ VALID</span>}
              {consistency?.status === "WARNING" && <span style={{ color: "var(--color-status-degraded)" }}>⚠ {consistency.warning_count} WARNINGS</span>}
              {consistency?.status === "INVALID" && <span style={{ color: "var(--color-status-critical)" }}>✕ {consistency.invalid_count} INVALID</span>}
              {consistency?.status === "UNKNOWN" && <span style={{ color: "var(--color-status-unknown)" }}>? UNKNOWN</span>}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
              Completeness: {(summary.completeness_ratio * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      )}

      {/* ── Sub Navigation Tabs ────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--color-border-subtle)", marginBottom: "1.5rem" }}>
        {[
          { id: "nodes", label: "Live Nodes & Provenance" },
          { id: "baselines", label: "Baselines & Snapshots" },
          { id: "comparison", label: "State Comparison" },
          { id: "reconstruction", label: "Historical Reconstruction" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            style={{
              padding: "0.625rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === t.id ? "2px solid var(--color-accent)" : "2px solid transparent",
              color: activeTab === t.id ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              fontWeight: activeTab === t.id ? 600 : 400,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: Live Nodes & Provenance ─────────────────────────────── */}
      {activeTab === "nodes" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "1.5rem" }}>
          {/* Node Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", alignContent: "start" }}>
            {graphState?.nodes.map((n) => {
              const sc = STATE_COLORS[n.state] || STATE_COLORS.UNKNOWN;
              const isSelected = selectedNode?.node_id === n.node_id;

              return (
                <div
                  key={n.node_id}
                  onClick={() => setSelectedNode(n)}
                  style={{
                    backgroundColor: "var(--color-bg-surface)",
                    padding: "1rem",
                    borderRadius: "var(--radius-md)",
                    border: isSelected ? "2px solid var(--color-accent)" : "1px solid var(--color-border-subtle)",
                    cursor: "pointer",
                    transition: "all var(--duration-fast)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{n.node_name}</div>
                    <span
                      style={{
                        backgroundColor: sc.bg,
                        color: sc.text,
                        border: `1px solid ${sc.border}`,
                        padding: "0.125rem 0.5rem",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                      }}
                    >
                      {n.state}
                    </span>
                  </div>

                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
                    Type: {n.node_type} • Criticality: {n.criticality}
                  </div>

                  {/* Health Bar */}
                  <div style={{ marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>Health</span>
                      <span>{n.health !== null ? `${(n.health * 100).toFixed(0)}%` : "Unknown"}</span>
                    </div>
                    <div style={{ width: "100%", height: "4px", backgroundColor: "var(--color-bg-elevated)", borderRadius: "2px", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${(n.health ?? 0) * 100}%`,
                          height: "100%",
                          backgroundColor: n.health !== null && n.health < 0.5 ? "var(--color-status-critical)" : "var(--color-status-healthy)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Capacity Bar */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>Capacity</span>
                      <span>{n.capacity !== null ? `${(n.capacity * 100).toFixed(0)}%` : "Unknown"}</span>
                    </div>
                    <div style={{ width: "100%", height: "4px", backgroundColor: "var(--color-bg-elevated)", borderRadius: "2px", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${(n.capacity ?? 0) * 100}%`,
                          height: "100%",
                          backgroundColor: "var(--color-accent)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Consistency note if warning/invalid */}
                  {n.consistency_status !== "VALID" && (
                    <div style={{ marginTop: "0.75rem", fontSize: "0.6875rem", color: n.consistency_status === "INVALID" ? "var(--color-status-critical)" : "var(--color-status-degraded)" }}>
                      Rule: {n.consistency_status}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Node Inspector Side Panel */}
          {selectedNode ? (
            <div
              style={{
                backgroundColor: "var(--color-bg-surface)",
                padding: "1.25rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <div>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>{selectedNode.node_name}</h3>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                  ID: {selectedNode.node_id}
                </div>
              </div>

              {/* Provenance Box */}
              <div
                style={{
                  backgroundColor: "var(--color-bg-elevated)",
                  padding: "0.875rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8125rem",
                }}
              >
                <div style={{ fontWeight: 600, color: "var(--color-accent)", marginBottom: "0.375rem" }}>
                  State Provenance
                </div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: "0.75rem", lineHeight: 1.6 }}>
                  <div>Source: <strong>{selectedNode.provenance?.source ?? selectedNode.source ?? "unknown"}</strong></div>
                  <div>Type: <strong>{selectedNode.provenance?.source_type ?? "direct"}</strong></div>
                  <div>Confidence: <strong>{selectedNode.confidence !== null ? `${(selectedNode.confidence * 100).toFixed(0)}%` : "Unknown (unassessed)"}</strong></div>
                  <div>Last Observed: <strong>{selectedNode.last_observed_at ? formatUtcDateTime(new Date(selectedNode.last_observed_at)) : "Never"}</strong></div>
                  {selectedNode.provenance?.observation_id && (
                    <div>Observation ID: <code>{selectedNode.provenance.observation_id.slice(0, 8)}...</code></div>
                  )}
                </div>
              </div>

              {/* State History Audit Log */}
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  State Audit History
                </div>
                {historyLoading ? (
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Loading history...</div>
                ) : nodeHistory.length === 0 ? (
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>No historical updates recorded.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "300px", overflowY: "auto" }}>
                    {nodeHistory.map((h) => (
                      <div
                        key={h.id}
                        style={{
                          backgroundColor: "var(--color-bg-base)",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.75rem",
                          borderLeft: "3px solid var(--color-border-strong)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <strong>{h.state || h.metric}</strong>
                          <span style={{ color: "var(--color-text-tertiary)" }}>
                            {formatUtcDateTime(new Date(h.observed_at))}
                          </span>
                        </div>
                        <div style={{ color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                          Health: {h.health ?? "N/A"} • Source: {h.source}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.875rem" }}>Select a node to inspect.</div>
          )}
        </div>
      )}

      {/* ── TAB 2: Baselines & Snapshots ──────────────────────────────── */}
      {activeTab === "baselines" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {/* Baselines Section */}
          <div style={{ backgroundColor: "var(--color-bg-surface)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-subtle)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>Recorded Baselines</h3>

            {/* Capture Baseline */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <input
                type="text"
                placeholder="Baseline name (e.g. Reference Healthy 1.0)"
                value={newBaselineName}
                onChange={(e) => setNewBaselineName(e.target.value)}
                style={{
                  flex: 1,
                  backgroundColor: "var(--color-bg-base)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.5rem",
                  color: "var(--color-text-primary)",
                  fontSize: "0.875rem",
                }}
              />
              <Button size="sm" onClick={handleCaptureBaseline} disabled={isCapturingBaseline || !newBaselineName.trim()}>
                {isCapturingBaseline ? "Capturing..." : "+ Capture"}
              </Button>
            </div>

            {baselines.length === 0 ? (
              <EmptyState title="No Baselines" description="Capture a baseline to compare future state deviations." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {baselines.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      backgroundColor: "var(--color-bg-base)",
                      padding: "0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: b.is_active ? "1px solid var(--color-status-healthy)" : "1px solid var(--color-border-subtle)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{b.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                        Captured: {new Date(b.captured_at).toLocaleString()} • {b.node_count} nodes
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => handleCompareBaseline(b.id)}>
                      Compare vs Live
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Snapshots Section */}
          <div style={{ backgroundColor: "var(--color-bg-surface)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-subtle)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>System Snapshots</h3>

            {snapshots.length === 0 ? (
              <EmptyState title="No Snapshots" description="Snapshots save system state at logical points in time." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {snapshots.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      backgroundColor: "var(--color-bg-base)",
                      padding: "0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{s.name || `Snapshot ${s.id.slice(0, 8)}`}</div>
                      <Badge variant="info">{s.snapshot_type}</Badge>
                    </div>

                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                      Effective: {new Date(s.effective_at).toLocaleString()} • Nodes: {s.node_count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: State Comparison ────────────────────────────────────── */}
      {activeTab === "comparison" && (
        <div style={{ backgroundColor: "var(--color-bg-surface)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-subtle)" }}>
          {comparisonLoading ? (
            <LoadingState message="Computing deterministic state differences..." />
          ) : !comparison ? (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <p style={{ color: "var(--color-text-secondary)" }}>Select a baseline from the Baselines tab to view differences.</p>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                    {comparison.source_a_label} vs {comparison.source_b_label}
                  </h3>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                    {comparison.changed_nodes_count} changed nodes / {comparison.unchanged_nodes_count} unchanged nodes
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {comparison.node_comparisons
                  .filter((nc) => nc.is_changed)
                  .map((nc) => (
                    <div
                      key={nc.node_id}
                      style={{
                        backgroundColor: "var(--color-bg-base)",
                        padding: "1rem",
                        borderRadius: "var(--radius-sm)",
                        borderLeft: "3px solid var(--color-status-degraded)",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                        Node: {nc.node_name}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                        {nc.diffs.map((d, i) => (
                          <div key={i} style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
                            <strong>{d.field_name}</strong>: {String(d.previous_value)} → <span style={{ color: "var(--color-accent)", fontWeight: 600 }}>{String(d.current_value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                {comparison.changed_nodes_count === 0 && (
                  <div style={{ color: "var(--color-status-healthy)", fontSize: "0.875rem", padding: "1rem" }}>
                    ✓ No state drift detected. Current state exactly matches the reference baseline.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: Historical Reconstruction ──────────────────────────── */}
      {activeTab === "reconstruction" && (
        <div style={{ backgroundColor: "var(--color-bg-surface)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-subtle)" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Historical State Replay</h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
            Replay recorded events, observations, and state transitions to reconstruct system state at any exact historical timestamp.
          </p>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", maxWidth: "600px" }}>
            <input
              type="datetime-local"
              value={reconTimestamp}
              onChange={(e) => setReconTimestamp(e.target.value)}
              style={{
                flex: 1,
                backgroundColor: "var(--color-bg-base)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "0.5rem",
                color: "var(--color-text-primary)",
                fontSize: "0.875rem",
              }}
            />
            <Button size="sm" onClick={handleReconstruct} disabled={reconLoading || !reconTimestamp}>
              {reconLoading ? "Reconstructing..." : "Reconstruct"}
            </Button>
          </div>

          {reconstruction && (
            <div>
              <div style={{ padding: "0.75rem", backgroundColor: "var(--color-bg-elevated)", borderRadius: "var(--radius-sm)", marginBottom: "1rem", fontSize: "0.8125rem" }}>
                <div>Reconstructed at requested: <strong>{new Date(reconstruction.requested_timestamp).toLocaleString()}</strong></div>
                <div>Records evaluated: <strong>{reconstruction.records_evaluated}</strong></div>
                <div>Completeness ratio: <strong>{(reconstruction.completeness_ratio * 100).toFixed(0)}%</strong></div>
                {reconstruction.completeness_note && (
                  <div style={{ color: "var(--color-status-degraded)", marginTop: "0.25rem" }}>
                    Note: {reconstruction.completeness_note}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
                {reconstruction.nodes.map((rn) => (
                  <div
                    key={rn.node_id}
                    style={{
                      backgroundColor: "var(--color-bg-base)",
                      padding: "0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{rn.node_name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                      State: {rn.state} • Health: {rn.health !== null ? `${(rn.health * 100).toFixed(0)}%` : "Unknown"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
