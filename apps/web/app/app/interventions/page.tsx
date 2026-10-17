"use client";

/**
 * CAUSAL — /app/interventions: Counterfactual Simulation Engine
 *
 * Phase 7: Deterministic, auditable what-if simulation.
 *
 * Provides:
 * - Baseline selection (Phase 4 baselines / snapshots)
 * - Constrained typed intervention builder
 * - Paired simulation execution (Baseline vs Counterfactual)
 * - Differential outcome comparison with uncertainty disclosure
 * - Persisted experiment history and run retrieval
 *
 * SAFETY: All interventions are hypothetical only.
 * This page NEVER sends commands to live infrastructure.
 */

import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import {
  Panel,
  Badge,
  Button,
  LoadingState,
  EmptyState,
} from "@/components/ui";
import type {
  GraphResponse,
  NodeResponse,
  DependencyResponse,
  CounterfactualExperimentCreate,
  CounterfactualChangeCreate,
  CounterfactualChangeType,
  CounterfactualExperimentListItem,
  CounterfactualRunResultResponse,
  CounterfactualNodeDiff,
} from "@causal/shared/src/index";

// ── Local style helpers ──────────────────────────────────────────────────────

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

/** Type-safe change type display metadata */
const CHANGE_TYPE_META: Record<
  CounterfactualChangeType,
  { label: string; target: "NODE" | "DEPENDENCY"; valueLabel: string; example: string }
> = {
  STATE_OVERRIDE: {
    label: "Set Node State",
    target: "NODE",
    valueLabel: "State",
    example: "FAILED | DEGRADED | CRITICAL | NORMAL | RECOVERING",
  },
  HEALTH_OVERRIDE: {
    label: "Set Node Health",
    target: "NODE",
    valueLabel: "Health [0.0–1.0]",
    example: "e.g. 0.2",
  },
  CAPACITY_OVERRIDE: {
    label: "Set Node Capacity",
    target: "NODE",
    valueLabel: "Capacity [0.0–1.0]",
    example: "e.g. 0.5",
  },
  AVAILABILITY_OVERRIDE: {
    label: "Set Node Availability",
    target: "NODE",
    valueLabel: "Availability [0.0–1.0]",
    example: "e.g. 0.0",
  },
  DEPENDENCY_AVAILABILITY: {
    label: "Isolate / Restore Dependency",
    target: "DEPENDENCY",
    valueLabel: "Available (true/false)",
    example: "false = isolate, true = restore",
  },
  DEPENDENCY_STRENGTH: {
    label: "Set Dependency Strength",
    target: "DEPENDENCY",
    valueLabel: "Strength [0.0–1.0]",
    example: "e.g. 0.1",
  },
  DEPENDENCY_DELAY: {
    label: "Set Propagation Delay",
    target: "DEPENDENCY",
    valueLabel: "Delay (seconds ≥ 0)",
    example: "e.g. 300",
  },
};

const NODE_STATES = ["NORMAL", "DEGRADED", "CRITICAL", "FAILED", "RECOVERING"];

function statusColor(status: string): string {
  switch (status) {
    case "COMPLETED": return "var(--color-status-normal)";
    case "FAILED": return "var(--color-status-failed)";
    case "RUNNING": return "var(--color-status-degraded)";
    default: return "var(--color-text-tertiary)";
  }
}

function deltaColor(delta: number): string {
  if (delta < 0) return "var(--color-status-normal)";
  if (delta > 0) return "var(--color-status-failed)";
  return "var(--color-text-secondary)";
}

function categoryColor(cat?: string): string {
  switch (cat) {
    case "PREVENTED": return "var(--color-status-normal)";
    case "NEW_IMPACT": return "var(--color-status-failed)";
    case "DELAYED": return "var(--color-status-normal)";
    case "ACCELERATED": return "var(--color-status-failed)";
    case "SEVERITY_CHANGED": return "var(--color-status-degraded)";
    default: return "var(--color-text-secondary)";
  }
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function HypotheticalBadge() {
  return (
    <span
      aria-label="Hypothetical simulation — not live state"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.2rem 0.5rem",
        borderRadius: "var(--radius-sm)",
        backgroundColor: "rgba(139, 92, 246, 0.12)",
        border: "1px solid rgba(139, 92, 246, 0.3)",
        fontSize: "0.6875rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: "#a78bfa",
        fontFamily: "var(--font-mono)",
      }}
    >
      ◈ HYPOTHETICAL
    </span>
  );
}

