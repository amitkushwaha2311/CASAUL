"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { NetworkNodeData, NetworkEdgeData } from "./dimensional-network-canvas";

const DimensionalNetworkCanvas = dynamic(
  () =>
    import("./dimensional-network-canvas").then((mod) => mod.DimensionalNetworkCanvas),
  { ssr: false }
);

interface NodeState extends NetworkNodeData {
  x: number;
  y: number;
}

const INITIAL_NODES: NodeState[] = [
  {
    id: "node-power",
    name: "Substation Alpha (500kV)",
    code: "PWR-500",
    domain: "power",
    domainLabel: "Energy Grid",
    pos3d: [-3.8, 0.4, 0.2],
    x: 16,
    y: 45,
    status: "NORMAL",
    metric: "100% Bus Voltage · 50.0 Hz",
    description: "Primary regional transmission substation supplying municipal utilities",
  },
  {
    id: "node-pump",
    name: "Aqueduct Pump Station 4",
    code: "WTR-P04",
    domain: "water",
    domainLabel: "Water Distribution",
    pos3d: [-0.8, 1.8, -0.6],
    x: 48,
    y: 22,
    status: "NORMAL",
    metric: "98.4 bar · Nominal Intake",
    description: "High-volume raw water intake pump for metropolitan aqueduct network",
  },
  {
    id: "node-transit",
    name: "Metro Traction Feeder",
    code: "TRN-FED",
    domain: "transport",
    domainLabel: "Cyber-Physical Transit",
    pos3d: [-0.6, -1.8, 0.8],
    x: 46,
    y: 74,
    status: "NORMAL",
    metric: "1500V DC · Full Schedule",
    description: "Catenary traction substation powering rapid transit lines A & C",
  },
  {
    id: "node-treatment",
    name: "Treatment Plant 02",
    code: "WTR-T02",
    domain: "water",
    domainLabel: "Water Purification",
    pos3d: [3.2, 1.2, -0.2],
    x: 82,
    y: 26,
    status: "NORMAL",
    metric: "450 ML/d · Continuous Output",
    description: "Potable drinking water treatment facility dependent on continuous intake",
  },
  {
    id: "node-scada",
    name: "SCADA Telemetry Hub",
    code: "CYB-SCD",
    domain: "cyber",
    domainLabel: "Cyber Operations",
    pos3d: [3.0, -1.4, 0.6],
    x: 80,
    y: 70,
    status: "NORMAL",
    metric: "12ms Latency · Synchronized",
    description: "Telemetry aggregator monitoring pressure sensors and breaker relays",
  },
];

const EDGES: NetworkEdgeData[] = [
  {
    from: "node-power",
    to: "node-pump",
    label: "Feeder 4A (450ms)",
    delayMs: 600,
    flowType: "high_voltage",
  },
  {
    from: "node-power",
    to: "node-transit",
    label: "Grid Traction Tie (800ms)",
    delayMs: 1200,
    flowType: "traction",
  },
  {
    from: "node-pump",
    to: "node-treatment",
    label: "Hydraulic Inflow (1.4s)",
    delayMs: 2000,
    flowType: "hydraulic",
  },
  {
    from: "node-power",
    to: "node-scada",
    label: "Telemetry Power Bus",
    delayMs: 400,
    flowType: "telemetry",
  },
];

const CASCADE_STEPS = [
  { phase: 1, title: "Substation Alpha Trip", latency: "T+0ms", target: "PWR-500", note: "Loss of primary bus bar" },
  { phase: 2, title: "Pump 4 Starvation", latency: "T+850ms", target: "WTR-P04", note: "Hydraulic pressure loss" },
  { phase: 3, title: "Traction Derating", latency: "T+1600ms", target: "TRN-FED", note: "Emergency slow order" },
  { phase: 4, title: "Treatment Plant Depletion", latency: "T+2400ms", target: "WTR-T02", note: "Reservoirs emptying" },
];

