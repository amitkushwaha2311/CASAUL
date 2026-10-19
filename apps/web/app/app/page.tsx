"use client";

/**
 * CAUSAL — Production Overview Dashboard (/app)
 *
 * Operational Command Center:
 * - Real-time infrastructure graph telemetry and twin status
 * - High-density executive command HUD with architectural hairlines
 * - Active critical & high anomaly incident stream
 * - Evidence-grounded causal hypotheses and attribution
 * - Zero horizontal overflow with responsive multi-column hierarchy
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import App from "@/src/App";
import { apiClient } from "@/lib/api-client";
import {
  Badge,
  StatusIndicator,
  Button,
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/components/ui";
import type {
  GraphResponse,
  SystemStateSummaryResponse,
  EventResponse,
  HypothesisResponse,
  HealthResponse,
  SystemStatusResponse,
  NodeState,
} from "@causal/shared/src/index";

// ── Types ─────────────────────────────────────────────────────────────────

interface GraphDashboardData {
  graph: GraphResponse;
  summary: SystemStateSummaryResponse | null;
  recentEvents: EventResponse[];
  hypotheses: HypothesisResponse[];
  error?: boolean;
}

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

function mapOperationalStateToNodeState(state: string): NodeState {
  const s = state.toLowerCase();
  if (
    s === "normal" ||
    s === "degraded" ||
    s === "critical" ||
    s === "failed" ||
    s === "recovering" ||
    s === "simulation"
  ) {
    return s;
  }
  return "unknown";
}

function mapSeverityToBadge(severity: string): "critical" | "degraded" | "info" | "unknown" {
  const s = severity.toUpperCase();
  if (s === "CRITICAL") return "critical";
  if (s === "HIGH" || s === "MEDIUM") return "degraded";
  if (s === "LOW" || s === "INFO") return "info";
  return "unknown";
}

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return "No telemetry";
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Operational Graph Filter ───────────────────────────────────────────────

/**
 * Identifies synthetic test fixtures and automated test scaffolds
 * that must not appear in the production-style operational dashboard.
 */
function isOperationalGraph(graph: GraphResponse): boolean {
  const name = (graph.name ?? "").toLowerCase();
  const testPatterns = [
    "test graph",
    "p10 test",
    "e2e-infra",
    "filter test",
    "deterministic test",
    "depth bound",
    "horizon bound",
    "status label",
    "labeling test",
    "reproducibility",
    "readonlyretrieval",
    "snapshotintegrity",
    "knownzero",
    "zerovsunknown",
    "direction test",
    "backward direction",
    "cyclic grid",
    "cyclic loop",
    "attenuation grid",
    "sensor net",
    "multi-upstream",
    "unknown telemetry",
    "audit grid",
    "immutability grid",
    "assessa",
    "graph alpha",
    "graph a",
    "graph 1 ",
    "graph 2 ",
  ];

  if (testPatterns.some((pattern) => name.includes(pattern))) {
    return false;
  }

  if (graph.metadata && typeof graph.metadata === "object") {
    const meta = graph.metadata as Record<string, unknown>;
    if (meta.is_test === true || meta.environment === "test" || meta.fixture === true) {
      return false;
    }
  }

  return true;
}

// ── Main Dashboard Page ────────────────────────────────────────────────────

