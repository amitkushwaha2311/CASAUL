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

interface HypothesisDemo {
  id: string;
  title: string;
  mechanism: "UPSTREAM_FAILURE" | "LOCAL_FAULT" | "TELEMETRY_ANOMALY";
  confidence: number;
  candidateFactor: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  counterfactualResult: string;
}

const DEMO_HYPOTHESES: HypothesisDemo[] = [
  {
    id: "HYP-001",
    title: "Cavitation in Aqueduct Pump 4 caused by Substation Alpha voltage drop",
    mechanism: "UPSTREAM_FAILURE",
    confidence: 0.94,
    candidateFactor: "Feeder 4A Bus Trip (500kV)",
    supportingEvidence: [
      "Timestamp correlation: Voltage dip preceded pump vibration spike by 420ms",
      "Sensor S-402: Upstream intake valve pressure dropped below vapor threshold (0.82 bar)",
      "Hydraulic flow telemetry confirms rapid transient surge across suction manifold",
    ],
    contradictingEvidence: [
      "Motor winding temperature remained within nominal threshold (58°C < 85°C limit)",
    ],
    counterfactualResult:
      "If Substation Alpha backup generator engaged at T+100ms, pump intake pressure would have remained in safe operating envelope (>82 bar).",
  },
  {
    id: "HYP-002",
    title: "Mechanical impeller fatigue fracture in Pump 4 motor assembly",
    mechanism: "LOCAL_FAULT",
    confidence: 0.28,
    candidateFactor: "Component mechanical wear",
    supportingEvidence: [
      "Vibration sensor V-109 registered elevated high-frequency harmonics",
    ],
    contradictingEvidence: [
      "Oil lubrication pressure nominal throughout entire incident timeline",
      "Previous ultrasonic acoustic inspection passed 48 hours prior with zero crack propagation",
      "Event occurred synchronously across multiple grid-tied pumps on same feeder",
    ],
    counterfactualResult:
      "Replacing impeller assembly does not mitigate cascade risk under identical upstream grid failure conditions.",
  },
  {
    id: "HYP-003",
    title: "SCADA sensor telemetry anomaly / packet jitter on pressure sensor",
    mechanism: "TELEMETRY_ANOMALY",
    confidence: 0.08,
    candidateFactor: "Network packet drop / sensor drift",
    supportingEvidence: [
      "Telemetry gateway registered 2 dropped UDP telemetry frames at T+150ms",
    ],
    contradictingEvidence: [
      "Secondary redundant pressure gauge confirmed identical physical pressure drop",
      "Physical downstream water reservoir level decreased by 14,000 gallons synchronously",
    ],
    counterfactualResult:
      "Sensor recalibration has zero effect on physical fluid flow or observed system starvation.",
  },
];

