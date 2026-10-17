"use client";

/**
 * CAUSAL — /app/scenarios
 *
 * Phase 4: Scenarios & State Exploration
 *
 * Implements:
 * - Scenario listing, inspection, and creation with isolated state overrides
 * - Prominent advisory distinguishing scenario exploration from validated counterfactual analysis
 * - Visual side-by-side distinction between isolated sandbox overrides and untouched live operational state
 * - Inspection of captured snapshots and baselines
 * - Full state comparison engine (Baseline vs Current, Snapshot vs Current, Snapshot A vs B)
 * - Detailed node diffs with field values, timestamps, provenance, and completeness metrics
 * - Loading, empty, error, retry, and validation states
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import type {
  GraphResponse,
  ScenarioResponse,
  ScenarioCreate,
  BaselineResponse,
  SnapshotResponse,
  StateComparisonResponse,
  CurrentGraphStateResponse,
  NodeStateDetail,
} from "@causal/shared/src/index";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── State Color Config ────────────────────────────────────────────────────────

const STATE_CONFIG: Record<
  string,
  { bg: string; text: string; border: string; label: string }
> = {
  NORMAL: {
    bg: "rgba(34, 211, 238, 0.1)",
    text: "var(--color-status-normal, #22d3ee)",
    border: "rgba(34, 211, 238, 0.25)",
    label: "NORMAL",
  },
  DEGRADED: {
    bg: "rgba(245, 158, 11, 0.1)",
    text: "var(--color-status-degraded, #f59e0b)",
    border: "rgba(245, 158, 11, 0.25)",
    label: "DEGRADED",
  },
  CRITICAL: {
    bg: "rgba(249, 115, 22, 0.1)",
    text: "var(--color-status-critical, #f97316)",
    border: "rgba(249, 115, 22, 0.25)",
    label: "CRITICAL",
  },
  FAILED: {
    bg: "rgba(239, 68, 68, 0.12)",
    text: "var(--color-status-failed, #ef4444)",
    border: "rgba(239, 68, 68, 0.3)",
    label: "FAILED",
  },
  RECOVERING: {
    bg: "rgba(167, 139, 250, 0.1)",
    text: "var(--color-status-recovering, #a78bfa)",
    border: "rgba(167, 139, 250, 0.25)",
    label: "RECOVERING",
  },
  UNKNOWN: {
    bg: "rgba(107, 114, 128, 0.12)",
    text: "var(--color-status-unknown, #9ca3af)",
    border: "rgba(107, 114, 128, 0.25)",
    label: "UNKNOWN",
  },
};

function getStateBadge(state: string | null | undefined) {
  const normalized = (state || "UNKNOWN").toUpperCase();
  const cfg = STATE_CONFIG[normalized] || STATE_CONFIG.UNKNOWN;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.15rem 0.5rem",
        borderRadius: "var(--radius-full, 9999px)",
        backgroundColor: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.text,
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.06em",
        fontFamily: "var(--font-mono)",
      }}
    >
      <span
        style={{
          width: "5px",
          height: "5px",
          borderRadius: "50%",
          backgroundColor: cfg.text,
        }}
      />
      {cfg.label}
    </span>
  );
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPercentage(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return "—";
  return `${(ratio * 100).toFixed(0)}%`;
}

interface OverrideRow {
  nodeId: string;
  state: string;
  health: string;
  capacity: string;
  availability: string;
}

export default function ScenariosPage() {
  // ── Navigation & Graphs ──────────────────────────────────────────────────
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"scenarios" | "compare" | "snapshots">("scenarios");

  // ── Graph Data ───────────────────────────────────────────────────────────
  const [scenarios, setScenarios] = useState<ScenarioResponse[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotResponse[]>([]);
  const [baselines, setBaselines] = useState<BaselineResponse[]>([]);
  const [graphState, setGraphState] = useState<CurrentGraphStateResponse | null>(null);

  // ── Selection & Filter States ────────────────────────────────────────────
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioFilter, setScenarioFilter] = useState("");
  const [snapshotSubTab, setSnapshotSubTab] = useState<"snapshots" | "baselines">("snapshots");

  // ── Comparison State ─────────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState<"BASELINE_VS_CURRENT" | "SNAPSHOT_VS_CURRENT" | "SNAPSHOT_VS_SNAPSHOT">("BASELINE_VS_CURRENT");
  const [compareBaselineId, setCompareBaselineId] = useState<string>("");
  const [compareSnapshotA, setCompareSnapshotA] = useState<string>("");
  const [compareSnapshotB, setCompareSnapshotB] = useState<string>("");
  const [comparisonResult, setComparisonResult] = useState<StateComparisonResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [diffFilter, setDiffFilter] = useState<"ALL" | "CHANGED" | "UNCHANGED">("ALL");
  const [diffSearch, setDiffSearch] = useState("");

  // ── Create Scenario Modal State ──────────────────────────────────────────
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [newScenarioDesc, setNewScenarioDesc] = useState("");
  const [newScenarioBaseType, setNewScenarioBaseType] = useState<"none" | "snapshot" | "baseline">("none");
  const [newScenarioBaseId, setNewScenarioBaseId] = useState("");
  const [newScenarioOverrides, setNewScenarioOverrides] = useState<OverrideRow[]>([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createValidationError, setCreateValidationError] = useState<string | null>(null);

  // ── Page Level Status ────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch Initial Graphs ─────────────────────────────────────────────────
  useEffect(() => {
    apiClient
      .listGraphs()
      .then((res) => {
        setGraphs(res);
        if (res.length > 0) {
          setSelectedGraphId(res[0].id);
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load graphs";
        setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // ── Fetch Data For Active Graph ──────────────────────────────────────────
  const loadGraphData = useCallback((graphId: string) => {
    Promise.all([
      apiClient.listScenarios(graphId),
      apiClient.listSnapshots(graphId),
      apiClient.listBaselines(graphId),
      apiClient.getGraphState(graphId),
    ])
      .then(([scList, snList, blList, gState]) => {
        setScenarios(scList);
        setSnapshots(snList);
        setBaselines(blList);
        setGraphState(gState);

        // Select first scenario by default if available
        if (scList.length > 0) {
          setSelectedScenarioId((prev) => {
            return scList.some((s) => s.id === prev) ? prev : scList[0].id;
          });
        } else {
          setSelectedScenarioId(null);
        }

        // Initialize default comparison values
        if (blList.length > 0) {
          setCompareBaselineId(blList[0].id);
        }
        if (snList.length > 0) {
          setCompareSnapshotA(snList[0].id);
          if (snList.length > 1) {
            setCompareSnapshotB(snList[1].id);
          }
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load scenario data for graph";
        setError(msg);
      });
  }, []);

  useEffect(() => {
    if (selectedGraphId) {
      loadGraphData(selectedGraphId);
    }
  }, [selectedGraphId, loadGraphData]);

  // ── Selected Scenario ────────────────────────────────────────────────────
  const selectedScenario = useMemo(() => {
    return scenarios.find((s) => s.id === selectedScenarioId) || null;
  }, [scenarios, selectedScenarioId]);

  // Filtered Scenario list
  const filteredScenarios = useMemo(() => {
    const q = scenarioFilter.trim().toLowerCase();
    if (!q) return scenarios;
    return scenarios.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.id.toLowerCase().includes(q)
    );
  }, [scenarios, scenarioFilter]);

  // Map of node details for fast lookup
  const nodeLookup = useMemo(() => {
    const map = new Map<string, NodeStateDetail>();
    if (graphState?.nodes) {
      for (const node of graphState.nodes) {
        map.set(node.node_id, node);
      }
    }
    return map;
  }, [graphState]);

  // Base snapshot / baseline lookup for the selected scenario
  const scenarioBaseInfo = useMemo(() => {
    if (!selectedScenario) return null;
    if (selectedScenario.base_snapshot_id) {
      const snap = snapshots.find((s) => s.id === selectedScenario.base_snapshot_id);
      return {
        type: "SNAPSHOT" as const,
        id: selectedScenario.base_snapshot_id,
        item: snap,
        label: snap?.name || `Snapshot #${selectedScenario.base_snapshot_id.slice(0, 8)}`,
      };
    }
    if (selectedScenario.base_baseline_id) {
      const bl = baselines.find((b) => b.id === selectedScenario.base_baseline_id);
      return {
        type: "BASELINE" as const,
        id: selectedScenario.base_baseline_id,
        item: bl,
        label: bl?.name || `Baseline #${selectedScenario.base_baseline_id.slice(0, 8)}`,
      };
    }
    return {
      type: "LIVE" as const,
      id: null,
      item: null,
      label: "Current Operational State (Live Baseline)",
    };
  }, [selectedScenario, snapshots, baselines]);

  // ── Run Comparison Handler ───────────────────────────────────────────────
  const handleRunComparison = async () => {
    if (!selectedGraphId) return;
    setCompareLoading(true);
    setCompareError(null);
    try {
      let result: StateComparisonResponse;
      if (compareMode === "BASELINE_VS_CURRENT") {
        if (!compareBaselineId) {
          throw new Error("Please select a baseline to compare against current state.");
        }
        result = await apiClient.compareBaselineVsCurrent(selectedGraphId, compareBaselineId);
      } else if (compareMode === "SNAPSHOT_VS_CURRENT") {
        if (!compareSnapshotA) {
          throw new Error("Please select a snapshot to compare against current state.");
        }
        result = await apiClient.compareSnapshots(selectedGraphId, compareSnapshotA);
      } else {
        if (!compareSnapshotA || !compareSnapshotB) {
          throw new Error("Please select both Snapshot A and Snapshot B to compare.");
        }
        result = await apiClient.compareSnapshots(selectedGraphId, compareSnapshotA, compareSnapshotB);
      }
      setComparisonResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to run state comparison";
      setCompareError(msg);
    } finally {
      setCompareLoading(false);
    }
  };

  // Preset comparison from scenario base
  const handleLaunchScenarioComparison = (scenario: ScenarioResponse) => {
    if (scenario.base_baseline_id) {
      setCompareMode("BASELINE_VS_CURRENT");
      setCompareBaselineId(scenario.base_baseline_id);
      setActiveTab("compare");
    } else if (scenario.base_snapshot_id) {
      setCompareMode("SNAPSHOT_VS_CURRENT");
      setCompareSnapshotA(scenario.base_snapshot_id);
      setActiveTab("compare");
    } else {
      setActiveTab("compare");
    }
  };

  // Filtered Comparison Node Diffs
  const filteredNodeComparisons = useMemo(() => {
    if (!comparisonResult?.node_comparisons) return [];
    let list = comparisonResult.node_comparisons;

    if (diffFilter === "CHANGED") {
      list = list.filter((n) => n.is_changed);
    } else if (diffFilter === "UNCHANGED") {
      list = list.filter((n) => !n.is_changed);
    }

    const q = diffSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) => n.node_name.toLowerCase().includes(q) || n.node_id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [comparisonResult, diffFilter, diffSearch]);

  // ── Create Scenario Handlers ─────────────────────────────────────────────
  const handleOpenCreateModal = () => {
    setNewScenarioName("");
    setNewScenarioDesc("");
    setNewScenarioBaseType("none");
    setNewScenarioBaseId("");
    setNewScenarioOverrides([]);
    setCreateValidationError(null);
    setIsCreateModalOpen(true);
  };

  const handleAddOverrideRow = () => {
    if (!graphState?.nodes || graphState.nodes.length === 0) return;
    const defaultNode = graphState.nodes[0];
    setNewScenarioOverrides((prev) => [
      ...prev,
      {
        nodeId: defaultNode.node_id,
        state: "FAILED",
        health: "0.0",
        capacity: "0.0",
        availability: "0.0",
      },
    ]);
  };

  const handleRemoveOverrideRow = (index: number) => {
    setNewScenarioOverrides((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateOverrideRow = (index: number, field: keyof OverrideRow, value: string) => {
    setNewScenarioOverrides((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleCreateScenarioSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateValidationError(null);

    if (!selectedGraphId) {
      setCreateValidationError("No active graph selected.");
      return;
    }

    if (!newScenarioName.trim()) {
      setCreateValidationError("Scenario name is required.");
      return;
    }

    // Construct state_overrides dictionary
    const stateOverrides: Record<string, unknown> = {};
    for (const ov of newScenarioOverrides) {
      if (!ov.nodeId) continue;
      const nodeOverride: Record<string, unknown> = {
        state: ov.state,
      };
      const hNum = parseFloat(ov.health);
      if (!isNaN(hNum)) nodeOverride.health = Math.max(0, Math.min(1, hNum));
      const cNum = parseFloat(ov.capacity);
      if (!isNaN(cNum)) nodeOverride.capacity = Math.max(0, Math.min(1, cNum));
      const aNum = parseFloat(ov.availability);
      if (!isNaN(aNum)) nodeOverride.availability = Math.max(0, Math.min(1, aNum));

      stateOverrides[ov.nodeId] = nodeOverride;
    }

    const payload: ScenarioCreate = {
      name: newScenarioName.trim(),
      description: newScenarioDesc.trim() || undefined,
      base_snapshot_id: newScenarioBaseType === "snapshot" && newScenarioBaseId ? newScenarioBaseId : undefined,
      base_baseline_id: newScenarioBaseType === "baseline" && newScenarioBaseId ? newScenarioBaseId : undefined,
      state_overrides: stateOverrides,
      metadata: {
        created_via: "web_scenarios_ui",
        override_count: Object.keys(stateOverrides).length,
      },
    };

    setCreateSubmitting(true);
    try {
      const created = await apiClient.createScenario(selectedGraphId, payload);
      setScenarios((prev) => [created, ...prev]);
      setSelectedScenarioId(created.id);
      setIsCreateModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create scenario.";
      setCreateValidationError(msg);
    } finally {
      setCreateSubmitting(false);
    }
  };

  // ── Render Loading & Error for Page Initialization ───────────────────────
  if (loading && graphs.length === 0) {
    return <LoadingState message="Initializing Scenario & Digital Twin sandbox…" fullHeight />;
  }

  if (error && graphs.length === 0) {
    return <ErrorState title="Scenario Engine Offline" message={error} onRetry={() => setSelectedGraphId(null)} />;
  }

  const activeGraph = graphs.find((g) => g.id === selectedGraphId) || graphs[0];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        padding: "1.5rem",
        gap: "1.25rem",
        color: "var(--color-text-primary)",
      }}
    >
      {/* ── TOP HEADER & GRAPH SELECTOR ──────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6875rem",
                color: "var(--color-accent)",
                letterSpacing: "0.08em",
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              PHASE 4 · DIGITAL TWIN SANDBOX
            </span>
            <Badge variant="simulation">SCENARIOS & EXPLORATION</Badge>
          </div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Scenario & State Exploration
          </h1>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-tertiary)",
              margin: "0.25rem 0 0 0",
              maxWidth: "680px",
            }}
          >
            Inspect isolated hypothetical state overrides, explore sandbox branches, and compare system states
            against captured baselines or historical snapshots.
          </p>
        </div>

        {/* Controls: Graph Selector, Refresh, New Scenario Button */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {graphs.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                backgroundColor: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-default)",
                borderRadius: "var(--radius-md)",
                padding: "0.35rem 0.65rem",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                GRAPH:
              </span>
              <select
                aria-label="Active Graph Selector"
                value={selectedGraphId || ""}
                onChange={(e) => setSelectedGraphId(e.target.value)}
                style={{
                  backgroundColor: "transparent",
                  color: "var(--color-text-primary)",
                  border: "none",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {graphs.map((g) => (
                  <option key={g.id} value={g.id} style={{ backgroundColor: "var(--color-bg-elevated)" }}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => selectedGraphId && loadGraphData(selectedGraphId)}
            title="Refresh graph scenarios and snapshots"
          >
            ↻ Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreateModal}
            id="create-scenario-btn"
          >
            + New Scenario
          </Button>
        </div>
      </div>

      {/* ── MANDATORY ADVISORY NOTICE (Scenario Exploration vs Causal Analysis) ── */}
      <div
        role="alert"
        aria-label="Scenario Exploration Advisory"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.875rem",
          padding: "0.875rem 1rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: "rgba(169, 154, 128, 0.08)",
          border: "1px solid rgba(169, 154, 128, 0.25)",
        }}
      >
        <div
          style={{
            fontSize: "1.125rem",
            color: "var(--color-accent)",
            lineHeight: 1,
            marginTop: "0.125rem",
          }}
        >
          ℹ
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--color-accent)",
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono)",
              }}
            >
              Scenario Exploration Advisory
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                padding: "0.1rem 0.4rem",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "rgba(169, 154, 128, 0.15)",
                color: "var(--color-accent-hover, #F0EDE5)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ISOLATED SANDBOX · NOT VALIDATED COUNTERFACTUAL
            </span>
          </div>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-secondary)",
              margin: "0.25rem 0 0 0",
              lineHeight: 1.5,
            }}
          >
            <strong>Notice:</strong> Scenario exploration isolates hypothetical state overrides and snapshot
            comparisons for exploration. It is not a validated counterfactual analysis or automated causal
            discovery run. State overrides defined in scenarios exist strictly in isolated containers and do not
            mutate live operational telemetry or digital twin states.
          </p>
        </div>
      </div>

      {/* ── STATS BAR ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
          }}
        >
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            SCENARIOS DEFINED
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem" }}>
            {scenarios.length}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
          }}
        >
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            CAPTURED SNAPSHOTS
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem" }}>
            {snapshots.length}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
          }}
        >
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            SAVED BASELINES
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem" }}>
            {baselines.length}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
          }}
        >
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            GRAPH NODES
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem" }}>
            {graphState?.total_nodes ?? "—"}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
          }}
        >
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            LIVE STATE COMPLETENESS
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              marginTop: "0.25rem",
              color: (graphState?.completeness_ratio ?? 0) >= 0.8 ? "var(--color-status-normal)" : "var(--color-status-degraded)",
            }}
          >
            {formatPercentage(graphState?.completeness_ratio)}
          </div>
        </div>
      </div>

      {/* ── MAIN NAVIGATION TABS ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--color-border-subtle)",
          gap: "1.5rem",
        }}
      >
        <button
          onClick={() => setActiveTab("scenarios")}
          id="tab-scenarios"
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "scenarios" ? "2px solid var(--color-accent)" : "2px solid transparent",
            color: activeTab === "scenarios" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            padding: "0.625rem 0",
            fontSize: "0.875rem",
            fontWeight: activeTab === "scenarios" ? 600 : 400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>⊙ Scenarios</span>
          <span
            style={{
              fontSize: "0.6875rem",
              padding: "0.1rem 0.4rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-bg-elevated)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {scenarios.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("compare")}
          id="tab-compare"
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "compare" ? "2px solid var(--color-accent)" : "2px solid transparent",
            color: activeTab === "compare" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            padding: "0.625rem 0",
            fontSize: "0.875rem",
            fontWeight: activeTab === "compare" ? 600 : 400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>⇄ State Comparison</span>
          {comparisonResult && (
            <span
              style={{
                fontSize: "0.6875rem",
                padding: "0.1rem 0.4rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: comparisonResult.changed_nodes_count > 0 ? "rgba(245, 158, 11, 0.2)" : "var(--color-bg-elevated)",
                color: comparisonResult.changed_nodes_count > 0 ? "var(--color-status-degraded)" : "var(--color-text-tertiary)",
              }}
            >
              {comparisonResult.changed_nodes_count} diffs
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("snapshots")}
          id="tab-snapshots"
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "snapshots" ? "2px solid var(--color-accent)" : "2px solid transparent",
            color: activeTab === "snapshots" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            padding: "0.625rem 0",
            fontSize: "0.875rem",
            fontWeight: activeTab === "snapshots" ? 600 : 400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>⎈ Snapshots & Baselines</span>
          <span
            style={{
              fontSize: "0.6875rem",
              padding: "0.1rem 0.4rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-bg-elevated)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {snapshots.length + baselines.length}
          </span>
        </button>
      </div>

      {/* ── TAB 1: SCENARIOS VIEW ────────────────────────────────────────── */}
      {activeTab === "scenarios" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {scenarios.length === 0 ? (
            <EmptyState
              title="No Scenarios Defined"
              description={`No scenarios have been created for ${activeGraph?.name ?? "this graph"} yet. Create a sandbox scenario to define hypothetical state overrides.`}
              icon="⊙"
              action={{
                label: "+ Create First Scenario",
                onClick: handleOpenCreateModal,
              }}
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "340px 1fr",
                gap: "1.25rem",
                alignItems: "start",
              }}
            >
              {/* Left Column: Scenario List */}
              <div
                style={{
                  backgroundColor: "var(--color-bg-surface)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {/* Search & Header */}
                <div
                  style={{
                    padding: "0.875rem 1rem",
                    borderBottom: "1px solid var(--color-border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                      SAVED SCENARIOS ({filteredScenarios.length})
                    </span>
                    <button
                      onClick={handleOpenCreateModal}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-accent)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      + New
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search scenarios…"
                    value={scenarioFilter}
                    onChange={(e) => setScenarioFilter(e.target.value)}
                    style={{
                      width: "100%",
                      backgroundColor: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-default)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.4rem 0.6rem",
                      fontSize: "0.8125rem",
                      color: "var(--color-text-primary)",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Scenario Cards */}
                <div style={{ maxHeight: "calc(100vh - 380px)", overflowY: "auto", padding: "0.5rem" }}>
                  {filteredScenarios.map((sc) => {
                    const isSelected = sc.id === selectedScenarioId;
                    const overrideCount = Object.keys(sc.state_overrides || {}).length;
                    return (
                      <div
                        key={sc.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedScenarioId(sc.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setSelectedScenarioId(sc.id);
                          }
                        }}
                        style={{
                          padding: "0.75rem",
                          borderRadius: "var(--radius-sm)",
                          marginBottom: "0.35rem",
                          cursor: "pointer",
                          backgroundColor: isSelected ? "var(--color-bg-interactive)" : "transparent",
                          border: isSelected
                            ? "1px solid var(--color-accent)"
                            : "1px solid transparent",
                          transition: "all var(--duration-fast, 150ms)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                          <span
                            style={{
                              fontSize: "0.875rem",
                              fontWeight: isSelected ? 600 : 500,
                              color: isSelected ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                            }}
                          >
                            {sc.name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              padding: "0.1rem 0.35rem",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: overrideCount > 0 ? "rgba(245, 158, 11, 0.15)" : "var(--color-bg-elevated)",
                              color: overrideCount > 0 ? "var(--color-status-degraded)" : "var(--color-text-tertiary)",
                              fontFamily: "var(--font-mono)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {overrideCount} {overrideCount === 1 ? "override" : "overrides"}
                          </span>
                        </div>

                        {sc.description && (
                          <p
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--color-text-tertiary)",
                              margin: "0.25rem 0 0 0",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {sc.description}
                          </p>
                        )}

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            marginTop: "0.5rem",
                            fontSize: "0.6875rem",
                            color: "var(--color-text-tertiary)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          <span>{formatRelativeTime(sc.created_at)}</span>
                          <span>•</span>
                          <span>
                            {sc.base_snapshot_id
                              ? "Base: Snapshot"
                              : sc.base_baseline_id
                              ? "Base: Baseline"
                              : "Base: Live State"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Scenario Detail Inspector */}
              {selectedScenario ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {/* Scenario Header Card */}
                  <div
                    style={{
                      backgroundColor: "var(--color-bg-surface)",
                      border: "1px solid var(--color-border-subtle)",
                      borderRadius: "var(--radius-md)",
                      padding: "1.25rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                          <span
                            className="causal-text-mono"
                            style={{
                              fontSize: "0.6875rem",
                              color: "var(--color-text-tertiary)",
                            }}
                          >
                            ID: {selectedScenario.id}
                          </span>
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "var(--radius-full)",
                              backgroundColor: "rgba(129, 140, 248, 0.12)",
                              color: "var(--color-status-simulation)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            ISOLATED CONTAINER
                          </span>
                        </div>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                          {selectedScenario.name}
                        </h2>
                        {selectedScenario.description && (
                          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", margin: "0.35rem 0 0 0" }}>
                            {selectedScenario.description}
                          </p>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleLaunchScenarioComparison(selectedScenario)}
                          title="Compare this scenario's base state against live telemetry"
                        >
                          ⇄ Compare Base vs Live
                        </Button>
                      </div>
                    </div>

                    {/* Scenario Metadata Grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "1rem",
                        marginTop: "1.25rem",
                        paddingTop: "1rem",
                        borderTop: "1px solid var(--color-border-subtle)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                          BASE FOUNDATION
                        </div>
                        <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginTop: "0.2rem", color: "var(--color-accent)" }}>
                          {scenarioBaseInfo?.label ?? "Live System State"}
                        </div>
                        {scenarioBaseInfo?.item && (
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.15rem" }}>
                            Captured: {formatRelativeTime(scenarioBaseInfo.item.captured_at)} · Completeness: {formatPercentage(scenarioBaseInfo.item.completeness_ratio)}
                          </div>
                        )}
                      </div>

                      <div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                          STATE OVERRIDES
                        </div>
                        <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginTop: "0.2rem" }}>
                          {Object.keys(selectedScenario.state_overrides || {}).length} Nodes Modified
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.15rem" }}>
                          Completely decoupled from live telemetry
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                          CREATED AT
                        </div>
                        <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginTop: "0.2rem" }}>
                          {new Date(selectedScenario.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Isolated State Overrides vs Live Operational State */}
                  <div
                    style={{
                      backgroundColor: "var(--color-bg-surface)",
                      border: "1px solid var(--color-border-subtle)",
                      borderRadius: "var(--radius-md)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "1rem 1.25rem",
                        borderBottom: "1px solid var(--color-border-subtle)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      <div>
                        <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: 0 }}>
                          Isolated State Overrides
                        </h3>
                        <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", margin: "0.2rem 0 0 0" }}>
                          Side-by-side comparison of scenario overrides against untouched live operational telemetry
                        </p>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: "rgba(245, 158, 11, 0.12)",
                            color: "var(--color-status-degraded)",
                            border: "1px solid rgba(245, 158, 11, 0.25)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          ⚡ HYPOTHETICAL OVERRIDES
                        </span>
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: "rgba(34, 211, 238, 0.1)",
                            color: "var(--color-status-normal)",
                            border: "1px solid rgba(34, 211, 238, 0.25)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          ● LIVE OPERATIONAL STATE
                        </span>
                      </div>
                    </div>

                    {Object.keys(selectedScenario.state_overrides || {}).length === 0 ? (
                      <div style={{ padding: "2.5rem 1rem", textAlign: "center" }}>
                        <div style={{ fontSize: "1.25rem", marginBottom: "0.5rem", color: "var(--color-text-disabled)" }}>
                          ◎
                        </div>
                        <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text-secondary)" }}>
                          No State Overrides Defined
                        </div>
                        <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", maxWidth: "420px", margin: "0.25rem auto 0 auto" }}>
                          This scenario inherits 100% of its state directly from its base foundation without any overridden node parameters.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {Object.entries(selectedScenario.state_overrides).map(([nodeId, rawOverride]) => {
                          const override = (typeof rawOverride === "object" && rawOverride !== null ? rawOverride : {}) as Record<string, unknown>;
                          const liveNode = nodeLookup.get(nodeId);
                          const nodeName = liveNode?.node_name ?? `Node #${nodeId.slice(0, 8)}`;
                          const nodeType = liveNode?.node_type ?? "unknown";

                          return (
                            <div
                              key={nodeId}
                              style={{
                                padding: "1.25rem",
                                borderBottom: "1px solid var(--color-border-subtle)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.75rem",
                              }}
                            >
                              {/* Node header */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <span style={{ fontSize: "0.9375rem", fontWeight: 600 }}>
                                    {nodeName}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "0.6875rem",
                                      padding: "0.1rem 0.35rem",
                                      borderRadius: "var(--radius-sm)",
                                      backgroundColor: "var(--color-bg-elevated)",
                                      color: "var(--color-text-tertiary)",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {nodeType}
                                  </span>
                                </div>
                                <span className="causal-text-mono" style={{ fontSize: "0.6875rem", color: "var(--color-text-disabled)" }}>
                                  {nodeId}
                                </span>
                              </div>

                              {/* Comparison Grid: Override vs Live */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: "1rem",
                                }}
                              >
                                {/* Override Card */}
                                <div
                                  style={{
                                    backgroundColor: "rgba(245, 158, 11, 0.04)",
                                    border: "1px solid rgba(245, 158, 11, 0.2)",
                                    borderRadius: "var(--radius-md)",
                                    padding: "0.875rem 1rem",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      marginBottom: "0.5rem",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "0.6875rem",
                                        fontWeight: 600,
                                        color: "var(--color-status-degraded)",
                                        fontFamily: "var(--font-mono)",
                                        letterSpacing: "0.05em",
                                      }}
                                    >
                                      HYPOTHETICAL OVERRIDE
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "0.625rem",
                                        padding: "0.05rem 0.3rem",
                                        borderRadius: "var(--radius-sm)",
                                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                                        color: "var(--color-status-degraded)",
                                        fontFamily: "var(--font-mono)",
                                      }}
                                    >
                                      ISOLATED
                                    </span>
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>State:</span>
                                    {getStateBadge(String(override.state ?? "UNKNOWN"))}
                                  </div>

                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.75rem" }}>
                                    {override.health !== undefined && (
                                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "var(--color-text-tertiary)" }}>Hypothetical Health:</span>
                                        <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                                          {formatPercentage(Number(override.health))}
                                        </span>
                                      </div>
                                    )}
                                    {override.capacity !== undefined && (
                                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "var(--color-text-tertiary)" }}>Hypothetical Capacity:</span>
                                        <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                                          {formatPercentage(Number(override.capacity))}
                                        </span>
                                      </div>
                                    )}
                                    {override.availability !== undefined && (
                                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "var(--color-text-tertiary)" }}>Hypothetical Availability:</span>
                                        <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                                          {formatPercentage(Number(override.availability))}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Live Operational State Card */}
                                <div
                                  style={{
                                    backgroundColor: "rgba(34, 211, 238, 0.03)",
                                    border: "1px solid rgba(34, 211, 238, 0.18)",
                                    borderRadius: "var(--radius-md)",
                                    padding: "0.875rem 1rem",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      marginBottom: "0.5rem",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "0.6875rem",
                                        fontWeight: 600,
                                        color: "var(--color-status-normal)",
                                        fontFamily: "var(--font-mono)",
                                        letterSpacing: "0.05em",
                                      }}
                                    >
                                      LIVE OPERATIONAL STATE
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "0.625rem",
                                        padding: "0.05rem 0.3rem",
                                        borderRadius: "var(--radius-sm)",
                                        backgroundColor: "rgba(34, 211, 238, 0.12)",
                                        color: "var(--color-status-normal)",
                                        fontFamily: "var(--font-mono)",
                                      }}
                                    >
                                      UNTOUCHED
                                    </span>
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>State:</span>
                                    {getStateBadge(liveNode?.state ?? "UNKNOWN")}
                                  </div>

                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.75rem" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                      <span style={{ color: "var(--color-text-tertiary)" }}>Live Health:</span>
                                      <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                                        {formatPercentage(liveNode?.health)}
                                      </span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                      <span style={{ color: "var(--color-text-tertiary)" }}>Telemetry Source:</span>
                                      <span style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
                                        {liveNode?.provenance?.source ?? liveNode?.source ?? "telemetry_daemon"}
                                      </span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                      <span style={{ color: "var(--color-text-tertiary)" }}>Last Observed:</span>
                                      <span style={{ color: "var(--color-text-tertiary)" }}>
                                        {formatRelativeTime(liveNode?.last_observed_at)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No Scenario Selected"
                  description="Choose a scenario from the left panel to inspect its configuration and state overrides."
                  icon="⊙"
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: STATE COMPARISON ENGINE ──────────────────────────────── */}
      {activeTab === "compare" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Comparison Mode Configuration Bar */}
          <div
            style={{
              backgroundColor: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                  System State Comparison Engine
                </h2>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", margin: "0.25rem 0 0 0" }}>
                  Diff saved baselines, historical snapshots, or live operational states side-by-side using the comparison engine.
                </p>
              </div>

              {/* Mode Selector Radio Pills */}
              <div
                style={{
                  display: "inline-flex",
                  backgroundColor: "var(--color-bg-elevated)",
                  padding: "0.25rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border-subtle)",
                  gap: "0.25rem",
                }}
              >
                <button
                  onClick={() => setCompareMode("BASELINE_VS_CURRENT")}
                  style={{
                    backgroundColor: compareMode === "BASELINE_VS_CURRENT" ? "var(--color-bg-surface)" : "transparent",
                    color: compareMode === "BASELINE_VS_CURRENT" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.35rem 0.75rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Baseline vs Current
                </button>
                <button
                  onClick={() => setCompareMode("SNAPSHOT_VS_CURRENT")}
                  style={{
                    backgroundColor: compareMode === "SNAPSHOT_VS_CURRENT" ? "var(--color-bg-surface)" : "transparent",
                    color: compareMode === "SNAPSHOT_VS_CURRENT" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.35rem 0.75rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Snapshot vs Current
                </button>
                <button
                  onClick={() => setCompareMode("SNAPSHOT_VS_SNAPSHOT")}
                  style={{
                    backgroundColor: compareMode === "SNAPSHOT_VS_SNAPSHOT" ? "var(--color-bg-surface)" : "transparent",
                    color: compareMode === "SNAPSHOT_VS_SNAPSHOT" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.35rem 0.75rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Snapshot A vs Snapshot B
                </button>
              </div>
            </div>

            {/* Inputs based on Mode */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
                paddingTop: "0.75rem",
                borderTop: "1px solid var(--color-border-subtle)",
              }}
            >
              {compareMode === "BASELINE_VS_CURRENT" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: "260px" }}>
                  <label htmlFor="compare-baseline-select" style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", fontWeight: 500, whiteSpace: "nowrap" }}>
                    Select Baseline:
                  </label>
                  <select
                    id="compare-baseline-select"
                    value={compareBaselineId}
                    onChange={(e) => setCompareBaselineId(e.target.value)}
                    style={{
                      flex: 1,
                      backgroundColor: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-default)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.45rem 0.6rem",
                      color: "var(--color-text-primary)",
                      fontSize: "0.8125rem",
                      outline: "none",
                    }}
                  >
                    {baselines.length === 0 && <option value="">No baselines available</option>}
                    {baselines.map((bl) => (
                      <option key={bl.id} value={bl.id}>
                        {bl.name} ({formatRelativeTime(bl.captured_at)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {compareMode === "SNAPSHOT_VS_CURRENT" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: "260px" }}>
                  <label htmlFor="compare-snapshot-select" style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", fontWeight: 500, whiteSpace: "nowrap" }}>
                    Select Snapshot:
                  </label>
                  <select
                    id="compare-snapshot-select"
                    value={compareSnapshotA}
                    onChange={(e) => setCompareSnapshotA(e.target.value)}
                    style={{
                      flex: 1,
                      backgroundColor: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-default)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.45rem 0.6rem",
                      color: "var(--color-text-primary)",
                      fontSize: "0.8125rem",
                      outline: "none",
                    }}
                  >
                    {snapshots.length === 0 && <option value="">No snapshots available</option>}
                    {snapshots.map((sn) => (
                      <option key={sn.id} value={sn.id}>
                        {sn.name || `Snapshot ${sn.id.slice(0, 8)}`} ({formatRelativeTime(sn.captured_at)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {compareMode === "SNAPSHOT_VS_SNAPSHOT" && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: "220px" }}>
                    <label htmlFor="compare-snapshot-a-select" style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", fontWeight: 500, whiteSpace: "nowrap" }}>
                      Snapshot A:
                    </label>
                    <select
                      id="compare-snapshot-a-select"
                      value={compareSnapshotA}
                      onChange={(e) => setCompareSnapshotA(e.target.value)}
                      style={{
                        flex: 1,
                        backgroundColor: "var(--color-bg-elevated)",
                        border: "1px solid var(--color-border-default)",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.45rem 0.6rem",
                        color: "var(--color-text-primary)",
                        fontSize: "0.8125rem",
                        outline: "none",
                      }}
                    >
                      {snapshots.map((sn) => (
                        <option key={sn.id} value={sn.id}>
                          {sn.name || `Snapshot ${sn.id.slice(0, 8)}`} ({formatRelativeTime(sn.captured_at)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: "220px" }}>
                    <label htmlFor="compare-snapshot-b-select" style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", fontWeight: 500, whiteSpace: "nowrap" }}>
                      Snapshot B:
                    </label>
                    <select
                      id="compare-snapshot-b-select"
                      value={compareSnapshotB}
                      onChange={(e) => setCompareSnapshotB(e.target.value)}
                      style={{
                        flex: 1,
                        backgroundColor: "var(--color-bg-elevated)",
                        border: "1px solid var(--color-border-default)",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.45rem 0.6rem",
                        color: "var(--color-text-primary)",
                        fontSize: "0.8125rem",
                        outline: "none",
                      }}
                    >
                      {snapshots.map((sn) => (
                        <option key={sn.id} value={sn.id}>
                          {sn.name || `Snapshot ${sn.id.slice(0, 8)}`} ({formatRelativeTime(sn.captured_at)})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <Button
                variant="primary"
                size="md"
                onClick={handleRunComparison}
                loading={compareLoading}
                id="run-comparison-btn"
              >
                Run State Comparison
              </Button>
            </div>

            {compareError && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  color: "var(--color-status-failed)",
                  fontSize: "0.8125rem",
                }}
              >
                {compareError}
              </div>
            )}
          </div>

          {/* Comparison Output Results */}
          {comparisonResult ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Summary Metrics & Sources */}
              <div
                style={{
                  backgroundColor: "var(--color-bg-surface)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.25rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      COMPARISON SCOPE
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.35rem" }}>
                      <span
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          padding: "0.2rem 0.6rem",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--color-bg-elevated)",
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {comparisonResult.source_a_label}
                      </span>
                      <span style={{ color: "var(--color-text-tertiary)", fontSize: "0.875rem" }}>vs</span>
                      <span
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          padding: "0.2rem 0.6rem",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--color-bg-elevated)",
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {comparisonResult.source_b_label}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "1.5rem" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                        TOTAL COMPARED
                      </div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.15rem" }}>
                        {comparisonResult.total_nodes_compared} nodes
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                        CHANGED
                      </div>
                      <div
                        style={{
                          fontSize: "1.25rem",
                          fontWeight: 700,
                          marginTop: "0.15rem",
                          color: comparisonResult.changed_nodes_count > 0 ? "var(--color-status-degraded)" : "var(--color-status-normal)",
                        }}
                      >
                        {comparisonResult.changed_nodes_count}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                        UNCHANGED
                      </div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.15rem", color: "var(--color-text-secondary)" }}>
                        {comparisonResult.unchanged_nodes_count}
                      </div>
                    </div>
                  </div>
                </div>

                {comparisonResult.completeness_limitations && (
                  <div
                    style={{
                      marginTop: "1rem",
                      padding: "0.6rem 0.8rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.2)",
                      fontSize: "0.75rem",
                      color: "var(--color-status-degraded)",
                    }}
                  >
                    <strong>Completeness Limitation Note:</strong> {comparisonResult.completeness_limitations}
                  </div>
                )}
              </div>

              {/* Filters & Search */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() => setDiffFilter("ALL")}
                    style={{
                      padding: "0.35rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: diffFilter === "ALL" ? "var(--color-bg-elevated)" : "transparent",
                      border: "1px solid var(--color-border-default)",
                      color: diffFilter === "ALL" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    All Nodes ({comparisonResult.total_nodes_compared})
                  </button>
                  <button
                    onClick={() => setDiffFilter("CHANGED")}
                    style={{
                      padding: "0.35rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: diffFilter === "CHANGED" ? "var(--color-bg-elevated)" : "transparent",
                      border: "1px solid var(--color-border-default)",
                      color: diffFilter === "CHANGED" ? "var(--color-text-tertiary)" : "var(--color-text-tertiary)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Changed Only ({comparisonResult.changed_nodes_count})
                  </button>
                  <button
                    onClick={() => setDiffFilter("UNCHANGED")}
                    style={{
                      padding: "0.35rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: diffFilter === "UNCHANGED" ? "var(--color-bg-elevated)" : "transparent",
                      border: "1px solid var(--color-border-default)",
                      color: diffFilter === "UNCHANGED" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Unchanged Only ({comparisonResult.unchanged_nodes_count})
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Filter nodes by name…"
                  value={diffSearch}
                  onChange={(e) => setDiffSearch(e.target.value)}
                  style={{
                    backgroundColor: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border-default)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.35rem 0.65rem",
                    fontSize: "0.8125rem",
                    color: "var(--color-text-primary)",
                    outline: "none",
                    minWidth: "220px",
                  }}
                />
              </div>

              {/* Node Diffs Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {filteredNodeComparisons.length === 0 ? (
                  <div
                    style={{
                      backgroundColor: "var(--color-bg-surface)",
                      border: "1px solid var(--color-border-subtle)",
                      borderRadius: "var(--radius-md)",
                      padding: "2rem",
                      textAlign: "center",
                      color: "var(--color-text-tertiary)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    No nodes match the selected filter.
                  </div>
                ) : (
                  filteredNodeComparisons.map((nodeComp) => (
                    <div
                      key={nodeComp.node_id}
                      style={{
                        backgroundColor: "var(--color-bg-surface)",
                        border: nodeComp.is_changed
                          ? "1px solid rgba(245, 158, 11, 0.3)"
                          : "1px solid var(--color-border-subtle)",
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "0.75rem 1rem",
                          backgroundColor: nodeComp.is_changed ? "rgba(245, 158, 11, 0.05)" : "transparent",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderBottom: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                            {nodeComp.node_name}
                          </span>
                          <span className="causal-text-mono" style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                            {nodeComp.node_id}
                          </span>
                        </div>

                        <div>
                          {nodeComp.is_changed ? (
                            <span
                              style={{
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                                padding: "0.15rem 0.5rem",
                                borderRadius: "var(--radius-full)",
                                backgroundColor: "rgba(245, 158, 11, 0.15)",
                                color: "var(--color-status-degraded)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              MODIFIED ({nodeComp.diffs.length} fields)
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "0.6875rem",
                                fontWeight: 600,
                                padding: "0.15rem 0.5rem",
                                borderRadius: "var(--radius-full)",
                                backgroundColor: "rgba(34, 211, 238, 0.08)",
                                color: "var(--color-status-normal)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              IDENTICAL
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Diff Details Table */}
                      {nodeComp.diffs.length > 0 && (
                        <div style={{ padding: "0.75rem 1rem", overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                            <thead>
                              <tr style={{ color: "var(--color-text-tertiary)", textAlign: "left", borderBottom: "1px solid var(--color-border-subtle)" }}>
                                <th style={{ padding: "0.4rem 0.5rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>FIELD</th>
                                <th style={{ padding: "0.4rem 0.5rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>SOURCE A (PREVIOUS)</th>
                                <th style={{ padding: "0.4rem 0.5rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>SOURCE B (CURRENT)</th>
                                <th style={{ padding: "0.4rem 0.5rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>CHANGE TYPE</th>
                              </tr>
                            </thead>
                            <tbody>
                              {nodeComp.diffs.map((diff, i) => {
                                const prevStr = diff.previous_value !== null && diff.previous_value !== undefined ? String(diff.previous_value) : "UNKNOWN / NULL";
                                const currStr = diff.current_value !== null && diff.current_value !== undefined ? String(diff.current_value) : "UNKNOWN / NULL";

                                return (
                                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                                    <td style={{ padding: "0.5rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                                      {diff.field_name}
                                    </td>
                                    <td style={{ padding: "0.5rem" }}>
                                      <span
                                        style={{
                                          padding: "0.15rem 0.4rem",
                                          borderRadius: "var(--radius-sm)",
                                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                                          color: "var(--color-status-failed)",
                                          fontFamily: "var(--font-mono)",
                                        }}
                                      >
                                        {prevStr}
                                      </span>
                                    </td>
                                    <td style={{ padding: "0.5rem" }}>
                                      <span
                                        style={{
                                          padding: "0.15rem 0.4rem",
                                          borderRadius: "var(--radius-sm)",
                                          backgroundColor: "rgba(34, 211, 238, 0.1)",
                                          color: "var(--color-status-normal)",
                                          fontFamily: "var(--font-mono)",
                                        }}
                                      >
                                        {currStr}
                                      </span>
                                    </td>
                                    <td style={{ padding: "0.5rem" }}>
                                      <span
                                        style={{
                                          fontSize: "0.625rem",
                                          padding: "0.1rem 0.35rem",
                                          borderRadius: "var(--radius-sm)",
                                          backgroundColor: "var(--color-bg-elevated)",
                                          color: "var(--color-text-secondary)",
                                          fontFamily: "var(--font-mono)",
                                        }}
                                      >
                                        {diff.change_type}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                backgroundColor: "var(--color-bg-surface)",
                border: "1px dashed var(--color-border-strong)",
                borderRadius: "var(--radius-md)",
                padding: "3.5rem 2rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem", color: "var(--color-text-disabled)" }}>
                ⇄
              </div>
              <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-text-secondary)", margin: "0 0 0.35rem 0" }}>
                Ready to Compare States
              </h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", maxWidth: "420px", margin: "0 auto 1.25rem auto" }}>
                Select a baseline or snapshot source above and click &quot;Run State Comparison&quot; to inspect all node diffs and state variations.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRunComparison}
                disabled={compareLoading || (compareMode === "BASELINE_VS_CURRENT" && !compareBaselineId)}
              >
                Launch Comparison
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: SNAPSHOTS & BASELINES BROWSER ─────────────────────────── */}
      {activeTab === "snapshots" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Subtabs: Snapshots vs Baselines */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              variant={snapshotSubTab === "snapshots" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setSnapshotSubTab("snapshots")}
            >
              System Snapshots ({snapshots.length})
            </Button>
            <Button
              variant={snapshotSubTab === "baselines" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setSnapshotSubTab("baselines")}
            >
              Recorded Baselines ({baselines.length})
            </Button>
          </div>

          {/* Snapshots Subtab */}
          {snapshotSubTab === "snapshots" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {snapshots.length === 0 ? (
                <EmptyState
                  title="No Snapshots Found"
                  description="No historical or live snapshots have been captured for this graph yet."
                  icon="⎈"
                />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
                  {snapshots.map((sn) => (
                    <div
                      key={sn.id}
                      style={{
                        backgroundColor: "var(--color-bg-surface)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: "var(--radius-md)",
                        padding: "1rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                            <span
                              style={{
                                fontSize: "0.625rem",
                                padding: "0.1rem 0.35rem",
                                borderRadius: "var(--radius-sm)",
                                backgroundColor: "rgba(169, 154, 128, 0.15)",
                                color: "var(--color-accent)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {sn.snapshot_type}
                            </span>
                          </div>
                          <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: 0 }}>
                            {sn.name || `Snapshot #${sn.id.slice(0, 8)}`}
                          </h4>
                          <span className="causal-text-mono" style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                            {sn.id}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCompareMode("SNAPSHOT_VS_CURRENT");
                            setCompareSnapshotA(sn.id);
                            setActiveTab("compare");
                          }}
                          title="Compare this snapshot against current live state"
                        >
                          ⇄ Compare
                        </Button>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "0.5rem",
                          paddingTop: "0.5rem",
                          borderTop: "1px solid var(--color-border-subtle)",
                          fontSize: "0.75rem",
                        }}
                      >
                        <div>
                          <span style={{ color: "var(--color-text-tertiary)" }}>Nodes:</span>{" "}
                          <span style={{ fontWeight: 600 }}>{sn.node_count}</span>
                        </div>
                        <div>
                          <span style={{ color: "var(--color-text-tertiary)" }}>Completeness:</span>{" "}
                          <span style={{ fontWeight: 600, color: "var(--color-status-normal)" }}>
                            {formatPercentage(sn.completeness_ratio)}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "var(--color-text-tertiary)" }}>Captured:</span>{" "}
                          <span>{formatRelativeTime(sn.captured_at)}</span>
                        </div>
                        <div>
                          <span style={{ color: "var(--color-text-tertiary)" }}>Effective:</span>{" "}
                          <span>{formatRelativeTime(sn.effective_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Baselines Subtab */}
          {snapshotSubTab === "baselines" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {baselines.length === 0 ? (
                <EmptyState
                  title="No Baselines Recorded"
                  description="No operational baselines recorded yet for this graph."
                  icon="◈"
                />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
                  {baselines.map((bl) => (
                    <div
                      key={bl.id}
                      style={{
                        backgroundColor: "var(--color-bg-surface)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: "var(--radius-md)",
                        padding: "1rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                            {bl.is_active && (
                              <span
                                style={{
                                  fontSize: "0.625rem",
                                  padding: "0.1rem 0.35rem",
                                  borderRadius: "var(--radius-sm)",
                                  backgroundColor: "rgba(34, 211, 238, 0.15)",
                                  color: "var(--color-status-normal)",
                                  fontFamily: "var(--font-mono)",
                                }}
                              >
                                ACTIVE BASELINE
                              </span>
                            )}
                          </div>
                          <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: 0 }}>
                            {bl.name}
                          </h4>
                          <span className="causal-text-mono" style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                            {bl.id}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCompareMode("BASELINE_VS_CURRENT");
                            setCompareBaselineId(bl.id);
                            setActiveTab("compare");
                          }}
                          title="Compare this baseline against current live state"
                        >
                          ⇄ Compare
                        </Button>
                      </div>

                      {bl.description && (
                        <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", margin: 0 }}>
                          {bl.description}
                        </p>
                      )}

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "0.5rem",
                          paddingTop: "0.5rem",
                          borderTop: "1px solid var(--color-border-subtle)",
                          fontSize: "0.75rem",
                        }}
                      >
                        <div>
                          <span style={{ color: "var(--color-text-tertiary)" }}>Nodes:</span>{" "}
                          <span style={{ fontWeight: 600 }}>{bl.node_count}</span>
                        </div>
                        <div>
                          <span style={{ color: "var(--color-text-tertiary)" }}>Completeness:</span>{" "}
                          <span style={{ fontWeight: 600, color: "var(--color-status-normal)" }}>
                            {formatPercentage(bl.completeness_ratio)}
                          </span>
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <span style={{ color: "var(--color-text-tertiary)" }}>Captured:</span>{" "}
                          <span>{new Date(bl.captured_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CREATE SCENARIO MODAL ────────────────────────────────────────── */}
      {isCreateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create New Scenario"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "var(--color-bg-overlay, rgba(8, 12, 20, 0.85))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            zIndex: 999,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-default)",
              borderRadius: "var(--radius-lg, 12px)",
              width: "100%",
              maxWidth: "680px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--color-border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                  Create New Scenario
                </h3>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", margin: "0.2rem 0 0 0" }}>
                  Defines an isolated sandbox container with optional state overrides.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-tertiary)",
                  fontSize: "1.25rem",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateScenarioSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflowY: "auto" }}>
              <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {createValidationError && (
                  <div
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      color: "var(--color-status-failed)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    {createValidationError}
                  </div>
                )}

                {/* Scenario Name */}
                <div>
                  <label htmlFor="scenario-name-input" style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Scenario Name *
                  </label>
                  <input
                    id="scenario-name-input"
                    type="text"
                    required
                    placeholder="e.g. Extreme Weather Substation Trip"
                    value={newScenarioName}
                    onChange={(e) => setNewScenarioName(e.target.value)}
                    style={{
                      width: "100%",
                      backgroundColor: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-default)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.875rem",
                      color: "var(--color-text-primary)",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="scenario-desc-input" style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Description
                  </label>
                  <textarea
                    id="scenario-desc-input"
                    rows={2}
                    placeholder="Describe the hypothetical perturbation or disruption hypothesis…"
                    value={newScenarioDesc}
                    onChange={(e) => setNewScenarioDesc(e.target.value)}
                    style={{
                      width: "100%",
                      backgroundColor: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-default)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.8125rem",
                      color: "var(--color-text-primary)",
                      outline: "none",
                      resize: "vertical",
                    }}
                  />
                </div>

                {/* Base Reference Selector */}
                <div>
                  <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Base Reference
                  </span>
                  <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="baseType"
                        checked={newScenarioBaseType === "none"}
                        onChange={() => {
                          setNewScenarioBaseType("none");
                          setNewScenarioBaseId("");
                        }}
                      />
                      Current Live State
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="baseType"
                        checked={newScenarioBaseType === "snapshot"}
                        onChange={() => {
                          setNewScenarioBaseType("snapshot");
                          if (snapshots.length > 0) setNewScenarioBaseId(snapshots[0].id);
                        }}
                      />
                      Snapshot
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="baseType"
                        checked={newScenarioBaseType === "baseline"}
                        onChange={() => {
                          setNewScenarioBaseType("baseline");
                          if (baselines.length > 0) setNewScenarioBaseId(baselines[0].id);
                        }}
                      />
                      Baseline
                    </label>
                  </div>

                  {newScenarioBaseType === "snapshot" && (
                    <select
                      value={newScenarioBaseId}
                      onChange={(e) => setNewScenarioBaseId(e.target.value)}
                      style={{
                        width: "100%",
                        backgroundColor: "var(--color-bg-elevated)",
                        border: "1px solid var(--color-border-default)",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.45rem 0.6rem",
                        color: "var(--color-text-primary)",
                        fontSize: "0.8125rem",
                      }}
                    >
                      {snapshots.map((sn) => (
                        <option key={sn.id} value={sn.id}>
                          {sn.name || `Snapshot #${sn.id.slice(0, 8)}`} ({formatRelativeTime(sn.captured_at)})
                        </option>
                      ))}
                    </select>
                  )}

                  {newScenarioBaseType === "baseline" && (
                    <select
                      value={newScenarioBaseId}
                      onChange={(e) => setNewScenarioBaseId(e.target.value)}
                      style={{
                        width: "100%",
                        backgroundColor: "var(--color-bg-elevated)",
                        border: "1px solid var(--color-border-default)",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.45rem 0.6rem",
                        color: "var(--color-text-primary)",
                        fontSize: "0.8125rem",
                      }}
                    >
                      {baselines.map((bl) => (
                        <option key={bl.id} value={bl.id}>
                          {bl.name} ({formatRelativeTime(bl.captured_at)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Overrides Builder */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <div>
                      <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                        Hypothetical State Overrides
                      </span>
                      <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", display: "block" }}>
                        Specify which nodes will have isolated state perturbations
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAddOverrideRow}
                      disabled={!graphState?.nodes || graphState.nodes.length === 0}
                    >
                      + Add Node Override
                    </Button>
                  </div>

                  {newScenarioOverrides.length === 0 ? (
                    <div
                      style={{
                        padding: "1.25rem",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--color-bg-elevated)",
                        border: "1px dashed var(--color-border-default)",
                        textAlign: "center",
                        fontSize: "0.75rem",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      No overrides added yet. (Click &quot;+ Add Node Override&quot; to test a specific failure).
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {newScenarioOverrides.map((row, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 1.5fr 1fr 32px",
                            gap: "0.5rem",
                            alignItems: "center",
                            backgroundColor: "var(--color-bg-elevated)",
                            padding: "0.5rem 0.75rem",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--color-border-subtle)",
                          }}
                        >
                          {/* Node select */}
                          <select
                            value={row.nodeId}
                            onChange={(e) => handleUpdateOverrideRow(idx, "nodeId", e.target.value)}
                            style={{
                              backgroundColor: "var(--color-bg-surface)",
                              border: "1px solid var(--color-border-default)",
                              borderRadius: "var(--radius-sm)",
                              padding: "0.35rem 0.5rem",
                              fontSize: "0.75rem",
                              color: "var(--color-text-primary)",
                            }}
                          >
                            {graphState?.nodes.map((n) => (
                              <option key={n.node_id} value={n.node_id}>
                                {n.node_name} ({n.state})
                              </option>
                            ))}
                          </select>

                          {/* State select */}
                          <select
                            value={row.state}
                            onChange={(e) => handleUpdateOverrideRow(idx, "state", e.target.value)}
                            style={{
                              backgroundColor: "var(--color-bg-surface)",
                              border: "1px solid var(--color-border-default)",
                              borderRadius: "var(--radius-sm)",
                              padding: "0.35rem 0.5rem",
                              fontSize: "0.75rem",
                              color: "var(--color-text-primary)",
                            }}
                          >
                            <option value="FAILED">FAILED</option>
                            <option value="CRITICAL">CRITICAL</option>
                            <option value="DEGRADED">DEGRADED</option>
                            <option value="NORMAL">NORMAL</option>
                            <option value="RECOVERING">RECOVERING</option>
                            <option value="UNKNOWN">UNKNOWN</option>
                          </select>

                          {/* Health input */}
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            placeholder="Health (0-1)"
                            value={row.health}
                            onChange={(e) => handleUpdateOverrideRow(idx, "health", e.target.value)}
                            style={{
                              backgroundColor: "var(--color-bg-surface)",
                              border: "1px solid var(--color-border-default)",
                              borderRadius: "var(--radius-sm)",
                              padding: "0.35rem 0.5rem",
                              fontSize: "0.75rem",
                              color: "var(--color-text-primary)",
                            }}
                          />

                          {/* Delete row */}
                          <button
                            type="button"
                            onClick={() => handleRemoveOverrideRow(idx)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--color-status-failed)",
                              cursor: "pointer",
                              fontSize: "1rem",
                              lineHeight: 1,
                            }}
                            title="Remove override"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Advisory footer inside modal */}
                <div
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--color-text-tertiary)",
                    backgroundColor: "rgba(169, 154, 128, 0.05)",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(169, 154, 128, 0.15)",
                  }}
                >
                  Notice: Overrides are completely isolated in this scenario and will NOT mutate live operational telemetry or digital twin states.
                </div>
              </div>

              {/* Modal Actions */}
              <div
                style={{
                  padding: "1rem 1.5rem",
                  borderTop: "1px solid var(--color-border-subtle)",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  backgroundColor: "var(--color-bg-elevated)",
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={createSubmitting}
                  id="submit-create-scenario"
                >
                  Create Scenario
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
