"use client";

/**
 * CAUSAL — /app/simulation: Cascade Prediction Engine
 *
 * Phase 6: Probabilistic, Time-Aware Downstream Failure Cascade Forecasting.
 *
 * Provides:
 * - Horizon & traversal bounding controls
 * - Strict distinction between observed current states and forecast predictions
 * - Time-to-impact ranges and heuristic probability intervals
 * - Chronological cascade timeline
 * - Auditable historical forecast runs
 * - Comprehensive loading, empty, and error handling
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
  CascadeForecastResponse,
  CascadeForecastListItem,
  CascadeTimelineEvent,
  SimulationMode,
} from "@causal/shared/src/index";

export default function SimulationPage() {
  // Graph & Node Selection
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string>("");
  const [nodes, setNodes] = useState<NodeResponse[]>([]);
  const [initiatingNodeId, setInitiatingNodeId] = useState<string>("");

  // Simulation Controls
  const [horizonMinutes, setHorizonMinutes] = useState<number>(60);
  const [maxDepth, setMaxDepth] = useState<number>(5);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>("DETERMINISTIC");
  const [seed, setSeed] = useState<number>(42);
  const probabilityThreshold = 0.2;

  // Forecast Execution & State
  const [activeForecast, setActiveForecast] = useState<CascadeForecastResponse | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<CascadeTimelineEvent[]>([]);
  const [forecastHistory, setForecastHistory] = useState<CascadeForecastListItem[]>([]);
  const [selectedTab, setSelectedTab] = useState<"nodes" | "timeline" | "paths" | "assumptions">("nodes");

  // UX state
  const [loadingGraphs, setLoadingGraphs] = useState<boolean>(true);
  const [runningForecast, setRunningForecast] = useState<boolean>(false);
  const [loadingForecastDetails, setLoadingForecastDetails] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load Graphs ──────────────────────────────────────────────────────────
  const loadInitialData = useCallback(async () => {
    setLoadingGraphs(true);
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
      setLoadingGraphs(false);
    }
  }, []);

  const loadGraphContext = async (graphId: string) => {
    try {
      const [nodeList, historyList] = await Promise.all([
        apiClient.listNodes(graphId),
        apiClient.listCascadeForecasts(graphId, { page_size: 10 }),
      ]);
      setNodes(nodeList);
      setForecastHistory(historyList.items);

      // If history exists, load the latest run by default
      if (historyList.items.length > 0) {
        await loadForecastDetails(graphId, historyList.items[0].id);
      } else {
        setActiveForecast(null);
        setTimelineEvents([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph context.");
    }
  };

  const loadForecastDetails = async (graphId: string, forecastId: string) => {
    setLoadingForecastDetails(true);
    try {
      const [details, timeline] = await Promise.all([
        apiClient.getCascadeForecast(graphId, forecastId),
        apiClient.getCascadeForecastTimeline(graphId, forecastId),
      ]);
      setActiveForecast(details);
      setTimelineEvents(timeline.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load forecast details.");
    } finally {
      setLoadingForecastDetails(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Handle Graph change
  const handleGraphChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedGraphId(newId);
    setInitiatingNodeId("");
    await loadGraphContext(newId);
  };

  // Run Simulation
  const handleRunSimulation = async () => {
    if (!selectedGraphId) return;
    setRunningForecast(true);
    setError(null);
    try {
      const runResult = await apiClient.runCascadeForecast(selectedGraphId, {
        initiating_node_id: initiatingNodeId || null,
        horizon_minutes: horizonMinutes,
        max_depth: maxDepth,
        simulation_mode: simulationMode,
        seed: simulationMode === "MONTE_CARLO" ? seed : null,
        propagation_probability_threshold: probabilityThreshold,
      });
      setActiveForecast(runResult);

      const [timeline, historyList] = await Promise.all([
        apiClient.getCascadeForecastTimeline(selectedGraphId, runResult.id),
        apiClient.listCascadeForecasts(selectedGraphId, { page_size: 10 }),
      ]);
      setTimelineEvents(timeline.events);
      setForecastHistory(historyList.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cascade forecast execution failed.");
    } finally {
      setRunningForecast(false);
    }
  };

  if (loadingGraphs) {
    return (
      <div style={{ padding: "3rem 2rem", maxWidth: 1400, margin: "0 auto" }}>
        <LoadingState message="Initializing Cascade Simulation Engine..." />
      </div>
    );
  }

  if (graphs.length === 0) {
    return (
      <div style={{ padding: "4rem 2rem", maxWidth: 800, margin: "0 auto" }}>
        <EmptyState
          title="No Infrastructure Graphs Available"
          description="Create or configure an infrastructure graph to run time-aware failure cascade simulations."
          icon="◎"
          action={{
            label: "Explore System State",
            onClick: () => {
              window.location.href = "/app/state";
            },
          }}
        />
      </div>
    );
  }

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
              Cascade Prediction Engine
            </h1>
            <Badge variant="simulation">
              Phase 6 · Forecast Model
            </Badge>
            <Badge variant="degraded">
              Simulation Only
            </Badge>
          </div>
          <p style={{ color: "var(--color-text-tertiary)", fontSize: "0.8125rem", margin: 0 }}>
            Time-aware downstream failure propagation estimates with explicit model assumptions and uncertainty intervals.
          </p>
        </div>

        {/* Advisory Warning Tag */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.35rem 0.75rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            fontSize: "0.75rem",
            color: "var(--color-status-degraded)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span>⚠</span>
          <span>Advisory only — Dependency paths do not establish guaranteed failure</span>
        </div>
      </div>

      {/* ── Error Banner ────────────────────────────────────────── */}
      {error && (
        <div
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
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            ✕
          </Button>
        </div>
      )}

      {/* ── Top Grid: Simulation Parameters & Controls ───────────── */}
      <Panel elevation="base" padding="1.25rem" style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
            alignItems: "end",
          }}
        >
          {/* Target Graph Selector */}
          <div>
            <label className="causal-label" style={{ display: "block", marginBottom: "0.375rem" }}>
              Target Infrastructure Graph
            </label>
            <select
              id="select-cascade-graph"
              value={selectedGraphId}
              onChange={handleGraphChange}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-bg-base)",
                border: "1px solid var(--color-border-default)",
                color: "var(--color-text-primary)",
                fontSize: "0.8125rem",
                fontFamily: "var(--font-sans)",
              }}
            >
              {graphs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.domain})
                </option>
              ))}
            </select>
          </div>

          {/* Initiating Node Selector */}
          <div>
            <label className="causal-label" style={{ display: "block", marginBottom: "0.375rem" }}>
              Initiating Disturbance Node
            </label>
            <select
              id="select-initiating-node"
              value={initiatingNodeId}
              onChange={(e) => setInitiatingNodeId(e.target.value)}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-bg-base)",
                border: "1px solid var(--color-border-default)",
                color: "var(--color-text-primary)",
                fontSize: "0.8125rem",
                fontFamily: "var(--font-sans)",
              }}
            >
              <option value="">All degraded / failed nodes (Auto-detect)</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} [{n.state}] (crit: {n.criticality.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          {/* Forecast Horizon */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.375rem" }}>
              <label className="causal-label">Horizon</label>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
                {horizonMinutes} min ({Math.round(horizonMinutes / 60)}h)
              </span>
            </div>
            <input
              id="input-horizon-slider"
              type="range"
              min={10}
              max={360}
              step={10}
              value={horizonMinutes}
              onChange={(e) => setHorizonMinutes(Number(e.target.value))}
              style={{ width: "100%", cursor: "pointer" }}
            />
          </div>

          {/* Max Traversal Depth */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.375rem" }}>
              <label className="causal-label">Max Traversal Depth</label>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
                {maxDepth} hops
              </span>
            </div>
            <input
              id="input-depth-slider"
              type="range"
              min={1}
              max={10}
              step={1}
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value))}
              style={{ width: "100%", cursor: "pointer" }}
            />
          </div>

          {/* Simulation Mode */}
          <div>
            <label className="causal-label" style={{ display: "block", marginBottom: "0.375rem" }}>
              Model Execution Mode
            </label>
            <div style={{ display: "flex", gap: "0.375rem" }}>
              <Button
                id="btn-mode-deterministic"
                variant={simulationMode === "DETERMINISTIC" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setSimulationMode("DETERMINISTIC")}
              >
                Deterministic
              </Button>
              <Button
                id="btn-mode-monte-carlo"
                variant={simulationMode === "MONTE_CARLO" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setSimulationMode("MONTE_CARLO")}
              >
                Monte Carlo
              </Button>
            </div>
          </div>

          {/* Run Action Button */}
          <div>
            <Button
              id="btn-run-cascade"
              variant="primary"
              size="md"
              loading={runningForecast}
              onClick={handleRunSimulation}
              style={{ width: "100%", justifyContent: "center" }}
            >
              ⚡ Run Cascade Forecast
            </Button>
          </div>
        </div>

        {/* Secondary Parameter Toggles (Monte Carlo Seed & Threshold) */}
        {simulationMode === "MONTE_CARLO" && (
          <div
            style={{
              marginTop: "1rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--color-border-subtle)",
              display: "flex",
              gap: "1.5rem",
              alignItems: "center",
              fontSize: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "var(--color-text-tertiary)" }}>Reproducibility Seed:</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                style={{
                  width: "80px",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--color-bg-base)",
                  border: "1px solid var(--color-border-default)",
                  color: "var(--color-text-primary)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "var(--color-text-tertiary)" }}>Probability Cutoff:</span>
              <span style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
                {(probabilityThreshold * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </Panel>

      {/* ── Forecast Results Section ─────────────────────────────── */}
      {loadingForecastDetails ? (
        <LoadingState message="Loading cascade simulation results..." />
      ) : activeForecast ? (
        <div>
          {/* ── KPI Command Ribbon ─────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "0.875rem",
              marginBottom: "1.5rem",
            }}
          >
            <Panel elevation="base" padding="1rem">
              <span className="causal-label">Observed Impairments</span>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--color-text-primary)" }}>
                {activeForecast.total_already_affected}
              </div>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                Initial disturbance set
              </span>
            </Panel>

            <Panel elevation="base" padding="1rem">
              <span className="causal-label">Predicted Downstream</span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  marginTop: "0.25rem",
                  color:
                    activeForecast.total_predicted_affected > 0
                      ? "var(--color-status-degraded)"
                      : "var(--color-status-normal)",
                }}
              >
                {activeForecast.total_predicted_affected}
              </div>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                Within {Math.round(activeForecast.horizon_minutes)}m horizon
              </span>
            </Panel>

            <Panel elevation="base" padding="1rem">
              <span className="causal-label">Critical Nodes at Risk</span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  marginTop: "0.25rem",
                  color:
                    activeForecast.total_critical_affected > 0
                      ? "var(--color-status-critical)"
                      : "var(--color-text-primary)",
                }}
              >
                {activeForecast.total_critical_affected}
              </div>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                Criticality ≥ 0.70
              </span>
            </Panel>

            <Panel elevation="base" padding="1rem">
              <span className="causal-label">Max Traversal Depth</span>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--color-accent)" }}>
                {activeForecast.max_depth_reached}
              </div>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                Hop limit: {activeForecast.max_depth}
              </span>
            </Panel>

            <Panel elevation="base" padding="1rem">
              <span className="causal-label">Criticality Impact</span>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--color-text-primary)" }}>
                {activeForecast.impact_summary.composite_criticality_impact_percent.toFixed(1)}%
              </div>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                Weighted graph impact
              </span>
            </Panel>

            <Panel elevation="base" padding="1rem">
              <span className="causal-label">Calibration Status</span>
              <div style={{ marginTop: "0.35rem" }}>
                <Badge variant="degraded">
                  {activeForecast.calibration_status}
                </Badge>
              </div>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", display: "block", marginTop: "0.25rem" }}>
                Non-calibrated heuristic
              </span>
            </Panel>
          </div>

          {/* ── Main Forecast Tabs & Views ──────────────────────────── */}
          <Panel elevation="base" padding="1.25rem">
            {/* View Tabs */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                borderBottom: "1px solid var(--color-border-subtle)",
                paddingBottom: "0.75rem",
                marginBottom: "1.25rem",
              }}
            >
              {[
                { key: "nodes", label: "Affected Nodes", count: activeForecast.predicted_nodes.length },
                { key: "timeline", label: "Cascade Timeline", count: timelineEvents.length },
                { key: "paths", label: "Propagation Paths", count: activeForecast.propagation_paths.length },
                { key: "assumptions", label: "Model Assumptions & Audit", count: activeForecast.impact_summary.assumptions.length },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  id={`tab-${key}`}
                  onClick={() => setSelectedTab(key as typeof selectedTab)}
                  style={{
                    padding: "0.4rem 0.875rem",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: selectedTab === key ? "var(--color-bg-elevated)" : "transparent",
                    border: `1px solid ${selectedTab === key ? "var(--color-border-default)" : "transparent"}`,
                    color: selectedTab === key ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                    fontSize: "0.8125rem",
                    fontWeight: selectedTab === key ? 600 : 400,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span>{label}</span>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      padding: "0.1rem 0.35rem",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: "var(--color-bg-base)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {/* Tab 1: Affected Nodes Table */}
            {selectedTab === "nodes" && (
              <div>
                {activeForecast.predicted_nodes.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2.5rem" }}>
                    <EmptyState
                      title="No Nodes Projected to Fail"
                      description="Under the current simulation parameters, disturbances do not propagate beyond initial thresholds."
                      icon="✓"
                    />
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border-subtle)", textAlign: "left" }}>
                          <th style={{ padding: "0.625rem 0.75rem", color: "var(--color-text-tertiary)", fontWeight: 500 }}>
                            Node Name
                          </th>
                          <th style={{ padding: "0.625rem 0.75rem", color: "var(--color-text-tertiary)", fontWeight: 500 }}>
                            Forecast Status
                          </th>
                          <th style={{ padding: "0.625rem 0.75rem", color: "var(--color-text-tertiary)", fontWeight: 500 }}>
                            Projected State
                          </th>
                          <th style={{ padding: "0.625rem 0.75rem", color: "var(--color-text-tertiary)", fontWeight: 500 }}>
                            Impact Level
                          </th>
                          <th style={{ padding: "0.625rem 0.75rem", color: "var(--color-text-tertiary)", fontWeight: 500 }}>
                            Time to Impact
                          </th>
                          <th style={{ padding: "0.625rem 0.75rem", color: "var(--color-text-tertiary)", fontWeight: 500 }}>
                            Propagation Likelihood
                          </th>
                          <th style={{ padding: "0.625rem 0.75rem", color: "var(--color-text-tertiary)", fontWeight: 500 }}>
                            Depth
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeForecast.predicted_nodes.map((pn) => {
                          const isObserved = pn.forecast_status === "ALREADY_AFFECTED";
                          return (
                            <tr
                              key={pn.node_id}
                              style={{
                                borderBottom: "1px solid var(--color-border-subtle)",
                                backgroundColor: isObserved ? "rgba(239, 68, 68, 0.03)" : "transparent",
                              }}
                            >
                              <td style={{ padding: "0.75rem" }}>
                                <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                                  {pn.node_name}
                                </div>
                                <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                                  {pn.node_type} · crit: {pn.criticality.toFixed(2)}
                                </div>
                              </td>

                              <td style={{ padding: "0.75rem" }}>
                                {isObserved ? (
                                  <Badge variant="failed" dot>
                                    Observed State
                                  </Badge>
                                ) : (
                                  <Badge variant="simulation">
                                    Forecast Impact
                                  </Badge>
                                )}
                              </td>

                              <td style={{ padding: "0.75rem" }}>
                                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                                  {pn.predicted_state}
                                </span>
                              </td>

                              <td style={{ padding: "0.75rem" }}>
                                <Badge
                                  variant={
                                    pn.predicted_impact_level === "CRITICAL"
                                      ? "critical"
                                      : pn.predicted_impact_level === "HIGH"
                                      ? "degraded"
                                      : "info"
                                  }
                                >
                                  {pn.predicted_impact_level}
                                </Badge>
                              </td>

                              <td style={{ padding: "0.75rem", fontFamily: "var(--font-mono)" }}>
                                {isObserved ? (
                                  <span style={{ color: "var(--color-text-tertiary)" }}>Current</span>
                                ) : pn.time_to_impact_range ? (
                                  <div>
                                    <div style={{ color: "var(--color-text-primary)" }}>
                                      +{Math.round(pn.time_to_impact_range.point_estimate_seconds / 60)} min
                                    </div>
                                    <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                                      [{Math.round(pn.time_to_impact_range.min_seconds / 60)}–{Math.round(pn.time_to_impact_range.max_seconds / 60)}m] ({pn.time_to_impact_range.delay_source})
                                    </div>
                                  </div>
                                ) : (
                                  <span>—</span>
                                )}
                              </td>

                              <td style={{ padding: "0.75rem", fontFamily: "var(--font-mono)" }}>
                                {isObserved ? (
                                  <span style={{ color: "var(--color-text-tertiary)" }}>100% (Observed)</span>
                                ) : pn.propagation_probability_point !== null ? (
                                  <div>
                                    <div style={{ color: "var(--color-text-primary)" }}>
                                      {(pn.propagation_probability_point * 100).toFixed(0)}%
                                    </div>
                                    <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                                      [{((pn.propagation_probability_min ?? 0) * 100).toFixed(0)}%–{((pn.propagation_probability_max ?? 0) * 100).toFixed(0)}%] heuristic
                                    </div>
                                  </div>
                                ) : (
                                  <span>—</span>
                                )}
                              </td>

                              <td style={{ padding: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                                {pn.depth}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Chronological Cascade Timeline */}
            {selectedTab === "timeline" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {timelineEvents.map((ev, idx) => (
                  <div
                    key={`${ev.node_id}-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "1rem",
                      padding: "0.75rem 1rem",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "var(--color-bg-base)",
                      border: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--color-bg-elevated)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.75rem",
                        color: "var(--color-text-secondary)",
                        flexShrink: 0,
                      }}
                    >
                      {ev.timestamp_offset_seconds === 0 ? "T = 0s" : `+${Math.round(ev.timestamp_offset_seconds / 60)} min`}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                        <span style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "0.875rem" }}>
                          {ev.node_name}
                        </span>
                        <Badge
                          variant={
                            ev.forecast_status === "ALREADY_AFFECTED" ? "failed" : "simulation"
                          }
                        >
                          {ev.event_type}
                        </Badge>
                        <Badge
                          variant={
                            ev.impact_level === "CRITICAL"
                              ? "critical"
                              : ev.impact_level === "HIGH"
                              ? "degraded"
                              : "info"
                          }
                        >
                          {ev.impact_level}
                        </Badge>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                        {ev.explanation}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                      <span style={{ color: "var(--color-text-disabled)" }}>Hop {ev.depth}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: Propagation Paths */}
            {selectedTab === "paths" && (
              <div>
                {activeForecast.propagation_paths.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-tertiary)" }}>
                    No propagation paths traversed in this run.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {activeForecast.propagation_paths.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          padding: "0.75rem 1rem",
                          borderRadius: "var(--radius-md)",
                          backgroundColor: "var(--color-bg-base)",
                          border: "1px solid var(--color-border-subtle)",
                          fontSize: "0.8125rem",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                          <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                            {p.source_node_name} <span style={{ color: "var(--color-accent)" }}>→</span> {p.target_node_name}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", fontSize: "0.75rem" }}>
                            Delay: ~{Math.round((p.estimated_delay_seconds ?? 0) / 60)} min ({p.delay_source})
                          </span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                          {p.propagation_rationale}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Model Assumptions & Audit Metadata */}
            {selectedTab === "assumptions" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.5rem" }}>
                    Explicit Simulation Assumptions
                  </h3>
                  <ul style={{ paddingLeft: "1.25rem", color: "var(--color-text-secondary)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                    {activeForecast.impact_summary.assumptions.map((asm, i) => (
                      <li key={i}>{asm}</li>
                    ))}
                  </ul>
                </div>

                {activeForecast.impact_summary.warnings.length > 0 && (
                  <div
                    style={{
                      padding: "0.75rem 1rem",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                    }}
                  >
                    <h4 style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-status-degraded)", marginBottom: "0.25rem" }}>
                      Model Warnings
                    </h4>
                    <ul style={{ paddingLeft: "1.25rem", color: "var(--color-status-degraded)", fontSize: "0.75rem", margin: 0, lineHeight: 1.5 }}>
                      {activeForecast.impact_summary.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.5rem" }}>
                    Uncertainty & Technical Limitations
                  </h3>
                  <ul style={{ paddingLeft: "1.25rem", color: "var(--color-text-tertiary)", fontSize: "0.75rem", lineHeight: 1.6 }}>
                    {activeForecast.impact_summary.limitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>

                {/* Audit Context */}
                <div
                  style={{
                    paddingTop: "0.75rem",
                    borderTop: "1px solid var(--color-border-subtle)",
                    display: "flex",
                    gap: "2rem",
                    fontSize: "0.75rem",
                    color: "var(--color-text-disabled)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <span>Forecast ID: {activeForecast.id}</span>
                  <span>Rule Version: {activeForecast.rule_version}</span>
                  <span>Timestamp: {new Date(activeForecast.created_at).toLocaleString()}</span>
                </div>
              </div>
            )}
          </Panel>
        </div>
      ) : (
        <Panel elevation="base" padding="3rem" style={{ textAlign: "center" }}>
          <EmptyState
            title="No Forecast Run Active"
            description="Select simulation parameters above and click 'Run Cascade Forecast' to generate downstream failure projections."
            icon="◎"
          />
        </Panel>
      )}

      {/* ── Historical Runs Footer ──────────────────────────────── */}
      {forecastHistory.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Recent Forecast Audit History
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
            {forecastHistory.map((item) => (
              <div
                key={item.id}
                onClick={() => loadForecastDetails(item.graph_id, item.id)}
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-bg-surface)",
                  border: `1px solid ${
                    activeForecast?.id === item.id ? "var(--color-border-focus)" : "var(--color-border-subtle)"
                  }`,
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.75rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {item.simulation_mode} · {item.horizon_minutes}m
                  </div>
                  <div style={{ color: "var(--color-text-tertiary)", marginTop: "0.125rem" }}>
                    {item.total_predicted_affected} predicted · {item.total_critical_affected} critical
                  </div>
                </div>
                <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--color-text-disabled)" }}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
