"use client";

import React from "react";
import Link from "next/link";

const DRIFTBAR_FOOTER_VIDEO =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/4d01c727-d9c5-47c8-a778-35a451ffd39f.mp4";

export function LandingFooter() {
  return (
    <footer className="driftbar-footer border-t border-[rgba(240,237,229,0.10)]" id="platform-footer">
      {/* ── Layer 0: Original Driftbar Reference Video ─────────────────── */}
      <video
        src={DRIFTBAR_FOOTER_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-40 mix-blend-screen"
        style={{
          objectPosition: "50% 100%",
          transform: "translateY(9%)",
        }}
      />

      {/* ── Layer 1: Oversized Frosted-Glass CAUSAL Wordmark ─────────── */}
      <div aria-hidden="true" className="driftbar-wordmark font-mono">
        CAUSAL
      </div>

      {/* ── Layer 2: Atmospheric Fade & Bottom Fog ─────────────────────── */}
      <div aria-hidden="true" className="driftbar-atmospheric-fade" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-[#111210] to-transparent pointer-events-none z-[2]"
      />

      {/* ── Layer 3: Driftbar Master Content Grid ─────────────────────── */}
      <div className="driftbar-content-grid">
        {/* Brand Column (440u) */}
        <div className="space-y-4 pr-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-7 h-7 rounded border border-[rgba(240,237,229,0.18)] bg-[#191A17] causal-glass-subtle">
              <span className="w-1.5 h-1.5 rounded-sm bg-[#A99A80]" />
            </div>
            <span className="text-xl font-bold font-mono tracking-tight text-[#F0EDE5]">
              CAUSAL
            </span>
          </div>

          <p className="text-xs sm:text-[13px] text-[#A7A398] leading-relaxed max-w-sm font-sans">
            Domain-independent intelligence platform for interconnected cyber-physical infrastructure systems. Stop cascading failure propagation before physical limits are exceeded.
          </p>

          <div className="pt-1 flex items-center gap-3">
            <Link
              href="/app"
              id="footer-brand-enter-btn"
              className="inline-flex items-center gap-2 px-4 py-2 rounded text-xs font-mono font-semibold text-[#111210] bg-[#F0EDE5] hover:bg-white transition-all shadow-sm"
            >
              <span>Launch Platform</span>
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#82977D] px-2.5 py-1.5 rounded border border-[#82977D]/25 bg-[#82977D]/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#82977D] animate-pulse" />
              <span>Phase 1–6 Core Engines Online</span>
            </div>
          </div>

          <div className="pt-4 text-[11px] font-mono text-[#736F66] leading-relaxed">
            <p>© 2026 CAUSAL Systems. Built for Resilient Cyber-Physical Infrastructure.</p>
            <p className="mt-1 text-[10px] text-[#5D5B54]">
              Illustrative simulations clearly labeled · Operational models require verified telemetry feeds
            </p>
          </div>
        </div>

        {/* Column 2: Platform Modules (240u) */}
        <div className="space-y-3 font-mono text-xs">
          <span className="font-bold uppercase tracking-wider text-[#F0EDE5] block pb-1 border-b border-[rgba(240,237,229,0.08)]">
            Platform Modules
          </span>
          <ul className="space-y-2 text-[#A7A398]">
            <li>
              <Link href="/app" className="hover:text-[#F0EDE5] transition-colors">
                Overview Console
              </Link>
            </li>
            <li>
              <Link href="/app/command-center" className="hover:text-[#F0EDE5] transition-colors">
                Command Center
              </Link>
            </li>
            <li>
              <Link href="/app/state" className="hover:text-[#F0EDE5] transition-colors">
                Graph Explorer
              </Link>
            </li>
            <li>
              <Link href="/app/simulation" className="hover:text-[#F0EDE5] transition-colors">
                Simulation Studio
              </Link>
            </li>
            <li>
              <Link href="/app/causal" className="hover:text-[#F0EDE5] transition-colors">
                Causal Reasoning
              </Link>
            </li>
            <li>
              <Link href="/app/evidence" className="hover:text-[#F0EDE5] transition-colors">
                Evidence Audit Trail
              </Link>
            </li>
            <li>
              <Link href="/app/scenarios" className="hover:text-[#F0EDE5] transition-colors">
                Scenario Sandboxing
              </Link>
            </li>
            <li>
              <Link href="/app/interventions" className="hover:text-[#F0EDE5] transition-colors">
                Counterfactual Engine
              </Link>
            </li>
            <li>
              <Link href="/app/recommendations" className="hover:text-[#F0EDE5] transition-colors">
                Ranked Recommendations
              </Link>
            </li>
            <li>
              <Link href="/app/analytics" className="hover:text-[#F0EDE5] transition-colors">
                Analytics &amp; Forecasting
              </Link>
            </li>
          </ul>
        </div>

        {/* Column 3: Core Specifications (240u) */}
        <div className="space-y-3 font-mono text-xs">
          <span className="font-bold uppercase tracking-wider text-[#F0EDE5] block pb-1 border-b border-[rgba(240,237,229,0.08)]">
            Core Specifications
          </span>
          <ul className="space-y-2 text-[#A7A398]">
            <li>Phase 1: Multi-Domain Graph DB</li>
            <li>Phase 2: Directional Blast Radius</li>
            <li>Phase 3: Real-Time Event Bus</li>
            <li>Phase 4: Baselines &amp; Snapshots</li>
            <li>Phase 5: Causal Evidence Reasoner</li>
            <li>Phase 6: Temporal Forecast Engine</li>
            <li>Phase 7: Counterfactual Sandboxes</li>
            <li>Phase 8: Safety Boundaries</li>
            <li>Phase 9: Operator Verification</li>
            <li>Phase 10: Closed-Loop Governance</li>
          </ul>
        </div>

        {/* Column 4: Integration & API (1fr) */}
        <div className="space-y-3 font-mono text-xs">
          <span className="font-bold uppercase tracking-wider text-[#F0EDE5] block pb-1 border-b border-[rgba(240,237,229,0.08)]">
            Integration &amp; API
          </span>
          <ul className="space-y-2 text-[#A7A398]">
            <li>
              <a
                href="http://localhost:8000/api/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#F0EDE5] transition-colors inline-flex items-center gap-1.5"
              >
                <span>FastAPI OpenAPI Specs</span>
                <span className="text-[10px] text-[#A99A80]">↗</span>
              </a>
            </li>
            <li>
              <a
                href="http://localhost:8000/api/v1/health"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#F0EDE5] transition-colors inline-flex items-center gap-1.5"
              >
                <span>System Health Check</span>
                <span className="text-[10px] text-[#A99A80]">↗</span>
              </a>
            </li>
            <li>
              <a
                href="http://localhost:8000/api/v1/graphs"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#F0EDE5] transition-colors inline-flex items-center gap-1.5"
              >
                <span>Raw Topology Endpoints</span>
                <span className="text-[10px] text-[#A99A80]">↗</span>
              </a>
            </li>
            <li>
              <Link href="/login" className="hover:text-[#F0EDE5] transition-colors">
                Operator Sign In
              </Link>
            </li>
          </ul>

          <div className="pt-4 mt-4 border-t border-[rgba(240,237,229,0.06)]">
            <span className="text-[11px] font-mono text-[#736F66] uppercase tracking-wider block mb-2">
              System Architecture
            </span>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#191A17] border border-[rgba(240,237,229,0.08)] text-[#A7A398]">
                FastAPI v1.0
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#191A17] border border-[rgba(240,237,229,0.08)] text-[#A7A398]">
                Next.js 16
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#191A17] border border-[rgba(240,237,229,0.08)] text-[#A7A398]">
                Tailwind v4
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default LandingFooter;
