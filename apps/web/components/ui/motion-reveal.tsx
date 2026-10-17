/**
 * CAUSAL — MotionReveal
 *
 * A wrapper that animates its children into view when they enter the viewport.
 * Respects `prefers-reduced-motion`; renders instantly when enabled.
 *
 * Usage:
 *   <MotionReveal>
 *     <SomeSection />
 *   </MotionReveal>
 *
 *   <MotionReveal direction="up" delay={0.1}>
 *     <HeroTitle />
 *   </MotionReveal>
 */

"use client";

import React, { useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  fadeUp,
  fadeIn,
  fadeRight,
  fadeLeft,
  instantVariant,
  DURATION,
  EASE_DEFAULT,
} from "@/lib/motion-config";

export type RevealDirection = "up" | "left" | "right" | "none";

interface MotionRevealProps {
  children: React.ReactNode;
  direction?: RevealDirection;
  delay?: number;
  /** Additional class on the wrapper div */
  className?: string;
  /** Fraction of element in view before triggering (default 0.15) */
  threshold?: number;
  /** Only play once (default true) */
  once?: boolean;
}

function getVariants(direction: RevealDirection) {
  switch (direction) {
    case "up":
      return fadeUp;
    case "left":
      return fadeRight; // slide in from left → moves right
    case "right":
      return fadeLeft;  // slide in from right → moves left
    case "none":
    default:
      return fadeIn;
  }
}

export function MotionReveal({
  children,
  direction = "up",
  delay = 0,
  className,
  threshold = 0.05,
  once = true,
}: MotionRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, amount: threshold });
  const [safetyVisible, setSafetyVisible] = React.useState(false);

  // Safety fallback: ensure content is revealed even if IntersectionObserver doesn't fire
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSafetyVisible(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Respect reduced-motion OS preference
  const reducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const variants = reducedMotion ? instantVariant : getVariants(direction);

  return (
    <motion.div
      ref={ref}
      variants={variants}
      initial={reducedMotion ? false : "hidden"}
      animate={inView || safetyVisible || reducedMotion ? "visible" : "hidden"}
      transition={
        delay > 0
          ? { delay, duration: DURATION.slow, ease: EASE_DEFAULT }
          : undefined
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default MotionReveal;
