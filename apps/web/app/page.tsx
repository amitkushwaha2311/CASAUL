/**
 * CAUSAL — Public Landing Page (/)
 *
 * Visual language: EDITORIAL INFRASTRUCTURE INTELLIGENCE
 * Specifications integrated:
 * 1. Driftbar: Editorial footer, atmospheric fade, oversized frosted-glass wordmark, exact responsive grid.
 * 2. Cinematic Hero: 100svh inset container, background video, word-by-word blur reveal, liquid-glass badges.
 * 3. Prisma Creative Studio: Elevated charcoal story panel, Newsreader italic styling, 480px staggered feature cards.
 *
 * Palette: Obsidian (#111210) · Warm Ivory (#F0EDE5) · Muted Bronze (#A99A80) · Stone (#A7A398)
 * Typography: Inter (sans) + Newsreader (serif italic) + JetBrains Mono (data)
 */

import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { CinematicHero } from "@/components/landing/cinematic-hero";
import { PrismaStorySection } from "@/components/landing/prisma-story-section";
import { PrismaFeatureCards } from "@/components/landing/prisma-feature-cards";
import { CascadeHeroVisualization } from "@/components/landing/cascade-hero-visualization";
import { CausalReasonerPreview } from "@/components/landing/causal-reasoner-preview";
import { ForecastingTimelinePreview } from "@/components/landing/forecasting-timeline-preview";
import { DigitalTwinScenarioSandbox } from "@/components/landing/digital-twin-scenario-sandbox";
import { DomainResilienceGrid } from "@/components/landing/domain-resilience-grid";
import { LenisProvider } from "@/components/landing/lenis-provider";
import { MotionReveal } from "@/components/ui/motion-reveal";

export const metadata: Metadata = {
  title: "CAUSAL — See the Cascade Before It Happens",
  description:
    "Autonomous causal reasoning, predictive blast-radius forecasting, and counterfactual scenario modeling for interconnected cyber-physical infrastructure systems.",
};

