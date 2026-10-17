"use client";

/**
 * CAUSAL — Phase 3: Event Timeline Page (/app/incidents)
 *
 * Professional incident investigation interface:
 * - Real-time event timeline with WebSocket live telemetry
 * - Severity distribution stats
 * - Severity & status filters with tactile feedback
 * - Selected incident details with telemetry provenance
 * - Respects master Obsidian, Charcoal, Sage, Amber, and Oxide Red palette
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion-config";
import { apiClient } from "@/lib/api-client";
import type { EventResponse, EventStatisticsResponse } from "@causal/shared/src/index";

// ── Severity display config ────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  INFO:     { color: "bg-[#20211D] text-[#A7A398] border border-[rgba(240,237,229,0.1)]", text: "text-[#A7A398]", dot: "bg-[#A7A398]", label: "INFO" },
  LOW:      { color: "bg-[#20211D] text-[#A99A80] border border-[#A99A80]/30", text: "text-[#A99A80]",  dot: "bg-[#A99A80]",  label: "LOW" },
  MEDIUM:   { color: "bg-[#B9955B]/15 text-[#D5B075] border border-[#B9955B]/30", text: "text-[#D5B075]", dot: "bg-[#B9955B]", label: "MEDIUM" },
  HIGH:     { color: "bg-[#9B4540]/20 text-[#E5827C] border border-[#9B4540]/30", text: "text-[#E5827C]", dot: "bg-[#9B4540]", label: "HIGH" },
  CRITICAL: { color: "bg-[#9B4540] text-white border border-[#9B4540]", text: "text-white", dot: "bg-[#9B4540]", label: "CRITICAL" },
} as const;

const STATUS_COLORS = {
  OPEN: "text-[#B9955B]",
  ACKNOWLEDGED: "text-[#A99A80]",
  RESOLVED: "text-[#82977D]",
  DISMISSED: "text-[#736F66]",
} as const;

type WsState = "connecting" | "connected" | "disconnected" | "error";

// ── WebSocket hook ─────────────────────────────────────────────────────────

function useEventStream(
  graphId: string | null,
  onEvent: (event: Record<string, string>) => void
) {
  const [wsState, setWsState] = useState<WsState>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!graphId) return;
    setWsState("connecting");

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const wsBase = apiBase.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsBase}/api/v1/ws/graphs/${graphId}/events`);
    wsRef.current = ws;

    ws.onopen = () => setWsState("connected");
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "event.created") {
          onEvent(data);
        }
      } catch {}
    };
    ws.onclose = () => {
      setWsState("disconnected");
      // Auto-reconnect after 3 seconds
      // eslint-disable-next-line react-hooks/immutability
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => setWsState("error");
  }, [graphId, onEvent]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return wsState;
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function EventTimelinePage() {
  const [graphs, setGraphs] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [stats, setStats] = useState<EventStatisticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [newEventBadge, setNewEventBadge] = useState(false);

  // Load graphs on mount
  useEffect(() => {
    apiClient.listGraphs().then((g) => {
      setGraphs(g);
      if (g.length > 0) setSelectedGraphId(g[0].id);
    }).catch(() => setError("Failed to load graphs"));
  }, []);

  // Load events & stats when graph changes
  const refresh = useCallback(async () => {
    if (!selectedGraphId) return;
    setLoading(true);
    setError(null);
    try {
      const [evs, st] = await Promise.all([
        apiClient.listEvents(selectedGraphId, {
          severity: severityFilter === "ALL" ? undefined : severityFilter,
          page_size: 100,
        }),
        apiClient.getEventStatistics(selectedGraphId),
      ]);
      setEvents(evs);
      setStats(st);
    } catch {
      setError("Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [selectedGraphId, severityFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  // WebSocket new event handler
  const handleNewEvent = useCallback(() => {
    if (!selectedGraphId) return;
    setNewEventBadge(true);
    setTimeout(() => setNewEventBadge(false), 3000);
    // Refresh event list
    refresh();
  }, [selectedGraphId, refresh]);

  const wsState = useEventStream(selectedGraphId, handleNewEvent);

  return (
    <div className="causal-fade-in p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen text-[#F0EDE5]">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4 pb-4 border-b border-[rgba(240,237,229,0.08)]">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-[#F0EDE5] font-sans">
              Event Timeline & Telemetry Feed
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[rgba(169,154,128,0.15)] border border-[rgba(169,154,128,0.3)] text-[#A99A80] tracking-wider uppercase font-semibold">
              Phase 3 · Observability
            </span>
          </div>
          <p className="text-[#A7A398] text-xs font-mono">
            Direct physical observations and incident telemetry · Causal attribution evaluated in Phase 5
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* WebSocket status */}
          <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded border border-[rgba(240,237,229,0.1)] bg-[#191A17]">
            <span className={`w-2 h-2 rounded-full ${
              wsState === "connected" ? "bg-[#82977D] shadow-[0_0_8px_rgba(130,151,125,0.5)]" :
              wsState === "connecting" ? "bg-[#B9955B] animate-pulse" :
              wsState === "error" ? "bg-[#9B4540]" : "bg-[#736F66]"
            }`} />
            <span className="text-[#A7A398] uppercase tracking-wider text-[11px]">{wsState}</span>
          </div>

          {/* New event badge */}
          {newEventBadge && (
            <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded bg-[#B9955B]/15 border border-[#B9955B]/30 text-[#D5B075] animate-pulse">
              ⚡ Live Telemetry Ingested
            </div>
          )}

          {/* Graph selector */}
          <select
            className="bg-[#191A17] border border-[rgba(240,237,229,0.12)] rounded-lg px-3 py-1.5 text-xs font-mono text-[#F0EDE5] focus:outline-none focus:border-[#A99A80]"
            value={selectedGraphId ?? ""}
            onChange={(e) => setSelectedGraphId(e.target.value)}
          >
            {graphs.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6"
          variants={staggerContainer(0.04, 0.02)}
          initial="hidden"
          animate="visible"
        >
          {[
            { label: "Total Ingested", value: stats.total_events, color: "text-[#F0EDE5]" },
            { label: "Active Open", value: stats.open_events, color: "text-[#B9955B]" },
            { label: "Acknowledged", value: stats.acknowledged_events, color: "text-[#A99A80]" },
            { label: "Resolved", value: stats.resolved_events, color: "text-[#82977D]" },
            { label: "Dismissed", value: stats.dismissed_events, color: "text-[#736F66]" },
          ].map(({ label, value, color }) => (
            <motion.div
              key={label}
              variants={staggerItem}
              className="p-3.5 rounded-lg border border-[rgba(240,237,229,0.08)] bg-[#191A17]"
            >
              <div className="text-[10px] font-mono tracking-wider uppercase text-[#A7A398] mb-1">{label}</div>
              <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Severity filter */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        <span className="text-[11px] font-mono uppercase text-[#736F66] tracking-wider mr-1">Filter:</span>
        {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
          <motion.button
            key={s}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSeverityFilter(s)}
            className={`px-3 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-all duration-150 ${
              severityFilter === s
                ? "bg-[#20211D] text-[#F0EDE5] border border-[#A99A80] font-semibold"
                : "bg-[#191A17] text-[#A7A398] border border-[rgba(240,237,229,0.08)] hover:bg-[#20211D] hover:text-[#F0EDE5]"
            }`}
          >
            {s}
          </motion.button>
        ))}
      </div>

      {/* Timeline */}
      <div className="relative">
        {loading && (
          <div className="text-center text-[#A7A398] font-mono text-xs py-12 animate-pulse">
            Ingesting telemetry stream...
          </div>
        )}
        {error && (
          <div className="text-center text-[#E5827C] text-xs font-mono py-8 bg-[#9B4540]/15 border border-[#9B4540]/40 rounded-lg">
            {error}
          </div>
        )}
        {!loading && !error && events.length === 0 && (
          <div className="text-center py-16 rounded-lg border border-[rgba(240,237,229,0.08)] bg-[#191A17]">
            <div className="text-2xl mb-2 text-[#736F66] font-mono">⊘</div>
            <div className="text-xs font-mono text-[#A7A398]">No events found matching telemetry query.</div>
          </div>
        )}

        {/* Event list */}
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {events.map((ev) => {
              const sev = SEVERITY_CONFIG[ev.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.INFO;
              const statusColor = STATUS_COLORS[ev.status as keyof typeof STATUS_COLORS] ?? "text-[#736F66]";

              return (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="flex gap-4 p-4 rounded-lg border border-[rgba(240,237,229,0.08)] bg-[#191A17] hover:border-[rgba(240,237,229,0.18)] hover:bg-[#20211D]/60 transition-all duration-150 group"
                >
                  {/* Severity indicator line */}
                  <div className="flex flex-col items-center pt-1 gap-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${sev.dot} ring-2 ring-[#111210] group-hover:scale-110 transition-transform`} />
                    <div className="w-px flex-1 bg-[rgba(240,237,229,0.08)]" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${sev.color} tracking-wider uppercase`}>
                          {ev.severity}
                        </span>
                        <span className="text-[#F0EDE5] font-mono font-medium text-xs">{ev.event_type}</span>
                        <span className={`text-[10px] font-mono uppercase tracking-wider ${statusColor}`}>{ev.status}</span>
                      </div>
                      <time className="text-[11px] font-mono text-[#A7A398] shrink-0">
                        {new Date(ev.timestamp).toLocaleString()}
                      </time>
                    </div>

                    {ev.description && (
                      <p className="text-[#A7A398] text-xs leading-relaxed mb-2 font-sans">{ev.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-[11px] font-mono text-[#736F66]">
                      <span>Source: <span className="text-[#A7A398]">{ev.source}</span></span>
                      {ev.confidence !== null && ev.confidence !== undefined && (
                        <span>Confidence: <span className="text-[#82977D]">{(ev.confidence * 100).toFixed(0)}%</span></span>
                      )}
                      <span className="text-[#736F66]">ID: {ev.id.slice(0, 10)}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
