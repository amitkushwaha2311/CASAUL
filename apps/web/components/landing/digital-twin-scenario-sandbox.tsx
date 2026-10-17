"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { MotionReveal } from "@/components/ui/motion-reveal";

interface OverrideOption {
  id: string;
  label: string;
  targetNode: string;
  delta: string;
  active: boolean;
}

const DEFAULT_OVERRIDES: OverrideOption[] = [
  {
    id: "ov-generator",
    label: "Engage Aux Diesel Generator (4MW)",
    targetNode: "Aqueduct Pump Station 4",
    delta: "feeder_status: PRIMARY_LOSS -> AUX_GENERATOR_ACTIVE (T+120ms)",
    active: true,
  },
  {
    id: "ov-valve",
    label: "Throttled Cross-Tie Valve V-12",
    targetNode: "Water Distribution Main",
    delta: "valve_position: 100% -> 35% THROTTLED",
    active: true,
  },
  {
    id: "ov-shed",
    label: "Load-Shed Metro Ancillary Traction",
    targetNode: "Metro Traction Feeder",
    delta: "traction_draw: 100% -> 60% ESSENTIAL_ONLY",
    active: false,
  },
];

export function DigitalTwinScenarioSandbox() {
  const [overrides, setOverrides] = useState<OverrideOption[]>(DEFAULT_OVERRIDES);

  const toggleOverride = (id: string) => {
    setOverrides((prev) =>
      prev.map((o) => (o.id === id ? { ...o, active: !o.active } : o))
    );
  };

  const activeCount = overrides.filter((o) => o.active).length;
  const resultingDegradation =
    activeCount === 3 ? 8 : activeCount === 2 ? 14 : activeCount === 1 ? 42 : 78;
  const nodesImpacted =
    activeCount === 3 ? 1 : activeCount === 2 ? 2 : activeCount === 1 ? 4 : 6;

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-12 max-w-[1520px] mx-auto" id="scenarios">
      {/* Section Header */}
      <MotionReveal direction="up" className="max-w-3xl mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-[rgba(240,237,229,0.12)] bg-[#191A17] text-xs font-mono text-[#A99A80] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80] animate-pulse" />
          PHASE 4 · DIGITAL TWIN &amp; SCENARIO SANDBOXING
        </div>
        <h2 className="text-3xl sm:text-5xl font-light tracking-tight text-[#F0EDE5] mb-4">
          <span className="font-sans font-bold uppercase block">
            Counterfactual What-If
          </span>
          <span className="font-serif italic text-[#A7A398] block mt-1">
            Sandboxes.
          </span>
        </h2>
        <p className="text-base text-[#A7A398] leading-relaxed font-sans">
          Test operational interventions and contingency plans safely in memory. Isolated state overrides decouple counterfactual exploration from immutable live telemetry.
        </p>
      </MotionReveal>

      {/* Main Comparison Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Column: Live Immutable Baseline */}
        <MotionReveal direction="right" delay={0.05} className="lg:col-span-5 flex flex-col">
          <div className="p-6 sm:p-8 rounded-xl border border-[rgba(240,237,229,0.10)] bg-[#191A17] flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[rgba(240,237,229,0.08)]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#82977D]" />
                  <span className="text-xs font-mono font-bold tracking-wider text-[#F0EDE5] uppercase">
                    Live Operational Baseline
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-[rgba(130,151,125,0.14)] text-[#82977D] border border-[rgba(130,151,125,0.28)] font-semibold">
                  READ ONLY · IMMUTABLE
                </span>
              </div>

              <p className="text-xs text-[#A7A398] mb-6 font-sans">
                Reflects verified physical hardware status, active telemetry streams, and synchronized sensor baselines.
              </p>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="p-3 rounded-lg bg-[#111210] border border-[rgba(240,237,229,0.06)] flex justify-between items-center">
                  <span className="text-[#A7A398]">Substation Alpha Bus</span>
                  <span className="text-[#F0EDE5] font-bold">500 kV · NOMINAL</span>
                </div>
                <div className="p-3 rounded-lg bg-[#111210] border border-[rgba(240,237,229,0.06)] flex justify-between items-center">
                  <span className="text-[#A7A398]">Aqueduct Intake Pressure</span>
                  <span className="text-[#F0EDE5] font-bold">98.4 bar</span>
                </div>
                <div className="p-3 rounded-lg bg-[#111210] border border-[rgba(240,237,229,0.06)] flex justify-between items-center">
                  <span className="text-[#A7A398]">Metro Traction Voltage</span>
                  <span className="text-[#F0EDE5] font-bold">1500V DC</span>
                </div>
                <div className="p-3 rounded-lg bg-[#111210] border border-[rgba(240,237,229,0.06)] flex justify-between items-center">
                  <span className="text-[#A7A398]">Treatment Flow Rate</span>
                  <span className="text-[#F0EDE5] font-bold">450 ML/day</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-[rgba(240,237,229,0.08)] text-[11px] font-mono text-[#A7A398] flex items-center justify-between">
              <span>Ground Truth Sync: Synchronized</span>
              <span className="text-[#A99A80]">SHA-256 Verified</span>
            </div>
          </div>
        </MotionReveal>

        {/* Right Column: Interactive Sandbox Overrides */}
        <MotionReveal direction="left" delay={0.1} className="lg:col-span-7 flex flex-col">
          <div className="p-6 sm:p-8 rounded-xl border border-[rgba(169,154,128,0.25)] bg-[#191A17] flex-1 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[rgba(240,237,229,0.08)]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#A99A80] animate-pulse" />
                  <span className="text-xs font-mono font-bold tracking-wider text-[#F0EDE5] uppercase">
                    Simulated Sandbox State
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-[rgba(169,154,128,0.15)] text-[#A99A80] border border-[rgba(169,154,128,0.3)] font-semibold">
                  ISOLATED · {activeCount} OVERRIDES STAGED
                </span>
              </div>

              <p className="text-xs text-[#A7A398] mb-6 font-sans">
                Toggle hypothetical interventions to recalculate downstream propagation risk without modifying production hardware.
              </p>

              {/* Overrides List */}
              <div className="space-y-3 mb-6">
                {overrides.map((ov) => (
                  <div
                    key={ov.id}
                    onClick={() => toggleOverride(ov.id)}
                    className={`p-3.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      ov.active
                        ? "border-[#A99A80]/40 bg-[#20211D] text-[#F0EDE5]"
                        : "border-[rgba(240,237,229,0.08)] bg-[#111210] text-[#A7A398] hover:border-[rgba(240,237,229,0.18)]"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] font-bold ${
                          ov.active ? "border-[#A99A80] bg-[#A99A80] text-[#111210]" : "border-[#736F66]"
                        }`}>
                          {ov.active ? "✓" : ""}
                        </span>
                        <span className="text-xs font-mono font-semibold">{ov.label}</span>
                      </div>
                      <div className="text-[10px] font-mono text-[#A7A398] pl-5">
                        Target: {ov.targetNode} · {ov.delta}
                      </div>
                    </div>
                    <motion.span
                      key={ov.active ? "staged" : "bypassed"}
                      initial={{ scale: 0.9, opacity: 0.8 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        ov.active ? "bg-[rgba(169,154,128,0.2)] text-[#F0EDE5]" : "bg-[rgba(240,237,229,0.05)] text-[#736F66]"
                      }`}
                    >
                      {ov.active ? "STAGED" : "BYPASSED"}
                    </motion.span>
                  </div>
                ))}
              </div>

              {/* Differential Outcome Readout */}
              <div className="p-4 rounded-lg border border-[rgba(240,237,229,0.08)] bg-[#111210] grid grid-cols-2 gap-4 font-mono">
                <div>
                  <span className="text-[10px] uppercase text-[#A7A398] block mb-0.5">
                    Mitigated Blast Radius Calculation
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${
                      resultingDegradation < 20 ? "text-[#82977D]" : "text-[#B9955B]"
                    }`}>
                      {resultingDegradation}%
                    </span>
                    <span className="text-[10px] text-[#A99A80]">
                      (-{78 - resultingDegradation}% reduction)
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-[#A7A398] block mb-0.5">
                    Impacted Sectors
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-[#F0EDE5]">
                      {nodesImpacted}
                    </span>
                    <span className="text-[10px] text-[#A7A398]">of 8 critical</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-[rgba(240,237,229,0.08)] flex items-center justify-between flex-wrap gap-3">
              <span className="text-xs font-mono text-[#A7A398]">
                Non-destructive in-memory evaluation
              </span>
              <Link
                href="/app/scenarios"
                className="px-4 py-2 rounded-lg text-xs font-mono font-semibold text-[#111210] bg-[#F0EDE5] hover:bg-white transition-colors"
              >
                Open Scenarios Console →
              </Link>
            </div>
          </div>
        </MotionReveal>
      </div>
    </section>
  );
}

export default DigitalTwinScenarioSandbox;