const apiDocsUrl = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/docs`;

export default function HomePage() {
  return (
    <LenisProvider>
      <div className="min-h-screen bg-[#111210] text-[#F0EDE5] relative selection:bg-[#A99A80]/30 selection:text-white overflow-x-hidden">

        {/* ── Dual-layer Architectural Grid ─────────────────────── */}
        <div
          aria-hidden="true"
          className="fixed inset-0 causal-grid-texture opacity-[0.25] pointer-events-none z-0"
        />
        <div
          aria-hidden="true"
          className="fixed inset-0 causal-grid-texture-fine opacity-[0.12] pointer-events-none z-0"
        />

        {/* Navigation Header */}
        <LandingNavbar />

        <main className="relative z-10">

          {/* ════════════════════════════════════════════════════════
              1. CINEMATIC HERO — 100svh INSET VIDEO STAGE
              ════════════════════════════════════════════════════════ */}
          <CinematicHero />

          {/* ════════════════════════════════════════════════════════
              2. PRISMA PRODUCT STORY — EDITORIAL PERSPECTIVE
              ════════════════════════════════════════════════════════ */}
          <PrismaStorySection />

          {/* ════════════════════════════════════════════════════════
              3. PRISMA CAPABILITY FEATURE CARDS (4-COL, 480px)
              ════════════════════════════════════════════════════════ */}
          <PrismaFeatureCards />

          {/* ════════════════════════════════════════════════════════
              4. INTERACTIVE 3D CASCADE SIMULATION ENGINE
              ════════════════════════════════════════════════════════ */}
          <section className="px-4 sm:px-6 lg:px-12 max-w-[1580px] mx-auto py-20 lg:py-28" id="dependency-visualization">
            <MotionReveal direction="up" className="mb-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[rgba(240,237,229,0.08)]">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#82977D]" />
                    <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#82977D] font-semibold">
                      Phase 2 · Blast Propagation Engine
                    </span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl lg:text-5xl font-sans font-extrabold tracking-tight text-[#F0EDE5]">
                    Interactive <span className="font-serif italic font-light text-[#A7A398]">Digital Twin Cascade.</span>
                  </h2>
                </div>
                <p className="text-xs sm:text-sm font-sans text-[#A7A398] max-w-md leading-relaxed">
                  Trigger an instantaneous trip on Substation Alpha to observe real-time causal blast-radius propagation across water pumping, fiber routing, and transit signaling.
                </p>
              </div>
            </MotionReveal>

            <MotionReveal direction="up" delay={0.1}>
              <div className="relative w-full">
                <div
                  aria-hidden="true"
                  className="absolute -inset-6 bg-gradient-to-tr from-[#9B4540]/10 via-[#B9955B]/10 to-[#82977D]/12 blur-3xl opacity-40 pointer-events-none rounded-3xl"
                />
                <CascadeHeroVisualization />
              </div>
            </MotionReveal>
          </section>

          {/* ════════════════════════════════════════════════════════
              5. CAUSAL REASONING ENGINE (PHASE 5)
              ════════════════════════════════════════════════════════ */}
          <div className="border-t border-[rgba(240,237,229,0.07)] relative">
            <div className="absolute left-8 sm:left-12 top-0 -translate-y-1/2 flex items-center gap-2.5 bg-[#191A17] px-3.5 py-1 rounded-full border border-[rgba(240,237,229,0.1)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80]" />
              <span className="text-[10px] font-mono tracking-wider uppercase text-[#A99A80] font-semibold">Phase 5 · Causal Reasoning Engine</span>
            </div>
          </div>
          <section className="bg-[#191A17]/60 py-6" id="causal-engine">
            <CausalReasonerPreview />
          </section>

          {/* ════════════════════════════════════════════════════════
              6. PREDICTIVE BLAST-RADIUS TIMELINES (PHASE 6)
              ════════════════════════════════════════════════════════ */}
          <div className="border-t border-[rgba(240,237,229,0.07)] relative">
            <div className="absolute left-8 sm:left-12 top-0 -translate-y-1/2 flex items-center gap-2.5 bg-[#111210] px-3.5 py-1 rounded-full border border-[rgba(240,237,229,0.1)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80]" />
              <span className="text-[10px] font-mono tracking-wider uppercase text-[#A99A80] font-semibold">Phase 6 · Blast-Radius Forecasting</span>
            </div>
          </div>
          <section className="bg-[#111210] py-6" id="forecasting">
            <ForecastingTimelinePreview />
          </section>

          {/* ════════════════════════════════════════════════════════
              7. COUNTERFACTUAL WHAT-IF SANDBOXES (PHASE 7)
              ════════════════════════════════════════════════════════ */}
          <div className="border-t border-[rgba(240,237,229,0.07)] relative">
            <div className="absolute left-8 sm:left-12 top-0 -translate-y-1/2 flex items-center gap-2.5 bg-[#191A17] px-3.5 py-1 rounded-full border border-[rgba(240,237,229,0.1)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80]" />
              <span className="text-[10px] font-mono tracking-wider uppercase text-[#A99A80] font-semibold">Phase 7 · Counterfactual Sandboxes</span>
            </div>
          </div>
          <section className="bg-[#191A17]/60 py-6" id="scenarios">
            <DigitalTwinScenarioSandbox />
          </section>

          {/* ════════════════════════════════════════════════════════
              8. MULTI-DOMAIN GRAPH TOPOLOGY
              ════════════════════════════════════════════════════════ */}
          <div className="border-t border-[rgba(240,237,229,0.07)] relative">
            <div className="absolute left-8 sm:left-12 top-0 -translate-y-1/2 flex items-center gap-2.5 bg-[#111210] px-3.5 py-1 rounded-full border border-[rgba(240,237,229,0.1)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80]" />
              <span className="text-[10px] font-mono tracking-wider uppercase text-[#A99A80] font-semibold">Domain-Independent Graph Topology</span>
            </div>
          </div>
          <section className="bg-[#111210] py-6" id="domains">
            <DomainResilienceGrid />
          </section>

          {/* ════════════════════════════════════════════════════════
              9. MISSION CONSOLE PORTAL CTA
              ════════════════════════════════════════════════════════ */}
          <section className="py-24 px-4 sm:px-6 lg:px-12 max-w-5xl mx-auto" id="enter-platform">
            <div className="causal-gradient-border">
              <div className="relative p-10 sm:p-16 rounded-2xl bg-[#191A17] overflow-hidden text-center causal-glass-strong">

                {/* Interior grid texture */}
                <div aria-hidden="true" className="absolute inset-0 causal-grid-texture opacity-25 pointer-events-none" />

                {/* Corner accent marks */}
                <div aria-hidden="true" className="absolute top-5 left-5 w-6 h-6 border-t border-l border-[#A99A80]/35" />
                <div aria-hidden="true" className="absolute top-5 right-5 w-6 h-6 border-t border-r border-[#A99A80]/35" />
                <div aria-hidden="true" className="absolute bottom-5 left-5 w-6 h-6 border-b border-l border-[#A99A80]/35" />
                <div aria-hidden="true" className="absolute bottom-5 right-5 w-6 h-6 border-b border-r border-[#A99A80]/35" />

                <div className="relative z-10">
                  <div className="causal-phase-pill mx-auto mb-8 w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#82977D] animate-pulse" />
                    MISSION CONSOLE READY
                  </div>

                  <h2 className="text-4xl sm:text-6xl tracking-[-0.04em] mb-5">
                    <span className="font-sans font-extrabold uppercase block text-[#F0EDE5]">
                      PREVENT THE
                    </span>
                    <span className="font-serif italic font-light block mt-1 causal-shimmer-text">
                      Cascade.
                    </span>
                  </h2>

                  <p className="text-[0.9375rem] text-[#A7A398] max-w-2xl mx-auto leading-relaxed mb-10 font-sans">
                    Launch into the active operational graph. Analyze live telemetry events, evaluate causal explanations, and simulate interventions across interconnected municipal sectors.
                  </p>

                  <div className="flex items-center justify-center flex-wrap gap-3.5 mb-12">
                    <Link
                      href="/app"
                      id="footer-launch-platform-btn"
                      className="px-6 py-3 rounded-xl text-sm font-mono font-semibold text-[#111210] bg-[#F0EDE5] hover:bg-white transition-all flex items-center gap-2 shadow-[0_4px_20px_rgba(240,237,229,0.1)]"
                    >
                      <span>Launch CAUSAL Platform</span>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>

                    <Link
                      href="/app/simulation"
                      id="footer-open-simulation-btn"
                      className="px-5 py-3 rounded-xl text-sm font-mono font-medium text-[#F0EDE5] bg-[#20211D] hover:bg-[#272823] border border-[rgba(240,237,229,0.12)] hover:border-[rgba(240,237,229,0.28)] transition-colors"
                    >
                      Simulation Studio
                    </Link>

                    <a
                      href={apiDocsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-xl text-xs font-mono text-[#736F66] hover:text-[#A7A398] border border-[rgba(240,237,229,0.07)] hover:border-[rgba(240,237,229,0.18)] transition-colors"
                    >
                      Swagger API Specs ↗
                    </a>
                  </div>

                  <div className="flex items-center justify-center gap-6 text-[11px] font-mono text-[#736F66]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-[#82977D]" />
                      FastAPI v1.0.0
                    </span>
                    <span className="w-px h-3 bg-[rgba(240,237,229,0.10)]" />
                    <span className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-[#A99A80]" />
                      Next.js App Router
                    </span>
                    <span className="w-px h-3 bg-[rgba(240,237,229,0.10)]" />
                    <span className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-[#736F66]" />
                      Phases 1–10 Active
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </main>

        {/* ════════════════════════════════════════════════════════
            10. DRIFTBAR EDITORIAL FOOTER (1440x672 SCALED STAGE)
            ════════════════════════════════════════════════════════ */}
        <LandingFooter />
      </div>
    </LenisProvider>
  );
}