function UncertaintyDisclosure({ warnings, limitations }: { warnings: string[]; limitations: string[] }) {
  return (
    <div
      style={{
        padding: "0.875rem 1rem",
        borderRadius: "var(--radius-md)",
        backgroundColor: "rgba(245, 158, 11, 0.06)",
        border: "1px solid rgba(245, 158, 11, 0.2)",
        fontSize: "0.75rem",
      }}
    >
      <p style={{ fontWeight: 700, color: "var(--color-status-degraded)", marginBottom: "0.5rem" }}>
        ⚠ Uncertainty & Limitations
      </p>
      {warnings.length > 0 && (
        <ul style={{ margin: "0 0 0.5rem 0", paddingLeft: "1.25rem", color: "var(--color-text-secondary)" }}>
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--color-text-tertiary)" }}>
        {limitations.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </div>
  );
}

function MetricCard({
  label, baseline, counterfactual, delta, unit = "",
}: {
  label: string; baseline: number; counterfactual: number; delta: number; unit?: string;
}) {
  return (
    <div
      style={{
        padding: "0.875rem",
        borderRadius: "var(--radius-md)",
        backgroundColor: "var(--color-bg-base)",
        border: "1px solid var(--color-border-subtle)",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginBottom: "0.375rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </p>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
          Baseline: <strong>{baseline}{unit}</strong>
        </span>
        <span style={{ color: "var(--color-text-tertiary)" }}>→</span>
        <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
          CF: <strong>{counterfactual}{unit}</strong>
        </span>
        {delta !== 0 && (
          <span
            style={{ fontSize: "0.8125rem", fontWeight: 700, color: deltaColor(delta) }}
          >
            ({delta > 0 ? "+" : ""}{delta}{unit})
          </span>
        )}
      </div>
    </div>
  );
}

function NodeDiffRow({ node, category }: { node: CounterfactualNodeDiff; category: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.625rem 0.875rem",
        borderRadius: "var(--radius-sm)",
        backgroundColor: "var(--color-bg-base)",
        border: "1px solid var(--color-border-subtle)",
        fontSize: "0.8125rem",
      }}
    >
      <span style={{ flex: "1 1 140px", fontWeight: 600, color: "var(--color-text-primary)" }}>
        {node.node_name}
      </span>
      <span
        style={{
          padding: "0.15rem 0.45rem",
          borderRadius: "var(--radius-sm)",
          backgroundColor: "rgba(139,92,246,0.1)",
          fontSize: "0.6875rem",
          color: "#a78bfa",
          fontFamily: "var(--font-mono)",
        }}
      >
        crit: {(node.criticality * 100).toFixed(0)}%
      </span>
      <span
        style={{
          padding: "0.15rem 0.45rem",
          borderRadius: "var(--radius-sm)",
          fontSize: "0.6875rem",
          fontWeight: 700,
          color: categoryColor(node.difference_category ?? category),
          backgroundColor: "rgba(0,0,0,0.12)",
        }}
      >
        {node.difference_category ?? category}
      </span>
      {node.time_delta_seconds !== undefined && node.time_delta_seconds !== null && (
        <span style={{ fontSize: "0.75rem", color: deltaColor(node.time_delta_seconds) }}>
          Δt {node.time_delta_seconds > 0 ? "+" : ""}{node.time_delta_seconds.toFixed(0)}s
        </span>
      )}
      {node.explanation && (
        <span style={{ flex: "1 1 100%", color: "var(--color-text-tertiary)", fontSize: "0.75rem", paddingTop: "0.25rem" }}>
          {node.explanation}
        </span>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CounterfactualPage() {

  // ── Context State ────────────────────────────────────────────────────────
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string>("");
  const [nodes, setNodes] = useState<NodeResponse[]>([]);
  const [dependencies, setDependencies] = useState<DependencyResponse[]>([]);

  type BaselineOption = { id: string; name: string; type: "baseline" | "snapshot"; completeness?: number };
  const [baselines, setBaselines] = useState<BaselineOption[]>([]);

  // ── Experiment Builder State ─────────────────────────────────────────────
  const [expName, setExpName] = useState<string>("");
  const [expDescription, setExpDescription] = useState<string>("");
  const [selectedBaselineId, setSelectedBaselineId] = useState<string>("");
  const [selectedBaselineType, setSelectedBaselineType] = useState<"baseline" | "snapshot">("baseline");
  const [changes, setChanges] = useState<CounterfactualChangeCreate[]>([]);

  // Forecast settings
  const [horizonMinutes, setHorizonMinutes] = useState<number>(60);
  const [maxDepth, setMaxDepth] = useState<number>(5);
  const [seed, setSeed] = useState<number>(42);
  const [initiatingNodeId, setInitiatingNodeId] = useState<string>("");

  // New change form
  const [newChangeType, setNewChangeType] = useState<CounterfactualChangeType>("STATE_OVERRIDE");
  const [newTargetId, setNewTargetId] = useState<string>("");
  const [newValue, setNewValue] = useState<string>("");
  const [newRationale, setNewRationale] = useState<string>("");

  // ── Experiment History & Results State ────────────────────────────────────
  const [history, setHistory] = useState<CounterfactualExperimentListItem[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<CounterfactualRunResultResponse | null>(null);

  // ── UI State ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"builder" | "comparison" | "history">("builder");
  const [loadingInit, setLoadingInit] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Load Initial Data ────────────────────────────────────────────────────
  const loadInitialData = useCallback(async () => {
    setLoadingInit(true);
    setError(null);
    try {
      const graphList = await apiClient.listGraphs();
      setGraphs(graphList);
      if (graphList.length > 0) {
        const firstId = graphList[0].id;
        setSelectedGraphId(firstId);
        // eslint-disable-next-line react-hooks/immutability
        await loadGraphContext(firstId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load infrastructure graphs.");
    } finally {
      setLoadingInit(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadGraphContext = async (graphId: string) => {
    try {
      const [nodeList, depList, baselineList, snapshotList, historyList] = await Promise.all([
        apiClient.listNodes(graphId),
        apiClient.listDependencies(graphId),
        apiClient.listBaselines(graphId),
        apiClient.listSnapshots(graphId),
        apiClient.listCounterfactualExperiments(graphId, { page_size: 20 }),
      ]);
      setNodes(nodeList);
      setDependencies(depList);

      const allBaselines: BaselineOption[] = [
        ...baselineList.map((b) => ({
          id: b.id,
          name: b.name || "Baseline",
          type: "baseline" as const,
          completeness: (b as unknown as Record<string, unknown>).completeness_ratio as number | undefined,
        })),
        ...snapshotList.map((s) => ({
          id: s.id,
          name: s.name || `Snapshot ${s.id.slice(0, 8)}`,
          type: "snapshot" as const,
          completeness: (s as unknown as Record<string, unknown>).completeness_ratio as number | undefined,
        })),
      ];
      setBaselines(allBaselines);
      setHistory(historyList.items);

      // Reset builder selections
      setSelectedBaselineId(allBaselines.length > 0 ? allBaselines[0].id : "");
      setSelectedBaselineType(allBaselines.length > 0 ? allBaselines[0].type : "baseline");
      setChanges([]);
      setNewTargetId(nodeList.length > 0 ? nodeList[0].id : "");
      setInitiatingNodeId("");
      setActiveResult(null);
      setSelectedExpId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph context.");
    }
  };

  const loadExperimentResult = async (graphId: string, expId: string) => {
    try {
      const result = await apiClient.getCounterfactualResults(graphId, expId);
      setActiveResult(result);
      setSelectedExpId(expId);
      setActiveTab("comparison");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load experiment result.");
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleGraphChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedGraphId(newId);
    await loadGraphContext(newId);
  };

  const handleBaselineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedBaselineId(id);
    const found = baselines.find((b) => b.id === id);
    setSelectedBaselineType(found?.type ?? "baseline");
  };

  const handleChangeTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ct = e.target.value as CounterfactualChangeType;
    setNewChangeType(ct);
    const meta = CHANGE_TYPE_META[ct];
    // Reset target selection based on type
    if (meta.target === "NODE" && nodes.length > 0) {
      setNewTargetId(nodes[0].id);
    } else if (meta.target === "DEPENDENCY" && dependencies.length > 0) {
      setNewTargetId(dependencies[0].id);
    }
    setNewValue("");
  };

  const handleAddChange = () => {
    setValidationError(null);
    const meta = CHANGE_TYPE_META[newChangeType];

    if (!newTargetId) {
      setValidationError("Select a target.");
      return;
    }
    if (!newValue.trim()) {
      setValidationError("Enter a value.");
      return;
    }

    // Parse value
    let parsedValue: string | number | boolean = newValue.trim();

    if (newChangeType === "STATE_OVERRIDE") {
      const upper = parsedValue.toUpperCase();
      if (!NODE_STATES.includes(upper)) {
        setValidationError(`State must be one of: ${NODE_STATES.join(", ")}`);
        return;
      }
      parsedValue = upper;
    } else if (newChangeType === "DEPENDENCY_AVAILABILITY") {
      if (parsedValue.toLowerCase() === "true" || parsedValue === "1") parsedValue = true;
      else if (parsedValue.toLowerCase() === "false" || parsedValue === "0") parsedValue = false;
      else { setValidationError("Enter true or false."); return; }
    } else if (newChangeType === "DEPENDENCY_DELAY") {
      const n = parseFloat(parsedValue as string);
      if (isNaN(n) || n < 0) { setValidationError("Delay must be a non-negative number."); return; }
      parsedValue = n;
    } else {
      const n = parseFloat(parsedValue as string);
      if (isNaN(n) || n < 0 || n > 1) {
        setValidationError(`${meta.valueLabel} must be between 0.0 and 1.0.`);
        return;
      }
      parsedValue = n;
    }

    const change: CounterfactualChangeCreate = {
      target_type: meta.target,
      target_id: newTargetId,
      change_type: newChangeType,
      proposed_value: parsedValue,
      rationale: newRationale.trim() || null,
    };

    setChanges((prev) => [...prev, change]);
    setNewValue("");
    setNewRationale("");
  };

  const handleRemoveChange = (idx: number) => {
    setChanges((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateAndRun = async () => {
    if (!selectedGraphId) return;
    if (!expName.trim()) { setError("Experiment name is required."); return; }
    if (changes.length === 0) { setError("At least one hypothetical change is required."); return; }

    setCreating(true);
    setError(null);
    try {
      const payload: CounterfactualExperimentCreate = {
        name: expName.trim(),
        description: expDescription.trim() || null,
        ...(selectedBaselineType === "baseline" && selectedBaselineId
          ? { baseline_id: selectedBaselineId }
          : selectedBaselineId
          ? { snapshot_id: selectedBaselineId }
          : {}),
        forecast_settings: {
          horizon_minutes: horizonMinutes,
          max_depth: maxDepth,
          seed,
          simulation_mode: "DETERMINISTIC",
          initiating_node_id: initiatingNodeId || null,
        },
        changes,
      };

      const exp = await apiClient.createCounterfactualExperiment(selectedGraphId, payload);
      setCreating(false);
      setRunning(true);

      const result = await apiClient.runCounterfactualExperiment(selectedGraphId, exp.id);
      setActiveResult(result);
      setSelectedExpId(exp.id);
      setActiveTab("comparison");

      // Refresh history
      const historyList = await apiClient.listCounterfactualExperiments(selectedGraphId, { page_size: 20 });
      setHistory(historyList.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Experiment failed.");
    } finally {
      setCreating(false);
      setRunning(false);
    }
  };

  // ── Guard states ─────────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <div style={{ padding: "3rem 2rem", maxWidth: 1400, margin: "0 auto" }}>
        <LoadingState message="Initializing Counterfactual Simulation Engine..." />
      </div>
    );
  }

  if (graphs.length === 0) {
    return (
      <div style={{ padding: "4rem 2rem", maxWidth: 800, margin: "0 auto" }}>
        <EmptyState
          title="No Infrastructure Graphs Available"
          description="Create or configure an infrastructure graph to run counterfactual what-if simulations."
          icon="◈"
          action={{
            label: "Explore System State",
            onClick: () => { window.location.href = "/app/state"; },
          }}
        />
      </div>
    );
  }

  const activeChangeTarget = CHANGE_TYPE_META[newChangeType].target;
  const targetOptions = activeChangeTarget === "NODE" ? nodes : dependencies;

  const comparison = activeResult?.comparison ?? null;
  const experiment = activeResult?.experiment ?? null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="causal-fade-in" style={{ padding: "1.5rem", maxWidth: 1600, margin: "0 auto" }}>
      {/* ── Page Header ────────────────────────────────────────── */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
              Counterfactual Simulation
            </h1>
            <Badge variant="simulation">Phase 7 · What-If Engine</Badge>
            <HypotheticalBadge />
          </div>
          <p style={{ color: "var(--color-text-tertiary)", fontSize: "0.8125rem", margin: 0 }}>
            Deterministic what-if analysis comparing baseline and hypothetical trajectories. Model-dependent estimates only.
          </p>
        </div>

        {/* Safety notice */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.35rem 0.75rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "rgba(139, 92, 246, 0.08)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            fontSize: "0.75rem",
            color: "#a78bfa",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span>◈</span>
          <span>Isolated simulation — never modifies live infrastructure</span>
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: "1.5rem",
            padding: "0.875rem 1.25rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-status-failed-bg)",
            border: "1px solid var(--color-status-failed-border)",
            color: "var(--color-status-failed)",
            fontSize: "0.8125rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>✕</Button>
        </div>
      )}

      {/* ── Graph Selector ───────────────────────────────────────── */}
      <Panel elevation="base" padding="1rem" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>
            <label style={LABEL_STYLE}>Infrastructure Graph</label>
            <select
              id="select-cf-graph"
              value={selectedGraphId}
              onChange={handleGraphChange}
              style={INPUT_STYLE}
            >
              {graphs.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.domain})</option>
              ))}
            </select>
          </div>
          <div style={{ flex: "0 0 auto", paddingTop: "1.25rem" }}>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
              {nodes.length} nodes · {dependencies.length} dependencies · {baselines.length} baselines
            </p>
          </div>
        </div>
      </Panel>

      {/* ── Tab Navigation ───────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.25rem",
          borderBottom: "1px solid var(--color-border-subtle)",
          paddingBottom: "0",
        }}
      >
        {(["builder", "comparison", "history"] as const).map((tab) => (
          <button
            key={tab}
            id={`tab-cf-${tab}`}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--color-accent)" : "2px solid transparent",
              backgroundColor: "transparent",
              color: activeTab === tab ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              fontSize: "0.8125rem",
              fontWeight: activeTab === tab ? 700 : 400,
              cursor: "pointer",
              transition: "all var(--duration-fast)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {tab === "builder" ? "⊕ Experiment Builder"
              : tab === "comparison" ? "⊞ Comparison Results"
              : "⊟ Run History"}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: EXPERIMENT BUILDER                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "builder" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {/* Left Column: Configuration */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* Experiment Metadata */}
            <Panel elevation="elevated" padding="1.25rem">
              <p style={{ fontWeight: 700, marginBottom: "1rem", fontSize: "0.875rem" }}>
                1 · Experiment Details
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label htmlFor="cf-exp-name" style={LABEL_STYLE}>Experiment Name *</label>
                  <input
                    id="cf-exp-name"
                    type="text"
                    value={expName}
                    onChange={(e) => setExpName(e.target.value)}
                    placeholder="e.g. Backup generator contingency"
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <label htmlFor="cf-exp-desc" style={LABEL_STYLE}>Description (optional)</label>
                  <textarea
                    id="cf-exp-desc"
                    value={expDescription}
                    onChange={(e) => setExpDescription(e.target.value)}
                    placeholder="Describe the hypothetical scenario being tested..."
                    rows={2}
                    style={{ ...INPUT_STYLE, resize: "vertical" }}
                  />
                </div>
              </div>
            </Panel>

            {/* Baseline Selection */}
            <Panel elevation="elevated" padding="1.25rem">
              <p style={{ fontWeight: 700, marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                2 · Baseline Selection
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginBottom: "0.875rem" }}>
                Select an immutable Phase 4 baseline or snapshot. The baseline is held fixed and not modified.
              </p>
              <div>
                <label htmlFor="cf-baseline-select" style={LABEL_STYLE}>Observed Baseline</label>
                <select
                  id="cf-baseline-select"
                  value={selectedBaselineId}
                  onChange={handleBaselineChange}
                  style={INPUT_STYLE}
                >
                  <option value="">— Current live state (no explicit baseline) —</option>
                  {baselines.map((b) => (
                    <option key={b.id} value={b.id}>
                      [{b.type.toUpperCase()}] {b.name}
                      {b.completeness !== undefined ? ` (${(b.completeness * 100).toFixed(0)}% coverage)` : ""}
                    </option>
                  ))}
                </select>
              </div>
              {selectedBaselineId && (
                <p style={{ fontSize: "0.75rem", color: "var(--color-status-normal)", marginTop: "0.5rem" }}>
                  ✓ Baseline selected — immutable, will not be modified by simulation
                </p>
              )}
              {!selectedBaselineId && (
                <p style={{ fontSize: "0.75rem", color: "var(--color-status-degraded)", marginTop: "0.5rem" }}>
                  ⚠ No baseline selected — simulation will use current live node states
                </p>
              )}
            </Panel>

            {/* Simulation Settings */}
            <Panel elevation="elevated" padding="1.25rem">
              <p style={{ fontWeight: 700, marginBottom: "0.75rem", fontSize: "0.875rem" }}>
                3 · Simulation Settings
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label htmlFor="cf-horizon" style={LABEL_STYLE}>Horizon (minutes)</label>
                  <input
                    id="cf-horizon"
                    type="number"
                    min={1} max={1440} step={1}
                    value={horizonMinutes}
                    onChange={(e) => setHorizonMinutes(Number(e.target.value))}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <label htmlFor="cf-depth" style={LABEL_STYLE}>Max Depth</label>
                  <input
                    id="cf-depth"
                    type="number"
                    min={1} max={20} step={1}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Number(e.target.value))}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <label htmlFor="cf-seed" style={LABEL_STYLE}>Reproducibility Seed</label>
                  <input
                    id="cf-seed"
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <label htmlFor="cf-init-node" style={LABEL_STYLE}>Initiating Node (disturbance)</label>
                  <select
                    id="cf-init-node"
                    value={initiatingNodeId}
                    onChange={(e) => setInitiatingNodeId(e.target.value)}
                    style={INPUT_STYLE}
                  >
                    <option value="">— Auto detect degraded nodes —</option>
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>{n.name} [{n.state}]</option>
                    ))}
                  </select>
                </div>
              </div>
            </Panel>
          </div>

          {/* Right Column: Intervention Builder */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <Panel elevation="elevated" padding="1.25rem">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <p style={{ fontWeight: 700, fontSize: "0.875rem", margin: 0 }}>
                  4 · Hypothetical Interventions
                </p>
                <HypotheticalBadge />
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginBottom: "1rem" }}>
                Define hypothetical changes applied only to the isolated simulation copy.
                Live infrastructure is never touched.
              </p>

              {/* Add change form */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                <div>
                  <label htmlFor="cf-change-type" style={LABEL_STYLE}>Operation Type</label>
                  <select
                    id="cf-change-type"
                    value={newChangeType}
                    onChange={handleChangeTypeChange}
                    style={INPUT_STYLE}
                  >
                    {(Object.keys(CHANGE_TYPE_META) as CounterfactualChangeType[]).map((ct) => (
                      <option key={ct} value={ct}>{CHANGE_TYPE_META[ct].label}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>
                    Target: {CHANGE_TYPE_META[newChangeType].target}
                  </p>
                </div>

                <div>
                  <label htmlFor="cf-target-id" style={LABEL_STYLE}>
                    Target {CHANGE_TYPE_META[newChangeType].target === "NODE" ? "Node" : "Dependency"}
                  </label>
                  <select
                    id="cf-target-id"
                    value={newTargetId}
                    onChange={(e) => setNewTargetId(e.target.value)}
                    style={INPUT_STYLE}
                  >
                    {targetOptions.length === 0 && (
                      <option value="">— No {activeChangeTarget.toLowerCase()}s available —</option>
                    )}
                    {(activeChangeTarget === "NODE" ? nodes : dependencies).map((item) => (
                      <option key={item.id} value={item.id}>
                        {(item as NodeResponse).name ??
                          `${(item as DependencyResponse).source_node_id} → ${(item as DependencyResponse).target_node_id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cf-change-value" style={LABEL_STYLE}>
                    {CHANGE_TYPE_META[newChangeType].valueLabel}
                  </label>
                  {newChangeType === "STATE_OVERRIDE" ? (
                    <select
                      id="cf-change-value"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      style={INPUT_STYLE}
                    >
                      <option value="">— Select state —</option>
                      {NODE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : newChangeType === "DEPENDENCY_AVAILABILITY" ? (
                    <select
                      id="cf-change-value"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      style={INPUT_STYLE}
                    >
                      <option value="">— Select —</option>
                      <option value="false">false (isolate / sever)</option>
                      <option value="true">true (restore connection)</option>
                    </select>
                  ) : (
                    <input
                      id="cf-change-value"
                      type="number"
                      step="0.01"
                      placeholder={CHANGE_TYPE_META[newChangeType].example}
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      style={INPUT_STYLE}
                    />
                  )}
                </div>

                <div>
                  <label htmlFor="cf-change-rationale" style={LABEL_STYLE}>Rationale (optional)</label>
                  <input
                    id="cf-change-rationale"
                    type="text"
                    placeholder="e.g. Backup generator engages on grid failure"
                    value={newRationale}
                    onChange={(e) => setNewRationale(e.target.value)}
                    style={INPUT_STYLE}
                  />
                </div>

                {validationError && (
                  <p style={{ fontSize: "0.75rem", color: "var(--color-status-failed)" }}>
                    ✕ {validationError}
                  </p>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddChange}
                  id="btn-add-cf-change"
                  disabled={!newTargetId || !newValue}
                >
                  ⊕ Add Intervention
                </Button>
              </div>

              {/* Staged changes list */}
              {changes.length === 0 ? (
                <div
                  style={{
                    padding: "1.5rem",
                    textAlign: "center",
                    color: "var(--color-text-tertiary)",
                    fontSize: "0.8125rem",
                    border: "1px dashed var(--color-border-subtle)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  No interventions staged yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", fontWeight: 600 }}>
                    Staged interventions ({changes.length}):
                  </p>
                  {changes.map((ch, idx) => {
                    const targetName =
                      ch.target_type === "NODE"
                        ? nodes.find((n) => n.id === ch.target_id)?.name ?? ch.target_id
                        : `Dependency ${ch.target_id.substring(0, 8)}…`;
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "rgba(139,92,246,0.06)",
                          border: "1px solid rgba(139,92,246,0.2)",
                          fontSize: "0.75rem",
                          gap: "0.5rem",
                        }}
                      >
                        <span>
                          <strong style={{ color: "#a78bfa" }}>[HYPOTHETICAL]</strong>{" "}
                          {CHANGE_TYPE_META[ch.change_type].label} on{" "}
                          <strong>{targetName}</strong> → <code>{String(ch.proposed_value)}</code>
                          {ch.rationale && (
                            <span style={{ color: "var(--color-text-tertiary)" }}> — {ch.rationale}</span>
                          )}
                        </span>
                        <button
                          onClick={() => handleRemoveChange(idx)}
                          style={{
                            border: "none", background: "none",
                            color: "var(--color-text-tertiary)", cursor: "pointer",
                            fontSize: "0.875rem", flexShrink: 0,
                          }}
                          aria-label="Remove intervention"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* Run Button */}
            <Button
              variant="primary"
              size="lg"
              onClick={handleCreateAndRun}
              id="btn-run-cf-experiment"
              disabled={creating || running || !expName.trim() || changes.length === 0}
              style={{ width: "100%" }}
            >
              {creating
                ? "Creating Experiment…"
                : running
                ? "Running Simulation…"
                : "▶ Execute Counterfactual Simulation"}
            </Button>

            {(creating || running) && (
              <div style={{ textAlign: "center" }}>
                <LoadingState
                  message={
                    creating
                      ? "Defining experiment and validating interventions…"
                      : "Running baseline and counterfactual branches through Phase 6 engine…"
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: COMPARISON RESULTS                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "comparison" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {!activeResult || !comparison ? (
            <EmptyState
              title="No Comparison Available"
              description="Run a counterfactual experiment to see baseline vs counterfactual trajectory comparison."
              icon="⊞"
              action={{ label: "Go to Builder", onClick: () => setActiveTab("builder") }}
            />
          ) : (
            <>
              {/* Experiment Provenance */}
              <Panel elevation="elevated" padding="1.25rem">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                      <p style={{ fontWeight: 700, fontSize: "0.9375rem", margin: 0 }}>{experiment?.name}</p>
                      <HypotheticalBadge />
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: statusColor(experiment?.status ?? ""),
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {experiment?.status}
                      </span>
                    </div>
                    {experiment?.description && (
                      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", margin: 0 }}>
                        {experiment.description}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.75rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    <p style={{ margin: 0 }}>Rule v{experiment?.rule_version}</p>
                    <p style={{ margin: 0 }}>Completed: {experiment?.completed_at ? new Date(experiment.completed_at).toLocaleString() : "N/A"}</p>
                  </div>
                </div>
              </Panel>

              {/* Applied Interventions */}
              <Panel elevation="base" padding="1.25rem">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <p style={{ fontWeight: 700, fontSize: "0.875rem", margin: 0 }}>Applied Hypothetical Interventions</p>
                  <HypotheticalBadge />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {(experiment?.changes ?? []).map((ch) => {
                    const targetName = nodes.find((n) => n.id === ch.target_id)?.name ?? ch.target_id.substring(0, 8) + "…";
                    return (
                      <div
                        key={ch.id}
                        style={{
                          padding: "0.5rem 0.75rem",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "rgba(139,92,246,0.06)",
                          border: "1px solid rgba(139,92,246,0.2)",
                          fontSize: "0.75rem",
                        }}
                      >
                        <span style={{ color: "#a78bfa", fontWeight: 700 }}>[HYPOTHETICAL]</span>{" "}
                        <strong>{ch.change_type}</strong> on <strong>{targetName}</strong>:{" "}
                        {ch.original_value !== null && <span style={{ color: "var(--color-text-tertiary)" }}>{String(ch.original_value)} → </span>}
                        <strong>{String(ch.proposed_value)}</strong>
                        {ch.rationale && <span style={{ color: "var(--color-text-tertiary)" }}> — {ch.rationale}</span>}
                      </div>
                    );
                  })}
                </div>
              </Panel>

              {/* Comparison Metrics Grid */}
              <Panel elevation="elevated" padding="1.25rem">
                <p style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.875rem" }}>
                  Differential Outcome Metrics
                  <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginLeft: "0.5rem" }}>
                    (model-dependent estimates — not real-world guarantees)
                  </span>
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
                  <MetricCard
                    label="Blast Radius (Nodes)"
                    baseline={comparison.comparison_metrics.baseline_blast_radius_count}
                    counterfactual={comparison.comparison_metrics.counterfactual_blast_radius_count}
                    delta={comparison.comparison_metrics.blast_radius_reduction_count * -1}
                  />
                  <MetricCard
                    label="Critical Nodes Affected"
                    baseline={comparison.comparison_metrics.baseline_critical_affected_count}
                    counterfactual={comparison.comparison_metrics.counterfactual_critical_affected_count}
                    delta={comparison.comparison_metrics.counterfactual_critical_affected_count - comparison.comparison_metrics.baseline_critical_affected_count}
                  />
                  <MetricCard
                    label="Composite Impact"
                    baseline={comparison.comparison_metrics.baseline_composite_impact_percent}
                    counterfactual={comparison.comparison_metrics.counterfactual_composite_impact_percent}
                    delta={comparison.comparison_metrics.composite_impact_delta_percent}
                    unit="%"
                  />
                  <MetricCard
                    label="Propagation Depth"
                    baseline={comparison.comparison_metrics.baseline_max_depth}
                    counterfactual={comparison.comparison_metrics.counterfactual_max_depth}
                    delta={comparison.comparison_metrics.counterfactual_max_depth - comparison.comparison_metrics.baseline_max_depth}
                  />
                </div>

                {/* Critical summary badges */}
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1rem" }}>
                  {comparison.comparison_metrics.nodes_prevented_count > 0 && (
                    <div
                      style={{
                        padding: "0.5rem 1rem",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "rgba(34,197,94,0.08)",
                        border: "1px solid rgba(34,197,94,0.25)",
                        fontSize: "0.8125rem",
                        color: "var(--color-status-normal)",
                        fontWeight: 700,
                      }}
                    >
                      ✓ {comparison.comparison_metrics.nodes_prevented_count} node(s) prevented from impact
                    </div>
                  )}
                  {comparison.comparison_metrics.nodes_newly_affected_count > 0 && (
                    <div
                      style={{
                        padding: "0.5rem 1rem",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.25)",
                        fontSize: "0.8125rem",
                        color: "var(--color-status-failed)",
                        fontWeight: 700,
                      }}
                    >
                      ⚠ {comparison.comparison_metrics.nodes_newly_affected_count} new node(s) affected in counterfactual
                    </div>
                  )}
                </div>
              </Panel>

              {/* Node Diff Tables */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                {/* Prevented */}
                <Panel elevation="base" padding="1.25rem">
                  <p style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.75rem", color: "var(--color-status-normal)" }}>
                    ✓ Prevented (baseline only) — {comparison.nodes_affected_baseline_only.length}
                  </p>
                  {comparison.nodes_affected_baseline_only.length === 0 ? (
                    <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>
                      No nodes exclusively prevented in counterfactual.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {comparison.nodes_affected_baseline_only.map((n) => (
                        <NodeDiffRow key={n.node_id} node={n} category="PREVENTED" />
                      ))}
                    </div>
                  )}
                </Panel>

                {/* New Impact */}
                <Panel elevation="base" padding="1.25rem">
                  <p style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.75rem", color: "var(--color-status-failed)" }}>
                    ⚠ New Impact (counterfactual only) — {comparison.nodes_affected_counterfactual_only.length}
                  </p>
                  {comparison.nodes_affected_counterfactual_only.length === 0 ? (
                    <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>
                      No new adverse impacts introduced in counterfactual.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {comparison.nodes_affected_counterfactual_only.map((n) => (
                        <NodeDiffRow key={n.node_id} node={n} category="NEW_IMPACT" />
                      ))}
                    </div>
                  )}
                </Panel>
              </div>

              {/* Affected in Both + Timing Differences */}
              {comparison.nodes_affected_both.length > 0 && (
                <Panel elevation="base" padding="1.25rem">
                  <p style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.75rem" }}>
                    ⊞ Affected in Both Branches — {comparison.nodes_affected_both.length}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {comparison.nodes_affected_both.map((n) => (
                      <NodeDiffRow key={n.node_id} node={n} category="UNCHANGED" />
                    ))}
                  </div>
                </Panel>
              )}

              {/* Timing & Severity Differences */}
              {(comparison.nodes_timing_differ.length > 0 || comparison.nodes_severity_differ.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                  {comparison.nodes_timing_differ.length > 0 && (
                    <Panel elevation="base" padding="1.25rem">
                      <p style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.75rem" }}>
                        ⧗ Timing Differences — {comparison.nodes_timing_differ.length}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {comparison.nodes_timing_differ.map((n, i) => (
                          <NodeDiffRow key={i} node={n} category={n.difference_category ?? ""} />
                        ))}
                      </div>
                    </Panel>
                  )}
                  {comparison.nodes_severity_differ.length > 0 && (
                    <Panel elevation="base" padding="1.25rem">
                      <p style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.75rem" }}>
                        ≋ Severity Differences — {comparison.nodes_severity_differ.length}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {comparison.nodes_severity_differ.map((n, i) => (
                          <NodeDiffRow key={i} node={n} category="SEVERITY_CHANGED" />
                        ))}
                      </div>
                    </Panel>
                  )}
                </div>
              )}

              {/* Uncertainty Disclosure */}
              <UncertaintyDisclosure
                warnings={comparison.warnings}
                limitations={comparison.limitations}
              />

              {/* Reproducibility Metadata */}
              <Panel elevation="base" padding="1rem">
                <p style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginBottom: "0.5rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Reproducibility Metadata
                </p>
                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                  <span>Experiment: {activeResult.experiment.id.substring(0, 8)}…</span>
                  <span>Baseline Forecast: {activeResult.experiment.baseline_forecast_id?.substring(0, 8) ?? "N/A"}…</span>
                  <span>CF Forecast: {activeResult.experiment.counterfactual_forecast_id?.substring(0, 8) ?? "N/A"}…</span>
                  <span>Horizon: {comparison.comparison_metrics.horizon_minutes}m</span>
                  <span>Rule v{activeResult.experiment.rule_version}</span>
                  <span>Calibration: {comparison.uncertainty_differences.calibration_status}</span>
                </div>
              </Panel>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: RUN HISTORY                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontWeight: 700, fontSize: "0.875rem", margin: 0 }}>
              Experiment Run History — {history.length} runs
            </p>
            <Button
              variant="ghost"
              size="sm"
              id="btn-refresh-cf-history"
              onClick={async () => {
                setLoadingHistory(true);
                try {
                  const list = await apiClient.listCounterfactualExperiments(selectedGraphId, { page_size: 20 });
                  setHistory(list.items);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to refresh history.");
                } finally {
                  setLoadingHistory(false);
                }
              }}
              disabled={loadingHistory}
            >
              {loadingHistory ? "Refreshing…" : "↺ Refresh"}
            </Button>
          </div>

          {history.length === 0 ? (
            <EmptyState
              title="No Experiments Run Yet"
              description="Run a counterfactual experiment to see it in history."
              icon="⊟"
              action={{ label: "Go to Builder", onClick: () => setActiveTab("builder") }}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {history.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.875rem 1.25rem",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: selectedExpId === item.id
                      ? "var(--color-bg-elevated)"
                      : "var(--color-bg-surface)",
                    border: selectedExpId === item.id
                      ? "1px solid var(--color-accent)"
                      : "1px solid var(--color-border-subtle)",
                    cursor: "pointer",
                    transition: "all var(--duration-fast)",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                  onClick={() => loadExperimentResult(selectedGraphId, item.id)}
                  id={`cf-history-item-${item.id.substring(0, 8)}`}
                >
                  <div>
                    <p style={{ fontWeight: 700, fontSize: "0.875rem", margin: "0 0 0.25rem 0" }}>
                      {item.name}
                    </p>
                    <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.75rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)", flexWrap: "wrap" }}>
                      <span>ID: {item.id.substring(0, 8)}…</span>
                      <span>
                        {(item.total_changes ?? (item as unknown as { changes_count?: number }).changes_count ?? 0)} intervention
                        {(item.total_changes ?? (item as unknown as { changes_count?: number }).changes_count ?? 0) !== 1 ? "s" : ""}
                      </span>
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: statusColor(item.status),
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {item.status}
                    </span>
                    {item.status === "COMPLETED" && (
                      <Button variant="ghost" size="sm">View Results →</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