export function CausalReasonerPreview() {
  const [selectedHypothesis, setSelectedHypothesis] = useState<HypothesisDemo>(
    DEMO_HYPOTHESES[0]
  );

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-12 max-w-[1520px] mx-auto" id="causal-engine">
      {/* Section Header */}
      <MotionReveal direction="up" className="max-w-3xl mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-[rgba(240,237,229,0.12)] bg-[#191A17] text-xs font-mono text-[#A99A80] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80] animate-pulse" />
          PHASE 5 · CAUSAL REASONING ENGINE
        </div>
        <h2 className="text-3xl sm:text-5xl font-light tracking-tight text-[#F0EDE5] mb-4">
          <span className="font-sans font-bold uppercase block">
            EVIDENCE-GROUNDED
          </span>
          <span className="font-serif italic text-[#A7A398] block mt-1">
            Causal Hypotheses.
          </span>
        </h2>
        <p className="text-base text-[#A7A398] leading-relaxed font-sans">
          Move beyond correlation and black-box neural networks. CAUSAL formulates transparent, falsifiable causal hypotheses grounded in physical telemetry, structural dependencies, and counterfactual validation.
        </p>
      </MotionReveal>

      {/* Interactive Hypotheses Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Hypotheses Selector (Left Column) */}
        <motion.div
          className="lg:col-span-5 space-y-3"
          variants={staggerContainer(0.1, 0.05)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
        >
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#A7A398] px-1 mb-2">
            Evaluated Hypotheses for Incident INC-2026-088
          </div>

          {DEMO_HYPOTHESES.map((hyp) => {
            const isSelected = selectedHypothesis.id === hyp.id;
            const pct = Math.round(hyp.confidence * 100);

            return (
              <motion.div
                key={hyp.id}
                variants={staggerItem}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedHypothesis(hyp)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedHypothesis(hyp)}
                className={`p-5 rounded-lg cursor-pointer transition-all border ${
                  isSelected
                    ? "border-[#A99A80] bg-[#20211D] shadow-lg"
                    : "border-[rgba(240,237,229,0.08)] bg-[#191A17] hover:border-[rgba(240,237,229,0.18)] hover:bg-[#20211D]/60"
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs font-mono text-[#A7A398]">
                    {hyp.id}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      hyp.mechanism === "UPSTREAM_FAILURE"
                        ? "bg-[#9B4540]/15 text-[#E5827C] border border-[#9B4540]/30"
                        : hyp.mechanism === "LOCAL_FAULT"
                        ? "bg-[#B9955B]/15 text-[#D5B075] border border-[#B9955B]/30"
                        : "bg-[#736F66]/15 text-[#A7A398] border border-[#736F66]/30"
                    }`}
                  >
                    {hyp.mechanism}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-[#F0EDE5] mb-3 line-clamp-2 font-sans">
                  {hyp.title}
                </h3>

                {/* Confidence Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#A7A398] text-[11px]">Confidence</span>
                    <span
                      className={`font-bold ${
                        pct > 70
                          ? "text-[#82977D]"
                          : pct > 20
                          ? "text-[#B9955B]"
                          : "text-[#736F66]"
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full h-1 rounded bg-[rgba(240,237,229,0.06)] overflow-hidden">
                    <motion.div
                      className="h-full"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${pct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: DURATION.slow, ease: EASE_DEFAULT, delay: 0.2 }}
                      style={{
                        backgroundColor:
                          pct > 70
                            ? "#82977D"
                            : pct > 20
                            ? "#B9955B"
                            : "#736F66",
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Deep Evidence Inspector (Right Column) */}
        <MotionReveal direction="left" delay={0.15} className="lg:col-span-7">
          <div className="p-6 sm:p-8 rounded-xl border border-[rgba(240,237,229,0.10)] bg-[#191A17] shadow-2xl">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-4 mb-6 border-b border-[rgba(240,237,229,0.08)]">
              <div>
                <span className="text-xs font-mono text-[#A99A80] font-semibold uppercase tracking-wider">
                  ACTIVE HYPOTHESIS DOSSIER · {selectedHypothesis.id}
                </span>
                <h4 className="text-lg font-bold text-[#F0EDE5] mt-1 font-sans">
                  {selectedHypothesis.candidateFactor}
                </h4>
              </div>
              <span className="px-3 py-1 rounded text-xs font-mono bg-[#20211D] text-[#A99A80] border border-[rgba(169,154,128,0.3)]">
                Confidence: {Math.round(selectedHypothesis.confidence * 100)}%
              </span>
            </div>

            {/* Supporting Evidence List */}
            <div className="space-y-3 mb-6">
              <h5 className="text-xs font-mono uppercase tracking-wider text-[#82977D] flex items-center gap-2">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Supporting Corroborating Evidence ({selectedHypothesis.supportingEvidence.length})
              </h5>
              <div className="space-y-2">
                {selectedHypothesis.supportingEvidence.map((ev, i) => (
                  <div
                    key={i}
                    className="p-3 rounded bg-[rgba(130,151,125,0.08)] border border-[rgba(130,151,125,0.2)] text-xs text-[#F0EDE5] flex items-start gap-2.5 font-sans"
                  >
                    <span className="text-[#82977D] font-mono font-bold mt-0.5">
                      ✓
                    </span>
                    <span>{ev}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Contradicting Evidence List */}
            <div className="space-y-3 mb-6">
              <h5 className="text-xs font-mono uppercase tracking-wider text-[#B9955B] flex items-center gap-2">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Contradicting / Inconsistent Observations ({selectedHypothesis.contradictingEvidence.length})
              </h5>
              <div className="space-y-2">
                {selectedHypothesis.contradictingEvidence.map((ev, i) => (
                  <div
                    key={i}
                    className="p-3 rounded bg-[rgba(185,149,91,0.08)] border border-[rgba(185,149,91,0.2)] text-xs text-[#F0EDE5] flex items-start gap-2.5 font-sans"
                  >
                    <span className="text-[#B9955B] font-mono font-bold mt-0.5">
                      ✕
                    </span>
                    <span>{ev}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Counterfactual Reasoning Box */}
            <div className="p-4 rounded-lg border border-[rgba(169,154,128,0.25)] bg-[#111210] mb-6">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#A99A80] font-bold block mb-1">
                Counterfactual Intervention Simulation
              </span>
              <p className="text-xs sm:text-sm text-[#F0EDE5] leading-relaxed font-serif italic">
                &ldquo;{selectedHypothesis.counterfactualResult}&rdquo;
              </p>
            </div>

            {/* Link to live causal dashboard */}
            <div className="pt-3 flex items-center justify-between flex-wrap gap-3 border-t border-[rgba(240,237,229,0.08)]">
              <span className="text-xs font-mono text-[#A7A398]">
                Verified against Phase 5 Causal Rules
              </span>
              <Link
                href="/app/causal"
                className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[#A99A80] hover:text-[#F0EDE5] transition-colors"
              >
                Inspect Live Causal Engine
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </MotionReveal>
      </div>
    </section>
  );
}

export default CausalReasonerPreview;
