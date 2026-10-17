"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

interface FeatureCardItem {
  id: string;
  title: string;
  category: string;
  description: string;
  href: string;
  imageSrc: string;
  altText: string;
  badge: string;
  metric: string;
}

const FEATURE_CARDS: FeatureCardItem[] = [
  {
    id: "graph-explorer",
    title: "Graph Explorer",
    category: "Topology & Dependencies",
    description:
      "Interactive multi-domain graph visualization mapping electrical, hydraulic, telecommunications, and transit dependency networks.",
    href: "/app/state",
    imageSrc: "/assets/features/graph-explorer.jpg",
    altText: "Enterprise infrastructure data center server racks and fibre optic networking switches in dark obsidian finish",
    badge: "Phase 1–2",
    metric: "4 Sectors Active",
  },
  {
    id: "evidence-provenance",
    title: "Evidence & Provenance",
    category: "Forensic Audit Trail",
    description:
      "Trace raw sensor signals, acoustic readings, and SCADA telemetry directly to causal hypotheses with cryptographic provenance.",
    href: "/app/evidence",
    imageSrc: "/assets/features/evidence-audit.jpg",
    altText: "Precision oscilloscope and high-speed telemetry instrumentation with amber waveform displays in infrastructure diagnostics lab",
    badge: "Phase 5",
    metric: "Bayesian Scoring",
  },
  {
    id: "counterfactual-experiments",
    title: "Counterfactual Experiments",
    category: "What-If Branching",
    description:
      "Stage hypothetical overrides and simulate cascading blast-radii in strictly isolated sandboxes without writing to production state.",
    href: "/app/interventions",
    imageSrc: "/assets/features/counterfactual-sim.jpg",
    altText: "Electrical power grid control dispatch room with curved wall displays showing transmission topology and digital twin telemetry",
    badge: "Phase 7",
    metric: "Isolated Sandbox",
  },
  {
    id: "safety-recommendations",
    title: "Safety-Constrained Recommendations",
    category: "Ranked Interventions",
    description:
      "Evaluate algorithmic mitigation plans checked against strict physical safety envelopes and operator sign-off boundaries.",
    href: "/app/recommendations",
    imageSrc: "/assets/features/safety-recommendations.jpg",
    altText: "High-pressure industrial hydraulic valve manifolds and safety actuators in municipal infrastructure facility",
    badge: "Phase 8–10",
    metric: "Operator Enforced",
  },
];

const PRISMA_FEATURE_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_133058_0504132a-0cf3-4450-a370-8ea3b05c95d4.mp4";

const CAPABILITIES_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_094631_d30ab262-45ee-4b7d-99f3-5d5848c8ef13.mp4";

export function PrismaFeatureCards() {
  const shouldReduceMotion = useReducedMotion();

  const cardVariants = {
    hidden: { scale: 0.98, opacity: shouldReduceMotion ? 1 : 0.75 },
    visible: (index: number) => ({
      scale: 1,
      opacity: 1,
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.5,
        delay: shouldReduceMotion ? 0 : index * 0.1,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    }),
  };

  return (
    <section className="min-h-[100svh] py-20 px-4 sm:px-6 lg:px-8 bg-[#111210] relative flex flex-col justify-center">
      {/* Subtle Noise Texture */}
      <div
        aria-hidden="true"
        className="absolute inset-0 causal-grid-texture opacity-15 pointer-events-none"
      />

      <div className="max-w-[1520px] w-full mx-auto relative z-10">
        
        {/* Section Masthead */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pb-6 border-b border-[rgba(240,237,229,0.08)]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80]" />
              <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#A99A80] font-semibold">
                Autonomous Capabilities
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-sans font-extrabold tracking-[-0.03em] text-[#F0EDE5]">
              Engineered for <span className="font-serif italic font-light text-[#A7A398]">Zero Surprise.</span>
            </h2>
          </div>
          <p className="text-xs sm:text-sm font-sans text-[#A7A398] max-w-md leading-relaxed">
            Four specialized operational planes providing end-to-end verification from raw physical telemetry up to automated safety-bounded interventions.
          </p>
        </div>

        {/* ── 4-Column Feature Grid (480px card height) ───────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-2 md:gap-1.5 lg:gap-3">
          {FEATURE_CARDS.map((card, index) => (
            <motion.div
              key={card.id}
              custom={index}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.05 }}
              variants={cardVariants}
              className="h-[480px] rounded-2xl overflow-hidden border border-[rgba(240,237,229,0.12)] relative group causal-glass-strong flex flex-col justify-between p-6 transition-all duration-300 hover:border-[#A99A80]/60 hover:shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
            >
              {/* Background Image Asset */}
              <div className="absolute inset-0 -z-20 overflow-hidden">
                <Image
                  src={card.imageSrc}
                  alt={card.altText}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 opacity-55 mix-blend-luminosity"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#111210] via-[#111210]/60 to-[#111210]/30"
                />
              </div>

              {/* Top Card Bar */}
              <div className="relative z-10 flex items-center justify-between">
                <span className="causal-glass-subtle px-2.5 py-1 rounded text-[10px] font-mono text-[#A99A80] border border-[rgba(240,237,229,0.12)] font-semibold">
                  {card.badge}
                </span>
                <span className="text-[10px] font-mono text-[#82977D] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#82977D]" />
                  {card.metric}
                </span>
              </div>

              {/* Bottom Content Deck */}
              <div className="relative z-10 space-y-3">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#A7A398] block mb-1">
                    {card.category}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-bold font-sans text-[#F0EDE5] tracking-tight group-hover:text-white transition-colors">
                    {card.title}
                  </h3>
                </div>

                <p className="text-xs text-[#A7A398] font-sans leading-relaxed line-clamp-3">
                  {card.description}
                </p>

                <div className="pt-2">
                  <Link
                    href={card.href}
                    id={`feature-card-link-${card.id}`}
                    className="inline-flex items-center gap-2 text-xs font-mono font-medium text-[#F0EDE5] group-hover:text-[#A99A80] transition-colors"
                  >
                    <span>Launch Module</span>
                    <svg
                      width="12"
                      height="12"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      className="transition-transform group-hover:translate-x-1"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Capabilities Inset Video Showcase ────────────────────────── */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative rounded-2xl overflow-hidden border border-[rgba(240,237,229,0.12)] h-[220px] causal-glass-strong">
            <video
              src={PRISMA_FEATURE_VIDEO}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#111210] via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-[#A99A80] uppercase tracking-wider block">
                  Reference Inset
                </span>
                <span className="text-xs font-mono font-semibold text-[#F0EDE5]">
                  Continuous Graph Simulation Stream
                </span>
              </div>
              <span className="w-2 h-2 rounded-full bg-[#82977D] animate-ping" />
            </div>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-[rgba(240,237,229,0.12)] h-[220px] causal-glass-strong">
            <video
              src={CAPABILITIES_VIDEO}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#111210] via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-[#A99A80] uppercase tracking-wider block">
                  Autonomous Reasoning
                </span>
                <span className="text-xs font-mono font-semibold text-[#F0EDE5]">
                  Dynamic Blast Horizon Recalculation
                </span>
              </div>
              <span className="w-2 h-2 rounded-full bg-[#82977D] animate-ping" />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

export default PrismaFeatureCards;
