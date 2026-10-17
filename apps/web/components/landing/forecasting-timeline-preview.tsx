"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { MotionReveal } from "@/components/ui/motion-reveal";
import {
  staggerContainer,
  staggerItem,
  DURATION,
  EASE_DEFAULT,
} from "@/lib/motion-config";

interface ForecastStep {
  horizon: string;
  timeLabel: string;
  predictedImpactPct: number;
  confidenceLower: number;
  confidenceUpper: number;
  impactedNodesCount: number;
  summary: string;
  primaryRisk: string;
  status: "NOMINAL" | "STRAIN" | "CRITICAL" | "CATASTROPHIC";
}

const FORECAST_STEPS: ForecastStep[] = [
  {
    horizon: "T+0m",
    timeLabel: "Incident Genesis (00:00:00)",
    predictedImpactPct: 15,
    confidenceLower: 12,
    confidenceUpper: 18,
    impactedNodesCount: 1,
    summary: "Isolated breaker trip on 500kV bus. Downstream pumps drawing on kinetic line pressure.",
    primaryRisk: "Transients buffered by regional capacitor banks; local pressure drop begins.",
    status: "NOMINAL",
  },
  {
    horizon: "T+5m",
    timeLabel: "Hydraulic Pressure Drain (00:05:00)",
    predictedImpactPct: 38,
    confidenceLower: 32,
    confidenceUpper: 44,
    impactedNodesCount: 3,
    summary: "Aqueduct intake manifold pressure drops below 1.2 bar. Pump cavitation safeguards trip.",
    primaryRisk: "Secondary water distribution line pressure dropping rapidly towards cavitation limits.",
    status: "STRAIN",
  },
  {
    horizon: "T+15m",
    timeLabel: "Multi-Domain Cascade Spread (00:15:00)",
    predictedImpactPct: 68,
    confidenceLower: 59,
    confidenceUpper: 77,
    impactedNodesCount: 5,
    summary: "Raw water treatment plant intake starved. Metro rail feeder shifts to overloaded auxiliary tie.",
    primaryRisk: "Municipal water reservoir depletion threshold crossed; transit line speed throttled by 50%.",
    status: "CRITICAL",
  },
  {
    horizon: "T+30m",
    timeLabel: "Systemic Service Interruption (00:30:00)",
    predictedImpactPct: 89,
    confidenceLower: 78,
    confidenceUpper: 96,
    impactedNodesCount: 7,
    summary: "Secondary treatment plant halts filtration. Metro traction substations experience brownout.",
    primaryRisk: "Widespread municipal water outages and complete suspension of transit lines A & C.",
    status: "CATASTROPHIC",
  },
];