export default function OverviewDashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [graphData, setGraphData] = useState<Map<string, GraphDashboardData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback(async () => {
    setFetchError(null);
    try {
      const [hRes, sRes, gRes] = await Promise.allSettled([
        apiClient.health(),
        apiClient.systemStatus(),
        apiClient.listGraphs(),
      ]);

      if (hRes.status === "fulfilled") setHealth(hRes.value);
      if (sRes.status === "fulfilled") setSystemStatus(sRes.value);

      if (gRes.status === "rejected") {
        setFetchError("Failed to fetch infrastructure graphs from the API.");
        setGraphs([]);
        setGraphData(new Map());
        return;
      }

      const allGraphs = gRes.value;
      const operationalGraphs = allGraphs.filter(isOperationalGraph);
      // Prioritize genuine operational models; if none match (e.g. fresh environment), show empty state
      const graphList = operationalGraphs;
      setGraphs(graphList);

      const dataMap = new Map<string, GraphDashboardData>();

      await Promise.all(
        graphList.map(async (graph) => {
          const entry: GraphDashboardData = {
            graph,
            summary: null,
            recentEvents: [],
            hypotheses: [],
            error: false,
          };

          const [summaryRes, eventsRes, hypothesesRes] = await Promise.allSettled([
            apiClient.getSystemStateSummary(graph.id),
            apiClient.listEvents(graph.id, { page_size: 15, status: "OPEN" }),
            apiClient.listHypotheses(graph.id),
          ]);

          if (summaryRes.status === "fulfilled") entry.summary = summaryRes.value;
          if (eventsRes.status === "fulfilled") {
            entry.recentEvents = eventsRes.value
              .sort((a, b) => {
                const ai = SEVERITY_ORDER.indexOf(a.severity.toUpperCase() as (typeof SEVERITY_ORDER)[number]);
                const bi = SEVERITY_ORDER.indexOf(b.severity.toUpperCase() as (typeof SEVERITY_ORDER)[number]);
                if (ai !== -1 && bi !== -1 && ai !== bi) return ai - bi;
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
              })
              .slice(0, 8);
          }
          if (hypothesesRes.status === "fulfilled") entry.hypotheses = hypothesesRes.value;

          if (summaryRes.status === "rejected" || eventsRes.status === "rejected" || hypothesesRes.status === "rejected") {
            entry.error = true;
          }

          dataMap.set(graph.id, entry);
        })
      );

      setGraphData(dataMap);
      setLastRefreshed(new Date());
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "An unexpected network error occurred.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    loadAll();
  };

  useEffect(() => {
    loadAll();
    refreshIntervalRef.current = setInterval(loadAll, 30_000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [loadAll]);

  // ── Metrics Aggregations ────────────────────────────────────────────────
  const allSummaries = [...graphData.values()]
    .map((d) => d.summary)
    .filter((s): s is SystemStateSummaryResponse => s !== null);

  const totalNodes = allSummaries.reduce((sum, s) => sum + s.total_nodes, 0);
  const totalKnownNodes = allSummaries.reduce((sum, s) => sum + s.nodes_with_known_state, 0);
  const totalUnknownNodes = allSummaries.reduce((sum, s) => sum + s.nodes_with_unknown_state, 0);

  const aggregatedStates: Record<string, number> = {
    NORMAL: 0,
    DEGRADED: 0,
    CRITICAL: 0,
    FAILED: 0,
    RECOVERING: 0,
    UNKNOWN: 0,
  };

  for (const s of allSummaries) {
    for (const [stateKey, count] of Object.entries(s.count_by_operational_state ?? {})) {
      const normalizedKey = stateKey.toUpperCase();
      aggregatedStates[normalizedKey] = (aggregatedStates[normalizedKey] ?? 0) + count;
    }
  }

  const normalNodes = aggregatedStates["NORMAL"] ?? 0;
  const degradedNodes = aggregatedStates["DEGRADED"] ?? 0;
  const criticalNodes = aggregatedStates["CRITICAL"] ?? 0;
  const failedNodes = aggregatedStates["FAILED"] ?? 0;
  const totalFailedCritical = criticalNodes + failedNodes;

  const validHealthSummaries = allSummaries.filter(
    (s) => s.average_health !== null && s.average_health !== undefined && s.health_denominator > 0
  );
  const avgHealthPercent =
    validHealthSummaries.length > 0
      ? (
          (validHealthSummaries.reduce((acc, s) => acc + (s.average_health ?? 0), 0) /
            validHealthSummaries.length) *
          100
        ).toFixed(1) + "%"
      : "—";

  const allEvents = [...graphData.values()].flatMap((d) => d.recentEvents);
  const criticalEvents = allEvents.filter(
    (e) => e.severity.toUpperCase() === "CRITICAL" || e.severity.toUpperCase() === "HIGH"
  );

  const allHypotheses = [...graphData.values()].flatMap((d) => d.hypotheses);
  const supportedHypotheses = allHypotheses.filter((h) => h.status === "SUPPORTED");
  const possibleHypotheses = allHypotheses.filter((h) => h.status === "POSSIBLE");
  const contradictedHypotheses = allHypotheses.filter((h) => h.status === "CONTRADICTED");
  const insufficientHypotheses = allHypotheses.filter((h) => h.status === "INSUFFICIENT_EVIDENCE");

  const totalWarnings = allSummaries.reduce((sum, s) => sum + (s.consistency_warning_count ?? 0), 0);
  const totalInvalid = allSummaries.reduce((sum, s) => sum + (s.consistency_invalid_count ?? 0), 0);

  const latestStateUpdateAt = allSummaries.reduce<string | null>((latest, s) => {
    if (!s.latest_state_update_at) return latest;
    if (!latest) return s.latest_state_update_at;
    return new Date(s.latest_state_update_at) > new Date(latest) ? s.latest_state_update_at : latest;
  }, null);

  const platformIsHealthy = health?.status === "healthy" && health?.database === "connected";

  // ── Render States ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto min-h-[600px] flex items-center justify-center">
        <LoadingState message="Connecting to CAUSAL Operational Telemetry Stream..." />
      </div>
    );
  }

  if (fetchError && graphs.length === 0) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <ErrorState
          title="Overview Telemetry Unavailable"
          message={fetchError}
          onRetry={loadAll}
        />
      </div>
    );
  }

  if (graphs.length === 0) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <EmptyState
          title="No Monitored Infrastructure Graphs"
          description="Register or seed multi-domain infrastructure topology models in the Digital Twin workspace to begin operational intelligence ingestion."
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
    <div className="flex flex-col w-full">
      {/* ── RIVR Glassmorphism Hero (Post-Login Authenticated Experience) ── */}
      <App />

      {/* ── CAUSAL Platform Overview Telemetry Dashboard ── */}
      <div id="overview-telemetry-dashboard" className="p-4 sm:p-6 lg:p-8 max-w-[1640px] mx-auto space-y-6 text-[#F0EDE5] w-full bg-[#111210]">
      {/* ── Top Header Bar ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-[rgba(240,237,229,0.08)]">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] font-sans text-[#F0EDE5]">
              Platform Overview
            </h1>

            <div
              id="platform-health-status"
              className={`inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-mono border ${
                platformIsHealthy
                  ? "bg-[#82977D]/15 border-[#82977D]/40 text-[#82977D]"
                  : "bg-[#9B4540]/15 border-[#9B4540]/40 text-[#9B4540]"
              }`}
            >
              <StatusIndicator
                status={platformIsHealthy ? "normal" : "failed"}
                label={health?.status?.toUpperCase() ?? "UNKNOWN"}
                size="sm"
                pulse={!platformIsHealthy}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-[#A7A398] flex-wrap">
            <span>
              {graphs.length} graph{graphs.length !== 1 ? "s" : ""} active
            </span>
            <span className="text-[#736F66]">·</span>
            <span>Refreshed: {lastRefreshed.toLocaleTimeString()}</span>
            <span className="text-[#736F66]">·</span>
            <span>
              Telemetry freshness:{" "}
              <strong className="text-[#F0EDE5]">
                {formatRelativeTime(latestStateUpdateAt)}
              </strong>
            </span>
          </div>
        </div>

        {/* Action Controls & System Status Badges */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Badge variant={health?.database === "connected" ? "normal" : "failed"} dot>
            DB {health?.database ?? "UNKNOWN"}
          </Badge>

          {systemStatus?.features.causal_engine && (
            <Badge variant="recovering">
              ⊛ Causal Engine Active
            </Badge>
          )}

          <Button
            id="btn-refresh-overview"
            variant="secondary"
            size="sm"
            onClick={handleManualRefresh}
            loading={isRefreshing}
          >
            ↺ Refresh
          </Button>
        </div>
      </div>

      {/* ── Key Metrics Command Bar (KPIs) ────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div id="stat-graphs-count" className="p-3.5 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#191A17] flex flex-col justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#A7A398]">Monitored Graphs</span>
          <span className="text-2xl font-bold font-mono tracking-tight text-[#F0EDE5] my-1">{graphs.length}</span>
          <span className="text-[11px] text-[#736F66] truncate">{new Set(graphs.map((g) => g.domain)).size} domain(s)</span>
        </div>

        <div id="stat-total-nodes" className="p-3.5 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#191A17] flex flex-col justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#A7A398]">Total Nodes</span>
          <span className="text-2xl font-bold font-mono tracking-tight text-[#F0EDE5] my-1">{totalNodes}</span>
          <span className="text-[11px] text-[#736F66] truncate">{totalKnownNodes} known · {totalUnknownNodes} unk</span>
        </div>

        <div id="stat-normal-nodes" className="p-3.5 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#191A17] flex flex-col justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#82977D]">Normal State</span>
          <span className="text-2xl font-bold font-mono tracking-tight text-[#82977D] my-1">{normalNodes}</span>
          <span className="text-[11px] text-[#736F66] truncate">{totalNodes > 0 ? ((normalNodes / totalNodes) * 100).toFixed(0) : 0}% of nodes</span>
        </div>

        <div id="stat-degraded-nodes" className="p-3.5 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#191A17] flex flex-col justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#B9955B]">Degraded</span>
          <span className={`text-2xl font-bold font-mono tracking-tight my-1 ${degradedNodes > 0 ? "text-[#B9955B]" : "text-[#F0EDE5]"}`}>{degradedNodes}</span>
          <span className="text-[11px] text-[#736F66] truncate">{degradedNodes > 0 ? "Performance reduced" : "No degradation"}</span>
        </div>

        <div id="stat-failed-nodes" className="p-3.5 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#191A17] flex flex-col justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#9B4540]">Critical / Failed</span>
          <span className={`text-2xl font-bold font-mono tracking-tight my-1 ${totalFailedCritical > 0 ? "text-[#9B4540]" : "text-[#F0EDE5]"}`}>{totalFailedCritical}</span>
          <span className="text-[11px] text-[#736F66] truncate">{totalFailedCritical > 0 ? "Action required" : "Zero failures"}</span>
        </div>

        <div id="stat-avg-health" className="p-3.5 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#191A17] flex flex-col justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#A7A398]">Average Health</span>
          <span className="text-2xl font-bold font-mono tracking-tight text-[#F0EDE5] my-1">{avgHealthPercent}</span>
          <span className="text-[11px] text-[#736F66] truncate">Aggregated index</span>
        </div>

        <div id="stat-active-incidents" className="p-3.5 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#191A17] flex flex-col justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#9B4540]">Active Incidents</span>
          <span className={`text-2xl font-bold font-mono tracking-tight my-1 ${criticalEvents.length > 0 ? "text-[#9B4540]" : "text-[#F0EDE5]"}`}>{criticalEvents.length}</span>
          <span className="text-[11px] text-[#736F66] truncate">{allEvents.length} total open</span>
        </div>

        <div id="stat-causal-hypotheses" className="p-3.5 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#191A17] flex flex-col justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#A99A80]">Hypotheses</span>
          <span className="text-2xl font-bold font-mono tracking-tight text-[#F0EDE5] my-1">{allHypotheses.length}</span>
          <span className="text-[11px] text-[#736F66] truncate">{supportedHypotheses.length} sup · {possibleHypotheses.length} pos</span>
        </div>
      </div>

      {/* ── Main Layout: Graphs (Left) & Active Events (Right) ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Monitored Graphs Panel (Left 7 Cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-[rgba(240,237,229,0.10)] bg-[#191A17] p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(240,237,229,0.06)]">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono uppercase tracking-wider text-[#A99A80]">⬡</span>
              <h2 className="text-sm font-bold tracking-tight text-[#F0EDE5] font-sans">
                Infrastructure Graphs & Twin Telemetry
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#20211D] border border-[rgba(240,237,229,0.1)] text-[#A7A398]">
                {graphs.length}
              </span>
            </div>
            <Link href="/app/state" className="text-xs font-mono text-[#A99A80] hover:text-[#F0EDE5] transition-colors">
              Digital Twin View →
            </Link>
          </div>

          <div className="space-y-3">
            {graphs.map((graph) => {
              const data = graphData.get(graph.id);
              const summary = data?.summary ?? null;
              const events = data?.recentEvents ?? [];
              const hypotheses = data?.hypotheses ?? [];
              const critCount = events.filter(
                (e) => e.severity.toUpperCase() === "CRITICAL" || e.severity.toUpperCase() === "HIGH"
              ).length;
              const supportedCount = hypotheses.filter((h) => h.status === "SUPPORTED").length;

              const stateCounts = summary?.count_by_operational_state ?? {};
              const nodeTotal = summary?.total_nodes ?? 0;

              return (
                <Link
                  key={graph.id}
                  href="/app/state"
                  className="block group"
                >
                  <div
                    id={`graph-card-${graph.id}`}
                    className="p-4 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#111210] hover:border-[#A99A80]/50 transition-all space-y-3"
                  >
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm text-[#F0EDE5] group-hover:text-white transition-colors">
                            {graph.name}
                          </span>
                          <Badge variant="info">
                            {graph.domain}
                          </Badge>
                          {data?.error && (
                            <Badge variant="degraded">Sync Warning</Badge>
                          )}
                        </div>
                        {graph.description && (
                          <p className="text-xs text-[#A7A398] truncate max-w-md">
                            {graph.description}
                          </p>
                        )}
                      </div>

                      <div className="text-right font-mono text-xs flex-shrink-0">
                        <span className="text-[#736F66]">Avg Health: </span>
                        <strong
                          className={
                            summary?.average_health !== null && summary?.average_health !== undefined
                              ? summary.average_health < 0.6
                                ? "text-[#9B4540]"
                                : summary.average_health < 0.8
                                ? "text-[#B9955B]"
                                : "text-[#82977D]"
                              : "text-[#736F66]"
                          }
                        >
                          {summary?.average_health !== null && summary?.average_health !== undefined
                            ? `${(summary.average_health * 100).toFixed(0)}%`
                            : "—"}
                        </strong>
                      </div>
                    </div>

                    {/* Operational States Distribution Progress Bar */}
                    {nodeTotal > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex h-1.5 rounded-full overflow-hidden bg-[#20211D] gap-0.5">
                          {(["FAILED", "CRITICAL", "DEGRADED", "RECOVERING", "NORMAL", "UNKNOWN"] as const).map(
                            (st) => {
                              const cnt = stateCounts[st] ?? 0;
                              if (cnt === 0) return null;
                              const pct = (cnt / nodeTotal) * 100;
                              const bgClass =
                                st === "FAILED" || st === "CRITICAL"
                                  ? "bg-[#9B4540]"
                                  : st === "DEGRADED"
                                  ? "bg-[#B9955B]"
                                  : st === "NORMAL"
                                  ? "bg-[#82977D]"
                                  : "bg-[#736F66]";
                              return (
                                <div
                                  key={st}
                                  style={{ width: `${pct}%` }}
                                  className={`${bgClass} transition-all`}
                                  title={`${st}: ${cnt} (${pct.toFixed(0)}%)`}
                                />
                              );
                            }
                          )}
                        </div>

                        <div className="flex gap-1.5 flex-wrap">
                          {Object.entries(stateCounts)
                            .filter(([, v]) => v > 0)
                            .map(([st, cnt]) => {
                              const nodeState = mapOperationalStateToNodeState(st);
                              return (
                                <Badge
                                  key={st}
                                  variant={
                                    nodeState === "normal"
                                      ? "normal"
                                      : nodeState === "degraded"
                                      ? "degraded"
                                      : nodeState === "critical"
                                      ? "critical"
                                      : nodeState === "failed"
                                      ? "failed"
                                      : "unknown"
                                  }
                                >
                                  {cnt} {st}
                                </Badge>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* Graph Telemetry Stats Footer */}
                    <div className="flex items-center justify-between text-xs text-[#A7A398] pt-2 border-t border-[rgba(240,237,229,0.06)] font-mono">
                      <div className="flex items-center gap-3">
                        <span>
                          Nodes: <strong className="text-[#F0EDE5]">{nodeTotal}</strong>
                        </span>
                        {critCount > 0 && (
                          <span className="text-[#9B4540]">
                            ⚡ {critCount} incident{critCount !== 1 ? "s" : ""}
                          </span>
                        )}
                        {supportedCount > 0 && (
                          <span className="text-[#82977D]">
                            ⊛ {supportedCount} hypothesis{supportedCount !== 1 ? "es" : ""}
                          </span>
                        )}
                        {summary && (
                          <span className="hidden sm:inline">
                            Completeness: {(summary.completeness_ratio * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-[#736F66]">
                        {formatRelativeTime(summary?.latest_state_update_at)}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Active Events & Incident Feed Panel (Right 5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-[rgba(240,237,229,0.10)] bg-[#191A17] p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(240,237,229,0.06)]">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono uppercase tracking-wider text-[#9B4540]">⚡</span>
              <h2 className="text-sm font-bold tracking-tight text-[#F0EDE5] font-sans">
                Active Incidents & Events
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#201515] border border-[#9B4540]/30 text-[#9B4540]">
                {allEvents.length}
              </span>
            </div>
            <Link href="/app/incidents" className="text-xs font-mono text-[#A99A80] hover:text-[#F0EDE5] transition-colors">
              All Incidents →
            </Link>
          </div>

          {allEvents.length === 0 ? (
            <div className="py-12 text-center">
              <EmptyState
                title="No Open Incidents"
                description="All monitored telemetry within normal operational thresholds."
                icon="✓"
              />
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
              {allEvents.slice(0, 10).map((ev) => {
                const badgeVariant = mapSeverityToBadge(ev.severity);
                return (
                  <div
                    key={ev.id}
                    id={`event-item-${ev.id}`}
                    className="p-3 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#111210] flex items-start gap-3 hover:border-[rgba(240,237,229,0.18)] transition-colors"
                  >
                    <Badge variant={badgeVariant} dot>
                      {ev.severity.toUpperCase()}
                    </Badge>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold font-mono text-[#F0EDE5] truncate">
                        {ev.event_type}
                      </div>
                      {ev.description && (
                        <p className="text-[11px] text-[#A7A398] mt-0.5 line-clamp-2 leading-snug">
                          {ev.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] font-mono text-[#736F66] mt-1.5">
                        <span>Src: {ev.source}</span>
                        <span>Status: {ev.status}</span>
                      </div>
                    </div>

                    <time className="text-[10px] font-mono text-[#736F66] flex-shrink-0">
                      {formatRelativeTime(ev.timestamp)}
                    </time>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-[rgba(240,237,229,0.06)]">
            <Link
              href="/app/incidents"
              id="link-timeline-feed"
              className="block w-full py-2 px-3 text-center rounded-lg bg-[#20211D] hover:bg-[#282924] border border-[rgba(240,237,229,0.08)] text-xs font-mono text-[#F0EDE5] transition-colors"
            >
              Open Interactive Event Timeline →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Bottom Section: State Distribution, Causal Hypotheses & Instrument Controls ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Card 1: Node State Distribution & Consistency */}
        <div className="rounded-2xl border border-[rgba(240,237,229,0.10)] bg-[#191A17] p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[rgba(240,237,229,0.06)]">
            <span className="text-xs font-mono text-[#A99A80]">⎈</span>
            <h2 className="text-sm font-bold text-[#F0EDE5] font-sans">
              Operational State Distribution
            </h2>
          </div>

          {totalNodes === 0 ? (
            <div className="text-center py-8 text-xs font-mono text-[#736F66]">
              No node state observations ingested yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {(["NORMAL", "DEGRADED", "CRITICAL", "FAILED", "RECOVERING", "UNKNOWN"] as const).map((st) => {
                const count = aggregatedStates[st] ?? 0;
                const pct = totalNodes > 0 ? (count / totalNodes) * 100 : 0;
                const nodeState = mapOperationalStateToNodeState(st);

                return (
                  <div key={st} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="flex items-center gap-1.5 font-semibold text-[#F0EDE5]">
                        <StatusIndicator status={nodeState} size="sm" />
                        <span>{st}</span>
                      </span>
                      <span className="text-[#A7A398]">
                        {count} ({pct.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="h-1 rounded-full bg-[#20211D] overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className={`h-full transition-all ${
                          st === "NORMAL"
                            ? "bg-[#82977D]"
                            : st === "DEGRADED"
                            ? "bg-[#B9955B]"
                            : st === "CRITICAL" || st === "FAILED"
                            ? "bg-[#9B4540]"
                            : "bg-[#736F66]"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}

              {(totalWarnings > 0 || totalInvalid > 0) && (
                <div className="mt-3 p-2.5 rounded-lg bg-[#B9955B]/10 border border-[#B9955B]/30 text-xs font-mono text-[#B9955B]">
                  ⚠ {totalWarnings} warning(s) & {totalInvalid} invalid rule violations detected.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 2: Causal Hypotheses Breakdown */}
        <div className="rounded-2xl border border-[rgba(240,237,229,0.10)] bg-[#191A17] p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(240,237,229,0.06)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#A99A80]">⊛</span>
              <h2 className="text-sm font-bold text-[#F0EDE5] font-sans">
                Causal Engine Hypotheses
              </h2>
            </div>
            <Link href="/app/causal" className="text-xs font-mono text-[#A99A80] hover:text-[#F0EDE5]">
              Engine →
            </Link>
          </div>

          {allHypotheses.length === 0 ? (
            <div className="py-8 text-center">
              <EmptyState
                title="No Hypotheses Generated"
                description="Run causal inference over anomalies to evaluate root causes."
                icon="⊛"
                action={{
                  label: "Open Causal Engine",
                  onClick: () => {
                    window.location.href = "/app/causal";
                  },
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded-lg bg-[#82977D]/10 border border-[#82977D]/25">
                  <div className="text-[10px] text-[#82977D] font-bold">SUPPORTED</div>
                  <div className="text-lg font-bold text-[#82977D]">{supportedHypotheses.length}</div>
                </div>

                <div className="p-2 rounded-lg bg-[#B9955B]/10 border border-[#B9955B]/25">
                  <div className="text-[10px] text-[#B9955B] font-bold">POSSIBLE</div>
                  <div className="text-lg font-bold text-[#B9955B]">{possibleHypotheses.length}</div>
                </div>

                <div className="p-2 rounded-lg bg-[#9B4540]/10 border border-[#9B4540]/25">
                  <div className="text-[10px] text-[#9B4540] font-bold">CONTRADICTED</div>
                  <div className="text-lg font-bold text-[#9B4540]">{contradictedHypotheses.length}</div>
                </div>

                <div className="p-2 rounded-lg bg-[#20211D] border border-[rgba(240,237,229,0.08)]">
                  <div className="text-[10px] text-[#A7A398] font-bold">INSUFFICIENT</div>
                  <div className="text-lg font-bold text-[#A7A398]">{insufficientHypotheses.length}</div>
                </div>
              </div>

              {allHypotheses.slice(0, 2).map((hyp) => (
                <div
                  key={hyp.id}
                  className="p-3 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#111210] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-[#F0EDE5] truncate">
                      {hyp.candidate_cause_factor}
                    </span>
                    <Badge variant={hyp.status === "SUPPORTED" ? "normal" : hyp.status === "POSSIBLE" ? "degraded" : "failed"}>
                      {hyp.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[#A7A398] truncate">
                    {hyp.explanation}
                  </p>
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#736F66]">
                    <span>Node: {hyp.affected_node_id}</span>
                    <span>Evidence: {(hyp.evidence_completeness * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 3: System Data Freshness & Mission Controls */}
        <div className="rounded-2xl border border-[rgba(240,237,229,0.10)] bg-[#191A17] p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[rgba(240,237,229,0.06)]">
            <span className="text-xs font-mono text-[#A99A80]">◈</span>
            <h2 className="text-sm font-bold text-[#F0EDE5] font-sans">
              Data Freshness & Navigation
            </h2>
          </div>

          <div className="p-3.5 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#111210] space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[#736F66]">Latest Observation:</span>
              <span className="text-[#F0EDE5]">
                {latestStateUpdateAt ? new Date(latestStateUpdateAt).toLocaleTimeString() : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#736F66]">Sync Cycle:</span>
              <span className="text-[#82977D]">Live (30s interval)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#736F66]">API Status:</span>
              <span className="text-[#82977D]">{health?.status ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#736F66]">Storage Link:</span>
              <span className="text-[#A7A398]">{health?.database ?? "—"}</span>
            </div>
          </div>

          {/* Quick Mission Navigation */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {[
              { href: "/app/state", label: "Digital Twin", icon: "⎈" },
              { href: "/app/incidents", label: "Incidents", icon: "⚡" },
              { href: "/app/causal", label: "Causal Engine", icon: "⊛" },
              { href: "/app/simulation", label: "Simulation", icon: "◎" },
              { href: "/app/interventions", label: "Interventions", icon: "✦" },
              { href: "/app/assessments", label: "Assessments", icon: "🛡" },
            ].map((nav) => (
              <Link
                key={nav.href}
                href={nav.href}
                className="p-2.5 rounded-xl border border-[rgba(240,237,229,0.08)] bg-[#111210] hover:bg-[#20211D] hover:border-[#A99A80]/40 transition-colors flex items-center gap-2 text-[#A7A398] hover:text-[#F0EDE5]"
              >
                <span>{nav.icon}</span>
                <span className="truncate">{nav.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
