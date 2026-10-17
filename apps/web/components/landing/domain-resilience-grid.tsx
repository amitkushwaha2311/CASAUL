"use client";

import React from "react";
import { motion } from "motion/react";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { staggerContainer, staggerItem } from "@/lib/motion-config";

interface DomainCard {
  title: string;
  tag: string;
  description: string;
  telemetryMetrics: string[];
  interconnectedWith: string[];
  icon: React.ReactNode;
}

const DOMAINS: DomainCard[] = [
  {
    title: "High-Voltage Power Grids",
    tag: "ENERGY INFRASTRUCTURE",
    description:
      "Transmission substations, generator governor loops, reactive power compensators, and frequency stability telemetry.",
    telemetryMetrics: ["Bus Voltage (kV)", "Grid Frequency (Hz)", "Phase Angle Delta"],
    interconnectedWith: ["Water Pumps", "Data Centers", "Transit Traction"],
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    title: "Municipal Aqueducts & Water",
    tag: "HYDRAULIC DISTRIBUTION",
    description:
      "Raw water intakes, high-head booster pumping stations, treatment chlorination loops, and gravity pressure reservoirs.",
    telemetryMetrics: ["Manifold Pressure (bar)", "Flow Rate (ML/d)", "Turbidity (NTU)"],
    interconnectedWith: ["Power Grid", "Cooling Loops", "Emergency Fire Mains"],
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
  {
    title: "Regional Telecom Backbones",
    tag: "COMMUNICATIONS & FIBER",
    description:
      "Dense wavelength optical corridors, autonomous routing gateways, PTP time-synchronization, and edge POP nodes.",
    telemetryMetrics: ["Optical Attenuation (dB)", "Packet Jitter (μs)", "BGP Route Churn"],
    interconnectedWith: ["SCADA Relays", "Grid Telemetry", "Traffic Controls"],
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
      </svg>
    ),
  },
  {
    title: "Cyber-Physical Transit & Rail",
    tag: "METROPOLITAN TRANSPORT",
    description:
      "Traction power substations, automated signaling interlockings, catenary feeder ties, and headway control servers.",
    telemetryMetrics: ["Catenary DC Voltage", "Signaling Carrier Freq", "Track Circuit Shunt"],
    interconnectedWith: ["Traction Grid", "Telemetry Core", "Emergency Power"],
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
];

export function DomainResilienceGrid() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-12 max-w-[1520px] mx-auto" id="domains">
      <MotionReveal direction="up" className="max-w-3xl mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-[rgba(240,237,229,0.12)] bg-[#191A17] text-xs font-mono text-[#A99A80] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80] animate-pulse" />
          DOMAIN-INDEPENDENT GRAPH TOPOLOGY
        </div>
        <h2 className="text-3xl sm:text-5xl font-light tracking-tight text-[#F0EDE5] mb-4">
          <span className="font-sans font-bold uppercase block">
            MULTI-DOMAIN
          </span>
          <span className="font-serif italic text-[#A7A398] block mt-1">
            Infrastructure Defense.
          </span>
        </h2>
        <p className="text-base text-[#A7A398] leading-relaxed font-sans">
          Critical failure cascades cross sector boundaries within seconds. CAUSAL unifies heterogeneous telemetry across physical, cyber, and operational environments into a single directed graph.
        </p>
      </MotionReveal>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
        variants={staggerContainer(0.08, 0.05)}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.1 }}
      >
        {DOMAINS.map((domain) => (
          <motion.div
            key={domain.title}
            variants={staggerItem}
            className="group p-6 sm:p-8 rounded-xl border border-[rgba(240,237,229,0.10)] bg-[#191A17] flex flex-col justify-between hover:border-[rgba(240,237,229,0.20)] hover:bg-[#20211D] transition-all duration-200 shadow-md relative overflow-hidden"
          >
            {/* Left accent strip — appears on hover */}
            <div className="absolute left-0 top-6 bottom-6 w-px bg-[#A99A80] opacity-0 group-hover:opacity-60 transition-opacity duration-300" />

            <div>
              <div className="flex items-center justify-between gap-3 mb-5">
                <span className="p-2.5 rounded-lg bg-[#20211D] text-[#A99A80] border border-[rgba(169,154,128,0.22)] group-hover:border-[rgba(169,154,128,0.40)] group-hover:bg-[#272823] transition-all">
                  {domain.icon}
                </span>
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#736F66] bg-[rgba(240,237,229,0.04)] px-2.5 py-1 rounded border border-[rgba(240,237,229,0.06)] group-hover:text-[#A7A398] transition-colors">
                  {domain.tag}
                </span>
              </div>

              <h3 className="text-lg font-bold text-[#F0EDE5] mb-2.5 font-sans group-hover:text-white transition-colors">
                {domain.title}
              </h3>
              <p className="text-xs sm:text-sm text-[#A7A398] leading-relaxed mb-6 font-sans">
                {domain.description}
              </p>

              <div className="mb-6">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#736F66] block mb-2.5">
                  Synchronized Telemetry Channels
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {domain.telemetryMetrics.map((metric) => (
                    <span
                      key={metric}
                      className="px-2.5 py-1 rounded-sm text-[11px] font-mono bg-[#111210] text-[#A7A398] border border-[rgba(240,237,229,0.06)] group-hover:border-[rgba(240,237,229,0.10)] transition-colors"
                    >
                      {metric}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[rgba(240,237,229,0.07)] flex items-center justify-between text-xs font-mono">
              <span className="text-[#736F66] text-[11px]">Coupled Sectors:</span>
              <span className="text-[#A99A80] font-medium group-hover:text-[#C4B59B] transition-colors">
                {domain.interconnectedWith.join(" · ")}
              </span>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

export default DomainResilienceGrid;