export function ForecastingTimelinePreview() {
  const [activeStepIndex, setActiveStepIndex] = useState(2); // default T+15m
  const currentStep = FORECAST_STEPS[activeStepIndex];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-12 max-w-[1520px] mx-auto" id="forecasting">
      {/* Section Header */}
      <MotionReveal direction="up" className="max-w-3xl mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-[rgba(240,237,229,0.12)] bg-[#191A17] text-xs font-mono text-[#A99A80] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80] animate-pulse" />
          PHASE 6 · TIME-AWARE CASCADE PREDICTION
        </div>
        <h2 className="text-3xl sm:text-5xl font-light tracking-tight text-[#F0EDE5] mb-4">
          <span className="font-sans font-bold uppercase block">
            Predictive Blast-Radius
          </span>
          <span className="font-serif italic text-[#A7A398] block mt-1">
            Timelines.
          </span>
        </h2>
        <p className="text-base text-[#A7A398] leading-relaxed font-sans">
          Forecast cascading failure progression before physical propagation completes. Evaluate temporal blast radius, uncertainty bands, and secondary domain impacts.
        </p>
      </MotionReveal>

      {/* Main Structural Card */}
      <MotionReveal direction="up" delay={0.1}>
        <div className="p-6 sm:p-10 rounded-xl border border-[rgba(240,237,229,0.10)] bg-[#191A17] shadow-2xl">
          {/* Important Boundary Notice */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-8 p-3.5 rounded-lg border border-[rgba(169,154,128,0.25)] bg-[#111210]">
            <div className="flex items-center gap-2 text-xs font-mono text-[#F0EDE5]">
              <span className="font-bold text-[#A99A80]">METHODOLOGY INTEGRITY:</span>
              <span className="text-[#A7A398]">Forecasts represent model predictions, clearly distinguished from observed operational telemetry.</span>
            </div>
            <span className="px-2.5 py-0.5 rounded bg-[rgba(240,237,229,0.06)] text-[11px] font-mono text-[#A7A398]">
              Monte Carlo Ensemble · N=5,000 runs
            </span>
          </div>

          {/* Interactive Timeline Stepper */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
            variants={staggerContainer(0.06, 0.05)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            {FORECAST_STEPS.map((step, idx) => {
              const isActive = idx === activeStepIndex;
              return (
                <motion.button
                  key={step.horizon}
                  variants={staggerItem}
                  type="button"
                  onClick={() => setActiveStepIndex(idx)}
                  className={`p-4 rounded-lg text-left transition-all border font-mono ${
                    isActive
                      ? "border-[#A99A80] bg-[#20211D] shadow-md"
                      : "border-[rgba(240,237,229,0.08)] bg-[#111210] hover:border-[rgba(240,237,229,0.18)] hover:bg-[#20211D]/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-bold ${isActive ? "text-[#A99A80]" : "text-[#F0EDE5]"}`}>
                      {step.horizon}
                    </span>
                    <span className="text-[10px] text-[#A7A398]">
                      {step.impactedNodesCount} nodes
                    </span>
                  </div>
                  <div className="text-[11px] text-[#A7A398] mb-2 truncate">
                    {step.timeLabel}
                  </div>
                  <div className="flex items-baseline gap-1 text-xs">
                    <span className="text-[#736F66] text-[10px]">Severity:</span>
                    <span
                      className={`font-bold ${
                        step.predictedImpactPct > 60
                          ? "text-[#9B4540]"
                          : step.predictedImpactPct > 30
                          ? "text-[#B9955B]"
                          : "text-[#82977D]"
                      }`}
                    >
                      Index {step.predictedImpactPct}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>

          {/* Selected Horizon Detail Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start p-6 rounded-lg border border-[rgba(240,237,229,0.08)] bg-[#111210]">
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-[#A99A80] font-bold uppercase tracking-wider">
                  {currentStep.horizon} · {currentStep.timeLabel}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                    currentStep.status === "CATASTROPHIC"
                      ? "bg-[#9B4540]/15 text-[#E5827C] border border-[#9B4540]/30"
                      : currentStep.status === "CRITICAL"
                      ? "bg-[#9B4540]/15 text-[#E5827C] border border-[#9B4540]/30"
                      : currentStep.status === "STRAIN"
                      ? "bg-[#B9955B]/15 text-[#D5B075] border border-[#B9955B]/30"
                      : "bg-[#82977D]/15 text-[#82977D] border border-[#82977D]/30"
                  }`}
                >
                  STATUS: {currentStep.status}
                </span>
              </div>

              <p className="text-sm sm:text-base text-[#F0EDE5] leading-relaxed font-sans">
                {currentStep.summary}
              </p>

              <div className="p-3.5 rounded-lg border border-[#9B4540]/30 bg-[#201515] text-xs font-mono text-[#E5827C]">
                <span className="font-bold text-[#E5827C] block mb-1 uppercase tracking-wider">
                  Primary Secondary Threat:
                </span>
                <span>{currentStep.primaryRisk}</span>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4 border-t lg:border-t-0 lg:border-l border-[rgba(240,237,229,0.08)] pt-4 lg:pt-0 lg:pl-8 font-mono">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#A7A398]">Mean Predicted Impact</span>
                  <span className="text-lg font-bold text-[#F0EDE5]">
                    {currentStep.predictedImpactPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded bg-[rgba(240,237,229,0.08)] overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[#82977D] via-[#B9955B] to-[#9B4540]"
                    animate={{ width: `${currentStep.predictedImpactPct}%` }}
                    transition={{ duration: DURATION.slow, ease: EASE_DEFAULT }}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#191A17] border border-[rgba(240,237,229,0.08)] text-xs space-y-1.5">
                <div className="flex justify-between text-[#A7A398]">
                  <span>90% Confidence Interval</span>
                  <span className="text-[#F0EDE5]">
                    [{currentStep.confidenceLower}%, {currentStep.confidenceUpper}%]
                  </span>
                </div>
                <div className="flex justify-between text-[#A7A398]">
                  <span>Directly Impacted Nodes</span>
                  <span className="text-[#A99A80] font-bold">
                    {currentStep.impactedNodesCount} / 8 Nodes
                  </span>
                </div>
              </div>

              <Link
                href="/app/simulation"
                className="w-full py-2.5 rounded-lg text-xs font-mono font-semibold text-center text-[#111210] bg-[#F0EDE5] hover:bg-white transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Explore In Simulation Studio</span>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </MotionReveal>
    </section>
  );
}

export default ForecastingTimelinePreview;
