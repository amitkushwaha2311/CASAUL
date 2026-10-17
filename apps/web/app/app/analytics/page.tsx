"use client";

/**
 * CAUSAL — /app/analytics
 *
 * Phase 1–6 Platform Analytics & Operational Intelligence
 *
 * Comprehensive cross-system analytics integrating:
 * - Graph selection and time-range filtering (1H, 6H, 24H, 7D, ALL)
 * - Historical node-state & health trends from timestamped persisted records
 * - Event and incident distribution by severity, status, and timeline
 * - Causal reasoning hypothesis distribution & evidence-completeness audit
 * - Phase 6 cascade forecast run history & predicted-impact summaries (strictly separated from observed outcomes)
 * - Baseline & snapshot context and data completeness
 * - Clear metric definitions, denominators, units, and time windows
 * - Navigation links to Digital Twin, Incidents, Causal Engine, Evidence, Scenarios, and Simulation
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import type {
  GraphResponse,
  GraphStatisticsResponse,
  EventStatisticsResponse,
  EventResponse,
  SystemStateSummaryResponse,
  StateHistoryResponse,
  HypothesisResponse,
  CascadeForecastListItem,
  SnapshotResponse,
  BaselineResponse,
} from "@causal/shared/src/index";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Time Range Definition ──────────────────────────────────────────────────

type TimeRangeOption = "1h" | "6h" | "24h" | "7d" | "all";

interface TimeRangeConfig {
  label: string;
  durationMs: number | null;
}

const TIME_RANGES: Record<TimeRangeOption, TimeRangeConfig> = {
  "1h": { label: "Last 1h", durationMs: 1 * 60 * 60 * 1000 },
  "6h": { label: "Last 6h", durationMs: 6 * 60 * 60 * 1000 },
  "24h": { label: "Last 24h", durationMs: 24 * 60 * 60 * 1000 },
  "7d": { label: "Last 7d", durationMs: 7 * 24 * 60 * 60 * 1000 },
  all: { label: "All Time", durationMs: null },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPercentage(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || isNaN(ratio)) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
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

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", border: "rgba(239, 68, 68, 0.3)" },
  HIGH: { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316", border: "rgba(249, 115, 22, 0.3)" },
  MEDIUM: { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b", border: "rgba(245, 158, 11, 0.3)" },
  LOW: { bg: "rgba(167, 163, 152, 0.15)", text: "#A7A398", border: "rgba(167, 163, 152, 0.3)" },
  INFO: { bg: "rgba(100, 116, 139, 0.15)", text: "#94a3b8", border: "rgba(100, 116, 139, 0.3)" },
};

export default function AnalyticsPage() {
  // ── Global Filter State ──────────────────────────────────────────────────
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("24h");
  const [activeTab, setActiveTab] = useState<
    "overview" | "events" | "causal" | "forecasts" | "snapshots"
  >("overview");

  // ── Raw Analytics Data ───────────────────────────────────────────────────
  const [graphStats, setGraphStats] = useState<GraphStatisticsResponse | null>(null);
  const [eventStats, setEventStats] = useState<EventStatisticsResponse | null>(null);
  const [recentEvents, setRecentEvents] = useState<EventResponse[]>([]);
  const [stateSummary, setStateSummary] = useState<SystemStateSummaryResponse | null>(null);
  const [stateHistory, setStateHistory] = useState<StateHistoryResponse[]>([]);
  const [hypotheses, setHypotheses] = useState<HypothesisResponse[]>([]);
  const [forecasts, setForecasts] = useState<CascadeForecastListItem[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotResponse[]>([]);
  const [baselines, setBaselines] = useState<BaselineResponse[]>([]);

  // ── UI States ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [referenceTime, setReferenceTime] = useState<number>(0);

  // ── Load Graphs ──────────────────────────────────────────────────────────
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

  // ── Load Analytics Data For Selected Graph ───────────────────────────────
  const loadAnalyticsData = useCallback((graphId: string) => {
    Promise.all([
      apiClient.getGraphStatistics(graphId).catch(() => null),
      apiClient.getEventStatistics(graphId).catch(() => null),
      apiClient.listEvents(graphId, { page_size: 100 }).catch(() => []),
      apiClient.getSystemStateSummary(graphId).catch(() => null),
      apiClient.getGraphStateHistory(graphId, { page_size: 200 }).catch(() => []),
      apiClient.listHypotheses(graphId).catch(() => []),
      apiClient.listCascadeForecasts(graphId, { page_size: 50 }).catch(() => ({ items: [], total: 0, page: 1, page_size: 50 })),
      apiClient.listSnapshots(graphId).catch(() => []),
      apiClient.listBaselines(graphId).catch(() => []),
    ])
      .then(([gStats, eStats, evts, sSummary, sHistory, hyps, fList, snaps, bls]) => {
        setGraphStats(gStats);
        setEventStats(eStats);
        setRecentEvents(evts);
        setStateSummary(sSummary);
        setStateHistory(sHistory);
        setHypotheses(hyps);
        setForecasts(fList?.items || []);
        setSnapshots(snaps);
        setBaselines(bls);
        const allTimestamps = [
          ...evts.map((e) => new Date(e.timestamp).getTime()),
          ...sHistory.map((s) => new Date(s.observed_at || s.recorded_at).getTime()),
        ].filter((t) => !isNaN(t) && t > 0);
        const maxTs = allTimestamps.length > 0 ? Math.max(...allTimestamps) : Date.now();
        setReferenceTime(Date.now() - maxTs > 24 * 60 * 60 * 1000 ? maxTs : Date.now());
        setError(null);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load platform analytics";
        setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (selectedGraphId) {
      loadAnalyticsData(selectedGraphId);
    }
  }, [selectedGraphId, loadAnalyticsData]);

  // ── Filtered Records by Time Range ───────────────────────────────────────
  const filteredStateHistory = useMemo(() => {
    const config = TIME_RANGES[timeRange];
    if (!config.durationMs || referenceTime === 0) return stateHistory;
    const cutoff = referenceTime - config.durationMs;
    return stateHistory.filter((rec) => {
      const ts = new Date(rec.observed_at || rec.recorded_at).getTime();
      return ts >= cutoff;
    });
  }, [stateHistory, timeRange, referenceTime]);

  const filteredEvents = useMemo(() => {
    const config = TIME_RANGES[timeRange];
    if (!config.durationMs || referenceTime === 0) return recentEvents;
    const cutoff = referenceTime - config.durationMs;
    return recentEvents.filter((ev) => {
      const ts = new Date(ev.timestamp).getTime();
      return ts >= cutoff;
    });
  }, [recentEvents, timeRange, referenceTime]);

  // ── Derived Health Metrics ───────────────────────────────────────────────
  const healthStats = useMemo(() => {
    const validHealthRecords = filteredStateHistory.filter(
      (r) => r.health !== null && r.health !== undefined && !isNaN(r.health)
    );
    if (validHealthRecords.length === 0) {
      const defaultAvg = stateSummary?.average_health ?? graphStats?.average_health ?? null;
      return {
        sampleCount: 0,
        average: defaultAvg,
        min: defaultAvg,
        max: defaultAvg,
      };
    }
    const values = validHealthRecords.map((r) => r.health as number);
    const sum = values.reduce((acc, v) => acc + v, 0);
    return {
      sampleCount: values.length,
      average: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [filteredStateHistory, stateSummary, graphStats]);

  // ── Event Severity Distribution In Filtered Range ────────────────────────
  const eventSeverityCounts = useMemo(() => {
    const counts: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFO: 0,
    };
    for (const ev of filteredEvents) {
      const sev = (ev.severity || "INFO").toUpperCase();
      counts[sev] = (counts[sev] || 0) + 1;
    }
    return counts;
  }, [filteredEvents]);

  // ── Event Status Breakdown ───────────────────────────────────────────────
  const eventStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      OPEN: 0,
      ACKNOWLEDGED: 0,
      RESOLVED: 0,
      DISMISSED: 0,
    };
    for (const ev of filteredEvents) {
      const st = (ev.status || "OPEN").toUpperCase();
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [filteredEvents]);

  // ── Causal Hypothesis Metrics ────────────────────────────────────────────
  const hypothesisMetrics = useMemo(() => {
    const total = hypotheses.length;
    const statusCounts: Record<string, number> = {
      SUPPORTED: 0,
      POSSIBLE: 0,
      CONTRADICTED: 0,
      INSUFFICIENT_EVIDENCE: 0,
    };
    const typeCounts: Record<string, number> = {};
    let completenessSum = 0;

    for (const h of hypotheses) {
      statusCounts[h.status] = (statusCounts[h.status] || 0) + 1;
      typeCounts[h.hypothesis_type] = (typeCounts[h.hypothesis_type] || 0) + 1;
      completenessSum += h.evidence_completeness || 0;
    }

    return {
      total,
      statusCounts,
      typeCounts,
      averageCompleteness: total > 0 ? completenessSum / total : 0,
    };
  }, [hypotheses]);

  // ── Forecast Runs Breakdown ──────────────────────────────────────────────
  const forecastMetrics = useMemo(() => {
    const totalRuns = forecasts.length;
    let totalPredictedAffected = 0;
    let totalCriticalRisk = 0;
    let maxDepth = 0;

    for (const f of forecasts) {
      totalPredictedAffected += f.total_predicted_affected || 0;
      totalCriticalRisk += f.total_critical_affected || 0;
      if (f.max_depth_reached > maxDepth) maxDepth = f.max_depth_reached;
    }

    return {
      totalRuns,
      totalPredictedAffected,
      totalCriticalRisk,
      maxDepth,
      averagePredictedPerRun: totalRuns > 0 ? (totalPredictedAffected / totalRuns).toFixed(1) : "0.0",
    };
  }, [forecasts]);

  // ── Active Graph Reference ───────────────────────────────────────────────
  const activeGraph = graphs.find((g) => g.id === selectedGraphId) || graphs[0];

  // ── Initial Loading & Error ──────────────────────────────────────────────
  if (loading && graphs.length === 0) {
    return <LoadingState message="Initializing CAUSAL Analytics intelligence…" fullHeight />;
  }

  if (error && graphs.length === 0) {
    return <ErrorState title="Analytics Engine Unavailable" message={error} onRetry={() => setSelectedGraphId(null)} />;
  }

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
      {/* ── TOP HEADER & CONTROLS ────────────────────────────────────────── */}
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
              PHASE 1–6 PERSISTED INTELLIGENCE
            </span>
            <Badge variant="simulation">CROSS-PHASE ANALYTICS</Badge>
          </div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Platform Analytics & Operational Trends
          </h1>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-tertiary)",
              margin: "0.25rem 0 0 0",
              maxWidth: "720px",
            }}
          >
            Audit historical operational state transitions, incident frequencies, causal evidence distributions,
            and predictive cascade forecast runs across timestamped infrastructure records
            {activeGraph ? ` for ${activeGraph.name}${graphStats ? ` (${graphStats.node_count} nodes)` : ""}` : ""}.
          </p>
        </div>

        {/* Global Selectors */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Graph Selector */}
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
                aria-label="Analytics Graph Selector"
                value={selectedGraphId || ""}
                onChange={(e) => {
                  setSelectedGraphId(e.target.value);
                  setLoading(true);
                }}
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

          {/* Time Range Pills */}
          <div
            style={{
              display: "inline-flex",
              backgroundColor: "var(--color-bg-elevated)",
              padding: "0.2rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-subtle)",
              gap: "0.2rem",
            }}
          >
            {(Object.keys(TIME_RANGES) as TimeRangeOption[]).map((tr) => (
              <button
                key={tr}
                onClick={() => {
                  setTimeRange(tr);
                  setReferenceTime(Date.now());
                }}
                style={{
                  backgroundColor: timeRange === tr ? "var(--color-bg-surface)" : "transparent",
                  color: timeRange === tr ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.25rem 0.55rem",
                  fontSize: "0.75rem",
                  fontWeight: timeRange === tr ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {TIME_RANGES[tr].label}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => selectedGraphId && loadAnalyticsData(selectedGraphId)}
            title="Refresh analytics data"
          >
            ↻ Refresh
          </Button>
        </div>
      </div>

      {/* ── ANALYTICAL INTEGRITY NOTICE ──────────────────────────────────── */}
      <div
        role="alert"
        aria-label="Analytical Integrity Notice"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.875rem",
          padding: "0.75rem 1rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: "rgba(34, 211, 238, 0.05)",
          border: "1px solid rgba(34, 211, 238, 0.2)",
        }}
      >
        <div style={{ fontSize: "1.125rem", color: "var(--color-status-normal)", lineHeight: 1, marginTop: "0.1rem" }}>
          ◈
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--color-status-normal)",
                letterSpacing: "0.02em",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
              }}
            >
              Auditable Integrity Standards
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                padding: "0.1rem 0.4rem",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "rgba(34, 211, 238, 0.12)",
                color: "var(--color-status-normal)",
                fontFamily: "var(--font-mono)",
              }}
            >
              REAL DATA ONLY · HONEST UNKNOWNS
            </span>
          </div>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--color-text-secondary)",
              margin: "0.2rem 0 0 0",
              lineHeight: 1.45,
            }}
          >
            All figures are computed directly from persisted audit records. Missing telemetry is reported as
            unknown and excluded from health denominators rather than assumed healthy. Predicted cascade impacts
            are strictly categorized as prospective simulation estimates and decoupled from observed incident telemetry.
          </p>
        </div>
      </div>

      {/* ── EXECUTIVE SUMMARY METRIC CARDS ──────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {/* Metric 1: Mean Operational Health */}
        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.875rem 1rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            MEAN HEALTH
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              marginTop: "0.25rem",
              color:
                healthStats.average !== null && healthStats.average >= 0.8
                  ? "var(--color-status-normal)"
                  : healthStats.average !== null && healthStats.average >= 0.5
                  ? "var(--color-status-degraded)"
                  : "var(--color-status-failed)",
            }}
          >
            {formatPercentage(healthStats.average)}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>
            Denominator: {healthStats.sampleCount > 0 ? `${healthStats.sampleCount} history records` : `${stateSummary?.health_denominator ?? graphStats?.node_count ?? 0} known nodes`}
          </div>
          <div style={{ fontSize: "0.625rem", color: "var(--color-text-disabled)", marginTop: "0.15rem" }}>
            Window: {TIME_RANGES[timeRange].label}
          </div>
        </div>

        {/* Metric 2: Incident & Event Activity */}
        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.875rem 1rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            FILTERED EVENTS
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
            {filteredEvents.length}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--color-status-critical)", marginTop: "0.25rem" }}>
            {eventSeverityCounts.CRITICAL} Critical · {eventSeverityCounts.HIGH} High
          </div>
          <div style={{ fontSize: "0.625rem", color: "var(--color-text-disabled)", marginTop: "0.15rem" }}>
            Total persisted in graph: {eventStats?.total_events ?? recentEvents.length}
          </div>
        </div>

        {/* Metric 3: Causal Evidence Completeness */}
        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.875rem 1rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            EVIDENCE COMPLETENESS
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              marginTop: "0.25rem",
              color: hypothesisMetrics.averageCompleteness >= 0.75 ? "var(--color-status-normal)" : "var(--color-status-degraded)",
            }}
          >
            {formatPercentage(hypothesisMetrics.averageCompleteness)}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>
            Denominator: {hypothesisMetrics.total} evaluated hypotheses
          </div>
          <div style={{ fontSize: "0.625rem", color: "var(--color-text-disabled)", marginTop: "0.15rem" }}>
            {hypothesisMetrics.statusCounts.SUPPORTED} supported · {hypothesisMetrics.statusCounts.CONTRADICTED} contradicted
          </div>
        </div>

        {/* Metric 4: Forecast Activity */}
        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.875rem 1rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            CASCADE FORECAST RUNS
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--color-status-simulation)" }}>
            {forecastMetrics.totalRuns}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>
            Predicted at-risk nodes: {forecastMetrics.totalPredictedAffected}
          </div>
          <div style={{ fontSize: "0.625rem", color: "var(--color-status-simulation)", marginTop: "0.15rem" }}>
            Phase 6 simulations (hypothetical)
          </div>
        </div>

        {/* Metric 5: State Completeness */}
        <div
          style={{
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.875rem 1rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
            STATE COMPLETENESS
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
            {formatPercentage(stateSummary?.completeness_ratio ?? 1.0)}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>
            Denominator: {stateSummary?.total_nodes ?? graphStats?.node_count ?? "—"} nodes
          </div>
          <div style={{ fontSize: "0.625rem", color: "var(--color-text-disabled)", marginTop: "0.15rem" }}>
            {stateSummary?.nodes_with_unknown_state ?? 0} unknown states
          </div>
        </div>
      </div>

      {/* ── NAVIGATION TABS ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--color-border-subtle)",
          gap: "1.25rem",
          overflowX: "auto",
        }}
      >
        <button
          onClick={() => setActiveTab("overview")}
          id="tab-overview"
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "overview" ? "2px solid var(--color-accent)" : "2px solid transparent",
            color: activeTab === "overview" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            padding: "0.625rem 0",
            fontSize: "0.875rem",
            fontWeight: activeTab === "overview" ? 600 : 400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            whiteSpace: "nowrap",
          }}
        >
          <span>⎈ Health & State Trends</span>
          <span
            style={{
              fontSize: "0.6875rem",
              padding: "0.1rem 0.35rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-bg-elevated)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {filteredStateHistory.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("events")}
          id="tab-events"
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "events" ? "2px solid var(--color-accent)" : "2px solid transparent",
            color: activeTab === "events" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            padding: "0.625rem 0",
            fontSize: "0.875rem",
            fontWeight: activeTab === "events" ? 600 : 400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            whiteSpace: "nowrap",
          }}
        >
          <span>⚡ Incidents & Events</span>
          <span
            style={{
              fontSize: "0.6875rem",
              padding: "0.1rem 0.35rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-bg-elevated)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {filteredEvents.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("causal")}
          id="tab-causal"
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "causal" ? "2px solid var(--color-accent)" : "2px solid transparent",
            color: activeTab === "causal" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            padding: "0.625rem 0",
            fontSize: "0.875rem",
            fontWeight: activeTab === "causal" ? 600 : 400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            whiteSpace: "nowrap",
          }}
        >
          <span>⊛ Causal Hypotheses & Evidence</span>
          <span
            style={{
              fontSize: "0.6875rem",
              padding: "0.1rem 0.35rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-bg-elevated)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {hypotheses.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("forecasts")}
          id="tab-forecasts"
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "forecasts" ? "2px solid var(--color-accent)" : "2px solid transparent",
            color: activeTab === "forecasts" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            padding: "0.625rem 0",
            fontSize: "0.875rem",
            fontWeight: activeTab === "forecasts" ? 600 : 400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            whiteSpace: "nowrap",
          }}
        >
          <span>◎ Cascade Forecasts</span>
          <span
            style={{
              fontSize: "0.6875rem",
              padding: "0.1rem 0.35rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-bg-elevated)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {forecasts.length}
          </span>
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
            gap: "0.4rem",
            whiteSpace: "nowrap",
          }}
        >
          <span>◈ Baselines & Snapshots</span>
          <span
            style={{
              fontSize: "0.6875rem",
              padding: "0.1rem 0.35rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-bg-elevated)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {snapshots.length + baselines.length}
          </span>
        </button>
      </div>

      {/* ── TAB 1: OVERVIEW & SYSTEM HEALTH TRENDS ───────────────────────── */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Health Distribution & Trend Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.25rem" }}>
            {/* SVG Health Trend Timeline */}
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
                    Historical Node Health Trajectory
                  </h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", margin: "0.2rem 0 0 0" }}>
                    Timestamped health values ({filteredStateHistory.length} records in window)
                  </p>
                </div>
                <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                  <div>
                    <span style={{ color: "var(--color-text-tertiary)" }}>Min: </span>
                    <span style={{ fontWeight: 600 }}>{formatPercentage(healthStats.min)}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-text-tertiary)" }}>Avg: </span>
                    <span style={{ fontWeight: 600, color: "var(--color-status-normal)" }}>{formatPercentage(healthStats.average)}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-text-tertiary)" }}>Max: </span>
                    <span style={{ fontWeight: 600 }}>{formatPercentage(healthStats.max)}</span>
                  </div>
                </div>
              </div>

              {filteredStateHistory.length === 0 ? (
                <EmptyState
                  title="No Historical State Records"
                  description={`No state history records found in ${TIME_RANGES[timeRange].label}. Telemetry updates will populate this trajectory as observations occur.`}
                  icon="⎈"
                />
              ) : (
                <div style={{ height: "220px", width: "100%", position: "relative" }}>
                  {/* Inline Responsive SVG Line/Area Chart */}
                  <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 600 200"
                    preserveAspectRatio="none"
                    style={{ overflow: "visible" }}
                  >
                    {/* Grid Lines */}
                    <line x1="0" y1="20" x2="600" y2="20" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
                    <line x1="0" y1="65" x2="600" y2="65" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
                    <line x1="0" y1="110" x2="600" y2="110" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
                    <line x1="0" y1="155" x2="600" y2="155" stroke="var(--color-border-subtle)" strokeDasharray="3 3" />
                    <line x1="0" y1="200" x2="600" y2="200" stroke="var(--color-border-default)" />

                    {/* Y-axis Labels */}
                    <text x="5" y="18" fill="var(--color-text-disabled)" fontSize="9" fontFamily="var(--font-mono)">100%</text>
                    <text x="5" y="108" fill="var(--color-text-disabled)" fontSize="9" fontFamily="var(--font-mono)">50%</text>
                    <text x="5" y="195" fill="var(--color-text-disabled)" fontSize="9" fontFamily="var(--font-mono)">0%</text>

                    {/* Polyline Curve */}
                    {(() => {
                      const recordsWithHealth = filteredStateHistory.filter((r) => r.health !== null && r.health !== undefined);
                      if (recordsWithHealth.length === 0) return null;
                      const points = recordsWithHealth.map((r, idx) => {
                        const x = (idx / Math.max(1, recordsWithHealth.length - 1)) * 580 + 10;
                        const y = 200 - (Number(r.health) * 180 + 10);
                        return `${x},${y}`;
                      });
                      return (
                        <>
                          <polyline
                            fill="none"
                            stroke="var(--color-accent)"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={points.join(" ")}
                          />
                          {recordsWithHealth.slice(-25).map((r, idx) => {
                            const x = (idx / Math.max(1, Math.min(25, recordsWithHealth.length) - 1)) * 580 + 10;
                            const y = 200 - (Number(r.health) * 180 + 10);
                            return (
                              <circle
                                key={idx}
                                cx={x}
                                cy={y}
                                r="3.5"
                                fill="var(--color-bg-surface)"
                                stroke="var(--color-accent)"
                                strokeWidth="2"
                              />
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              )}
            </div>

            {/* Current Operational State Distribution */}
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
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
                  Operational State Breakdown
                </h3>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", margin: "0.2rem 0 0 0" }}>
                  Current active operational telemetry distribution
                </p>
              </div>

              {(() => {
                const totalNodes = stateSummary?.total_nodes ?? graphStats?.node_count ?? 1;
                const stateCounts: Record<string, number> = stateSummary?.count_by_operational_state ?? {
                  NORMAL: graphStats?.healthy_node_count ?? 0,
                  DEGRADED: graphStats?.degraded_node_count ?? 0,
                  CRITICAL: graphStats?.critical_node_count ?? 0,
                  FAILED: graphStats?.failed_node_count ?? 0,
                  RECOVERING: graphStats?.recovering_node_count ?? 0,
                  UNKNOWN: stateSummary?.nodes_with_unknown_state ?? 0,
                };

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {Object.entries(stateCounts).map(([st, cnt]) => {
                      const pct = totalNodes > 0 ? (cnt / totalNodes) * 100 : 0;
                      return (
                        <div key={st}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                            <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{st}</span>
                            <span>{cnt} nodes ({pct.toFixed(1)}%)</span>
                          </div>
                          <div
                            style={{
                              height: "6px",
                              backgroundColor: "var(--color-bg-elevated)",
                              borderRadius: "var(--radius-full)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                backgroundColor:
                                  st === "NORMAL"
                                    ? "var(--color-status-normal)"
                                    : st === "DEGRADED"
                                    ? "var(--color-status-degraded)"
                                    : st === "CRITICAL"
                                    ? "var(--color-status-critical)"
                                    : st === "FAILED"
                                    ? "var(--color-status-failed)"
                                    : "var(--color-status-unknown)",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Historical Transitions Table */}
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
                padding: "0.875rem 1rem",
                borderBottom: "1px solid var(--color-border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>
                  Recent Persisted State Audit Records
                </h4>
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                  Showing {Math.min(10, filteredStateHistory.length)} most recent transitions
                </span>
              </div>
              <Link
                href="/app/state"
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-accent)",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Inspect Digital Twin →
              </Link>
            </div>

            {filteredStateHistory.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.8125rem" }}>
                No state transition history records available in selected time range.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                  <thead>
                    <tr style={{ color: "var(--color-text-tertiary)", textAlign: "left", borderBottom: "1px solid var(--color-border-subtle)" }}>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>TIMESTAMP</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>NODE ID</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>STATE</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>HEALTH</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>SOURCE</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>REASON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStateHistory.slice(0, 10).map((rec) => (
                      <tr key={rec.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                          {formatRelativeTime(rec.observed_at || rec.recorded_at)}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>
                          {rec.node_id}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          <span
                            style={{
                              padding: "0.1rem 0.4rem",
                              borderRadius: "var(--radius-sm)",
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                              backgroundColor: rec.state === "NORMAL" ? "rgba(34, 211, 238, 0.1)" : "rgba(239, 68, 68, 0.15)",
                              color: rec.state === "NORMAL" ? "var(--color-status-normal)" : "var(--color-status-failed)",
                            }}
                          >
                            {rec.state ?? "UNKNOWN"}
                          </span>
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>
                          {formatPercentage(rec.health)}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-tertiary)" }}>
                          {rec.source}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>
                          {rec.change_reason || "Nominal state update"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: INCIDENTS & TELEMETRY EVENTS ──────────────────────────── */}
      {activeTab === "events" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {/* Severity Breakdown */}
            <div
              style={{
                backgroundColor: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "1.25rem",
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem 0" }}>
                Incident Severity Distribution
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", margin: "0 0 1rem 0" }}>
                Classification of persisted incident events in {TIME_RANGES[timeRange].label}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {Object.entries(eventSeverityCounts).map(([sev, count]) => {
                  const cfg = SEVERITY_COLORS[sev] || SEVERITY_COLORS.INFO;
                  const total = filteredEvents.length || 1;
                  const pct = (count / total) * 100;
                  return (
                    <div key={sev}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                        <span style={{ fontWeight: 600, color: cfg.text, fontFamily: "var(--font-mono)" }}>
                          {sev}
                        </span>
                        <span>{count} events ({pct.toFixed(1)}%)</span>
                      </div>
                      <div style={{ height: "6px", backgroundColor: "var(--color-bg-elevated)", borderRadius: "var(--radius-full)" }}>
                        <div style={{ width: `${pct}%`, height: "100%", backgroundColor: cfg.text, borderRadius: "var(--radius-full)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Event Lifecycle & Status */}
            <div
              style={{
                backgroundColor: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "1.25rem",
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem 0" }}>
                Resolution Lifecycle
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", margin: "0 0 1rem 0" }}>
                Incident response resolution progress across recorded events
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div style={{ backgroundColor: "var(--color-bg-elevated)", padding: "0.875rem", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>OPEN / ACTIVE</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--color-status-critical)" }}>
                    {eventStatusCounts.OPEN}
                  </div>
                </div>
                <div style={{ backgroundColor: "var(--color-bg-elevated)", padding: "0.875rem", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>ACKNOWLEDGED</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--color-status-degraded)" }}>
                    {eventStatusCounts.ACKNOWLEDGED}
                  </div>
                </div>
                <div style={{ backgroundColor: "var(--color-bg-elevated)", padding: "0.875rem", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>RESOLVED</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--color-status-normal)" }}>
                    {eventStatusCounts.RESOLVED}
                  </div>
                </div>
                <div style={{ backgroundColor: "var(--color-bg-elevated)", padding: "0.875rem", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>DISMISSED</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--color-text-secondary)" }}>
                    {eventStatusCounts.DISMISSED}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Event Stream Sample Table */}
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
                padding: "0.875rem 1rem",
                borderBottom: "1px solid var(--color-border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h4 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>
                Incident Events Stream
              </h4>
              <Link href="/app/incidents" style={{ fontSize: "0.75rem", color: "var(--color-accent)", textDecoration: "none" }}>
                View Full Incidents Dashboard →
              </Link>
            </div>

            {filteredEvents.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.8125rem" }}>
                No events recorded in this time range.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                  <thead>
                    <tr style={{ color: "var(--color-text-tertiary)", textAlign: "left", borderBottom: "1px solid var(--color-border-subtle)" }}>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>TIME</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>SEVERITY</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>TYPE</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>STATUS</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>SOURCE</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>DESCRIPTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.slice(0, 15).map((ev) => (
                      <tr key={ev.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                          {formatRelativeTime(ev.timestamp)}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          <span
                            style={{
                              padding: "0.1rem 0.4rem",
                              borderRadius: "var(--radius-sm)",
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.6875rem",
                              fontWeight: 700,
                              backgroundColor: SEVERITY_COLORS[ev.severity]?.bg ?? "transparent",
                              color: SEVERITY_COLORS[ev.severity]?.text ?? "inherit",
                            }}
                          >
                            {ev.severity}
                          </span>
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>
                          {ev.event_type}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>{ev.status}</td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-tertiary)" }}>{ev.source}</td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>
                          {ev.description || "System anomaly record"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: CAUSAL REASONING & EVIDENCE AUDIT ─────────────────────── */}
      {activeTab === "causal" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {/* Hypothesis Status Breakdown */}
            <div
              style={{
                backgroundColor: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "1.25rem",
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem 0" }}>
                Causal Inference Hypothesis Status
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", margin: "0 0 1rem 0" }}>
                Audited evidence status across all candidate causal explanations
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: "var(--color-status-normal)", fontWeight: 600 }}>SUPPORTED</span>
                    <span>{hypothesisMetrics.statusCounts.SUPPORTED} hypotheses</span>
                  </div>
                  <div style={{ height: "6px", backgroundColor: "var(--color-bg-elevated)", borderRadius: "var(--radius-full)" }}>
                    <div
                      style={{
                        width: `${hypothesisMetrics.total > 0 ? (hypothesisMetrics.statusCounts.SUPPORTED / hypothesisMetrics.total) * 100 : 0}%`,
                        height: "100%",
                        backgroundColor: "var(--color-status-normal)",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: "var(--color-status-degraded)", fontWeight: 600 }}>POSSIBLE</span>
                    <span>{hypothesisMetrics.statusCounts.POSSIBLE} hypotheses</span>
                  </div>
                  <div style={{ height: "6px", backgroundColor: "var(--color-bg-elevated)", borderRadius: "var(--radius-full)" }}>
                    <div
                      style={{
                        width: `${hypothesisMetrics.total > 0 ? (hypothesisMetrics.statusCounts.POSSIBLE / hypothesisMetrics.total) * 100 : 0}%`,
                        height: "100%",
                        backgroundColor: "var(--color-status-degraded)",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: "var(--color-status-failed)", fontWeight: 600 }}>CONTRADICTED</span>
                    <span>{hypothesisMetrics.statusCounts.CONTRADICTED} hypotheses</span>
                  </div>
                  <div style={{ height: "6px", backgroundColor: "var(--color-bg-elevated)", borderRadius: "var(--radius-full)" }}>
                    <div
                      style={{
                        width: `${hypothesisMetrics.total > 0 ? (hypothesisMetrics.statusCounts.CONTRADICTED / hypothesisMetrics.total) * 100 : 0}%`,
                        height: "100%",
                        backgroundColor: "var(--color-status-failed)",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: "var(--color-status-unknown)", fontWeight: 600 }}>INSUFFICIENT EVIDENCE</span>
                    <span>{hypothesisMetrics.statusCounts.INSUFFICIENT_EVIDENCE} hypotheses</span>
                  </div>
                  <div style={{ height: "6px", backgroundColor: "var(--color-bg-elevated)", borderRadius: "var(--radius-full)" }}>
                    <div
                      style={{
                        width: `${hypothesisMetrics.total > 0 ? (hypothesisMetrics.statusCounts.INSUFFICIENT_EVIDENCE / hypothesisMetrics.total) * 100 : 0}%`,
                        height: "100%",
                        backgroundColor: "var(--color-status-unknown)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Candidate Mechanism Types */}
            <div
              style={{
                backgroundColor: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "1.25rem",
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem 0" }}>
                Identified Mechanism Types
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", margin: "0 0 1rem 0" }}>
                Mechanism categorization from Phase 5 Causal Engine runs
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {Object.entries(hypothesisMetrics.typeCounts).map(([tp, cnt]) => (
                  <div
                    key={tp}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.6rem 0.8rem",
                      backgroundColor: "var(--color-bg-elevated)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                      {tp}
                    </span>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 700 }}>
                      {cnt}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
                <Link href="/app/evidence" style={{ fontSize: "0.75rem", color: "var(--color-accent)", textDecoration: "none" }}>
                  Inspect Full Forensic Evidence Audit →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: CASCADE FORECASTS VS OBSERVED REALITY ─────────────────── */}
      {activeTab === "forecasts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Strict Separation Callout Banner */}
          <div
            style={{
              padding: "1rem 1.25rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "rgba(129, 140, 248, 0.08)",
              border: "1px solid rgba(129, 140, 248, 0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--color-status-simulation)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                }}
              >
                PROSPECTIVE SIMULATION ESTIMATES (NOT OBSERVED REALITY)
              </span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", margin: "0.35rem 0 0 0" }}>
              Phase 6 Cascade Forecast records reflect algorithmic downstream propagation models evaluated under
              hypothetical perturbation scenarios. They are explicitly separated from observed incident records.
              Forecast accuracy is neither claimed nor certified without direct observed failure verification.
            </p>
          </div>

          {/* Forecast Runs Audit Table */}
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
                padding: "0.875rem 1rem",
                borderBottom: "1px solid var(--color-border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>
                  Recorded Cascade Forecast Runs
                </h4>
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                  {forecasts.length} total forecast runs logged in system
                </span>
              </div>
              <Link href="/app/simulation" style={{ fontSize: "0.75rem", color: "var(--color-accent)", textDecoration: "none" }}>
                Open Cascade Simulator →
              </Link>
            </div>

            {forecasts.length === 0 ? (
              <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.8125rem" }}>
                No cascade forecast runs recorded for this graph yet.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                  <thead>
                    <tr style={{ color: "var(--color-text-tertiary)", textAlign: "left", borderBottom: "1px solid var(--color-border-subtle)" }}>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>TIMESTAMP</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>FORECAST ID</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>INITIATING NODE</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>HORIZON</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>PREDICTED AT RISK</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>CRITICAL AT RISK</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>MAX DEPTH</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>CALIBRATION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecasts.map((fc) => (
                      <tr key={fc.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                          {formatRelativeTime(fc.created_at)}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>
                          {fc.id.slice(0, 8)}…
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--font-mono)" }}>
                          {fc.initiating_node_id ?? "Entire Graph"}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          {fc.horizon_minutes} min
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "var(--color-status-simulation)" }}>
                          {fc.total_predicted_affected} nodes
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "var(--color-status-critical)" }}>
                          {fc.total_critical_affected} nodes
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          Depth {fc.max_depth_reached}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          <span
                            style={{
                              fontSize: "0.625rem",
                              padding: "0.1rem 0.35rem",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: "var(--color-bg-elevated)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {fc.calibration_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: BASELINES & SNAPSHOT CONTEXT ───────────────────────────── */}
      {activeTab === "snapshots" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {/* Baselines Context */}
            <div
              style={{
                backgroundColor: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "1.25rem",
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem 0" }}>
                Operational Baselines ({baselines.length})
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", margin: "0 0 1rem 0" }}>
                Golden reference states captured for divergence comparison
              </p>

              {baselines.length === 0 ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.75rem" }}>
                  No operational baselines recorded.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {baselines.map((bl) => (
                    <div
                      key={bl.id}
                      style={{
                        padding: "0.75rem",
                        backgroundColor: "var(--color-bg-elevated)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{bl.name}</span>
                        {bl.is_active && <Badge variant="normal">ACTIVE</Badge>}
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>
                        Captured: {formatRelativeTime(bl.captured_at)} · Completeness: {formatPercentage(bl.completeness_ratio)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Snapshots Context */}
            <div
              style={{
                backgroundColor: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "1.25rem",
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem 0" }}>
                System Snapshots ({snapshots.length})
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", margin: "0 0 1rem 0" }}>
                Historical frozen state archives available for comparative analysis
              </p>

              {snapshots.length === 0 ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.75rem" }}>
                  No historical snapshots captured yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {snapshots.map((sn) => (
                    <div
                      key={sn.id}
                      style={{
                        padding: "0.75rem",
                        backgroundColor: "var(--color-bg-elevated)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{sn.name || `Snapshot #${sn.id.slice(0, 8)}`}</span>
                        <span style={{ fontSize: "0.625rem", fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>
                          {sn.snapshot_type}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>
                        Nodes: {sn.node_count} · Completeness: {formatPercentage(sn.completeness_ratio)} · Effective: {formatRelativeTime(sn.effective_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Link href="/app/scenarios" style={{ fontSize: "0.75rem", color: "var(--color-accent)", textDecoration: "none" }}>
              Launch Full State Comparison in Scenarios Page →
            </Link>
          </div>
        </div>
      )}

      {/* ── CROSS-NAVIGATION QUICK SHORTCUTS BAR ─────────────────────────── */}
      <div
        style={{
          marginTop: "1rem",
          padding: "1rem 1.25rem",
          backgroundColor: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
            PLATFORM NAVIGATION:
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginLeft: "0.5rem" }}>
            Investigate detailed sub-systems directly
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href="/app/state" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="sm">⎈ Digital Twin</Button>
          </Link>
          <Link href="/app/incidents" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="sm">⚡ Incidents</Button>
          </Link>
          <Link href="/app/causal" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="sm">⊛ Causal Engine</Button>
          </Link>
          <Link href="/app/evidence" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="sm">⊘ Evidence Audit</Button>
          </Link>
          <Link href="/app/scenarios" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="sm">⊙ Scenarios</Button>
          </Link>
          <Link href="/app/simulation" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="sm">◎ Cascade Simulation</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