export function CascadeHeroVisualization() {
  const [nodes, setNodes] = useState<NodeState[]>(INITIAL_NODES);
  const [isCascading, setIsCascading] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedNode, setSelectedNode] = useState<NodeState>(INITIAL_NODES[0]);
  const [isPaused, setIsPaused] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    setIsClient(true);
    return () => clearTimers();
  }, [clearTimers]);

  const triggerCascade = () => {
    clearTimers();
    setIsCascading(true);
    setStep(1);

    // Step 1: Root power substation trips (Immediate)
    setNodes((prev) =>
      prev.map((n) =>
        n.id === "node-power"
          ? {
              ...n,
              status: "FAILED",
              metric: "0.0 kV · BREAKER TRIPPED",
            }
          : { ...n, status: "NORMAL" }
      )
    );

    // Step 2: Aqueduct pump loses primary feeder (850ms)
    const t1 = setTimeout(() => {
      setStep(2);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === "node-pump"
            ? {
                ...n,
                status: "DEGRADED",
                metric: "Pressure Drop 42 bar (-57%)",
              }
            : n
        )
      );
    }, 850);
    timersRef.current.push(t1);

    // Step 3: Transit feeder degradation (1600ms)
    const t2 = setTimeout(() => {
      setStep(3);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === "node-transit"
            ? {
                ...n,
                status: "DEGRADED",
                metric: "Emergency Slow Order · 600V",
              }
            : n
        )
      );
    }, 1600);
    timersRef.current.push(t2);

    // Step 4: Water Treatment plant critical starvation (2400ms)
    const t3 = setTimeout(() => {
      setStep(4);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === "node-treatment"
            ? {
                ...n,
                status: "CRITICAL",
                metric: "STARVED INFLOW · Reservoirs Emptying",
              }
            : n
        )
      );
    }, 2400);
    timersRef.current.push(t3);
  };

  const resetSystem = () => {
    clearTimers();
    setIsCascading(false);
    setStep(0);
    setNodes(INITIAL_NODES);
    setSelectedNode(INITIAL_NODES[0]);
  };

  const getStatusColor = (status: NodeState["status"]) => {
    switch (status) {
      case "FAILED":
      case "CRITICAL":
        return "#9B4540"; // Oxide Red
      case "DEGRADED":
        return "#B9955B"; // Restrained Amber
      case "NORMAL":
      default:
        return "#82977D"; // Muted Sage
    }
  };

  const getStatusBg = (status: NodeState["status"]) => {
    switch (status) {
      case "FAILED":
      case "CRITICAL":
        return "rgba(155, 69, 64, 0.16)";
      case "DEGRADED":
        return "rgba(185, 149, 91, 0.16)";
      case "NORMAL":
      default:
        return "rgba(130, 151, 125, 0.14)";
    }
  };

  const activeSelected = nodes.find((n) => n.id === selectedNode.id) || selectedNode;

  return (
    <div className="relative w-full" id="dependency-visualization">
      {/* Precision Datum Classification Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 pb-2 border-b border-[rgba(240,237,229,0.08)] text-[11px] font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[#F0EDE5]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#82977D] animate-pulse" />
            <span className="uppercase tracking-wider font-semibold">
              Digital Twin Graph Demonstration · Directional Causal Dependencies
            </span>
          </span>
          <span className="text-[#736F66] hidden md:inline">/</span>
          <span className="text-[#A7A398] hidden md:inline">
            COORDINATES: LAT 37.77° N · LON 122.41° W
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded bg-[rgba(169,154,128,0.14)] text-[#A99A80] border border-[rgba(169,154,128,0.25)] font-mono text-[10px] tracking-wide font-semibold">
            ILLUSTRATIVE SIMULATION
          </span>
          <span className="text-[#736F66] text-[10px] hidden sm:inline">
            PROVENANCE: IEEE 118-BUS ADAPTATION
          </span>
        </div>
      </div>

      {/* Main Spatial Stage Container */}
      <div className="relative rounded-2xl border border-[rgba(240,237,229,0.12)] bg-[#111210] overflow-hidden shadow-2xl">
        {/* Subtle architectural datum corner crosshairs */}
        <div className="absolute top-3 left-3 z-30 font-mono text-[10px] text-[#736F66] select-none pointer-events-none">
          + REGION-01 // SECTOR-A
        </div>
        <div className="absolute top-3 right-3 z-30 font-mono text-[10px] text-[#736F66] select-none pointer-events-none">
          + 5 ASSETS // 4 CONDUITS
        </div>

        {/* Real 3D WebGL Dimensional Interactive Network */}
        <div className="relative w-full h-[480px] sm:h-[560px]">
          {/* Active Simulation Step Indicator Pill */}
          {isCascading && (
            <div className="absolute top-10 left-4 sm:left-6 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#201515]/95 backdrop-blur-md border border-[#9B4540]/70 text-[#F0EDE5] text-[11px] font-mono shadow-2xl">
              <span className="w-2 h-2 rounded-full bg-[#9B4540] animate-pulse" />
              <span>
                CASCADE ACTIVE · PHASE {step}/4 · PROPAGATING AT 3.2 HOPS/S
              </span>
            </div>
          )}

          {/* Perspective Navigation Hint */}
          <div className="absolute bottom-16 right-4 sm:right-6 z-30 hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#191A17]/90 backdrop-blur-md border border-[rgba(240,237,229,0.08)] text-[11px] font-mono text-[#A7A398]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80]" />
            <span>Interactive 3D Network · Hover / Drag to Orbit</span>
          </div>

          {/* 3D Canvas */}
          {isClient && (
            <DimensionalNetworkCanvas
              nodes={nodes}
              edges={EDGES}
              selectedNodeId={selectedNode.id}
              onSelectNode={(nodeId) => {
                const found = nodes.find((n) => n.id === nodeId);
                if (found) setSelectedNode(found);
              }}
              isCascading={isCascading}
              step={step}
              isPaused={isPaused}
            />
          )}

          {/* Accessible DOM Nodes Fallback (For Screen Readers & Headless Test Environments) */}
          <div className="sr-only" aria-hidden="false">
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                aria-label={`Node ${node.name}, status ${node.status}`}
                onClick={() => setSelectedNode(node)}
              >
                {node.name}
              </button>
            ))}
          </div>
        </div>

        {/* Integrated Floating Control Deck & Telemetry Inspector */}
        <div className="border-t border-[rgba(240,237,229,0.10)] bg-[#191A17]/95 backdrop-blur-xl p-4 sm:p-5">
          {/* Timeline Step Progression Strip */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#A99A80] font-semibold">
                Propagation Timeline & Blast Wavefront
              </span>
              <span className="text-[11px] font-mono text-[#736F66]">
                {isCascading ? `Phase ${step} of 4 Active` : "Nominal Telemetry Steady"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CASCADE_STEPS.map((s) => {
                const isPast = step >= s.phase;
                const isCurrent = step === s.phase;
                return (
                  <div
                    key={s.phase}
                    className={`p-2.5 rounded-lg border transition-all text-[11px] font-mono ${
                      isCurrent
                        ? "bg-[#201515] border-[#9B4540] text-[#F0EDE5] shadow-[0_0_15px_rgba(155,69,64,0.2)]"
                        : isPast
                        ? "bg-[#191A17] border-[#9B4540]/40 text-[#A7A398]"
                        : "bg-[#141512] border-[rgba(240,237,229,0.06)] text-[#736F66]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-[10px]">Phase {s.phase}/4</span>
                      <span className="text-[9px] opacity-75">{s.latency}</span>
                    </div>
                    <div className="font-semibold truncate text-[#F0EDE5]">{s.title}</div>
                    <div className="text-[10px] text-[#A7A398] truncate">{s.note}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons & Inspector Summary */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pt-3 border-t border-[rgba(240,237,229,0.08)]">
            {/* Simulation Triggers */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {!isCascading ? (
                <button
                  type="button"
                  onClick={triggerCascade}
                  className="px-4 py-2 rounded-lg text-xs font-mono font-semibold text-white bg-[#9B4540] hover:bg-[#863732] transition-colors flex items-center gap-2 cursor-pointer shadow-sm hover:shadow-[0_0_18px_rgba(155,69,64,0.35)]"
                  id="btn-simulate-cascade"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  Simulate Substation Alpha Trip
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resetSystem}
                  className="px-4 py-2 rounded-lg text-xs font-mono font-semibold text-[#111210] bg-[#F0EDE5] hover:bg-white transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
                  id="btn-reset-simulation"
                >
                  Reset System State
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsPaused(!isPaused)}
                className="px-3 py-2 rounded-lg text-xs font-mono text-[#A7A398] border border-[rgba(240,237,229,0.12)] hover:border-[rgba(240,237,229,0.25)] hover:text-[#F0EDE5] transition-colors cursor-pointer"
              >
                {isPaused ? "▶ Resume" : "⏸ Pause"}
              </button>
            </div>

            {/* Selected Node Real-Time Telemetry Readout */}
            <div className="flex items-center gap-4 flex-wrap text-xs font-mono bg-[#111210] px-4 py-2.5 rounded-xl border border-[rgba(240,237,229,0.08)]">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse"
                  style={{ backgroundColor: getStatusColor(activeSelected.status) }}
                />
                <span className="font-semibold text-[#F0EDE5]">
                  {activeSelected.name}
                </span>
                <span className="text-[#736F66]">[{activeSelected.code}]</span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold"
                  style={{
                    backgroundColor: getStatusBg(activeSelected.status),
                    color: getStatusColor(activeSelected.status),
                  }}
                >
                  {activeSelected.status}
                </span>
              </div>

              <div className="h-3 w-px bg-[rgba(240,237,229,0.12)] hidden sm:block" />

              <div>
                <span className="text-[#736F66] mr-1.5">Telemetry:</span>
                <span
                  className="font-bold text-xs"
                  style={{ color: getStatusColor(activeSelected.status) }}
                >
                  {activeSelected.metric}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CascadeHeroVisualization;
