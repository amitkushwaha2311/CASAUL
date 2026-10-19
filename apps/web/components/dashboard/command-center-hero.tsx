"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ShieldAlert,
  GitBranch,
  Activity,
  ArrowUpRight,
  Database,
  Scale,
  Sparkles,
  Layers,
  Radio,
} from "lucide-react";

export interface CommandCenterHeroProps {
  graphsCount: number;
  totalNodes: number;
  normalNodes: number;
  degradedNodes: number;
  criticalNodes: number;
  activeIncidentsCount: number;
  hypothesesCount: number;
  supportedHypothesesCount: number;
  avgHealthPercent: string;
  latestTelemetryTime?: string | null;
  databaseStatus?: string;
  causalEngineActive?: boolean;
}

export function CommandCenterHero({
  graphsCount,
  totalNodes,
  normalNodes,
  degradedNodes,
  criticalNodes,
  activeIncidentsCount,
  hypothesesCount,
  supportedHypothesesCount,
  avgHealthPercent,
  latestTelemetryTime,
  databaseStatus = "connected",
  causalEngineActive = true,
}: CommandCenterHeroProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Network topology nodes for the infrastructure dependency canvas
  const topologyNodes = [
    { id: "PWR-500", label: "Substation Alpha", domain: "Power", x: 85, y: 45, status: criticalNodes > 0 ? "critical" : "normal" },
    { id: "WTR-P04", label: "Aqueduct Intake", domain: "Water", x: 230, y: 35, status: degradedNodes > 0 ? "degraded" : "normal" },
    { id: "XFR-T01", label: "Transformer T-1", domain: "Power", x: 170, y: 95, status: "normal" },
    { id: "TRN-FED", label: "Traction Feeder", domain: "Transit", x: 330, y: 75, status: "normal" },
    { id: "WTR-T02", label: "Treatment Plant", domain: "Water", x: 430, y: 45, status: "normal" },
    { id: "BUS-SEC", label: "Secondary Bus", domain: "Grid", x: 290, y: 135, status: "normal" },
  ];

  const topologyEdges = [
    { from: "PWR-500", to: "XFR-T01", flow: true },
    { from: "XFR-T01", to: "WTR-P04", flow: true },
    { from: "XFR-T01", to: "BUS-SEC", flow: true },
    { from: "BUS-SEC", to: "TRN-FED", flow: true },
    { from: "WTR-P04", to: "WTR-T02", flow: true },
  ];

  return (
    <div className="relative w-full rounded-2xl md:rounded-3xl overflow-hidden border border-[rgba(240,237,229,0.12)] bg-[#191A17] shadow-2xl">
      {/* ── Background Architectural Infrastructure Grid & Radial Glow ── */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(240,237,229,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(240,237,229,0.04) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute -top-32 -left-32 w-96 h-96 bg-[radial-gradient(circle,rgba(169,154,128,0.12)_0%,transparent_70%)] pointer-events-none blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -right-32 w-96 h-96 bg-[radial-gradient(circle,rgba(130,151,125,0.08)_0%,transparent_70%)] pointer-events-none blur-3xl"
      />

      {/* ── Main Hero Content Structure ── */}
      <div className="relative z-10 p-6 sm:p-8 lg:p-9 space-y-6">
        {/* Top Header & Interactive Network Visualization Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left Column: Heading, Domain Mission & Primary Actions */}
          <div className="lg:col-span-7 space-y-3.5">
            {/* Status Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(240,237,229,0.06)] backdrop-blur-md border border-[rgba(240,237,229,0.14)] text-[#A99A80] text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-[#82977D] animate-pulse" />
              <span className="font-semibold tracking-wide">CAUSAL</span>
              <span className="text-[#736F66]">·</span>
              <span className="text-[#F0EDE5]">Resilience Engine Live</span>
              {causalEngineActive && (
                <>
                  <span className="text-[#736F66]">·</span>
                  <span className="text-[10px] text-[#82977D] uppercase">Attribution Active</span>
                </>
              )}
            </div>

            {/* Exact Required Title */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-[-0.03em] font-sans text-[#F0EDE5] leading-tight">
              Infrastructure Resilience Command Center
            </h1>

            {/* Exact Required Supporting Text */}
            <p className="text-xs sm:text-sm text-[#A7A398] leading-relaxed font-sans max-w-xl">
              Understand system dependencies, investigate cascading failures, test counterfactual scenarios, and identify safety-constrained interventions from auditable evidence.
            </p>

            {/* Operational Deep-Link Action Strip */}
            <div className="flex items-center gap-2.5 pt-2 flex-wrap text-xs font-mono">
              <Link
                href="/app/state"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#20211D] hover:bg-[#282924] border border-[rgba(240,237,229,0.12)] hover:border-[#A99A80]/40 text-[#F0EDE5] transition-all group text-decoration-none shadow-sm"
              >
                <Layers className="w-3.5 h-3.5 text-[#A99A80]" />
                <span>Digital Twin Explorer</span>
                <ArrowUpRight className="w-3 h-3 text-[#736F66] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>

              <Link
                href="/app/incidents"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#20211D] hover:bg-[#282924] border border-[rgba(240,237,229,0.12)] hover:border-[#A99A80]/40 text-[#F0EDE5] transition-all group text-decoration-none shadow-sm"
              >
                <Activity className="w-3.5 h-3.5 text-[#82977D]" />
                <span>Incident Stream</span>
                {activeIncidentsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#9B4540]/20 text-[#9B4540] border border-[#9B4540]/30 font-bold">
                    {activeIncidentsCount}
                  </span>
                )}
              </Link>

              <Link
                href="/app/simulation"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#20211D] hover:bg-[#282924] border border-[rgba(240,237,229,0.12)] hover:border-[#A99A80]/40 text-[#A7A398] hover:text-[#F0EDE5] transition-all group text-decoration-none shadow-sm"
              >
                <GitBranch className="w-3.5 h-3.5 text-[#B9955B]" />
                <span>Cascade Simulation</span>
              </Link>

              <Link
                href="/app/recommendations"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#20211D] hover:bg-[#282924] border border-[rgba(240,237,229,0.12)] hover:border-[#A99A80]/40 text-[#A7A398] hover:text-[#F0EDE5] transition-all group text-decoration-none shadow-sm"
              >
                <Scale className="w-3.5 h-3.5 text-[#A99A80]" />
                <span>Interventions</span>
              </Link>
            </div>
          </div>

          {/* Right Column: Genuine Infrastructure Network Dependency Visualization */}
          <div className="lg:col-span-5 relative w-full h-[180px] sm:h-[190px] rounded-xl bg-[#111210]/90 border border-[rgba(240,237,229,0.10)] overflow-hidden p-2 select-none">
            <div className="absolute top-2 left-3 z-10 flex items-center gap-1.5 text-[10px] font-mono text-[#736F66] uppercase tracking-wider">
              <Radio className="w-3 h-3 text-[#82977D] animate-pulse" />
              <span>Multi-Domain Dependency Graph</span>
            </div>

            {/* SVG Interactive Topology Visualization */}
            <svg
              className="w-full h-full"
              viewBox="0 0 500 170"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="edge-flow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#A99A80" stopOpacity="0.2" />
                  <stop offset="50%" stopColor="#A99A80" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#82977D" stopOpacity="0.4" />
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Dependency Edges with Flow Direction */}
              {topologyEdges.map((edge, idx) => {
                const source = topologyNodes.find((n) => n.id === edge.from)!;
                const target = topologyNodes.find((n) => n.id === edge.to)!;
                return (
                  <g key={`edge-${idx}`}>
                    <line
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="rgba(240,237,229,0.12)"
                      strokeWidth="1.5"
                    />
                    <line
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="url(#edge-flow)"
                      strokeWidth="1.5"
                      strokeDasharray="6 14"
                      className="animate-[dash_8s_linear_infinite]"
                    />
                  </g>
                );
              })}

              {/* Infrastructure Nodes */}
              {topologyNodes.map((node) => {
                const isSelected = selectedNode === node.id;
                const color =
                  node.status === "critical"
                    ? "#9B4540"
                    : node.status === "degraded"
                    ? "#B9955B"
                    : "#82977D";

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer transition-transform hover:scale-110"
                    onClick={() => setSelectedNode(isSelected ? null : node.id)}
                  >
                    {/* Outer state halo */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isSelected ? 13 : 9}
                      fill={color}
                      fillOpacity="0.18"
                      stroke={color}
                      strokeWidth="1.5"
                      strokeOpacity="0.6"
                      filter="url(#glow)"
                    />
                    {/* Center Core */}
                    <circle cx={node.x} cy={node.y} r="3.5" fill={color} />

                    {/* Node Identifier Code */}
                    <text
                      x={node.x}
                      y={node.y - 12}
                      textAnchor="middle"
                      fill="#F0EDE5"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="600"
                    >
                      {node.id}
                    </text>

                    {/* Domain sub-label */}
                    <text
                      x={node.x}
                      y={node.y + 17}
                      textAnchor="middle"
                      fill="#736F66"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      {node.domain}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend / Selected Node Inspection Toast */}
            <div className="absolute bottom-2 right-3 z-10 flex items-center gap-2 text-[9px] font-mono text-[#A7A398] bg-[#191A17]/90 px-2 py-0.5 rounded border border-[rgba(240,237,229,0.08)]">
              {selectedNode ? (
                <span className="text-[#F0EDE5]">Selected: {selectedNode} · Active</span>
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#82977D]" /> Nominal
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B9955B]" /> Degraded
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#9B4540]" /> Anomaly
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Compact Operational Overview Metrics Strip (Real CAUSAL Data) ── */}
        <div className="pt-4 border-t border-[rgba(240,237,229,0.08)] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
          {/* 1. Infrastructure Graphs */}
          <div className="p-2.5 rounded-lg bg-[#20211D]/80 border border-[rgba(240,237,229,0.08)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[#736F66] tracking-wider">Models</span>
            <div className="text-sm font-bold text-[#F0EDE5] my-0.5">{graphsCount} Active</div>
            <span className="text-[10px] text-[#A7A398]">Operational Grids</span>
          </div>

          {/* 2. Nodes & State Breakdown */}
          <div className="p-2.5 rounded-lg bg-[#20211D]/80 border border-[rgba(240,237,229,0.08)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[#736F66] tracking-wider">Topology</span>
            <div className="text-sm font-bold text-[#A99A80] my-0.5">{totalNodes} Elements</div>
            <span className="text-[10px] text-[#82977D]">{normalNodes} Normal</span>
          </div>

          {/* 3. Operational State Distribution */}
          <div className="p-2.5 rounded-lg bg-[#20211D]/80 border border-[rgba(240,237,229,0.08)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[#736F66] tracking-wider">Health Index</span>
            <div className="text-sm font-bold text-[#82977D] my-0.5">{avgHealthPercent} Rating</div>
            <span className="text-[10px] text-[#A7A398]">
              {degradedNodes > 0 || criticalNodes > 0
                ? `${degradedNodes + criticalNodes} Anomalies`
                : "Nominal State"}
            </span>
          </div>

          {/* 4. Active Incidents */}
          <div className="p-2.5 rounded-lg bg-[#20211D]/80 border border-[rgba(240,237,229,0.08)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[#736F66] tracking-wider">Incidents</span>
            <div className={`text-sm font-bold my-0.5 ${activeIncidentsCount > 0 ? "text-[#9B4540]" : "text-[#F0EDE5]"}`}>
              {activeIncidentsCount} Open
            </div>
            <span className="text-[10px] text-[#A7A398]">Telemetry Feed</span>
          </div>

          {/* 5. Causal Hypotheses */}
          <div className="p-2.5 rounded-lg bg-[#20211D]/80 border border-[rgba(240,237,229,0.08)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[#736F66] tracking-wider">Attribution</span>
            <div className="text-sm font-bold text-[#F0EDE5] my-0.5">{hypothesesCount} Cases</div>
            <span className="text-[10px] text-[#A99A80]">{supportedHypothesesCount} Supported</span>
          </div>

          {/* 6. Telemetry & Evidence Freshness */}
          <div className="p-2.5 rounded-lg bg-[#20211D]/80 border border-[rgba(240,237,229,0.08)] flex flex-col justify-between">
            <span className="text-[10px] uppercase text-[#736F66] tracking-wider">Freshness</span>
            <div className="text-xs font-semibold text-[#F0EDE5] my-0.5 truncate">
              {latestTelemetryTime || "Nominal"}
            </div>
            <span className="text-[10px] text-[#82977D] flex items-center gap-1">
              <Database className="w-2.5 h-2.5" />
              <span>DB {databaseStatus}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
export default CommandCenterHero;
