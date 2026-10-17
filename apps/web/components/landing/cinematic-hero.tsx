"use client";

import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

const HERO_VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_080021_d598092b-c4c2-4e53-8e46-94cf9064cd50.mp4";

const HEADLINE_WORDS = ["SEE", "THE", "CASCADE.", "BEFORE", "IT", "HAPPENS."];

export function CinematicHero() {
  const shouldReduceMotion = useReducedMotion();

  const wordAnimationVariants = {
    hidden: {
      filter: "blur(10px)",
      opacity: 0,
      y: 50,
    },
    visible: (i: number) => ({
      filter: ["blur(10px)", "blur(5px)", "blur(0px)"],
      opacity: [0, 0.5, 1],
      y: [50, -5, 0],
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.7,
        times: [0, 0.5, 1],
        delay: shouldReduceMotion ? 0 : 0.1 * i,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    }),
  };

  return (
    <section className="relative w-full h-[100svh] min-h-[640px] p-4 sm:p-6 lg:p-6 flex flex-col justify-between overflow-hidden">
      {/* ── Inner Inset Container ───────────────────────────────────── */}
      <div className="relative w-full h-full rounded-2xl lg:rounded-[32px] overflow-hidden border border-[rgba(240,237,229,0.12)] flex flex-col justify-between p-6 sm:p-10 lg:p-12 z-0">
        
        {/* Background Video */}
        <video
          src={HERO_VIDEO_URL}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none -z-20"
        />

        {/* Atmospheric Scrim & Glass Sheen */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[#111210]/80 via-[#111210]/45 to-[#111210]/90 -z-10"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 causal-grid-texture opacity-15 pointer-events-none -z-10"
        />

        {/* ── Top Bar: Status Pill & Phase Indicator ──────────────── */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
          className="relative z-10 flex items-center justify-between gap-4 pt-16 sm:pt-14"
        >
          <div className="causal-glass-subtle px-3.5 py-1.5 rounded-full inline-flex items-center gap-2 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[#82977D] animate-pulse" />
            <span className="text-[#F0EDE5] font-semibold tracking-wide">
              SYSTEM ONLINE · PHASES 1–10 ACTIVE
            </span>
            <span className="w-px h-3 bg-[rgba(240,237,229,0.2)]" />
            <span className="text-[#A7A398] hidden sm:inline">Autonomous Resilience Engine</span>
          </div>

          <div className="hidden md:flex items-center gap-3 text-[11px] font-mono text-[#A7A398]">
            <span className="px-2.5 py-1 rounded bg-[#111210]/60 border border-[rgba(240,237,229,0.10)] text-[#A99A80]">
              ILLUSTRATIVE SIMULATION
            </span>
            <span className="px-2.5 py-1 rounded bg-[#111210]/60 border border-[rgba(240,237,229,0.10)] text-[#A7A398]">
              NO LIVE TELEMETRY
            </span>
          </div>
        </motion.div>

        {/* ── Center Stage: Scaled Headline & Value Proposition ─────── */}
        <div className="relative z-10 my-auto py-6 sm:py-10 max-w-7xl">
          <h1
            className="font-sans font-extrabold tracking-[-0.04em] leading-[0.92] text-[#F0EDE5] flex flex-wrap gap-x-[0.25em] gap-y-[0.05em] uppercase select-none text-[26vw] sm:text-[18vw] md:text-[14vw] lg:text-[11vw] xl:text-[9.5vw] 2xl:text-[8.5vw]"
          >
            {HEADLINE_WORDS.map((word, index) => (
              <motion.span
                key={index}
                custom={index}
                initial="hidden"
                animate="visible"
                variants={wordAnimationVariants}
                className={`inline-block ${
                  word === "CASCADE."
                    ? "font-serif italic font-light lowercase text-[#F0EDE5] causal-shimmer-text"
                    : word === "HAPPENS."
                    ? "font-serif italic font-light lowercase text-[#A7A398]"
                    : "text-[#F0EDE5]"
                }`}
              >
                {word === "CASCADE." ? "Cascade." : word === "HAPPENS." ? "happens." : word}
              </motion.span>
            ))}
          </h1>

          {/* Supporting Copy */}
          <motion.p
            initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.8, ease: "easeOut" }}
            className="mt-6 text-sm sm:text-base md:text-lg text-[#A7A398] max-w-2xl font-sans leading-relaxed"
          >
            Understand infrastructure dependencies, trace causal evidence, and evaluate safer interventions before failures cascade. Autonomous causal reasoning, predictive blast-radius forecasting, and counterfactual scenario modeling for interconnected cyber-physical infrastructure.
          </motion.p>

          {/* Action CTAs */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 1.1, ease: "easeOut" }}
            className="mt-8 flex flex-wrap items-center gap-3.5"
          >
            <Link
              href="/app"
              id="enter-platform-btn"
              className="px-6 py-3 rounded-xl text-sm font-mono font-semibold text-[#111210] bg-[#F0EDE5] hover:bg-white transition-all flex items-center gap-2 shadow-[0_4px_24px_rgba(240,237,229,0.18)]"
            >
              <span>Enter Platform</span>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>

            <Link
              href="/app/command-center"
              id="hero-command-center-btn"
              className="causal-glass-subtle px-5 py-3 rounded-xl text-sm font-mono font-medium text-[#F0EDE5] hover:bg-white/5 border border-[rgba(240,237,229,0.16)] transition-colors"
            >
              Command Center
            </Link>

            <a
              href="http://localhost:8000/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              id="api-docs-link"
              className="causal-glass-subtle px-4 py-3 rounded-xl text-xs font-mono text-[#A7A398] hover:text-[#F0EDE5] border border-[rgba(240,237,229,0.10)] transition-colors inline-flex items-center gap-1.5"
            >
              <span>API Docs</span>
              <span className="text-[#A99A80]">↗</span>
            </a>
          </motion.div>
        </div>

        {/* ── Bottom Capability / Trust Row ────────────────────────── */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 1.35, ease: "easeOut" }}
          className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-4 border-t border-[rgba(240,237,229,0.10)]"
        >
          <div className="causal-glass-subtle p-3 rounded-xl">
            <span className="text-[10px] font-mono text-[#736F66] uppercase tracking-wider block">
              Multi-Domain Graph
            </span>
            <span className="text-xs sm:text-sm font-mono font-semibold text-[#F0EDE5] mt-0.5 block">
              4 Physical Sectors Live
            </span>
          </div>

          <div className="causal-glass-subtle p-3 rounded-xl">
            <span className="text-[10px] font-mono text-[#736F66] uppercase tracking-wider block">
              Causal Evidence
            </span>
            <span className="text-xs sm:text-sm font-mono font-semibold text-[#82977D] mt-0.5 block">
              Verified Sensor Provenance
            </span>
          </div>

          <div className="causal-glass-subtle p-3 rounded-xl">
            <span className="text-[10px] font-mono text-[#736F66] uppercase tracking-wider block">
              Safety Guarantees
            </span>
            <span className="text-xs sm:text-sm font-mono font-semibold text-[#B9955B] mt-0.5 block">
              Strict Sandbox Isolation
            </span>
          </div>

          <div className="causal-glass-subtle p-3 rounded-xl">
            <span className="text-[10px] font-mono text-[#736F66] uppercase tracking-wider block">
              Blast Forecasting
            </span>
            <span className="text-xs sm:text-sm font-mono font-semibold text-[#A99A80] mt-0.5 block">
              Directional Hop Limits
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

export default CinematicHero;
