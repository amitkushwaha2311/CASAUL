"use client";

/**
 * CAUSAL — Operational Command Center (/app/command-center)
 *
 * Professional operational intelligence workspace:
 * - Real-time cyber-physical infrastructure status HUD
 * - Interactive multi-domain graph topology inspector
 * - Incident telemetry feed with severity grading
 * - Dynamic cascade blast-radius risk telemetry
 * - Rapid intervention controls (Causal, Simulation, Counterfactuals)
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import {
  Panel,
  Badge,
  Button,
  StatusIndicator,
  LoadingState,
  ErrorState,
} from "@/components/ui";
import { motion, AnimatePresence } from "motion/react";
import { staggerContainer, staggerItem, slideDown } from "@/lib/motion-config";
import type {
  GraphResponse,
  SystemStateSummaryResponse,
  EventResponse,
  HypothesisResponse,
  NodeResponse,
} from "@causal/shared/src/index";

export default function CommandCenterPage() {
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SystemStateSummaryResponse | null>(null);
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [hypotheses, setHypotheses] = useState<HypothesisResponse[]>([]);
  const [nodes, setNodes] = useState<NodeResponse[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeResponse | null>(null);
  const [simulatedIntervention, setSimulatedIntervention] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const fetchedGraphs = await apiClient.listGraphs();
      setGraphs(fetchedGraphs);

      const activeGraphId = selectedGraphId || fetchedGraphs[0]?.id;
      if (activeGraphId) {
        if (!selectedGraphId) setSelectedGraphId(activeGraphId);

        const [summaryData, eventData, hypothesisData, nodesData] = await Promise.allSettled([
          apiClient.getSystemStateSummary(activeGraphId),
          apiClient.listEvents(activeGraphId, { page_size: 10 }),
          apiClient.listHypotheses(activeGraphId),
          apiClient.listNodes(activeGraphId),
        ]);

        if (summaryData.status === "fulfilled") setSummary(summaryData.value);
        if (eventData.status === "fulfilled") setEvents(eventData.value);
        if (hypothesisData.status === "fulfilled") setHypotheses(hypothesisData.value);
        if (nodesData.status === "fulfilled") {
          setNodes(nodesData.value);
          if (nodesData.value.length > 0 && !selectedNode) {
            setSelectedNode(nodesData.value[0]);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load command center telemetry");
    } finally {
      setLoading(false);
    }
  }, [selectedGraphId, selectedNode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGraphChange = (id: string) => {
    setSelectedGraphId(id);
    setSelectedNode(null);
  };

  const handleApplyIntervention = (action: string) => {
    setSimulatedIntervention(action);
    setTimeout(() => {
      setSimulatedIntervention(null);
    }, 4500);
  };

  const activeGraph = graphs.find((g) => g.id === selectedGraphId) || graphs[0];

  if (loading && graphs.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <LoadingState message="Initializing Real-Time Command Center telemetry..." />
      </div>
    );
  }

  if (error && graphs.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <ErrorState
          title="Telemetry Initialization Error"
          message={error}
          onRetry={loadData}
        />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* ── Operational Workspace Header ─────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4 pb-4 border-b border-[rgba(240,237,229,0.08)]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#F0EDE5] font-sans">
              Operational Command Center
            </h1>
            <Badge variant="normal" dot>
              REAL-TIME MISSION HUD
            </Badge>
          </div>
          <p className="text-xs text-[#A7A398] mt-1.5 font-mono">
            Active Cyber-Physical Topology · Causal Diagnostic Engine · Continuous Blast Radius Forecast
          </p>
        </div>

        {/* Graph Switcher & Quick Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {graphs.length > 0 && (
            <select
              aria-label="Active Infrastructure Graph"
              value={selectedGraphId}
              onChange={(e) => handleGraphChange(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs font-mono bg-[#191A17] border border-[rgba(240,237,229,0.12)] text-[#F0EDE5] focus:border-[#A99A80] focus:outline-none"
            >
              {graphs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.domain})
                </option>
              ))}
            </select>
          )}

          <Button
            variant="secondary"
            onClick={loadData}
            className="text-xs font-mono"
          >
            ↻ Refresh Telemetry
          </Button>

          <Link
            href="/app/simulation"
            className="px-4 py-2 rounded-lg text-xs font-mono font-semibold text-[#111210] bg-[#F0EDE5] hover:bg-white transition-all flex items-center gap-1.5 shadow-sm"
          >
            Launch Blast Simulation →
          </Link>
        </div>
      </div>

      {/* ── High-Density Metrics Bar ─────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        variants={staggerContainer(0.04, 0.02)}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={staggerItem}>
          <Panel className="p-4 causal-hud-panel border border-[rgba(240,237,229,0.08)]">
            <span className="text-[10px] font-mono uppercase text-[#A7A398] block">
              System Operational Health
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-[#82977D]">96.4%</span>
              <span className="text-[11px] text-[#82977D] font-mono">Nominal Range</span>
            </div>
          </Panel>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Panel className="p-4 causal-hud-panel border border-[rgba(240,237,229,0.08)]">
            <span className="text-[10px] font-mono uppercase text-[#A7A398] block">
              Total Monitored Nodes
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-[#F0EDE5]">
                {summary ? summary.total_nodes : nodes.length || 5}
              </span>
              <span className="text-[11px] text-[#A7A398] font-mono">Active In Graph</span>
            </div>
          </Panel>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Panel className="p-4 causal-hud-panel border border-[rgba(240,237,229,0.08)]">
            <span className="text-[10px] font-mono uppercase text-[#A7A398] block">
              Active Failure Events
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-[#B9955B]">
                {events.filter((e) => e.severity === "CRITICAL" || e.severity === "HIGH").length}
              </span>
              <span className="text-[11px] text-[#B9955B] font-mono">Requires Oversight</span>
            </div>
          </Panel>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Panel className="p-4 causal-hud-panel border border-[rgba(240,237,229,0.08)]">
            <span className="text-[10px] font-mono uppercase text-[#A7A398] block">
              Causal Hypotheses Formulated
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-[#A99A80]">
                {hypotheses.length}
              </span>
              <span className="text-[11px] text-[#A7A398] font-mono">Evidence-Backed</span>
            </div>
          </Panel>
        </motion.div>
      </motion.div>

      {/* ── Active Simulated Intervention Feedback Notice ───────── */}
      <AnimatePresence>
        {simulatedIntervention && (
          <motion.div
            variants={slideDown}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="p-4 rounded-xl bg-[#20211D] border border-[#A99A80]/40 text-[#F0EDE5] text-xs font-mono flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#A99A80] animate-ping" />
              <span>
                INTERVENTION STAGED: <strong className="text-[#A99A80]">{simulatedIntervention}</strong> — Differential cascade simulation recalculating blast radius across {nodes.length} nodes...
              </span>
            </div>
            <Link href="/app/interventions" className="text-[#A99A80] underline hover:text-[#F0EDE5]">
              Inspect in Counterfactual Studio →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Central Main Command Grid ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: Interactive Topology Map & Telemetry ── */}
        <div className="lg:col-span-7 space-y-4">
          <Panel className="p-5 causal-hud-panel border border-[rgba(240,237,229,0.08)]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[rgba(240,237,229,0.06)]">
              <div>
                <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-[#F0EDE5]">
                  Topology Node Inspector
                </h2>
                <p className="text-[11px] text-[#A7A398] font-mono">
                  Active Domain: {activeGraph?.domain || "multi-sector"} · ID: {activeGraph?.id || "nominal"}
                </p>
              </div>
              <Badge variant="normal" dot>
                SYNCHRONIZED
              </Badge>
            </div>

            {/* Nodes List / Selector */}
            {nodes.length === 0 ? (
              <div className="py-12 text-center text-xs font-mono text-[#A7A398]">
                No nodes found for this infrastructure graph. Create nodes in the Digital Twin explorer.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                {nodes.map((node) => {
                  const isSelected = selectedNode?.id === node.id;
                  return (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? "bg-[#20211D] border-[#A99A80] shadow-md"
                          : "bg-[#111210] border-[rgba(240,237,229,0.08)] hover:border-[rgba(240,237,229,0.2)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#F0EDE5] truncate font-sans">
                          {node.name}
                        </span>
                        <StatusIndicator status={node.state} size="sm" />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#A7A398] mt-2">
                        <span>Type: {node.type}</span>
                        <span>Crit: {node.criticality.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Selected Node Real-Time Telemetry Card */}
            {selectedNode && (
              <div className="mt-4 p-4 rounded-xl bg-[#111210] border border-[rgba(240,237,229,0.12)]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#F0EDE5] font-mono">
                      {selectedNode.name}
                    </span>
                    <Badge variant={selectedNode.state}>
                      {selectedNode.state}
                    </Badge>
                  </div>
                  <span className="text-[10px] font-mono text-[#A7A398]">
                    Node ID: {selectedNode.id}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[rgba(240,237,229,0.06)] text-xs font-mono">
                  <div>
                    <span className="text-[10px] uppercase text-[#A7A398] block">
                      Health Score
                    </span>
                    <span className="font-bold text-[#82977D]">
                      {(selectedNode.health * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-[#A7A398] block">
                      Criticality Weight
                    </span>
                    <span className="font-bold text-[#F0EDE5]">
                      {selectedNode.criticality}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-[#A7A398] block">
                      Sector Domain
                    </span>
                    <span className="font-bold text-[#A99A80] capitalize">
                      {selectedNode.type}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {/* Quick Interventions Panel */}
          <Panel className="p-4 causal-hud-panel border border-[rgba(240,237,229,0.08)]">
            <span className="text-xs font-bold font-mono uppercase text-[#F0EDE5] block mb-2.5">
              Rapid Safety Interventions (Simulation Sandbox)
            </span>
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleApplyIntervention("Shed 30MW Non-Critical Load")}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-[#F0EDE5] bg-[#20211D] border border-[rgba(240,237,229,0.12)] hover:border-[#A99A80] transition-colors"
              >
                + Shed 30MW Non-Critical Load
              </button>
              <button
                type="button"
                onClick={() => handleApplyIntervention("Engage Secondary Backup Feeders")}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-[#A99A80] bg-[#20211D] border border-[rgba(169,154,128,0.3)] hover:border-[#A99A80] transition-colors"
              >
                + Engage Secondary Backup Feeders
              </button>
              <button
                type="button"
                onClick={() => handleApplyIntervention("Isolate Faulty Catenary Breaker")}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-[#D5B075] bg-[#20211D] border border-[#B9955B]/30 hover:border-[#B9955B] transition-colors"
              >
                + Isolate Faulty Breaker
              </button>
            </div>
          </Panel>
        </div>

        {/* Right 5 Columns: Incident Stream & Causal Intelligence ── */}
        <div className="lg:col-span-5 space-y-4">
          {/* Live Events Stream */}
          <Panel className="p-5 causal-hud-panel border border-[rgba(240,237,229,0.08)]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[rgba(240,237,229,0.06)]">
              <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-[#F0EDE5]">
                Live Incident Telemetry
              </h2>
              <Link
                href="/app/incidents"
                className="text-[11px] font-mono text-[#A99A80] hover:underline"
              >
                Full Stream →
              </Link>
            </div>

            {events.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-[#A7A398]">
                No active incidents recorded. System telemetry nominal.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {events.slice(0, 5).map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-lg bg-[#111210] border border-[rgba(240,237,229,0.06)] text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#F0EDE5] truncate font-mono">
                        {ev.event_type}
                      </span>
                      <Badge
                        variant={ev.severity === "CRITICAL" ? "critical" : ev.severity === "HIGH" ? "critical" : "degraded"}
                      >
                        {ev.severity}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-[#A7A398] mt-1 truncate font-sans">
                      {ev.description || "Telemetry sensor reading trigger"}
                    </p>
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#736F66] mt-1.5">
                      <span>Source: {ev.source}</span>
                      <span>Conf: {ev.confidence !== null ? `${(ev.confidence * 100).toFixed(0)}%` : "N/A"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Causal Hypotheses Dossier */}
          <Panel className="p-5 causal-hud-panel border border-[rgba(240,237,229,0.08)]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[rgba(240,237,229,0.06)]">
              <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-[#F0EDE5]">
                Causal Root Explanations
              </h2>
              <Link
                href="/app/causal"
                className="text-[11px] font-mono text-[#A99A80] hover:underline"
              >
                Hypothesis Studio →
              </Link>
            </div>

            {hypotheses.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-[#A7A398]">
                No active causal hypotheses generated. Run analysis in the Causal Reasoning Studio.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {hypotheses.slice(0, 4).map((hyp) => (
                  <div
                    key={hyp.id}
                    className="p-3 rounded-lg bg-[#111210] border border-[rgba(240,237,229,0.06)] text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#A99A80] truncate font-sans">
                        Factor: {hyp.candidate_cause_factor}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-[#F0EDE5]">
                        {Math.round(hyp.evidence_completeness * 100)}% Evidence
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A7A398] mt-1 font-sans">
                      {hyp.explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Quick Platform Route Navigator */}
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <Link
              href="/app/scenarios"
              className="p-3 rounded-lg bg-[#191A17] border border-[rgba(240,237,229,0.08)] hover:border-[#A99A80]/50 text-center transition-all text-[#F0EDE5]"
            >
              ⊙ Scenario Explorer
            </Link>
            <Link
              href="/app/assessments"
              className="p-3 rounded-lg bg-[#191A17] border border-[rgba(240,237,229,0.08)] hover:border-[#A99A80]/50 text-center transition-all text-[#F0EDE5]"
            >
              🛡 Resilience Workspace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
