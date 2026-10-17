"use client";

import React, { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";

const PRISMA_HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4";

export function PrismaStorySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.8", "end 0.2"],
  });

  const videoScale = useTransform(scrollYProgress, [0, 1], [0.94, 1.02]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.4, 0.9], [0.3, 0.8, 1]);

  const words = [
    "Infrastructure",
    "does",
    "not",
    "fail",
    "in",
    "isolation.",
    "It",
    "fails",
    "in",
    "cascades.",
  ];

  return (
    <section
      ref={containerRef}
      className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-[#111210] relative overflow-hidden"
    >
      <div className="max-w-[1152px] mx-auto">
        
        {/* ── Inner Elevated Charcoal Panel ───────────────────────────── */}
        <div className="relative rounded-2xl lg:rounded-3xl bg-[#20211D] border border-[rgba(240,237,229,0.12)] p-8 sm:p-14 lg:p-16 overflow-hidden causal-glass-strong shadow-2xl">
          
          {/* Subtle noise grid */}
          <div aria-hidden="true" className="absolute inset-0 causal-grid-texture opacity-20 pointer-events-none" />

          {/* Editorial Category Label */}
          <div className="relative z-10 flex items-center gap-2 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A99A80]" />
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#A99A80] font-semibold">
              The Architecture of Resilience
            </span>
          </div>

          {/* Large Editorial Headline */}
          <div className="relative z-10 max-w-[48rem]">
            <h2 className="text-[30px] sm:text-[36px] md:text-[48px] lg:text-[60px] xl:text-[72px] font-sans font-extrabold text-[#F0EDE5] leading-[0.95] md:leading-[0.9] tracking-[-0.04em]">
              {words.map((word, i) => (
                <motion.span
                  key={i}
                  initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0.8, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.05 }}
                  transition={{
                    duration: 0.6,
                    delay: shouldReduceMotion ? 0 : i * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`inline-block mr-[0.25em] ${
                    word === "cascades."
                      ? "font-serif italic font-light text-[#F0EDE5] causal-shimmer-text"
                      : word === "isolation."
                      ? "font-serif italic font-light text-[#A7A398]"
                      : ""
                  }`}
                >
                  {word}
                </motion.span>
              ))}
            </h2>

            {/* Scroll-Linked Editorial Body */}
            <motion.p
              style={shouldReduceMotion ? undefined : { opacity: textOpacity }}
              className="mt-8 text-base sm:text-lg lg:text-xl text-[#A7A398] font-sans leading-relaxed max-w-2xl"
            >
              When a high-voltage transformer trips in Substation Alpha, the danger isn&apos;t just lost megawatts—it is the subterranean pressure spike in municipal aqueduct pumps, followed by fiber transit routing degradation. CAUSAL maps directional dependencies across multi-domain graphs to isolate root causes in milliseconds.
            </motion.p>
          </div>

          {/* ── Inset Prisma Hero Video ───────────────────────────────── */}
          <motion.div
            style={shouldReduceMotion ? undefined : { scale: videoScale }}
            className="mt-12 relative w-full h-[320px] sm:h-[420px] lg:h-[480px] rounded-xl lg:rounded-2xl overflow-hidden border border-[rgba(240,237,229,0.12)] shadow-2xl"
          >
            <video
              src={PRISMA_HERO_VIDEO}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className="w-full h-full object-cover"
            />
            {/* Liquid-Glass Video Caption Overlay */}
            <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-auto causal-glass-strong p-3.5 rounded-xl max-w-md">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#82977D] animate-pulse" />
                <span className="text-[11px] font-mono font-semibold text-[#F0EDE5]">
                  Continuous Directional Propagation Analysis
                </span>
              </div>
              <p className="text-[11px] text-[#A7A398] font-mono mt-1">
                Deterministic DAG traversal with cross-domain hop-limit blast radii.
              </p>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

export default PrismaStorySection;
